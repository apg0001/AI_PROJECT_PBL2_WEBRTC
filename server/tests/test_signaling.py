# Signaling 메시지 스펙(docs/03-connection-sequence.md §3) 검증
# 실행: cd server && python3 -m unittest -v

import asyncio
import json
import tempfile
import time
import unittest
from pathlib import Path

from aiohttp.test_utils import AioHTTPTestCase

from app import create_app
from signaling import SIGNALING

_n = 0


def room():
    global _n
    _n += 1
    return f'room-{int(time.time() * 1000)}-{_n}'


class Client:
    """메시지를 순서대로 꺼내 쓸 수 있는 테스트 클라이언트"""

    def __init__(self, ws):
        self.ws = ws

    async def send(self, m):
        await self.ws.send_str(m if isinstance(m, str) else json.dumps(m))

    async def next(self):
        return await self.ws.receive_json(timeout=1)

    async def close(self):
        await self.ws.close()


class SignalingTest(AioHTTPTestCase):
    async def get_application(self):
        return create_app(log=lambda *a: None)

    async def connect(self):
        return Client(await self.client.ws_connect('/ws'))

    async def test_join_order(self):
        """먼저 입장한 쪽은 빈 peers를 받고, 나중 입장 시 peer-joined를 받는다"""
        r = room()
        f = await self.connect()
        await f.send({'type': 'join', 'room': r, 'role': 'field'})
        j1 = await f.next()
        self.assertEqual(j1['type'], 'joined')
        self.assertEqual(j1['peers'], [])

        e = await self.connect()
        await e.send({'type': 'join', 'room': r, 'role': 'expert', 'name': 'kim'})
        j2 = await e.next()
        self.assertEqual(j2['type'], 'joined')
        self.assertEqual(len(j2['peers']), 1)
        self.assertEqual(j2['peers'][0]['role'], 'field')

        pj = await f.next()
        self.assertEqual(pj['type'], 'peer-joined')
        self.assertEqual(pj['peer']['role'], 'expert')
        self.assertEqual(pj['peer']['name'], 'kim')
        await f.close()
        await e.close()

    async def test_relay(self):
        """offer/answer/ice는 상대에게 from과 함께 그대로 중계된다"""
        r = room()
        f = await self.connect()
        e = await self.connect()
        await f.send({'type': 'join', 'room': r, 'role': 'field'})
        fid = (await f.next())['selfId']
        await e.send({'type': 'join', 'room': r, 'role': 'expert'})
        eid = (await e.next())['selfId']
        await f.next()  # peer-joined

        sdp = {'type': 'offer', 'sdp': 'v=0 dummy'}
        await f.send({'type': 'offer', 'sdp': sdp, 'extra': 'drop-me'})
        self.assertEqual(await e.next(), {'type': 'offer', 'from': fid, 'sdp': sdp})

        await e.send({'type': 'answer', 'sdp': {'type': 'answer', 'sdp': 'v=0'}})
        self.assertEqual((await f.next())['from'], eid)

        candidate = {'candidate': 'candidate:1 1 udp 1 1.2.3.4 5 typ host', 'sdpMid': '0'}
        await e.send({'type': 'ice', 'candidate': candidate})
        self.assertEqual(await f.next(), {'type': 'ice', 'from': eid, 'candidate': candidate})

        await e.send({'type': 'ice', 'candidate': None})
        self.assertIsNone((await f.next())['candidate'])
        await f.close()
        await e.close()

    async def test_capacity(self):
        """정원 초과와 역할 중복은 거부된다"""
        r = room()
        f = await self.connect()
        await f.send({'type': 'join', 'room': r, 'role': 'field'})
        await f.next()

        f2 = await self.connect()
        await f2.send({'type': 'join', 'room': r, 'role': 'field'})
        self.assertEqual((await f2.next())['code'], 'ROLE_TAKEN')

        e = await self.connect()
        await e.send({'type': 'join', 'room': r, 'role': 'expert'})
        await e.next()

        x = await self.connect()
        await x.send({'type': 'join', 'room': r, 'role': 'expert'})
        self.assertEqual((await x.next())['code'], 'ROOM_FULL')
        for c in (f, f2, e, x):
            await c.close()

    async def test_bad_messages(self):
        """잘못된 메시지와 순서 오류에 오류 코드를 돌려준다"""
        c = await self.connect()
        await c.send('not json')
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')
        await c.send({'type': 'join', 'room': '../etc', 'role': 'field'})
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')
        await c.send({'type': 'join', 'room': 'abc\n', 'role': 'field'})  # 끝 줄바꿈도 거부
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')
        await c.send({'type': 'join', 'room': room(), 'role': 'admin'})
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')
        await c.send({'type': 'offer', 'sdp': {}})
        self.assertEqual((await c.next())['code'], 'NOT_IN_ROOM')
        await c.send({'type': 'whatever'})
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')
        await c.send('[1,2]')
        self.assertEqual((await c.next())['code'], 'BAD_MESSAGE')

        await c.send({'type': 'join', 'room': room(), 'role': 'field'})
        await c.next()
        await c.send({'type': 'offer', 'sdp': {}})
        self.assertEqual((await c.next())['code'], 'NO_PEER')
        await c.send({'type': 'join', 'room': room(), 'role': 'field'})
        self.assertEqual((await c.next())['code'], 'ALREADY_JOINED')
        await c.close()

    async def test_leave(self):
        """퇴장(leave·연결 종료) 시 상대에게 peer-left를 보내고 자리를 비운다"""
        r = room()
        f = await self.connect()
        await f.send({'type': 'join', 'room': r, 'role': 'field'})
        await f.next()
        e = await self.connect()
        await e.send({'type': 'join', 'room': r, 'role': 'expert'})
        eid = (await e.next())['selfId']
        await f.next()

        await e.close()  # WebSocket 종료도 퇴장
        self.assertEqual(await f.next(), {'type': 'peer-left', 'peerId': eid})

        # 자리가 비었으므로 전문가가 다시 들어올 수 있다
        e2 = await self.connect()
        await e2.send({'type': 'join', 'room': r, 'role': 'expert'})
        self.assertEqual((await e2.next())['type'], 'joined')
        self.assertEqual((await f.next())['type'], 'peer-joined')

        await e2.send({'type': 'leave'})
        self.assertEqual((await f.next())['type'], 'peer-left')
        await f.close()
        await e2.close()
        await asyncio.sleep(0.05)
        self.assertNotIn(r, self.app[SIGNALING].rooms)  # 빈 Room은 지운다


class StaticTest(AioHTTPTestCase):
    """정적 파일, /healthz, /api/info"""

    async def get_application(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        (base / 'client').mkdir()
        (base / 'client' / 'index.html').write_text('<h1>start</h1>', encoding='utf-8')
        (base / 'client' / 'app.js').write_text('export {}', encoding='utf-8')
        (base / 'secret.txt').write_text('no', encoding='utf-8')
        return create_app(mounts=[('/', base / 'client')], log=lambda *a: None)

    async def asyncTearDown(self):
        await super().asyncTearDown()
        self.tmp.cleanup()

    async def test_index_and_mime(self):
        res = await self.client.get('/')
        self.assertEqual(res.status, 200)
        self.assertIn('start', await res.text())
        self.assertEqual(res.headers['Cache-Control'], 'no-store')
        res = await self.client.get('/app.js')
        self.assertTrue(res.headers['Content-Type'].startswith('text/javascript'))

    async def test_not_found_and_traversal(self):
        self.assertEqual((await self.client.get('/nope.html')).status, 404)
        res = await self.client.get('/%2e%2e/secret.txt')
        self.assertIn(res.status, (403, 404))
        self.assertNotEqual(await res.text(), 'no')

    async def test_health_and_info(self):
        body = await (await self.client.get('/healthz')).json()
        self.assertTrue(body['ok'])
        res = await self.client.get('/api/info')
        body = await res.json()
        self.assertIsInstance(body['lan'], list)
        self.assertEqual(res.headers['Cache-Control'], 'no-store')


if __name__ == '__main__':
    unittest.main()
