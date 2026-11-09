// 현장(field) / 전문가(expert) 화면 공통 로직: 입장, 연결, 퇴장
// 흐름: docs/03-connection-sequence.md §2

import { SignalingClient } from './signaling.js';
import { PeerSession, DEFAULT_ICE_SERVERS } from './peer.js';
import { createUi } from './ui.js';
import { PROFILES, mediaSupport, getCamera, getMic, getScreen, mediaErrorText } from './media.js';

const SLOT_NAME = { audio: '마이크', camera: '카메라', screen: '화면 공유' };

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

  // 내가 보내는 미디어. 연결 전에 켜 두면 연결될 때 붙는다.
  const mine = { audio: null, camera: null, screen: null };
  let facing = 'environment'; // 현장: 처음에는 후면 카메라
  let profile = params.get('profile') === 'A' ? 'A' : 'B';
  const support = mediaSupport();
  if (!support.camera) {
    ui.setMediaNote('지금은 http 주소라서 카메라와 마이크를 쓸 수 없습니다. ngrok의 https 주소로 여세요.');
    ui.disable('cam', 'https 필요');
    ui.disable('mic', 'https 필요');
  }
  if (role === 'expert' && !support.screen) ui.disable('screen', '이 브라우저는 화면 공유를 지원하지 않습니다');

  const announce = (slot) => session?.sendControl({ type: 'media', slot, on: !!mine[slot] });
  const bitrate = (slot) => (slot === 'camera' ? { maxBitrate: PROFILES[profile].maxBitrate } : {});

  async function setMine(slot, track) {
    mine[slot]?.stop();
    mine[slot] = track;
    ui.setLocal(slot, track, { facing });
    await session?.setTrack(slot, track, bitrate(slot));
    announce(slot);
    if (track) {
      const st = track.getSettings?.() ?? {};
      const size = st.width ? ` ${st.width}×${st.height}${st.frameRate ? `, ${Math.round(st.frameRate)} fps` : ''}` : '';
      ui.log('media', `${SLOT_NAME[slot]} 켬${size}`);
    } else {
      ui.log('media', `${SLOT_NAME[slot]} 끔`);
    }
  }

  async function tryGet(slot, getter) {
    try {
      const t = await getter();
      if (slot === 'screen') t.onended = () => mine.screen === t && setMine('screen', null); // 브라우저의 '공유 중지'
      await setMine(slot, t);
    } catch (err) {
      ui.log('error', `${SLOT_NAME[slot]}: ${mediaErrorText(err)}`);
      ui.setMediaNote(`${SLOT_NAME[slot]}을(를) 켜지 못했습니다. ${mediaErrorText(err)}`);
    }
  }

  ui.onCamera(() => (mine.camera ? setMine('camera', null) : tryGet('camera', () => getCamera({ facingMode: facing, profile }))));
  ui.onFlip(async () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    mine.camera?.stop(); // iOS는 카메라 두 개를 동시에 못 연다
    await tryGet('camera', () => getCamera({ facingMode: facing, profile }));
  });
  ui.onMic(() => (mine.audio ? setMine('audio', null) : tryGet('audio', getMic)));
  ui.onScreen(() => (mine.screen ? setMine('screen', null) : tryGet('screen', getScreen)));
  // 전문가가 현장 화질을 고른다 > 현장이 카메라를 다시 맞춘다
  ui.onProfile((p) => {
    session?.sendControl({ type: 'profile', profile: p });
    ui.log('media', `현장에 화질 변경 요청: ${PROFILES[p].label}`);
  });
  addEventListener('click', () => ui.resumeAudio(), true);

  async function applyProfile(p) {
    if (!PROFILES[p] || p === profile) return;
    profile = p;
    ui.log('media', `전문가 요청으로 화질 변경: ${PROFILES[p].label}`);
    if (mine.camera) await tryGet('camera', () => (mine.camera.stop(), getCamera({ facingMode: facing, profile })));
  }

  // 받는 영상 품질 (1초마다)
  setInterval(async () => {
    if (role !== 'expert' || session?.pc.connectionState !== 'connected') return;
    ui.showInbound(await session.inboundVideo('camera'));
  }, 1000);

  signaling.on('message', ({ direction, msg }) => ui.logSignal(direction, msg));
  signaling.on('close', ({ code }) => {
    ui.log('signaling', `서버 연결 끊김 (code ${code}). 이미 연결된 영상·데이터는 그대로 유지된다`);
    ui.setStatus('warn', session?.pc.connectionState === 'connected' ? '연결됨 (서버와는 끊김)' : '서버와 연결이 끊겼습니다');
  });

  function newSession() {
    session?.close();
    const s = new PeerSession({ signaling, iceServers, marks });
    ui.attachSession(s);
    ui.resetRemote();
    for (const [slot, track] of Object.entries(mine)) if (track) s.setTrack(slot, track, bitrate(slot));
    s.on('remote-track', ({ slot, track }) => {
      ui.setRemoteTrack(slot, track);
      ui.log('media', `상대 ${SLOT_NAME[slot] ?? slot} 통로 열림`);
    });
    s.on('control-open', () => ['audio', 'camera', 'screen'].forEach(announce));
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
      else if (m.type === 'media') {
        ui.setRemoteOn(m.slot, m.on);
        if (m.slot !== 'audio') ui.log('media', `상대가 ${SLOT_NAME[m.slot]}을(를) ${m.on ? '켰다' : '껐다'}`);
      } else if (m.type === 'profile' && role === 'field') applyProfile(m.profile);
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
    ui.resetRemote();
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
    for (const slot of Object.keys(mine)) if (mine[slot]) setMine(slot, null);
    ui.resetRemote();
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
