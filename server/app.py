# Signaling Server 진입점 (Python aiohttp)
# - client/ 와 tools/ 를 정적으로 서빙한다.
# - server/certs/{cert,key}.pem 이 있으면 HTTPS, 없으면 HTTP로 뜬다.
#   (모바일 getUserMedia는 HTTPS가 필요하므로 HTTP 모드에서는 `npm run tunnel` 로 ngrok HTTPS 주소를 쓴다)
# - /ws 경로에서 WebSocket 시그널링(Room, SDP/ICE 중계)을 제공한다. → signaling.py
# 실행: python3 server/app.py   (PORT 환경변수, 기본 3000)

import json
import mimetypes
import os
import re
import socket
import ssl
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

from signaling import attach_signaling

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get('PORT', 3000))

# URL 접두사 → 디렉터리
MOUNTS = [
    ('/tools/', ROOT / 'tools'),
    ('/', ROOT / 'client'),
]

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}
NO_STORE = {'Cache-Control': 'no-store'}


def log(*args):
    # 실험 기록(server.log)과 같은 형식: 2026-11-09T02:08:30.690Z
    now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    print(now, *args, flush=True)


def lan_addresses():
    """폰용 링크에 쓸 이 PC의 IPv4 주소. 네트워크 장치 순서(macOS는 Wi-Fi en0이 먼저)를 따른다"""
    found = []
    # 표준 라이브러리에는 장치별 주소 목록이 없어서 OS 명령 출력을 읽는다 (macOS: ifconfig, Linux: ip)
    for cmd in (['ifconfig'], ['ip', '-4', '-o', 'addr']):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=2).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        found = re.findall(r'\binet (\d+\.\d+\.\d+\.\d+)', out)
        if found:
            break
    if not found:
        try:
            # 기본 경로의 주소: 실제로 패킷을 보내지 않는다
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(('8.8.8.8', 80))
                found.append(s.getsockname()[0])
        except OSError:
            pass
    return [ip for i, ip in enumerate(found) if not ip.startswith('127.') and ip not in found[:i]]


async def healthz(request):
    return web.json_response({'ok': True, 'time': int(time.time() * 1000)})


async def info(request):
    # 시작 화면이 폰용 링크(LAN 주소)를 만들 때 쓴다
    return web.json_response({'lan': lan_addresses(), 'port': PORT}, headers=NO_STORE)


def make_static(mounts):
    async def serve(request):
        pathname = request.path  # 이미 URL 디코딩됨
        prefix, base = next((p, d) for p, d in mounts if pathname.startswith(p))
        base = base.resolve()
        file = (base / pathname[len(prefix):]).resolve()
        if file != base and base not in file.parents:
            return web.Response(status=403, text='forbidden')
        if file.is_dir():
            file = file / 'index.html'
        if not file.is_file():
            return web.Response(status=404, text='not found', charset='utf-8')
        ctype = MIME.get(file.suffix) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        return web.Response(body=file.read_bytes(), headers={'Content-Type': ctype, **NO_STORE})

    return serve


def create_app(mounts=MOUNTS, log=log, heartbeat=30.0):
    app = web.Application()
    app.router.add_get('/healthz', healthz)
    app.router.add_get('/api/info', info)
    attach_signaling(app, log=log, heartbeat=heartbeat)  # /ws
    app.router.add_get('/{tail:.*}', make_static(mounts))
    return app


def main():
    cert, key = ROOT / 'server' / 'certs' / 'cert.pem', ROOT / 'server' / 'certs' / 'key.pem'
    ssl_ctx = None
    if cert.exists() and key.exists():
        ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_ctx.load_cert_chain(cert, key)
    scheme = 'https' if ssl_ctx else 'http'

    async def announce(app):
        log(f'listening on {scheme}://localhost:{PORT}')
        for ip in lan_addresses():
            log(f'  LAN: {scheme}://{ip}:{PORT}')
        if not ssl_ctx:
            log('  같은 LAN 연결은 위 LAN 주소로 접속. 폰 카메라·다른 네트워크 시험은 HTTPS 필요 → `npm run tunnel`')

    app = create_app()
    app.on_startup.append(announce)
    web.run_app(app, host='0.0.0.0', port=PORT, ssl_context=ssl_ctx, print=None, access_log=None)


if __name__ == '__main__':
    sys.exit(main())
