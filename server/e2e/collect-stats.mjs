// PC 안에서 Chrome 두 개(가짜 카메라)를 연결해 N초 동안 품질 기록(CSV)을 모은다 (#18)
// 실제 폰 시험 전에 수집·그래프 도구를 확인하거나, PC 쪽 네트워크 제한(dnctl 등) 실험에 쓴다.
// 실행: node e2e/collect-stats.mjs <초> <출력 폴더> [profile A|B]
//   예: node e2e/collect-stats.mjs 30 /tmp/stats B
// 서버는 이 스크립트가 직접 띄운다 (PORT 3127). 결과: stats_expert.csv, stats_field.csv
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 자동 시험은 PC 안에서 끝나므로 TURN이 필요 없다. server/.env의 TURN 설정을 빈 값으로 덮어 무료 사용량을 쓰지 않는다
const NO_TURN = { CF_TURN_KEY_ID: '', CF_TURN_API_TOKEN: '', TURN_URLS: '' };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECONDS = Number(process.argv[2] ?? 30);
const OUT = path.resolve(process.argv[3] ?? 'stats-out');
const PROFILE = process.argv[4] === 'A' ? 'A' : 'B';
const PORT = Number(process.env.E2E_PORT ?? 3127);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await mkdir(OUT, { recursive: true });
const server = spawn('sh', ['server/run.sh', '-u', 'app.py'], { cwd: REPO, env: { ...process.env, PORT: String(PORT), ...NO_TURN }, stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  if (await fetch(`${BASE}/healthz`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 100));
}
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args });
const [b1, b2] = await Promise.all([launch(), launch()]);
try {
  const room = `stats${Date.now().toString(36)}`;
  const f = await b1.newPage();
  const e = await b2.newPage();
  await f.goto(`${BASE}/field.html?room=${room}&profile=${PROFILE}`);
  await e.goto(`${BASE}/expert.html?room=${room}`);
  const connected = (p) => p.waitForFunction(() => document.getElementById('status').textContent.startsWith('연결됨'), { timeout: 15000 });
  await Promise.all([connected(f), connected(e)]);
  await f.click('#cam');
  console.log(`연결됨, 카메라 켬 (화질 ${PROFILE}). ${SECONDS}초 수집...`);
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  for (const [name, p] of [['expert', e], ['field', f]]) {
    const csv = await p.evaluate(() => window.pbl.stats.toCsv());
    const file = path.join(OUT, `stats_${name}.csv`);
    await writeFile(file, csv);
    console.log(`saved ${file} (${csv.trim().split('\n').length - 1}줄)`);
  }
} finally {
  await Promise.race([Promise.all([b1.close(), b2.close()]), new Promise((r) => setTimeout(r, 5000))]);
  server.kill();
}
process.exit(0);
