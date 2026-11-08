// WebSocket Signaling — 메시지 스펙: docs/03-connection-sequence.md §3
// 서버는 Room 관리와 중계만 한다. SDP·ICE Candidate 내용은 해석하지 않는다.

import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const MAX_PEERS = 2;
const ROLES = new Set(['field', 'expert']);
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RELAY_TYPES = new Set(['offer', 'answer', 'ice']);

export function attachSignaling(server, { log = () => {}, heartbeatMs = 30_000 } = {}) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  /** @type {Map<string, Map<string, import('ws').WebSocket>>} */
  const rooms = new Map();

  const send = (ws, msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const error = (ws, code, message) => {
    log(`[${ws.room ?? '-'}] error ${code} → ${ws.id}`);
    send(ws, { type: 'error', code, message });
  };
  const peerInfo = (ws) => ({ id: ws.id, role: ws.role, name: ws.name });

  function join(ws, msg) {
    const { room, role } = msg;
    const name = typeof msg.name === 'string' ? msg.name.slice(0, 40) : '';
    if (ws.room) return error(ws, 'ALREADY_JOINED', '이미 Room에 들어와 있습니다');
    if (typeof room !== 'string' || !ROOM_RE.test(room) || !ROLES.has(role)) {
      return error(ws, 'BAD_MESSAGE', 'room 또는 role이 올바르지 않습니다');
    }
    const members = rooms.get(room) ?? new Map();
    if (members.size >= MAX_PEERS) return error(ws, 'ROOM_FULL', 'Room 정원(2명)이 찼습니다');
    if ([...members.values()].some((m) => m.role === role)) {
      return error(ws, 'ROLE_TAKEN', `이미 ${role} 참가자가 있습니다`);
    }

    const peers = [...members.values()].map(peerInfo);
    Object.assign(ws, { room, role, name });
    members.set(ws.id, ws);
    rooms.set(room, members);

    send(ws, { type: 'joined', selfId: ws.id, room, peers });
    // 기존 참가자에게만 알린다 → 받은 쪽이 Offerer (glare 방지)
    for (const other of members.values()) {
      if (other !== ws) send(other, { type: 'peer-joined', peer: peerInfo(ws) });
    }
    log(`[${room}] join ${role} ${ws.id} (${members.size}/${MAX_PEERS})`);
  }

  function relay(ws, msg) {
    if (!ws.room) return error(ws, 'NOT_IN_ROOM', 'join 전에는 보낼 수 없습니다');
    const others = [...rooms.get(ws.room).values()].filter((m) => m !== ws);
    if (others.length === 0) return error(ws, 'NO_PEER', '상대가 없습니다');
    const out = { type: msg.type, from: ws.id };
    if (msg.type === 'ice') out.candidate = msg.candidate ?? null;
    else out.sdp = msg.sdp;
    for (const other of others) send(other, out);
    log(`[${ws.room}] ${msg.type} ${ws.role} → ${others.map((o) => o.role).join(',')}`);
  }

  function leave(ws, reason) {
    const members = ws.room && rooms.get(ws.room);
    if (!members) return;
    members.delete(ws.id);
    for (const other of members.values()) send(other, { type: 'peer-left', peerId: ws.id });
    if (members.size === 0) rooms.delete(ws.room);
    log(`[${ws.room}] leave ${ws.role} ${ws.id} (${reason})`);
    ws.room = null;
  }

  wss.on('connection', (ws, req) => {
    ws.id = randomUUID().slice(0, 8);
    ws.room = null;
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return error(ws, 'BAD_MESSAGE', 'JSON이 아닙니다');
      }
      if (msg?.type === 'join') join(ws, msg);
      else if (RELAY_TYPES.has(msg?.type)) relay(ws, msg);
      else if (msg?.type === 'leave') leave(ws, 'leave');
      else error(ws, 'BAD_MESSAGE', `알 수 없는 type: ${msg?.type}`);
    });
    ws.on('close', () => leave(ws, 'close'));
    log(`ws open ${ws.id} from ${req.socket.remoteAddress}`);
  });

  // 조용히 끊긴 연결(화면 꺼짐, 네트워크 전환) 감지
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  timer.unref(); // 타이머 때문에 프로세스가 종료되지 않는 일을 막는다
  wss.on('close', () => clearInterval(timer));
  server.on('close', () => wss.close());

  return { wss, rooms };
}
