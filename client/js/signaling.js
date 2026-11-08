// Signaling 서버(WebSocket) 클라이언트 — 메시지 스펙: docs/03-connection-sequence.md §3
// 서버 메시지를 type 이름의 이벤트로 내보낸다. (예: 'joined', 'offer', 'peer-left')

export class SignalingClient extends EventTarget {
  constructor(url = defaultUrl()) {
    super();
    this.url = url;
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`WebSocket 연결 실패: ${this.url}`));
      ws.onclose = (e) => this.#emit('close', { code: e.code, reason: e.reason });
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        this.#emit('message', { direction: 'in', msg });
        this.#emit(msg.type, msg);
      };
    });
  }

  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    this.#emit('message', { direction: 'out', msg });
    return true;
  }

  on(type, handler) {
    this.addEventListener(type, (e) => handler(e.detail));
  }

  close() {
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
