// 현장(field) / 전문가(expert) 화면 공통 로직: 입장, 연결, 퇴장
// 흐름: docs/03-connection-sequence.md §2

import { SignalingClient } from './signaling.js';
import { PeerSession, DEFAULT_ICE_SERVERS } from './peer.js';
import { createUi } from './ui.js';
import { PROFILES, mediaSupport, getCamera, getMic, getScreen, mediaErrorText } from './media.js';
import { DataLink } from './datachannel.js';
import { StatsRecorder } from './stats.js';

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
  // ?fake=clock: 카메라 대신 G2G 시계 화면을 보낸다 (카메라·모니터를 뺀 시스템 내부 지연 측정, 자동 시험용)
  const fakeClock = role === 'field' && params.get('fake') === 'clock';
  const support = mediaSupport();
  if (fakeClock) ui.setMediaNote('시험 모드: 카메라 대신 G2G 시계를 보냅니다.');
  else if (!support.camera) {
    ui.setMediaNote('지금은 http 주소라서 카메라와 마이크를 쓸 수 없습니다. ngrok의 https 주소로 여세요.');
    ui.disable('cam', 'https 필요');
    ui.disable('mic', 'https 필요');
  }
  if (role === 'expert' && !support.screen) ui.disable('screen', '이 브라우저는 화면 공유를 지원하지 않습니다');

  // 데이터 통로 메시지 (#16). 연결이 바뀌어도 하나를 계속 쓴다(대기 중인 지시를 다시 보내기 위해)
  const link = new DataLink();
  window.pbl = { link, session: () => session }; // 브라우저 콘솔과 자동 시험에서 쓰는 손잡이
  const announce = (slot) => link.send('media', { slot, on: !!mine[slot] });
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

  const cameraTrack = async () => {
    if (!fakeClock) return getCamera({ facingMode: facing, profile });
    const { clockTrack } = await import('/tools/g2g-latency/clock.js');
    const p = PROFILES[profile];
    return clockTrack({ width: p.width, height: p.height, fps: p.frameRate });
  };
  ui.onCamera(() => (mine.camera ? setMine('camera', null) : tryGet('camera', cameraTrack)));
  ui.onFlip(async () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    mine.camera?.stop(); // iOS는 카메라 두 개를 동시에 못 연다
    await tryGet('camera', () => getCamera({ facingMode: facing, profile }));
  });
  ui.onMic(() => (mine.audio ? setMine('audio', null) : tryGet('audio', getMic)));
  ui.onScreen(() => (mine.screen ? setMine('screen', null) : tryGet('screen', getScreen)));
  // 전문가가 현장 화질을 고른다 > 현장이 카메라를 다시 맞춘다
  ui.onProfile((p) => {
    link.send('profile', { profile: p });
    ui.log('media', `현장에 화질 변경 요청: ${PROFILES[p].label}`);
  });
  addEventListener('click', () => ui.resumeAudio(), true);

  async function applyProfile(p) {
    if (!PROFILES[p] || p === profile) return;
    profile = p;
    ui.log('media', `전문가 요청으로 화질 변경: ${PROFILES[p].label}`);
    if (mine.camera) await tryGet('camera', () => (mine.camera.stop(), cameraTrack()));
  }

  // 통신 품질 (#18): 1초마다 getStats를 한 줄로 기록한다. 끊긴 동안(disconnected, failed)도 기록한다
  const stats = new StatsRecorder(role);
  window.pbl.stats = stats;
  let sampling = false;
  setInterval(async () => {
    if (sampling || !session) return;
    sampling = true;
    try {
      const r = await stats.sample(session);
      if (!r) return;
      ui.showQuality(r, stats.rows.length);
      if (role === 'expert') ui.showInbound(r.in_w ? { width: r.in_w, height: r.in_h, fps: r.in_fps, kbps: r.in_kbps, codec: r.in_codec } : null);
    } catch (err) {
      ui.log('error', `품질 수집: ${err.message}`);
    } finally {
      sampling = false;
    }
  }, 1000);
  ui.onExportCsv(() => stats.toCsv());

  // 종단 지연 측정 (#19, 전문가). 받은 현장 영상의 QR을 읽는다
  let meter = null;
  let meterTimer = 0;
  const meterShow = () => ui.showG2G(meter.summary(), meter.running, meter.readerName);
  ui.onG2G({
    toggle: async () => {
      if (!meter) {
        const { G2GMeter } = await import('/tools/g2g-latency/g2g.js');
        meter = new G2GMeter(document.getElementById('vMain'));
        window.pbl.g2g = meter;
      }
      if (meter.running) {
        meter.stop();
        clearInterval(meterTimer);
        ui.log('media', `G2G 측정 중지: 표본 ${meter.samples.length}개`);
      } else {
        try {
          await meter.start();
          meterTimer = setInterval(meterShow, 500);
          ui.log('media', `G2G 측정 시작 (QR 읽기: ${meter.readerName})`);
        } catch (err) {
          ui.log('error', `G2G: ${err.message}`);
        }
      }
      meterShow();
    },
    reset: () => meter && (meter.reset(), meterShow()),
    csv: () => meter?.toCsv() ?? '',
  });

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
    link.attach(s);
    s.on('error', ({ where, message }) => ui.log('error', `${where}: ${message}`));
    session = s;
    return s;
  }

  link.on('pong', ({ t }) => ui.log('data', `데이터 통로 왕복 ${(performance.now() - t).toFixed(1)} ms`));
  link.on('media', ({ slot, on }) => {
    ui.setRemoteOn(slot, on);
    if (slot !== 'audio') ui.log('media', `상대가 ${SLOT_NAME[slot] ?? slot}을(를) ${on ? '켰다' : '껐다'}`);
  });
  link.on('profile', ({ profile: p }) => role === 'field' && applyProfile(p));
  // ---- 대화, 작업 지시, 장비 상태, 포인터 (#17) ----
  const notOpen = () => ui.log('data', '데이터 통로가 아직 열리지 않아 보내지 못했습니다');
  ui.onChat((text) => {
    const sent = link.chat(text);
    if (sent) ui.addChat('me', sent);
    else if (text.trim()) notOpen();
    return !!sent;
  });
  link.on('chat', ({ text }) => ui.addChat('peer', text));
  ui.onInstruct((text) => !!link.instruct(text)); // 연결 전이면 대기열에 넣고 연결되면 보낸다
  link.on('instruction-status', (item) => ui.showInstruction(item));
  link.on('instruction', (m) => ui.addInstruction(m, (id) => link.confirm(id)));
  ui.onDeviceStatus(() => (link.send('device-status', dummyDevice()) ? ui.log('data', '장비 상태 보냄') : notOpen()));
  link.on('device-status', (s) => ui.showDevice(s));
  ui.onPointerInput((p) => link.send('pointer', p));
  link.on('pointer', (p) => ui.showPointer(p));

  link.on('invalid', ({ channel, error }) => ui.log('error', `${channel} 채널: 잘못된 메시지 (${error})`));

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
    if (!link.send('ping', { t: performance.now() })) ui.log('data', '데이터 통로가 아직 열리지 않았습니다');
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

// PoC용 가짜 장비 상태 (실제 설비 연동은 범위 밖)
function dummyDevice() {
  const warn = Math.random() < 0.3;
  return {
    equipmentId: 'PUMP-03',
    state: warn ? '경고' : '정상',
    errorCode: warn ? 'E-214' : null,
    temperature: Math.round((warn ? 82 : 64) + Math.random() * 6),
  };
}
