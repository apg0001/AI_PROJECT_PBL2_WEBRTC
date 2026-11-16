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

const server = spawn('sh', ['server/run.sh', '-u', 'app.py'], { cwd: REPO, env: { ...process.env, PORT: String(PORT) } });
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
// 서버가 뜰 때까지 /healthz를 확인한다 (최대 10초)
for (let i = 0; i < 100; i++) {
  if (await fetch(`http://localhost:${PORT}/healthz`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 100));
}

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const iceLog = await e.$eval('#log', (x) => [...x.querySelectorAll('li')].map((li) => li.textContent).find((t) => t.includes('ICE 서버')) ?? '');
  check('ICE 서버 목록 받음 (/api/ice)', iceLog.includes('stun'), iceLog.replace(/^.*ICE 서버/, 'ICE 서버'));
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

  // #16 메시지 형식 검사 (봉투, 채널 구분, 좌표 범위)
  const dec = await e.evaluate(async () => {
    const { decode, encode } = await import('/js/datachannel.js');
    const ok = (raw, ch) => !!decode(raw, ch).msg;
    return [
      ok(encode('chat', 0, { text: '안녕' }), 'control'),
      !ok('not json', 'control'),
      !ok(encode('nope', 0, {}), 'control'),
      !ok(encode('pointer', 0, { x: 0.5, y: 0.5 }), 'control'), // 채널이 다름
      !ok(encode('pointer', 0, { x: 1.5, y: 0.5 }), 'pointer'), // 범위 밖
      !ok(JSON.stringify({ type: 'chat', payload: { text: 'x' } }), 'control'), // seq 없음
      ok(encode('pointer', 3, { x: 0.25, y: 1 }), 'pointer'),
    ];
  });
  check('메시지 형식 검사 7가지', dec.every(Boolean), JSON.stringify(dec));

  // #16 작업 지시 > 현장 도착 확인(ack) 왕복
  const gotInstr = f.evaluate(
    () => new Promise((res) => window.pbl.link.on('instruction', (m) => res(m.text))),
  );
  await sleep(100); // 받는 쪽 구독이 먼저 걸리도록
  const ackMs = await e.evaluate(
    () =>
      new Promise((res) => {
        window.pbl.link.on('instruction-status', (it) => it.receivedMs != null && res(it.receivedMs));
        window.pbl.link.instruct('3번 밸브를 잠그세요');
      }),
  );
  check('작업 지시 도착 + 도착 확인(ack)', (await gotInstr) === '3번 밸브를 잠그세요', `왕복 ${ackMs} ms`);

  // #16 포인터는 순서 없는 채널로 가고, 늦게 온 번호는 버린다
  const ptr = f.evaluate(
    () =>
      new Promise((res) => {
        const got = [];
        window.pbl.link.on('pointer', (p) => got.push(p.seq));
        setTimeout(() => res({ got, stale: window.pbl.link.counts.pointerStale }), 600);
      }),
  ).catch(() => null);
  await sleep(100);
  await e.evaluate(() => {
    for (let i = 0; i < 5; i++) window.pbl.link.send('pointer', { x: i / 5, y: 0.5 });
  });
  const ptrRes = await ptr;
  check('포인터 5개 도착 (unreliable 채널)', ptrRes?.got.length === 5, JSON.stringify(ptrRes));

  // #15 현장 카메라 > 전문가
  await f.click('#cam');
  await e.waitForFunction(() => {
    const v = document.getElementById('vMain');
    return !v.hidden && v.videoWidth > 0;
  }, { timeout: 15000 });
  check('현장 카메라 > 전문가 화면에 영상', true, `${await videoSize(e)}px 폭`);
  await e.waitForFunction(() => document.getElementById('inbound').textContent.includes('fps'), { timeout: 8000 });
  check('전문가 화면에 받는 영상 품질 표시', true, await e.$eval('#inbound', (x) => x.textContent));

  // #18 통신 품질: 1초마다 기록, 화면 표와 CSV
  await sleep(3000);
  const q = await e.evaluate(() => {
    const csv = window.pbl.stats.toCsv().trim().split('\n');
    const head = csv[0].split(',');
    const rows = csv.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
    const video = rows.filter((r) => r.in_w && r.in_kbps && r.in_fps);
    return { cols: head.length, rows: rows.length, video: video.length, last: video.at(-1), table: document.getElementById('quality').textContent };
  });
  check('통신 품질 1초 기록 (CSV)', q.video >= 2 && q.last.rtt_ms !== '' && q.last.in_loss_pct !== '', `${q.cols}열, ${q.rows}줄 중 영상 ${q.video}줄. 마지막: ${q.last?.in_w}×${q.last?.in_h} ${q.last?.in_fps}fps ${q.last?.in_kbps}kbps 손실 ${q.last?.in_loss_pct}% 지터 ${q.last?.in_jitter_ms}ms RTT ${q.last?.rtt_ms}ms`);
  check('통신 품질 표 표시', q.table.includes('왕복 지연') && q.table.includes('받는 영상'));
  const fq = await f.evaluate(() => window.pbl.stats.rows.at(-1));
  check('현장: 보내는 영상과 화질을 낮춘 이유 기록', !!fq?.out_w && !!fq?.out_limit, `${fq?.out_w}×${fq?.out_h} ${fq?.out_kbps}kbps, 이유 ${fq?.out_limit}`);
  const csvName = await e.evaluate(() => {
    let name = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { name = this.download; };
    document.getElementById('exportCsv').click();
    HTMLAnchorElement.prototype.click = orig;
    return name;
  });
  check('품질 기록 CSV 파일 저장', /^stats_expert_.*\.csv$/.test(csvName ?? ''), csvName);

  // #17 대화 (양방향)
  await e.type('#chatText', '들리세요?');
  await e.click('#chatForm button');
  await f.waitForFunction(() => document.getElementById('chat').textContent.includes('들리세요?'), { timeout: 5000 });
  await f.type('#chatText', '네 잘 보입니다');
  await f.keyboard.press('Enter');
  await e.waitForFunction(() => document.getElementById('chat').textContent.includes('네 잘 보입니다'), { timeout: 5000 });
  check('대화 전문가 > 현장, 현장 > 전문가', true);

  // #17 작업 지시 > 현장 목록 > 현장 확인 > 전문가 표에 '현장 확인'
  await e.type('#instrText', '전원 차단기를 내리세요');
  await e.click('#instrForm button');
  await f.waitForFunction(() => [...document.querySelectorAll('#instr li.todo .x')].some((x) => x.textContent === '전원 차단기를 내리세요'), { timeout: 5000 });
  await f.evaluate(() => [...document.querySelectorAll('#instr li')].find((li) => li.textContent.includes('전원 차단기')).querySelector('button').click());
  await e.waitForFunction(() => [...document.querySelectorAll('#instrTable tr')].some((r) => r.textContent.includes('전원 차단기') && r.textContent.includes('현장 확인')), { timeout: 5000 });
  check('작업 지시 > 현장 표시 > 확인 버튼 > 전문가에 현장 확인', true);

  // #17 포인터: 전문가가 영상의 (0.25, 0.75)를 누르면 현장 카메라 화면의 같은 위치에 표시
  const target = await e.$eval('#vMain', (v) => {
    v.scrollIntoView({ block: 'center' }); // 대화 입력으로 페이지가 내려가 있을 수 있다
    const r = v.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * s, h = v.videoHeight * s;
    return { x: r.left + (r.width - w) / 2 + 0.25 * w, y: r.top + (r.height - h) / 2 + 0.75 * h };
  });
  await e.mouse.click(target.x, target.y);
  await f.waitForFunction(() => !document.getElementById('ptr').hidden, { timeout: 5000 });
  const where = await f.evaluate(() => {
    document.getElementById('vMain').scrollIntoView({ block: 'center' });
    const v = document.getElementById('vMain');
    const p = document.getElementById('ptr').getBoundingClientRect();
    const r = v.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * s, h = v.videoHeight * s;
    const cx = p.left + p.width / 2, cy = p.top + p.height / 2;
    return { x: +((cx - r.left - (r.width - w) / 2) / w).toFixed(3), y: +((cy - r.top - (r.height - h) / 2) / h).toFixed(3) };
  });
  check('포인터 > 현장 화면 같은 위치', Math.abs(where.x - 0.25) < 0.03 && Math.abs(where.y - 0.75) < 0.03, `현장에서 (${where.x}, ${where.y})`);

  // #17 장비 상태 (더미) 현장 > 전문가
  await f.click('#device');
  await e.waitForFunction(() => document.getElementById('device').textContent.includes('PUMP-03'), { timeout: 5000 });
  check('장비 상태 현장 > 전문가', true, await e.$eval('#device', (x) => x.textContent));

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

  // #16 현장이 없는 동안 보낸 지시는 대기했다가 다시 연결되면 간다
  await f.click('#leave');
  await waitStatus(e, '상대가 나갔습니다', 5000);
  const queued = await e.evaluate(() => window.pbl.link.instruct('재연결 후 지시').sent);
  await f.goto(`${BASE}/field.html?room=${room}`);
  await Promise.all([waitStatus(f, '연결됨'), waitStatus(e, '연결됨')]);
  const resent = await e
    .waitForFunction(() => [...window.pbl.link.pending.values()].some((i) => i.text === '재연결 후 지시' && i.receivedMs != null), { timeout: 8000 })
    .then(() => true, () => false);
  check('연결이 없을 때 보낸 지시 > 재연결 후 자동 재전송', !queued && resent, `처음 전송 ${queued}, 재전송 ${await e.evaluate(() => window.pbl.link.counts.resent)}회`);

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

  // #19 종단 지연 측정: 현장이 카메라 대신 G2G 시계를 보내고(?fake=clock) 전문가가 QR을 읽는다
  const room2 = `${room}g`;
  const gf = await b1.newPage();
  const ge = await b2.newPage();
  for (const p of [gf, ge]) p.on('pageerror', (err) => errors.push(err.message));
  await gf.goto(`${BASE}/field.html?room=${room2}&fake=clock`);
  await ge.goto(`${BASE}/expert.html?room=${room2}`);
  await Promise.all([waitStatus(gf, '연결됨'), waitStatus(ge, '연결됨')]);
  await gf.click('#cam');
  await ge.waitForFunction(() => document.getElementById('vMain').videoWidth > 0, { timeout: 15000 });
  await ge.evaluate(() => (document.getElementById('g2gBox').open = true));
  await ge.click('#g2gStart');
  await sleep(8000);
  const g = await ge.evaluate(() => ({ s: window.pbl.g2g.summary(), reader: window.pbl.g2g.readerName, table: document.getElementById('g2g').textContent }));
  check(
    '종단 지연 측정 (시계 영상, 8초)',
    g.s.g2g?.n >= 30 && g.s.g2g.median > 0 && g.s.g2g.median < 1000 && g.table.includes('중앙값'),
    g.s.g2g ? `표본 ${g.s.g2g.n}개, 중앙값 ${g.s.g2g.median} ms, p95 ${g.s.g2g.p95} ms, 받기 전 ${g.s.before?.median} / 받은 뒤 ${g.s.after?.median} ms, 못 읽음 ${g.s.unread}, 읽기 ${g.reader}` : JSON.stringify(g.s),
  );
  const g2gCsv = await ge.evaluate(() => window.pbl.g2g.toCsv().trim().split('\n').length - 1);
  check('종단 지연 CSV', g2gCsv === g.s.g2g?.n || g2gCsv >= 30, `${g2gCsv}줄`);
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
