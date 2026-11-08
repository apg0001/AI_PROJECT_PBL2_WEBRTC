// 화면 캡처: 시작 화면(PC·폰), 연결된 현장 화면(폰 크기), 전문가 화면(PC 크기)
// 실행: node e2e/screens.mjs <출력 폴더>   (설치된 Chrome 사용)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.argv[2] ?? path.join(REPO, 'weekly', 'screens'));
const PORT = Number(process.env.E2E_PORT ?? 3125);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://localhost:${PORT}`;

await mkdir(OUT, { recursive: true });
const server = spawn('node', ['server/src/index.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT) } });
await new Promise((r) => setTimeout(r, 800));
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true });
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
} finally {
  await Promise.all([b1.close(), b2.close()]);
  server.kill();
}
