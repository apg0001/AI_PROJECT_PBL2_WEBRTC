// Signaling 메시지 스펙(docs/03-connection-sequence.md §3) 검증
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { attachSignaling } from '../src/signaling.js';

let server, url;

before(async () => {
  server = createServer();
  attachSignaling(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
});
after(() => server.close());

// 메시지를 순서대로 꺼내 쓸 수 있는 테스트 클라이언트
async function client() {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const w = waiters.shift();
    w ? w(msg) : queue.push(msg);
  });
  await new Promise((r, j) => ws.once('open', r).once('error', j));
  return {
    send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    next: () =>
      queue.length
        ? Promise.resolve(queue.shift())
        : new Promise((res, rej) => {
            waiters.push(res);
            setTimeout(() => rej(new Error('timeout')), 1000);
          }),
    close: () => ws.close(),
  };
}

let n = 0;
const room = () => `room-${Date.now()}-${n++}`;

test('먼저 입장한 쪽은 빈 peers를 받고, 나중 입장 시 peer-joined를 받는다', async () => {
  const r = room();
  const f = await client();
  f.send({ type: 'join', room: r, role: 'field' });
  const j1 = await f.next();
  assert.equal(j1.type, 'joined');
  assert.deepEqual(j1.peers, []);

  const e = await client();
  e.send({ type: 'join', room: r, role: 'expert', name: 'kim' });
  const j2 = await e.next();
  assert.equal(j2.type, 'joined');
  assert.equal(j2.peers.length, 1);
  assert.equal(j2.peers[0].role, 'field');

  const pj = await f.next();
  assert.equal(pj.type, 'peer-joined');
  assert.equal(pj.peer.role, 'expert');
  assert.equal(pj.peer.name, 'kim');
  f.close();
  e.close();
});

test('offer/answer/ice는 상대에게 from과 함께 그대로 중계된다', async () => {
  const r = room();
  const f = await client();
  const e = await client();
  f.send({ type: 'join', room: r, role: 'field' });
  const { selfId: fid } = await f.next();
  e.send({ type: 'join', room: r, role: 'expert' });
  const { selfId: eid } = await e.next();
  await f.next(); // peer-joined

  const sdp = { type: 'offer', sdp: 'v=0 dummy' };
  f.send({ type: 'offer', sdp, extra: 'drop-me' });
  const o = await e.next();
  assert.deepEqual(o, { type: 'offer', from: fid, sdp });

  e.send({ type: 'answer', sdp: { type: 'answer', sdp: 'v=0' } });
  assert.equal((await f.next()).from, eid);

  const candidate = { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0' };
  e.send({ type: 'ice', candidate });
  assert.deepEqual(await f.next(), { type: 'ice', from: eid, candidate });

  e.send({ type: 'ice', candidate: null });
  assert.equal((await f.next()).candidate, null);
  f.close();
  e.close();
});

test('정원 초과와 역할 중복은 거부된다', async () => {
  const r = room();
  const f = await client();
  f.send({ type: 'join', room: r, role: 'field' });
  await f.next();

  const f2 = await client();
  f2.send({ type: 'join', room: r, role: 'field' });
  assert.equal((await f2.next()).code, 'ROLE_TAKEN');

  const e = await client();
  e.send({ type: 'join', room: r, role: 'expert' });
  await e.next();

  const x = await client();
  x.send({ type: 'join', room: r, role: 'expert' });
  assert.equal((await x.next()).code, 'ROOM_FULL');
  [f, f2, e, x].forEach((c) => c.close());
});

test('잘못된 메시지와 순서 오류에 오류 코드를 돌려준다', async () => {
  const c = await client();
  c.send('not json');
  assert.equal((await c.next()).code, 'BAD_MESSAGE');
  c.send({ type: 'join', room: '../etc', role: 'field' });
  assert.equal((await c.next()).code, 'BAD_MESSAGE');
  c.send({ type: 'join', room: room(), role: 'admin' });
  assert.equal((await c.next()).code, 'BAD_MESSAGE');
  c.send({ type: 'offer', sdp: {} });
  assert.equal((await c.next()).code, 'NOT_IN_ROOM');
  c.send({ type: 'whatever' });
  assert.equal((await c.next()).code, 'BAD_MESSAGE');

  c.send({ type: 'join', room: room(), role: 'field' });
  await c.next();
  c.send({ type: 'offer', sdp: {} });
  assert.equal((await c.next()).code, 'NO_PEER');
  c.send({ type: 'join', room: room(), role: 'field' });
  assert.equal((await c.next()).code, 'ALREADY_JOINED');
  c.close();
});

test('퇴장(leave·연결 종료) 시 상대에게 peer-left를 보내고 자리를 비운다', async () => {
  const r = room();
  const f = await client();
  f.send({ type: 'join', room: r, role: 'field' });
  await f.next();
  const e = await client();
  e.send({ type: 'join', room: r, role: 'expert' });
  const { selfId: eid } = await e.next();
  await f.next();

  e.close(); // WebSocket 종료도 퇴장
  assert.deepEqual(await f.next(), { type: 'peer-left', peerId: eid });

  // 자리가 비었으므로 전문가가 다시 들어올 수 있다
  const e2 = await client();
  e2.send({ type: 'join', room: r, role: 'expert' });
  assert.equal((await e2.next()).type, 'joined');
  assert.equal((await f.next()).type, 'peer-joined');

  e2.send({ type: 'leave' });
  assert.equal((await f.next()).type, 'peer-left');
  f.close();
  e2.close();
});
