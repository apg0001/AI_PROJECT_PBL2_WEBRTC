// RTCPeerConnection 한 개(1:1 세션)를 감싼다.
// - Offer/Answer, Trickle ICE, 원격 Candidate 대기열
// - DataChannel은 negotiated:true로 양쪽이 같은 id를 만든다 (docs/03 §1, docs/04 TD-09)
// - 측정 시점 t0~t7 기록 (docs/03 §5)
// - 미디어(#15, #62): 연결할 때 송수신 통로(transceiver) 3개를 미리 만든다.
//   순서 = MEDIA_SLOTS. 켜고 끌 때는 replaceTrack만 하므로 다시 협상(offer/answer)하지 않는다.
//   Offerer가 만든 순서대로 Answerer의 getTransceivers()가 나오므로 순서로 짝을 맞춘다.

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
export const MEDIA_SLOTS = [
  { slot: 'audio', kind: 'audio' }, // 양방향 음성
  { slot: 'camera', kind: 'video' }, // 현장 카메라 (현장 > 전문가)
  { slot: 'screen', kind: 'video' }, // 화면 공유 (전문가 > 현장)
];

export class PeerSession extends EventTarget {
  constructor({ signaling, iceServers = DEFAULT_ICE_SERVERS, marks = {} }) {
    super();
    this.signaling = signaling;
    this.marks = marks; // 앱이 t0(join), t1(peer-joined)을 넣어 준다
    this.localCandidates = [];
    this.remoteCandidates = [];
    this.pendingRemote = [];
    this.closed = false;
    this.slots = null; // { audio: RTCRtpTransceiver, camera, screen }
    this.localTracks = { audio: null, camera: null, screen: null };
    this.maxBitrate = {}; // slot > bps

    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    this.control = pc.createDataChannel('control', { negotiated: true, id: 0, ordered: true });
    this.pointer = pc.createDataChannel('pointer', {
      negotiated: true,
      id: 1,
      ordered: false,
      maxRetransmits: 0,
    });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.#mark('t4_firstLocalIce');
        this.localCandidates.push(describe(candidate));
        this.#emit('local-candidate', describe(candidate));
      } else {
        this.#emit('gathering-done', {});
      }
      this.signaling.send({ type: 'ice', candidate: candidate ? candidate.toJSON() : null });
    };

    for (const kind of ['connectionState', 'iceConnectionState', 'iceGatheringState', 'signalingState']) {
      pc[`on${kind.toLowerCase()}change`] = () => {
        if (kind === 'connectionState' && pc.connectionState === 'connected') this.#mark('t5_connected');
        this.#emit('state', { kind, value: pc[kind] });
      };
    }

    // Answerer는 setRemoteDescription 도중에 ontrack이 먼저 온다. 그때는 통로 이름이 아직 없으므로
    // #bindSlots가 끝난 뒤 한꺼번에 알린다.
    pc.ontrack = (e) => {
      const slot = this.slots && Object.keys(this.slots).find((k) => this.slots[k] === e.transceiver);
      if (slot) this.#emit('remote-track', { slot, track: e.track });
    };

    this.control.onopen = () => {
      this.#mark('t6_controlOpen');
      this.#emit('control-open', {});
    };
    this.control.onclose = () => this.#emit('control-close', {});
    this.control.onmessage = (e) => this.#emit('control-message', JSON.parse(e.data));
  }

  // Room에 먼저 있던 쪽이 호출한다
  async makeOffer() {
    const list = MEDIA_SLOTS.map(({ kind }) => this.pc.addTransceiver(kind, { direction: 'sendrecv' }));
    await this.#bindSlots(list);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.#mark('t2_offerSent');
    this.signaling.send({ type: 'offer', sdp: this.pc.localDescription.toJSON() });
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription(sdp);
    await this.#flushRemote();
    const list = this.pc.getTransceivers().filter((t) => t.receiver.track);
    for (const t of list) t.direction = 'sendrecv';
    if (list.length >= MEDIA_SLOTS.length) {
      await this.#bindSlots(list);
      for (const [slot, t] of Object.entries(this.slots)) this.#emit('remote-track', { slot, track: t.receiver.track });
    } else this.#emit('error', { where: 'media', message: `상대가 미디어 통로를 ${list.length}개만 열었습니다` });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.signaling.send({ type: 'answer', sdp: this.pc.localDescription.toJSON() });
  }

  async handleAnswer(sdp) {
    this.#mark('t3_answerReceived');
    await this.pc.setRemoteDescription(sdp);
    await this.#flushRemote();
  }

  async handleIce(candidate) {
    if (!candidate || !candidate.candidate) return; // 수집 완료 신호
    this.remoteCandidates.push(describe(candidate));
    this.#emit('remote-candidate', describe(candidate));
    // setRemoteDescription 전에 도착한 Candidate는 쌓아 두었다가 넣는다
    if (!this.pc.remoteDescription) this.pendingRemote.push(candidate);
    else await this.#addRemote(candidate);
  }

  // 보낼 트랙을 바꾼다. null이면 보내기를 멈춘다. 연결 전이면 연결될 때 붙인다.
  async setTrack(slot, track, { maxBitrate } = {}) {
    this.localTracks[slot] = track;
    if (maxBitrate) this.maxBitrate[slot] = maxBitrate;
    if (!this.slots?.[slot]) return;
    const sender = this.slots[slot].sender;
    await sender.replaceTrack(track);
    if (track && this.maxBitrate[slot]) await setMaxBitrate(sender, this.maxBitrate[slot]);
  }

  // 받는 영상의 해상도, 초당 프레임, 비트레이트 (1초 간격으로 부르면 kbps가 나온다)
  async inboundVideo(slot) {
    const rx = this.slots?.[slot]?.receiver;
    if (!rx) return null;
    const stats = await rx.getStats();
    let v = null;
    stats.forEach((s) => s.type === 'inbound-rtp' && s.kind === 'video' && (v = s));
    if (!v) return null;
    const prev = this.#prevInbound[slot];
    this.#prevInbound[slot] = { bytes: v.bytesReceived, ts: v.timestamp };
    const kbps = prev && v.timestamp > prev.ts ? ((v.bytesReceived - prev.bytes) * 8) / (v.timestamp - prev.ts) : null;
    return {
      width: v.frameWidth ?? null,
      height: v.frameHeight ?? null,
      fps: v.framesPerSecond ?? null,
      kbps: kbps != null ? Math.round(kbps) : null,
      framesDecoded: v.framesDecoded ?? 0,
      codec: stats.get(v.codecId)?.mimeType?.split('/')[1] ?? null,
    };
  }

  #prevInbound = {};

  async #bindSlots(list) {
    this.slots = {};
    MEDIA_SLOTS.forEach(({ slot }, i) => (this.slots[slot] = list[i]));
    for (const [slot, track] of Object.entries(this.localTracks)) if (track) await this.setTrack(slot, track);
  }

  sendControl(msg) {
    if (this.control.readyState !== 'open') return false;
    this.control.send(JSON.stringify(msg));
    return true;
  }

  // 실제로 선택된 경로 (host / srflx / relay)
  async selectedPair() {
    const stats = await this.pc.getStats();
    let pair;
    stats.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
    });
    if (!pair) stats.forEach((s) => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && (pair = s));
    if (!pair) return null;
    const pick = (c) =>
      c && { type: c.candidateType, address: c.address ?? c.ip, port: c.port, protocol: c.protocol };
    return {
      local: pick(stats.get(pair.localCandidateId)),
      remote: pick(stats.get(pair.remoteCandidateId)),
      rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pc.close();
    this.#emit('closed', {});
  }

  async #flushRemote() {
    const queued = this.pendingRemote.splice(0);
    for (const c of queued) await this.#addRemote(c);
  }

  async #addRemote(candidate) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      this.#emit('error', { where: 'addIceCandidate', message: err.message });
    }
  }

  #mark(name) {
    if (this.marks[name] == null) this.marks[name] = performance.now();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }
}

async function setMaxBitrate(sender, bps) {
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = bps;
    await sender.setParameters(params);
  } catch {
    // 일부 브라우저는 협상 전 setParameters를 거부한다. 화질 제한만 빠질 뿐 전송은 된다.
  }
}

// "candidate:… typ srflx raddr …" 문자열에서 표시용 필드를 뽑는다
export function describe(c) {
  const str = c.candidate ?? '';
  const parts = str.split(' ');
  const typ = parts[parts.indexOf('typ') + 1];
  return {
    type: c.type ?? typ ?? '?',
    protocol: c.protocol ?? parts[2]?.toLowerCase() ?? '?',
    address: c.address ?? parts[4] ?? '?',
    port: c.port ?? Number(parts[5]) ?? null,
    raw: str,
  };
}
