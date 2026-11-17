// Signaling 서버(WebSocket) 클라이언트 — 메시지 스펙: docs/03-connection-sequence.md §3
// 서버 메시지를 type 이름의 이벤트로 내보낸다. (예: 'joined', 'offer', 'peer-left')
//
// 자동 재접속 (#34): 서버 연결이 끊기면(네트워크 전환, 서버 재시작) 1, 2, 4, 5, 5…초 간격으로 다시 붙는다.
// 다시 붙으면 'reopen'을 내보내고, 앱이 같은 clientId로 다시 join한다.

const RETRY_MS = [1000, 2000, 4000, 5000];

export class SignalingClient extends EventTarget {
  constructor(url = defaultUrl()) {
    super();
    this.url = url;
    this.ws = null;
    this.stopped = false; // 나가기를 누르면 다시 붙지 않는다
    this.retries = 0;
    this.timer = 0;
    this.connectedOnce = false;
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connectedOnce = true;
        const again = this.retries > 0;
        this.retries = 0;
        resolve();
        if (again) this.#emit('reopen', {});
      };
      ws.onerror = () => !opened && reject(new Error(`WebSocket 연결 실패: ${this.url}`));
      ws.onclose = (e) => {
        if (this.ws !== ws) return; // 이미 새 연결로 바뀜
        if (opened) this.#emit('close', { code: e.code, reason: e.reason });
        this.#retry();
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        this.#emit('message', { direction: 'in', msg });
        this.#emit(msg.type, msg);
      };
    });
  }

  #retry() {
    // 첫 접속 실패는 호출한 쪽이 처리한다. 한 번이라도 붙었던 연결만 다시 붙는다
    if (this.stopped || this.timer || !this.connectedOnce) return;
    const delay = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries++;
    this.#emit('reconnecting', { attempt: this.retries, delay });
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.connect().catch(() => this.#retry());
    }, delay);
  }

  send(msg) {
    if (!this.open) return false;
    this.ws.send(JSON.stringify(msg));
    this.#emit('message', { direction: 'out', msg });
    return true;
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }

  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

function defaultUrl() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
