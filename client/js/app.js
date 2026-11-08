// 현장(field) / 전문가(expert) 화면 공통 로직: 입장, 연결, 퇴장
// 흐름: docs/03-connection-sequence.md §2

import { SignalingClient } from './signaling.js';
import { PeerSession, DEFAULT_ICE_SERVERS } from './peer.js';
import { createUi } from './ui.js';

export async function startApp({ role }) {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const ui = createUi({ role, room });
  if (!room) {
    ui.setStatus('error', 'Room이 없습니다. 첫 화면에서 Room을 만드세요.');
    return;
  }

  // ?stun=0 이면 STUN 없이 host Candidate만 쓴다 (NAT 분석 실험용)
  const iceServers = params.get('stun') === '0' ? [] : DEFAULT_ICE_SERVERS;
  const signaling = new SignalingClient();
  let session = null;
  let marks = {};

  signaling.on('message', ({ direction, msg }) => ui.logSignal(direction, msg));
  signaling.on('close', ({ code }) => {
    ui.log('signaling', `서버 연결 끊김 (code ${code}). 이미 연결된 영상·데이터는 그대로 유지된다`);
    ui.setStatus('warn', session?.pc.connectionState === 'connected' ? '연결됨 (서버와는 끊김)' : '서버와 연결이 끊겼습니다');
  });

  function newSession() {
    session?.close();
    const s = new PeerSession({ signaling, iceServers, marks });
    ui.attachSession(s);
    s.on('state', ({ kind, value }) => {
      if (kind !== 'connectionState') return;
      if (value === 'connected') onConnected(s);
      else if (value === 'connecting') ui.setStatus('busy', '연결 중…');
      else if (value === 'disconnected') ui.setStatus('warn', '연결이 불안정합니다');
      else if (value === 'failed') ui.setStatus('error', '연결하지 못했습니다. 연결 후보와 기록을 확인하세요');
    });
    s.on('control-message', (m) => {
      if (m.type === 'ping') s.sendControl({ type: 'pong', ts: m.ts });
      else if (m.type === 'pong') ui.log('data', `데이터 통로 왕복 ${(performance.now() - m.ts).toFixed(1)} ms`);
    });
    s.on('error', ({ where, message }) => ui.log('error', `${where}: ${message}`));
    session = s;
    return s;
  }

  async function onConnected(s) {
    ui.setStatus('ok', '연결됨');
    ui.showTimings(marks);
    const pair = await s.selectedPair();
    if (pair) ui.showSelectedPair(pair);
  }

  signaling.on('joined', ({ peers }) => {
    if (peers.length === 0) ui.setStatus('wait', `${role === 'field' ? '전문가' : '현장 작업자'}를 기다리는 중…`);
    else ui.setStatus('busy', '연결하는 중…'); // 나중에 들어온 쪽: Offer를 기다린다
  });

  // 먼저 있던 쪽 → Offerer
  signaling.on('peer-joined', async ({ peer }) => {
    ui.log('signaling', `${peer.role} 입장. 먼저 있던 내가 연결 제안(offer)을 보낸다`);
    marks = { t0_join: marks.t0_join, t1_peerJoined: performance.now() };
    ui.setStatus('busy', '연결하는 중…');
    await newSession().makeOffer();
  });

  signaling.on('offer', async ({ sdp }) => {
    await newSession().handleOffer(sdp);
  });
  signaling.on('answer', ({ sdp }) => session?.handleAnswer(sdp));
  signaling.on('ice', ({ candidate }) => session?.handleIce(candidate));

  signaling.on('peer-left', () => {
    session?.close();
    session = null;
    marks = { t0_join: marks.t0_join };
    ui.setStatus('wait', '상대가 나갔습니다. 다시 들어오기를 기다리는 중…');
  });

  signaling.on('error', ({ code, message }) => {
    ui.log('error', `${code}: ${message}`);
    if (code === 'ROOM_FULL' || code === 'ROLE_TAKEN') ui.setStatus('error', message);
  });

  ui.onPing(() => {
    if (!session?.sendControl({ type: 'ping', ts: performance.now() })) ui.log('data', '데이터 통로가 아직 열리지 않았습니다');
  });
  ui.onLeave(() => {
    signaling.send({ type: 'leave' });
    session?.close();
    session = null;
    ui.setStatus('wait', '나왔습니다. 새로고침하면 다시 들어갑니다.');
  });
  addEventListener('pagehide', () => signaling.send({ type: 'leave' }));

  try {
    ui.setStatus('busy', '서버에 접속하는 중…');
    await signaling.connect();
    marks.t0_join = performance.now();
    signaling.send({ type: 'join', room, role });
  } catch (err) {
    ui.setStatus('error', err.message);
  }
}
