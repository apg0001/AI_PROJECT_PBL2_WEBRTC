// 연결 시간 반복 측정 (전문가 쪽 자동화)
// 현장 폰이 field.html?room=<room> 을 열어 두면, 이 스크립트가 PC의 Chrome으로 expert.html에
// 들어갔다 나오기를 반복하며 Connection Time(join → connected), 선택 경로, RTT, DataChannel 왕복을 기록한다.
// 실행: node e2e/measure-connection.mjs <baseUrl> <room> <runs> <outDir>
//   예: node e2e/measure-connection.mjs http://localhost:3001 w1lan 10 ../experiments/2026-11-09_T1-iphone-pc-lan
import puppeteer from 'puppeteer-core';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [base = 'http://localhost:3000', room = 'test', runsArg = '10', outDir = '.'] = process.argv.slice(2);
const RUNS = Number(runsArg);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WAIT_FIRST_MS = Number(process.env.WAIT_FIRST_MS ?? 10 * 60_000); // 첫 연결(폰 접속) 대기

await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1100 });
const url = `${base}/expert.html?room=${encodeURIComponent(room)}`;

const readResult = () =>
  page.evaluate(() => {
    const kv = {};
    for (const r of document.querySelectorAll('#result tr')) kv[r.cells[0].textContent] = r.cells[1].textContent;
    const states = [...document.querySelectorAll('#states tbody tr')].map((r) => [...r.cells].map((c) => c.textContent));
    const cands = [...document.querySelectorAll('#cands tbody tr')].map((r) => [...r.cells].map((c) => c.textContent));
    return { kv, states, cands, summary: document.getElementById('candSummary').textContent };
  });

const results = [];
console.log(`폰에서 열기: ${base.replace('localhost', '<PC LAN IP>')}/field.html?room=${room}`);
for (let i = 1; i <= RUNS; i++) {
  await page.goto(url);
  try {
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('연결됨'), {
      timeout: i === 1 ? WAIT_FIRST_MS : 30_000,
    });
  } catch {
    // 연결 실패도 결과로 남긴다 (예: 폰 페이지가 백그라운드로 가서 닫힘)
    const status = await page.$eval('#status', (e) => e.textContent).catch(() => '?');
    results.push({ run: i, pathType: '실패', candidates: `연결 안 됨: ${status}` });
    console.log(JSON.stringify(results.at(-1)));
    await save();
    continue;
  }
  await new Promise((r) => setTimeout(r, 1500)); // 선택 경로·RTT 표시 대기
  await page.click('#ping');
  await page
    .waitForFunction(() => document.getElementById('log').textContent.includes('데이터 통로 왕복'), { timeout: 5000 })
    .catch(() => {});
  const r = await readResult();
  const ping = await page.evaluate(() => {
    const m = document.getElementById('log').textContent.match(/데이터 통로 왕복 ([\d.]+) ms/);
    return m ? Number(m[1]) : null;
  });
  const ms = (v) => (v ? Number(String(v).replace(/[^\d.]/g, '')) : null);
  const row = {
    run: i,
    role: r.kv['입장 순서'],
    connectionMs: ms(r.kv['연결 시간 (입장 요청부터)']),
    localPath: r.kv['내 쪽 주소'],
    remotePath: r.kv['상대 쪽 주소'],
    pathType: r.kv['경로'],
    iceRttMs: ms(r.kv['왕복 지연 (RTT)']),
    dataChannelRttMs: ping,
    candidates: r.summary,
  };
  results.push({ ...row, states: r.states, cands: r.cands });
  console.log(JSON.stringify(row));
  if (i === 1) await page.screenshot({ path: path.join(outDir, 'expert-run1.png') });
  await save();
  await new Promise((r) => setTimeout(r, 800));
}
await browser.close();
await save();

async function save() {
const cols = ['run', 'role', 'connectionMs', 'iceRttMs', 'dataChannelRttMs', 'pathType', 'localPath', 'remotePath', 'candidates'];
const csv = [cols.join(','), ...results.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
await writeFile(path.join(outDir, 'runs.csv'), csv + '\n');
await writeFile(path.join(outDir, 'runs.json'), JSON.stringify(results, null, 2));
}

const vals = results.map((r) => r.connectionMs).filter((v) => v != null).sort((a, b) => a - b);
const mid = Math.floor(vals.length / 2);
const med = vals.length ? (vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2) : null;
console.log(`완료 ${results.length}회 · Connection Time 중앙값 ${med} ms (최소 ${vals[0]}, 최대 ${vals.at(-1)})`);
