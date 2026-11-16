// G2G 측정기 (#19): 받은 영상의 프레임마다 QR(시계 시각)을 읽어 종단 지연을 잰다.
//
//   G2G = 이 프레임이 화면에 표시될 시각 - 영상 속 시계 시각
//   시계 페이지와 전문가 화면이 같은 PC에 있으므로 두 시각이 같은 시계다 (기기 간 시계 맞추기 불필요)
//
// requestVideoFrameCallback의 metadata를 쓴다
//   expectedDisplayTime  이 프레임이 화면에 나갈 예정 시각 > 표시 시각
//   receiveTime          (WebRTC) 이 프레임의 마지막 패킷을 받은 시각 > 지연을 '받기 전'과 '받은 뒤'로 나눈다
// QR 읽기는 BarcodeDetector(Chrome), 없으면 jsQR(CDN)

import { PREFIX } from './clock.js';

const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';

async function makeReader() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const d = new window.BarcodeDetector({ formats: ['qr_code'] });
        return { name: 'BarcodeDetector', read: async (bmp) => (await d.detect(bmp))[0]?.rawValue ?? null };
      }
    } catch {
      // 지원 목록 조회 실패 > jsQR로
    }
  }
  if (!window.jsQR) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSQR;
      s.onload = resolve;
      s.onerror = () => reject(new Error('QR 읽기 도구(jsQR)를 불러오지 못했습니다'));
      document.head.append(s);
    });
  }
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return {
    name: 'jsQR',
    read: async (bmp) => {
      c.width = bmp.width;
      c.height = bmp.height;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      return window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    },
  };
}

export const CSV_COLUMNS = [
  ['i', '표본 번호'],
  ['time', '측정 시각 (ISO)'],
  ['clock_ms', '영상 속 시계 시각 (epoch ms)'],
  ['g2g_ms', 'Glass-to-Glass 지연 = 표시 시각 - 시계 시각'],
  ['before_recv_ms', '받기 전 구간 = 수신 시각 - 시계 시각 (시계 화면 표시, 카메라, 인코딩, 네트워크)'],
  ['after_recv_ms', '받은 뒤 구간 = 표시 시각 - 수신 시각 (지터 버퍼, 디코딩, 렌더링)'],
  ['frame_w', '받은 영상 가로'],
  ['frame_h', '받은 영상 세로'],
  ['read_ms', 'QR 읽는 데 걸린 시간 (측정 오차가 아니라 도구 부담)'],
];

export class G2GMeter {
  constructor(video) {
    this.video = video;
    this.samples = [];
    this.frames = 0; // 살펴본 프레임
    this.unread = 0; // QR을 못 읽은 프레임
    this.skipped = 0; // 앞 프레임을 읽는 중이라 건너뛴 프레임
    this.running = false;
    this.reader = null;
    this.lastClock = null;
  }

  get readerName() {
    return this.reader?.name ?? '-';
  }

  async start() {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) throw new Error('이 브라우저는 requestVideoFrameCallback을 지원하지 않습니다 (Chrome 사용)');
    this.reader ??= await makeReader();
    this.running = true;
    this.#next();
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.samples = [];
    this.frames = this.unread = this.skipped = 0;
    this.lastClock = null;
  }

  #next() {
    if (!this.running) return;
    this.video.requestVideoFrameCallback((_, md) => {
      this.#onFrame(md);
      this.#next();
    });
  }

  async #onFrame(md) {
    this.frames++;
    if (this.busy) {
      this.skipped++;
      return;
    }
    this.busy = true;
    try {
      const display = performance.timeOrigin + md.expectedDisplayTime;
      const recv = md.receiveTime != null ? performance.timeOrigin + md.receiveTime : null;
      const bmp = await createImageBitmap(this.video); // 콜백 안에서 바로 찍으므로 이 프레임이다
      const t0 = performance.now();
      const raw = await this.reader.read(bmp);
      const readMs = performance.now() - t0;
      bmp.close?.();
      if (!raw?.startsWith(PREFIX)) {
        this.unread++;
        return;
      }
      const clock = Number(raw.slice(PREFIX.length));
      if (!Number.isFinite(clock) || clock === this.lastClock) return; // 같은 시계 화면을 두 번 세지 않는다
      this.lastClock = clock;
      const g2g = display - clock;
      if (g2g < 0 || g2g > 10000) {
        this.unread++; // 다른 PC의 시계를 찍은 경우 등
        return;
      }
      this.samples.push({
        i: this.samples.length + 1,
        time: new Date().toISOString(),
        clock_ms: clock,
        g2g_ms: round1(g2g),
        before_recv_ms: recv != null ? round1(recv - clock) : undefined,
        after_recv_ms: recv != null ? round1(display - recv) : undefined,
        frame_w: md.width,
        frame_h: md.height,
        read_ms: round1(readMs),
      });
    } catch {
      this.unread++;
    } finally {
      this.busy = false;
    }
  }

  summary() {
    const s = (key) => {
      const v = this.samples.map((x) => x[key]).filter((x) => x != null).sort((a, b) => a - b);
      if (!v.length) return null;
      const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
      return { n: v.length, median: q(0.5), p95: q(0.95), min: v[0], max: v.at(-1), mean: round1(v.reduce((a, b) => a + b, 0) / v.length) };
    };
    return { g2g: s('g2g_ms'), before: s('before_recv_ms'), after: s('after_recv_ms'), frames: this.frames, unread: this.unread, skipped: this.skipped };
  }

  toCsv() {
    const keys = CSV_COLUMNS.map(([k]) => k);
    return [keys.join(','), ...this.samples.map((r) => keys.map((k) => r[k] ?? '').join(','))].join('\n') + '\n';
  }
}

const round1 = (v) => Math.round(v * 10) / 10;
