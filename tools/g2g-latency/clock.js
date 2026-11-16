// G2G 시계 (#19): 캔버스에 지금 시각(ms)을 QR과 숫자로 매 프레임 그린다.
// - clock.html: PC 화면에 띄우고 폰 카메라로 찍는다 (실제 Glass-to-Glass)
// - 현장 화면 ?fake=clock: 카메라 대신 이 캔버스를 바로 보낸다 (카메라·모니터를 뺀 시스템 내부 지연)
// 시각은 performance.timeOrigin + performance.now(): 같은 PC의 다른 탭과 같은 기준, ms 소수점까지.

export const PREFIX = 'G2G:';
export const now = () => performance.timeOrigin + performance.now();

const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

export function loadQrLib() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = resolve;
    s.onerror = () => reject(new Error('QR 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)'));
    document.head.append(s);
  });
}

// 캔버스 하나에 그리기. 왼쪽 QR(정사각형), 오른쪽 숫자. 반환: 멈추는 함수
export function startClock(canvas, { fps = 0 } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let raf = 0;
  let last = 0;
  let stopped = false;
  const draw = () => {
    if (stopped) return;
    const t = now();
    if (!fps || t - last >= 1000 / fps - 1) {
      last = t;
      paint(ctx, canvas.width, canvas.height, t);
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export function paint(ctx, w, h, t) {
  const ms = Math.floor(t);
  const qr = window.qrcode(0, 'L'); // 짧은 숫자라 버전 1~2. 오류 정정 L이면 칸이 커서 카메라로 읽기 쉽다
  qr.addData(PREFIX + ms);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4; // QR 둘레 흰 여백(칸 수). 없으면 읽지 못한다
  const side = Math.min(h, w * 0.55);
  const cell = Math.floor(side / (n + quiet * 2));
  const qrSize = cell * (n + quiet * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  const ox = Math.floor((side - qrSize) / 2) + cell * quiet;
  const oy = Math.floor((h - qrSize) / 2) + cell * quiet;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
  // 숫자: 사진으로 수동 검증할 때 읽는다 (뒤 6자리 = 초.밀리초)
  const s = String(ms);
  const fontPx = Math.floor(Math.min(h / 5, (w - side) / 4.2));
  ctx.fillStyle = '#22272b';
  ctx.font = `600 ${fontPx}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${s.slice(-6, -3)}.${s.slice(-3)}`, side + fontPx * 0.4, h / 2);
  ctx.font = `400 ${Math.floor(fontPx / 3)}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillStyle = '#5f6b76';
  ctx.fillText(s, side + fontPx * 0.4, h / 2 + fontPx * 0.9);
}

// 현장 ?fake=clock: 시계 캔버스를 영상 트랙으로
export async function clockTrack({ width = 854, height = 480, fps = 30 } = {}) {
  await loadQrLib();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const stop = startClock(canvas);
  const track = canvas.captureStream(fps).getVideoTracks()[0];
  track.addEventListener('ended', stop);
  const origStop = track.stop.bind(track);
  track.stop = () => {
    stop();
    origStop();
  };
  return track;
}
