# ICE 서버 목록 발급 (#38): 브라우저는 GET /api/ice 로 STUN·TURN 주소와 접속 정보를 받는다.
#
# TURN 접속 정보는 비밀이라 저장소와 브라우저 코드에 넣지 않는다. 서버가 환경변수(또는 server/.env)에서 읽어
# 접속할 때마다 내려준다. 상용 서비스처럼 '짧은 유효기간의 접속 정보'를 발급하는 방식이다.
#
# 설정 (위에서부터 먼저 찾은 것을 쓴다)
#   1) Cloudflare Realtime TURN   CF_TURN_KEY_ID, CF_TURN_API_TOKEN   (TURN_TTL초 유효, 기본 4시간)
#   2) 고정 TURN                  TURN_URLS(쉼표 구분), TURN_USERNAME, TURN_CREDENTIAL
#   3) 없으면 STUN만
# Google 공용 STUN은 항상 넣는다.

import os
import time
from pathlib import Path

import aiohttp

GOOGLE_STUN = {'urls': 'stun:stun.l.google.com:19302'}
CF_URL = 'https://rtc.live.cloudflare.com/v1/turn/keys/{key}/credentials/generate-ice-servers'


def load_env_file(path: Path):
    """server/.env 의 KEY=VALUE 줄을 환경변수로 읽는다 (이미 있는 값은 덮지 않는다)"""
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class IceProvider:
    def __init__(self, env=None, log=lambda *a: None):
        self.env = os.environ if env is None else env
        self.log = log
        self.cache = None  # (만료 시각, servers)

    @property
    def mode(self):
        e = self.env
        if e.get('CF_TURN_KEY_ID') and e.get('CF_TURN_API_TOKEN'):
            return 'cloudflare'
        if e.get('TURN_URLS') and e.get('TURN_USERNAME') and e.get('TURN_CREDENTIAL'):
            return 'static'
        return 'stun'

    async def servers(self):
        """(iceServers, source 설명) 를 돌려준다. TURN 발급에 실패하면 STUN만 주고 이유를 적는다"""
        mode = self.mode
        if mode == 'static':
            urls = [u.strip() for u in self.env['TURN_URLS'].split(',') if u.strip()]
            turn = {'urls': urls, 'username': self.env['TURN_USERNAME'], 'credential': self.env['TURN_CREDENTIAL']}
            return [GOOGLE_STUN, turn], 'stun+turn(static)'
        if mode == 'cloudflare':
            try:
                return [GOOGLE_STUN, *await self._cloudflare()], 'stun+turn(cloudflare)'
            except Exception as err:  # 네트워크·인증 오류: 연결은 STUN만으로 계속 시도한다
                self.log(f'TURN 발급 실패: {err}')
                return [GOOGLE_STUN], f'stun (TURN 발급 실패: {err})'
        return [GOOGLE_STUN], 'stun'

    async def _cloudflare(self):
        now = time.time()
        if self.cache and self.cache[0] > now:
            return self.cache[1]
        ttl = int(self.env.get('TURN_TTL', 4 * 3600))
        url = CF_URL.format(key=self.env['CF_TURN_KEY_ID'])
        headers = {'Authorization': f'Bearer {self.env["CF_TURN_API_TOKEN"]}'}
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.post(url, json={'ttl': ttl}, headers=headers) as res:
                if res.status >= 300:
                    raise RuntimeError(f'Cloudflare 응답 {res.status}')
                body = await res.json()
        servers = []
        for srv in body.get('iceServers', []):
            urls = srv.get('urls', [])
            urls = [urls] if isinstance(urls, str) else urls
            # 브라우저에서 53번 포트는 시간 초과가 잦다 (Cloudflare 문서 권고)
            urls = [u for u in urls if ':53?' not in u and not u.endswith(':53')]
            if urls:
                servers.append({**srv, 'urls': urls})
        self.cache = (now + ttl / 2, servers)  # 유효기간 절반이 지나면 새로 받는다
        self.log(f'TURN 접속 정보 발급 (Cloudflare, {ttl}초 유효)')
        return servers
