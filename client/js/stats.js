// WebRTC 품질 지표 수집 (#18, docs/05 §2, docs/04 TD-11)
// 1초마다 getStats()를 읽어 한 줄(row)로 만든다. 누적 값(바이트, 손실 수 등)은 직전 줄과의 차이로 '그 1초 동안'의 값을 구한다.
// 연결이 바뀌어도(재연결) 기록은 이어서 쌓고, sess 열로 몇 번째 연결인지 구분한다.
//
// 받는 영상: 전문가는 현장 카메라, 현장은 전문가 화면 공유
// 보내는 영상: 전문가는 화면 공유, 현장은 카메라

export const COLUMNS = [
  // 공통
  ['t_s', '기록 시작부터 초'],
  ['time', '시각 (ISO)'],
  ['sess', '몇 번째 연결'],
  ['conn', 'connectionState'],
  ['path', '선택 경로 내 쪽/상대 쪽 (host, srflx, prflx, relay)'],
  ['rtt_ms', 'ICE 경로 왕복 시간'],
  ['avail_out_kbps', '보낼 수 있다고 추정한 대역폭'],
  // 받는 영상
  ['in_slot', '받는 영상 통로'],
  ['in_w', '해상도 가로'],
  ['in_h', '해상도 세로'],
  ['in_fps', '초당 프레임 (디코딩)'],
  ['in_kbps', '받은 비트레이트 (1초)'],
  ['in_lost', '손실 패킷 (1초)'],
  ['in_loss_pct', '손실률 % (1초)'],
  ['in_jitter_ms', '지터'],
  ['in_jb_ms', '지터 버퍼 평균 지연 (1초)'],
  ['in_decode_ms', '프레임당 디코딩 시간 (1초)'],
  ['in_freezes', '정지 횟수 (누적, Chrome)'],
  ['in_freeze_s', '정지 시간 합 (누적 초, Chrome)'],
  ['in_dropped', '버린 프레임 (누적)'],
  ['in_codec', '코덱'],
  // 보내는 영상
  ['out_slot', '보내는 영상 통로'],
  ['out_w', '해상도 가로'],
  ['out_h', '해상도 세로'],
  ['out_fps', '초당 프레임 (인코딩)'],
  ['out_kbps', '보낸 비트레이트 (1초)'],
  ['out_limit', '화질을 낮춘 이유 (none, bandwidth, cpu, other)'],
  ['out_target_kbps', '인코더 목표 비트레이트'],
  // 받는 음성
  ['aud_loss_pct', '음성 손실률 % (1초)'],
  ['aud_jitter_ms', '음성 지터'],
];

const SLOTS = {
  expert: { in: 'camera', out: 'screen' },
  field: { in: 'screen', out: 'camera' },
};
const MAX_ROWS = 2 * 60 * 60; // 2시간

export class StatsRecorder {
  constructor(role) {
    this.role = role;
    this.rows = [];
    this.t0 = null;
    this.sess = 0;
    this.session = null;
    this.prev = {};
  }

  // 1초마다 부른다. 연결이 없으면 null
  async sample(session) {
    if (!session || session.closed || session.pc.connectionState === 'new') return null;
    if (session !== this.session) {
      this.session = session;
      this.sess++;
      this.prev = {};
    }
    const now = performance.now();
    this.t0 ??= now;
    const { in: inSlot, out: outSlot } = SLOTS[this.role];
    const row = {
      t_s: +((now - this.t0) / 1000).toFixed(1),
      time: new Date().toISOString(),
      sess: this.sess,
      conn: session.pc.connectionState,
      in_slot: inSlot,
      out_slot: outSlot,
    };

    const all = await session.pc.getStats();
    // 선택된 경로
    let pair;
    all.forEach((s) => s.type === 'transport' && s.selectedCandidatePairId && (pair = all.get(s.selectedCandidatePairId)));
    if (!pair) all.forEach((s) => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && (pair = s));
    if (pair) {
      const lt = all.get(pair.localCandidateId)?.candidateType ?? '?';
      const rt = all.get(pair.remoteCandidateId)?.candidateType ?? '?';
      row.path = `${lt}/${rt}`;
      if (pair.currentRoundTripTime != null) row.rtt_ms = Math.round(pair.currentRoundTripTime * 1000);
      if (pair.availableOutgoingBitrate != null) row.avail_out_kbps = Math.round(pair.availableOutgoingBitrate / 1000);
    }

    const slots = session.slots ?? {};
    const pick = (report, type, kind) => {
      let found = null;
      report?.forEach((s) => s.type === type && s.kind === kind && (found = s));
      return found;
    };

    // 받는 영상
    const inRep = slots[inSlot] ? await slots[inSlot].receiver.getStats() : null;
    const iv = pick(inRep, 'inbound-rtp', 'video');
    if (iv && iv.framesDecoded > 0) {
      const p = this.#delta('in', iv);
      row.in_w = iv.frameWidth;
      row.in_h = iv.frameHeight;
      row.in_fps = round1(iv.framesPerSecond);
      row.in_kbps = p && rate(iv.bytesReceived - p.bytesReceived, iv.timestamp - p.timestamp);
      if (p) {
        const lost = Math.max(0, (iv.packetsLost ?? 0) - (p.packetsLost ?? 0));
        const recv = (iv.packetsReceived ?? 0) - (p.packetsReceived ?? 0);
        row.in_lost = lost;
        row.in_loss_pct = lost + recv > 0 ? round2((lost / (lost + recv)) * 100) : 0;
        row.in_jb_ms = avgMs(iv.jitterBufferDelay - p.jitterBufferDelay, iv.jitterBufferEmittedCount - p.jitterBufferEmittedCount);
        row.in_decode_ms = avgMs(iv.totalDecodeTime - p.totalDecodeTime, iv.framesDecoded - p.framesDecoded);
      }
      row.in_jitter_ms = iv.jitter != null ? round1(iv.jitter * 1000) : undefined;
      row.in_freezes = iv.freezeCount;
      row.in_freeze_s = iv.totalFreezesDuration != null ? round2(iv.totalFreezesDuration) : undefined;
      row.in_dropped = iv.framesDropped;
      row.in_codec = inRep.get(iv.codecId)?.mimeType?.split('/')[1];
    }

    // 보내는 영상 (트랙이 있을 때만)
    const sender = slots[outSlot]?.sender;
    const outRep = sender?.track ? await sender.getStats() : null;
    const ov = pick(outRep, 'outbound-rtp', 'video');
    if (ov && ov.framesEncoded > 0) {
      const p = this.#delta('out', ov);
      row.out_w = ov.frameWidth;
      row.out_h = ov.frameHeight;
      row.out_fps = round1(ov.framesPerSecond);
      row.out_kbps = p && rate(ov.bytesSent - p.bytesSent, ov.timestamp - p.timestamp);
      row.out_limit = ov.qualityLimitationReason;
      if (ov.targetBitrate != null) row.out_target_kbps = Math.round(ov.targetBitrate / 1000);
    }

    // 받는 음성
    const aRep = slots.audio ? await slots.audio.receiver.getStats() : null;
    const ia = pick(aRep, 'inbound-rtp', 'audio');
    if (ia && ia.packetsReceived > 0) {
      const p = this.#delta('aud', ia);
      if (p) {
        const lost = Math.max(0, (ia.packetsLost ?? 0) - (p.packetsLost ?? 0));
        const recv = ia.packetsReceived - p.packetsReceived;
        row.aud_loss_pct = lost + recv > 0 ? round2((lost / (lost + recv)) * 100) : 0;
      }
      row.aud_jitter_ms = ia.jitter != null ? round1(ia.jitter * 1000) : undefined;
    }

    this.rows.push(row);
    if (this.rows.length > MAX_ROWS) this.rows.shift();
    return row;
  }

  // 직전 값을 돌려주고 이번 값을 저장한다. 통로의 트랙이 바뀌어 누적 값이 줄면 직전 값을 버린다
  #delta(key, cur) {
    const p = this.prev[key];
    this.prev[key] = cur;
    if (!p || p.id !== cur.id || (cur.bytesReceived ?? cur.bytesSent) < (p.bytesReceived ?? p.bytesSent)) return null;
    return p;
  }

  toCsv() {
    const keys = COLUMNS.map(([k]) => k);
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [keys.join(','), ...this.rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n') + '\n';
  }
}

const round1 = (v) => (v == null ? undefined : Math.round(v * 10) / 10);
const round2 = (v) => (v == null ? undefined : Math.round(v * 100) / 100);
const rate = (bytes, ms) => (ms > 0 ? Math.round((bytes * 8) / ms) : undefined); // bytes/ms*8 = kbps
const avgMs = (sec, n) => (n > 0 && sec >= 0 ? round1((sec / n) * 1000) : undefined);
