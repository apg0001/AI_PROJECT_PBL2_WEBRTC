# WebSocket Signaling — 메시지 스펙: docs/03-connection-sequence.md §3
# 서버는 Room 관리와 중계만 한다. SDP·ICE Candidate 내용은 해석하지 않는다.

import json
import re
import uuid
import weakref

from aiohttp import WSMsgType, web

MAX_PEERS = 2
ROLES = {'field', 'expert'}
ROOM_RE = re.compile(r'[A-Za-z0-9_-]{1,64}')
RELAY_TYPES = {'offer', 'answer', 'ice'}
MAX_PAYLOAD = 64 * 1024


class Peer:
    """WebSocket 하나 = 참가자 한 명"""

    def __init__(self, ws: web.WebSocketResponse):
        self.ws = ws
        self.id = uuid.uuid4().hex[:8]
        self.room = None
        self.role = None
        self.name = ''

    def info(self):
        return {'id': self.id, 'role': self.role, 'name': self.name}


class Signaling:
    def __init__(self, log=lambda *a: None, heartbeat=30.0):
        self.log = log
        self.heartbeat = heartbeat
        self.rooms: dict[str, dict[str, Peer]] = {}
        self.sockets = weakref.WeakSet()  # 서버 종료 시 닫을 연결

    async def send(self, peer: Peer, msg: dict):
        if peer.ws.closed:
            return
        try:
            await peer.ws.send_str(json.dumps(msg, ensure_ascii=False, separators=(',', ':')))
        except ConnectionResetError:
            pass  # 막 끊기는 중인 연결

    async def error(self, peer: Peer, code: str, message: str):
        self.log(f'[{peer.room or "-"}] error {code} → {peer.id}')
        await self.send(peer, {'type': 'error', 'code': code, 'message': message})

    async def join(self, peer: Peer, msg: dict):
        room, role = msg.get('room'), msg.get('role')
        name = msg['name'][:40] if isinstance(msg.get('name'), str) else ''
        if peer.room:
            return await self.error(peer, 'ALREADY_JOINED', '이미 Room에 들어와 있습니다')
        if not isinstance(room, str) or not ROOM_RE.fullmatch(room) or role not in ROLES:
            return await self.error(peer, 'BAD_MESSAGE', 'room 또는 role이 올바르지 않습니다')
        members = self.rooms.get(room, {})
        if len(members) >= MAX_PEERS:
            return await self.error(peer, 'ROOM_FULL', 'Room 정원(2명)이 찼습니다')
        if any(m.role == role for m in members.values()):
            return await self.error(peer, 'ROLE_TAKEN', f'이미 {role} 참가자가 있습니다')

        peers = [m.info() for m in members.values()]
        peer.room, peer.role, peer.name = room, role, name
        members[peer.id] = peer
        self.rooms[room] = members

        await self.send(peer, {'type': 'joined', 'selfId': peer.id, 'room': room, 'peers': peers})
        # 기존 참가자에게만 알린다 → 받은 쪽이 Offerer (glare 방지)
        for other in list(members.values()):
            if other is not peer:
                await self.send(other, {'type': 'peer-joined', 'peer': peer.info()})
        self.log(f'[{room}] join {role} {peer.id} ({len(members)}/{MAX_PEERS})')

    async def relay(self, peer: Peer, msg: dict):
        if not peer.room:
            return await self.error(peer, 'NOT_IN_ROOM', 'join 전에는 보낼 수 없습니다')
        others = [m for m in self.rooms[peer.room].values() if m is not peer]
        if not others:
            return await self.error(peer, 'NO_PEER', '상대가 없습니다')
        out = {'type': msg['type'], 'from': peer.id}
        if msg['type'] == 'ice':
            out['candidate'] = msg.get('candidate')
        elif 'sdp' in msg:
            out['sdp'] = msg['sdp']
        for other in others:
            await self.send(other, out)
        self.log(f'[{peer.room}] {msg["type"]} {peer.role} → {",".join(o.role for o in others)}')

    async def leave(self, peer: Peer, reason: str):
        members = self.rooms.get(peer.room) if peer.room else None
        if members is None:
            return
        room = peer.room
        peer.room = None
        members.pop(peer.id, None)
        if not members:
            del self.rooms[room]
        for other in list(members.values()):
            await self.send(other, {'type': 'peer-left', 'peerId': peer.id})
        self.log(f'[{room}] leave {peer.role} {peer.id} ({reason})')

    async def dispatch(self, peer: Peer, data: str):
        try:
            msg = json.loads(data)
        except ValueError:
            return await self.error(peer, 'BAD_MESSAGE', 'JSON이 아닙니다')
        kind = msg.get('type') if isinstance(msg, dict) else None
        if kind == 'join':
            await self.join(peer, msg)
        elif kind in RELAY_TYPES:
            await self.relay(peer, msg)
        elif kind == 'leave':
            await self.leave(peer, 'leave')
        else:
            await self.error(peer, 'BAD_MESSAGE', f'알 수 없는 type: {kind}')

    async def handle(self, request: web.Request):
        # heartbeat: 30초마다 ping, pong이 없으면 끊는다 (화면 꺼짐, 네트워크 전환 감지)
        ws = web.WebSocketResponse(heartbeat=self.heartbeat, max_msg_size=MAX_PAYLOAD)
        await ws.prepare(request)
        peer = Peer(ws)
        self.sockets.add(ws)
        # 실험 기록용: 어떤 기기·브라우저가 접속했는지 남긴다
        ua = request.headers.get('User-Agent', '')[:160]
        self.log(f'ws open {peer.id} from {request.remote} ua="{ua}"')
        try:
            async for m in ws:
                if m.type == WSMsgType.TEXT:
                    await self.dispatch(peer, m.data)
                elif m.type == WSMsgType.BINARY:
                    await self.error(peer, 'BAD_MESSAGE', 'JSON이 아닙니다')
        finally:
            await self.leave(peer, 'close')
        return ws

    async def close_all(self, app=None):
        for ws in list(self.sockets):
            await ws.close(code=1001, message=b'server shutdown')


def attach_signaling(app: web.Application, log=lambda *a: None, heartbeat=30.0) -> Signaling:
    sig = Signaling(log, heartbeat)
    app.router.add_get('/ws', sig.handle)
    app.on_shutdown.append(sig.close_all)
    app[SIGNALING] = sig
    return sig


SIGNALING = web.AppKey('signaling', Signaling)
