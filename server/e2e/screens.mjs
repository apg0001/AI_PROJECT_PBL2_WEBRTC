// 화면 캡처: 시작 화면(PC·폰), 연결된 현장 화면(폰 크기), 전문가 화면(PC 크기),
//   영상 화면(현장 카메라 > 전문가, 전문가 화면 공유 > 현장). 카메라는 Chrome 가짜 장치(시험 패턴)다.
// 실행: node e2e/screens.mjs <출력 폴더>   (설치된 Chrome 사용)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 자동 시험은 PC 안에서 끝나므로 TURN이 필요 없다. server/.env의 TURN 설정을 빈 값으로 덮어 무료 사용량을 쓰지 않는다
const NO_TURN = { CF_TURN_KEY_ID: '', CF_TURN_API_TOKEN: '', TURN_URLS: '' };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(REPO, 'weekly', 'screens'));
const PORT = Number(process.env.E2E_PORT ?? 3125);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://localhost:${PORT}`;

await mkdir(OUT, { recursive: true });
const server = spawn('sh', ['server/run.sh', '-u', 'app.py'], { cwd: REPO, env: { ...process.env, PORT: String(PORT), ...NO_TURN } });
// 서버가 뜰 때까지 /healthz를 확인한다 (최대 10초)
for (let i = 0; i < 100; i++) {
  if (await fetch(`http://localhost:${PORT}/healthz`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 100));
}
const MEDIA_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'];
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: MEDIA_ARGS });
const [b1, b2] = await Promise.all([launch(), launch()]);
const shot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log('saved', name);
};
try {
  const room = 'demo-room';
  const start = await b1.newPage();
  await start.setViewport({ width: 1280, height: 800 });
  await start.goto(`${BASE}/?room=${room}`);
  await start.waitForSelector('#qr svg', { timeout: 5000 }).catch(() => {});
  await shot(start, 'start-pc.png');
  await start.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await shot(start, 'start-phone.png');

  const f = await b1.newPage();
  await f.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await f.goto(`${BASE}/field.html?room=${room}`);
  await f.waitForFunction(() => document.getElementById('status').textContent.includes('기다리는'));
  await shot(f, 'field-waiting.png');

  const e = await b2.newPage();
  await e.setViewport({ width: 1280, height: 900 });
  await e.goto(`${BASE}/expert.html?room=${room}`);
  const connected = (p) => p.waitForFunction(() => document.getElementById('status').textContent.startsWith('연결됨'), { timeout: 15000 });
  await Promise.all([connected(f), connected(e)]);
  await new Promise((r) => setTimeout(r, 1500));
  await e.click('#ping');
  await new Promise((r) => setTimeout(r, 500));
  await e.evaluate(() => (document.getElementById('logBox').open = true));
  await shot(f, 'field-connected.png');
  await shot(e, 'expert-connected.png');

  // 영상: 현장 카메라를 켜고, 전문가가 화면을 공유한다
  await e.evaluate(() => (document.getElementById('logBox').open = false));
  await f.click('#cam');
  await e.waitForFunction(() => document.getElementById('inbound').textContent.includes('fps'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 3000));
  await shot(e, 'expert-video.png');

  // 대화, 작업 지시, 포인터, 장비 상태 (#17)
  const say = async (p, text) => {
    await p.type('#chatText', text);
    await p.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 200));
  };
  await say(e, '2번 펌프 앞에 서 주세요');
  await say(f, '도착했습니다. 소리가 큽니다');
  for (const text of ['전원 차단기를 내리세요', '3번 밸브를 잠그세요']) {
    await e.type('#instrText', text);
    await e.click('#instrForm button');
    await new Promise((r) => setTimeout(r, 300));
  }
  await f.evaluate(() => [...document.querySelectorAll('#instr li')].find((li) => li.textContent.includes('전원')).querySelector('button').click());
  await f.click('#device');
  const pt = await e.$eval('#vMain', (v) => {
    v.scrollIntoView({ block: 'center' });
    const r = v.getBoundingClientRect();
    return { x: r.left + r.width * 0.62, y: r.top + r.height * 0.4 };
  });
  await e.mouse.click(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 800));
  await e.evaluate(() => scrollTo(0, 0));
  await f.evaluate(() => scrollTo(0, 0));
  await shot(f, 'field-instructions.png');
  await shot(e, 'expert-instructions.png');
  await e.click('#screen');
  await f.waitForFunction(() => document.getElementById('stage').classList.contains('sharing') && document.getElementById('vMain').videoWidth > 0, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  await shot(f, 'field-sharing.png');

  // 종단 지연 측정 (#19): G2G 시계 페이지, 그리고 시계 영상(?fake=clock)을 받은 전문가 화면
  const clock = await b1.newPage();
  await clock.setViewport({ width: 1000, height: 560 });
  await clock.goto(`${BASE}/tools/g2g-latency/clock.html`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot(clock, 'g2g-clock.png');
  const gf = await b1.newPage();
  const ge = await b2.newPage();
  await ge.setViewport({ width: 1280, height: 900 });
  await gf.goto(`${BASE}/field.html?room=g2g-demo&fake=clock`);
  await ge.goto(`${BASE}/expert.html?room=g2g-demo`);
  await Promise.all([connected(gf), connected(ge)]);
  await gf.click('#cam');
  await ge.waitForFunction(() => document.getElementById('vMain').videoWidth > 0, { timeout: 15000 });
  await ge.evaluate(() => {
    document.getElementById('g2gBox').open = true;
    document.getElementById('g2gStart').click();
  });
  await new Promise((r) => setTimeout(r, 8000));
  await ge.evaluate(() => document.getElementById('g2gBox').scrollIntoView({ block: 'start' }));
  await ge.screenshot({ path: path.join(OUT, 'expert-g2g.png') });
  console.log('saved expert-g2g.png');
} finally {
  await Promise.all([b1.close(), b2.close()]);
  server.kill();
}
