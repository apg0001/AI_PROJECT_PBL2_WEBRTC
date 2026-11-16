// DataChannel 메시지 프로토콜 (#16, docs/03 §6, docs/04 TD-09)
//
// 모든 메시지는 같은 봉투(envelope)에 담는다: { type, seq, ts, payload }
//   type    메시지 종류 (아래 TYPES)
//   seq     보내는 쪽이 채널마다 1씩 올리는 번호. 순서 확인, 오래된 포인터 버리기에 쓴다
//   ts      보낸 시각 (ms, Unix epoch). 두 기기의 시계가 다를 수 있어 지연 계산에는 쓰지 않는다
//   payload 종류별 내용
//
// 채널 두 개 (PeerSession이 negotiated:true로 만든다)
//   control  순서 보장 + 재전송 (reliable)   채팅, 작업 지시, 확인(ack), 장비 상태, 화면 제어
//   pointer  순서 무시 + 재전송 없음          포인터 좌표. 늦게 온 좌표는 버린다
//
// 작업 지시(instruction)는 확인을 두 번 받는다
//   1) 받은 쪽 앱이 도착하자마자 ack {id, stage:'received'}  > 보낸 쪽은 왕복 시간을 안다
//   2) 현장 작업자가 '확인' 버튼을 누르면 ack {id, stage:'done'}
//   연결이 끊겨 도착 확인을 못 받은 지시는 다시 연결될 때 다시 보낸다. 받는 쪽은 id로 중복을 거른다.

export const TYPES = {
  // control
  chat: 'control', // {text}
  instruction: 'control', // {id, text}
  ack: 'control', // {id, stage: 'received' | 'done'}
  'device-status': 'control', // {equipmentId, state, errorCode, temperature}
  media: 'control', // {slot, on}       카메라·마이크·화면 공유 켜짐 알림 (#15)
  profile: 'control', // {profile}      화질 변경 요청 (#15)
  ping: 'control', // {t}               데이터 통로 왕복 확인
  pong: 'control', // {t}
  // pointer
  pointer: 'pointer', // {x, y, down}   영상 위 위치, 0~1로 정규화
};

const MAX_TEXT = 500; // 채팅·지시 글자 수 제한

export function encode(type, seq, payload) {
  return JSON.stringify({ type, seq, ts: Date.now(), payload });
}

// 받은 문자열을 검사해 봉투로 돌려준다. 잘못된 메시지면 이유와 함께 null
export function decode(raw, channel) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return { error: 'JSON이 아닙니다' };
  }
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') return { error: 'type이 없습니다' };
  if (!(m.type in TYPES)) return { error: `알 수 없는 type: ${m.type}` };
  if (TYPES[m.type] !== channel) return { error: `${m.type}은(는) ${TYPES[m.type]} 채널 메시지입니다` };
  if (!Number.isInteger(m.seq)) return { error: 'seq가 없습니다' };
  const p = m.payload ?? {};
  if ((m.type === 'chat' || m.type === 'instruction') && typeof p.text !== 'string') return { error: 'text가 없습니다' };
  if ((m.type === 'instruction' || m.type === 'ack') && typeof p.id !== 'string') return { error: 'id가 없습니다' };
  if (m.type === 'pointer' && !(isUnit(p.x) && isUnit(p.y))) return { error: '포인터 좌표는 0~1이어야 합니다' };
  return { msg: { type: m.type, seq: m.seq, ts: m.ts, payload: p } };
}

const isUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

export class DataLink extends EventTarget {
  constructor() {
    super();
    this.session = null;
    this.seq = { control: 0, pointer: 0 };
    this.pending = new Map(); // 내가 보낸 지시: id > {text, sentAt, receivedMs, done}
    this.seenInstructions = new Set(); // 받은 지시 id (중복 거르기)
    this.lastPointerSeq = -1;
    // 실험 기록용 숫자
    this.counts = { sent: {}, received: {}, invalid: 0, pointerStale: 0, pointerGap: 0, resent: 0 };
  }

  // 새 연결(PeerSession)마다 부른다. 대기 중인 지시는 연결이 열리면 다시 보낸다.
  attach(session) {
    this.session = session;
    this.lastPointerSeq = -1; // 상대가 새로고침했으면 번호가 0부터 다시 시작한다
    session.control.onmessage = (e) => this.#receive(e.data, 'control');
    session.pointer.onmessage = (e) => this.#receive(e.data, 'pointer');
    session.on('control-open', () => this.#resendPending());
  }

  get open() {
    return this.session?.control.readyState === 'open';
  }

  // 보내기. 채널이 열려 있지 않으면 false
  send(type, payload = {}) {
    const channel = TYPES[type];
    const ch = this.session?.[channel];
    if (!ch || ch.readyState !== 'open') return false;
    // 포인터는 쌓이면 의미가 없다: 보내기 대기열이 밀려 있으면 이번 좌표는 건너뛴다
    if (channel === 'pointer' && ch.bufferedAmount > 16 * 1024) return false;
    ch.send(encode(type, this.seq[channel]++, payload));
    this.counts.sent[type] = (this.counts.sent[type] ?? 0) + 1;
    return true;
  }

  chat(text) {
    text = String(text).trim().slice(0, MAX_TEXT);
    if (!text) return null;
    return this.send('chat', { text }) ? text : null;
  }

  // 작업 지시: id를 붙여 보내고 확인을 기다린다. 연결 전이면 대기열에 두었다가 연결되면 보낸다
  instruct(text) {
    text = String(text).trim().slice(0, MAX_TEXT);
    if (!text) return null;
    const id = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const item = { id, text, sentAt: performance.now(), receivedMs: null, done: false, sent: false };
    this.pending.set(id, item);
    item.sent = this.send('instruction', { id, text });
    this.#emit('instruction-status', item);
    return item;
  }

  confirm(id) {
    return this.send('ack', { id, stage: 'done' });
  }

  #resendPending() {
    for (const item of this.pending.values()) {
      if (item.receivedMs != null) continue;
      item.sentAt = performance.now();
      item.sent = this.send('instruction', { id: item.id, text: item.text });
      if (item.sent) this.counts.resent++;
      this.#emit('instruction-status', item);
    }
  }

  #receive(raw, channel) {
    const { msg, error } = decode(raw, channel);
    if (!msg) {
      this.counts.invalid++;
      this.#emit('invalid', { channel, error });
      return;
    }
    this.counts.received[msg.type] = (this.counts.received[msg.type] ?? 0) + 1;
    const p = msg.payload;

    if (msg.type === 'pointer') {
      // 순서 보장이 없으므로 늦게 온 좌표는 버린다. 건너뛴 번호는 유실(또는 아직 안 온 것)
      if (msg.seq <= this.lastPointerSeq) {
        this.counts.pointerStale++;
        return;
      }
      if (this.lastPointerSeq >= 0) this.counts.pointerGap += msg.seq - this.lastPointerSeq - 1;
      this.lastPointerSeq = msg.seq;
    }

    if (msg.type === 'instruction') {
      this.send('ack', { id: p.id, stage: 'received' }); // 중복이어도 확인은 다시 보낸다
      if (this.seenInstructions.has(p.id)) return;
      this.seenInstructions.add(p.id);
    }

    if (msg.type === 'ack') {
      const item = this.pending.get(p.id);
      if (!item) return;
      if (p.stage === 'received' && item.receivedMs == null) item.receivedMs = Math.round(performance.now() - item.sentAt);
      if (p.stage === 'done') item.done = true;
      this.#emit('instruction-status', item);
      return;
    }

    if (msg.type === 'ping') {
      this.send('pong', { t: p.t });
      return;
    }

    this.#emit(msg.type, { ...p, seq: msg.seq, ts: msg.ts });
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }
}
