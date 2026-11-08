// RTCPeerConnection 한 개(1:1 세션)를 감싼다.
// - Offer/Answer, Trickle ICE, 원격 Candidate 대기열
// - DataChannel은 negotiated:true로 양쪽이 같은 id를 만든다 (docs/03 §1, docs/04 TD-09)
// - 측정 시점 t0~t7 기록 (docs/03 §5)

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export class PeerSession extends EventTarget {
  constructor({ signaling, iceServers = DEFAULT_ICE_SERVERS, marks = {} }) {
    super();
    this.signaling = signaling;
    this.marks = marks; // 앱이 t0(join), t1(peer-joined)을 넣어 준다
    this.localCandidates = [];
    this.remoteCandidates = [];
    this.pendingRemote = [];
    this.closed = false;

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

    this.control.onopen = () => {
      this.#mark('t6_controlOpen');
      this.#emit('control-open', {});
    };
    this.control.onclose = () => this.#emit('control-close', {});
    this.control.onmessage = (e) => this.#emit('control-message', JSON.parse(e.data));
  }

  // Room에 먼저 있던 쪽이 호출한다
  async makeOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.#mark('t2_offerSent');
    this.signaling.send({ type: 'offer', sdp: this.pc.localDescription.toJSON() });
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription(sdp);
    await this.#flushRemote();
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
