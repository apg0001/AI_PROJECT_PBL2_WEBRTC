// E2E: 실제 Chrome(별도 프로필 3개)으로 field ↔ expert 1:1 연결 검증
// 실행: npm run e2e  (설치된 Google Chrome 사용, 경로는 CHROME 환경변수로 변경 가능)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = spawn('node', ['server/src/index.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT) } });
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
await new Promise((r) => setTimeout(r, 800));

// 가짜 카메라·마이크와 권한 자동 허용. 화면 공유는 탭 캡처를 자동 선택한다.
const MEDIA_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--auto-accept-this-tab-capture',
  '--auto-select-desktop-capture-source=Entire screen',
  '--autoplay-policy=no-user-gesture-required',
];
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', ...MEDIA_ARGS] });
const videoSize = (p) => p.$eval('#vMain', (v) => (v.hidden ? 0 : v.videoWidth));
const [b1, b2, b3] = await Promise.all([launch(), launch(), launch()]);
const status = (p) => p.$eval('#status', (e) => e.textContent);
const result = (p) => p.$$eval('#result tr', (rows) => rows.map((r) => `${r.cells[0].textContent}: ${r.cells[1].textContent}`));
const waitStatus = (p, text, timeout = 15000) =>
  p.waitForFunction((t) => document.getElementById('status')?.textContent.includes(t), { timeout }, text);
const errors = [];
let ok = true;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) ok = false;
};

try {
  const room = `e2e${Date.now().toString(36)}`;
  const f = await b1.newPage();
  const e = await b2.newPage();
  for (const p of [f, e]) p.on('pageerror', (err) => errors.push(err.message));

  await f.goto(`${BASE}/field.html?room=${room}`);
  await waitStatus(f, '기다리는');
  check('현장 먼저 입장 → 대기', true, await status(f));

  await e.goto(`${BASE}/expert.html?room=${room}`);
  await Promise.all([waitStatus(f, '연결됨'), waitStatus(e, '연결됨')]);
  check('양쪽 connected', true);
  await new Promise((r) => setTimeout(r, 500));
  console.log('  field :', (await result(f)).join(' | '));
  console.log('  expert:', (await result(e)).join(' | '));

  // #11 연결 과정 가시화
  const nCands = await e.$$eval('#cands tbody tr', (r) => r.length);
  check('ICE Candidate 표', nCands > 0, `${nCands}행, ${await e.$eval('#candSummary', (x) => x.textContent)}`);
  const states = await e.$eval('#states', (t) => t.textContent);
  check('상태 전이 표에 connected 기록', states.includes('connected'));
  const dl = await e.evaluate(() => {
    let name = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { name = this.download; };
    document.getElementById('export').click();
    HTMLAnchorElement.prototype.click = orig;
    return name;
  });
  check('로그 내보내기 파일 생성', /^events_expert_.*\.json$/.test(dl ?? ''), dl);

  await e.click('#ping');
  await e.waitForFunction(() => document.getElementById('log').textContent.includes('데이터 통로 왕복'), { timeout: 5000 });
  check('DataChannel ping/pong', true);

  // #15 현장 카메라 > 전문가
  await f.click('#cam');
  await e.waitForFunction(() => {
    const v = document.getElementById('vMain');
    return !v.hidden && v.videoWidth > 0;
  }, { timeout: 15000 });
  check('현장 카메라 > 전문가 화면에 영상', true, `${await videoSize(e)}px 폭`);
  await e.waitForFunction(() => document.getElementById('inbound').textContent.includes('fps'), { timeout: 8000 });
  check('전문가 화면에 받는 영상 품질 표시', true, await e.$eval('#inbound', (x) => x.textContent));

  // 화질 변경 요청 > 현장이 카메라를 다시 맞춤
  await e.select('#profile', 'A');
  await f.waitForFunction(() => document.getElementById('log').textContent.includes('화질 변경'), { timeout: 8000 });
  check('전문가 화질 선택 > 현장 반영', true);

  // #15 마이크 (양방향 음성 통로)
  await f.click('#mic');
  await f.waitForFunction(() => document.getElementById('mic').getAttribute('aria-pressed') === 'true', { timeout: 8000 });
  // 소리 패킷이 실제로 오면 받는 쪽 트랙의 muted가 풀린다
  await e.waitForFunction(() => {
    const t = document.getElementById('remoteAudio').srcObject?.getAudioTracks()[0];
    return t && !t.muted;
  }, { timeout: 8000 });
  check('현장 마이크 > 전문가에게 소리 도착', true);

  // #62 전문가 화면 공유 > 현장
  await e.click('#screen');
  const shared = await f
    .waitForFunction(() => document.getElementById('stage').classList.contains('sharing') && document.getElementById('vMain').videoWidth > 0, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const screenErr = await e.$eval('#mediaNote', (x) => x.textContent);
  check('전문가 화면 공유 > 현장 큰 화면', shared, shared ? `${await videoSize(f)}px 폭, 내 카메라는 작은 화면` : screenErr);
  if (shared) {
    await e.click('#screen');
    await f.waitForFunction(() => !document.getElementById('stage').classList.contains('sharing'), { timeout: 8000 });
    check('화면 공유 중지 > 현장은 내 카메라로 복귀', true);
  }

  await e.click('#leave');
  await waitStatus(f, '상대가 나갔습니다', 5000);
  check('나가기 → 상대에게 peer-left', true);

  await e.goto(`${BASE}/expert.html?room=${room}`);
  await Promise.all([waitStatus(f, '연결됨'), waitStatus(e, '연결됨')]);
  check('재입장 후 재연결', true);
  await e.waitForFunction(() => document.getElementById('vMain').videoWidth > 0, { timeout: 15000 });
  check('재연결 후 켜 두었던 카메라가 다시 보임 (재협상 없이)', true);

  const x = await b3.newPage();
  await x.goto(`${BASE}/expert.html?room=${room}`);
  await waitStatus(x, '정원', 5000);
  check('3번째 입장 → ROOM_FULL', true, await status(x));

  await x.goto(`${BASE}/field.html`);
  check('room 없이 접속 → 안내', (await status(x)).includes('Room이 없습니다'));

  await x.goto(`${BASE}/`);
  await x.waitForFunction(() => document.getElementById('fieldLink').textContent.includes('field.html?room='), { timeout: 5000 });
  const link = await x.$eval('#fieldLink', (a) => a.textContent);
  check('시작 화면 폰 링크(LAN 주소)', !link.includes('localhost'), link);
  check('QR 생성', (await x.$('#qr svg')) !== null);
} catch (err) {
  check('예외 없이 완료', false, err.message);
} finally {
  check('페이지 JS 오류 없음', errors.length === 0, errors.join('; '));
  await Promise.all([b1.close(), b2.close(), b3.close()]);
  server.kill();
  console.log('--- server log (tail)');
  console.log(serverLog.join('').trim().split('\n').slice(-12).join('\n'));
  process.exit(ok ? 0 : 1);
}
