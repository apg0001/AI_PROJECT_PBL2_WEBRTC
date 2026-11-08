// 화면 표시: 상태, 연결 정보, 상태 변화, 연결 후보, 연결 기록, 기록 저장
// 기준: docs/DESIGN.md
//  - 현장(폰): 점검 태그 하나가 상태를 크게 보여 주고, 기술 정보는 접어 둔다.
//  - 전문가(PC): 상태는 조용한 한 줄, 연결 정보와 후보를 펼쳐 둔다.
// 목적: "어디까지 성공했고 어디서 실패했는가"를 화면과 파일로 남긴다 (과제 명세 §18, §23)

const ROLE_NAME = { field: '현장 작업자', expert: '원격 전문가' };
const STATE_KINDS = ['signalingState', 'iceGatheringState', 'iceConnectionState', 'connectionState'];
const STATUS_CLASS = { ok: 'ok', error: 'error' }; // 그 밖(대기, 진행, 불안정)은 주의(노랑)
const CATEGORY = { signaling: '시그널링', state: '상태', ice: '후보', data: '데이터', status: '화면', error: '오류' };
const DIRECTION = { local: '내 쪽', remote: '상대 쪽' };

const TERMS =
  '브라우저가 찾은 접속 주소들이다. host는 기기 자신의 주소, srflx는 STUN 서버로 알아낸 공인 주소, ' +
  'prflx는 연결을 시험하는 중에 새로 알게 된 주소, relay는 TURN 중계 주소. ' +
  '카메라 권한이 없으면 브라우저가 기기 주소를 숨긴다(.local 이름).';

export function createUi({ role, room }) {
  const app = document.getElementById('app');
  document.body.classList.add(role === 'field' ? 'field' : 'expert');

  const head = `
    <header class="masthead">
      <h1>${ROLE_NAME[role] ?? role}</h1>
      <span class="room">Room <code>${escapeHtml(room ?? '없음')}</code></span>
    </header>`;
  const resultTable = `<h2>연결 정보</h2><table class="kv" id="result"></table>`;
  const statesTable = `
    <h2>상태 변화</h2>
    <table id="states"><thead><tr><th>시각</th><th>항목</th><th>값</th></tr></thead><tbody></tbody></table>`;
  const candsTable = `
    <h2>연결 후보 <span class="muted" id="candSummary"></span></h2>
    <p class="muted small">${TERMS}</p>
    <table id="cands"><thead><tr><th>시각</th><th>쪽</th><th>종류</th><th>방식</th><th>주소</th></tr></thead><tbody></tbody></table>`;
  const logBlock = `<details id="logBox"><summary>연결 기록</summary><ol id="log" class="log"></ol></details>`;

  if (role === 'field') {
    app.innerHTML = `
      ${head}
      <div id="status" class="tag" role="status" aria-live="polite">준비</div>
      <div class="actions">
        <button id="ping">연결 확인</button>
        <button id="leave">나가기</button>
      </div>
      <details>
        <summary>연결 정보 자세히</summary>
        ${resultTable}${statesTable}${candsTable}
        <div class="actions"><button id="export">기록 저장 (JSON)</button></div>
      </details>
      ${logBlock}`;
  } else {
    app.innerHTML = `
      ${head}
      <div class="columns">
        <section>
          <div id="status" class="state-line" role="status" aria-live="polite">준비</div>
          ${resultTable}
          <div class="actions">
            <button id="ping">연결 확인</button>
            <button id="export">기록 저장 (JSON)</button>
            <button id="leave">나가기</button>
          </div>
        </section>
        <section>${statesTable}${candsTable}</section>
      </div>
      ${logBlock}`;
  }

  const $ = (id) => document.getElementById(id);
  const t0 = performance.now();
  const sec = () => ((performance.now() - t0) / 1000).toFixed(3);

  // 기록 저장용
  const record = {
    role,
    room,
    userAgent: navigator.userAgent,
    startedAt: new Date().toISOString(),
    events: [],
    states: [],
    candidates: [],
    result: {},
    marks: {},
    selectedPair: null,
  };

  function log(category, text) {
    const t = sec();
    record.events.push({ t: Number(t), category, text });
    const li = document.createElement('li');
    li.className = `cat-${category}`;
    li.innerHTML = `<span class="t">${t}s</span><span class="c">${CATEGORY[category] ?? category}</span><span class="x"></span>`;
    li.querySelector('.x').textContent = text;
    $('log').prepend(li);
  }

  function addRow(tableId, cells, className = '', codeCols = []) {
    const tr = $(tableId).tBodies[0].insertRow();
    tr.className = className;
    cells.forEach((c, i) => {
      const td = tr.insertCell();
      td.textContent = c;
      if (codeCols.includes(i)) td.className = 'code';
    });
  }

  function setRow(key, value) {
    record.result[key] = value;
    let row = [...$('result').rows].find((r) => r.dataset.key === key);
    if (!row) {
      row = $('result').insertRow();
      row.dataset.key = key;
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = key;
      row.appendChild(th);
      row.insertCell();
    }
    row.cells[1].textContent = value;
  }

  function updateCandSummary() {
    const count = (dir) => {
      const m = {};
      record.candidates.filter((c) => c.dir === dir).forEach((c) => (m[c.type] = (m[c.type] ?? 0) + 1));
      return Object.entries(m).map(([k, v]) => `${k} ${v}개`).join(', ') || '없음';
    };
    $('candSummary').textContent = `(내 쪽: ${count('local')} / 상대 쪽: ${count('remote')})`;
  }

  function onCandidate(dir, c) {
    const t = sec();
    record.candidates.push({ t: Number(t), dir, ...c });
    const addr = c.address && c.address !== '?' ? c.address : '숨김';
    addRow('cands', [`${t}s`, DIRECTION[dir], c.type, c.protocol, `${addr}:${c.port ?? '?'}`], `ctype-${c.type}`, [4]);
    log('ice', `${DIRECTION[dir]} ${c.type} ${c.protocol} ${addr}:${c.port}`);
    updateCandSummary();
  }

  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `events_${role}_${room}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return {
    log,
    record,

    // kind: ok | error | wait | busy | warn
    setStatus(kind, text) {
      const base = role === 'field' ? 'tag' : 'state-line';
      $('status').className = `${base} ${STATUS_CLASS[kind] ?? ''}`.trim();
      $('status').textContent = text;
      log('status', text);
    },

    logSignal(direction, msg) {
      const dir = direction === 'out' ? '보냄' : '받음';
      let detail = '';
      if (msg.sdp) detail = `${msg.sdp.type}, ${msg.sdp.sdp?.length ?? 0}바이트`;
      else if (msg.type === 'ice') detail = msg.candidate ? msg.candidate.candidate.split(' ').slice(4, 8).join(' ') : '후보 찾기 끝';
      else if (msg.type === 'joined') detail = `내 번호 ${msg.selfId}, 먼저 있던 사람 ${msg.peers.length}명`;
      else if (msg.type === 'error') detail = msg.code;
      log('signaling', `${dir} ${msg.type}${detail ? ` (${detail})` : ''}`);
    },

    attachSession(s) {
      // 새 연결(재입장)마다 표를 비운다. 이전 연결의 기록은 연결 기록(events)에 남는다.
      $('result').innerHTML = '';
      record.result = {};
      $('states').tBodies[0].innerHTML = '';
      $('cands').tBodies[0].innerHTML = '';
      record.candidates = [];
      updateCandSummary();
      for (const kind of STATE_KINDS) addRow('states', [`${sec()}s`, kind, s.pc[kind]], 'initial');

      s.on('state', ({ kind, value }) => {
        const t = sec();
        record.states.push({ t: Number(t), kind, value });
        addRow('states', [`${t}s`, kind, value], `state-${value}`);
        log('state', `${kind} = ${value}`);
      });
      s.on('local-candidate', (c) => onCandidate('local', c));
      s.on('remote-candidate', (c) => onCandidate('remote', c));
      s.on('gathering-done', () => log('ice', '내 쪽 후보 찾기 끝'));
      s.on('control-open', () => log('data', '데이터 통로 열림'));
    },

    showTimings(m) {
      record.marks = { ...m };
      const d = (a, b) => (m[a] != null && m[b] != null ? `${(m[b] - m[a]).toFixed(0)} ms` : '-');
      if (m.t1_peerJoined != null) {
        setRow('입장 순서', '먼저 입장 (연결 제안을 보냄)');
        setRow('연결 시간 (상대 입장부터)', d('t1_peerJoined', 't5_connected'));
        setRow('제안을 보내고 응답을 받기까지', d('t2_offerSent', 't3_answerReceived'));
      } else {
        setRow('입장 순서', '나중 입장 (제안에 응답)');
        setRow('연결 시간 (입장 요청부터)', d('t0_join', 't5_connected'));
      }
      setRow('첫 후보를 찾고 연결되기까지', d('t4_firstLocalIce', 't5_connected'));
    },

    showSelectedPair(p) {
      record.selectedPair = p;
      const fmt = (c) => (c ? `${c.type} ${c.protocol} ${c.address || '숨김'}:${c.port ?? '?'}` : '-');
      const relay = p.local?.type === 'relay' || p.remote?.type === 'relay';
      setRow('경로', relay ? 'TURN 서버 중계' : '직접 연결 (서버를 거치지 않음)');
      setRow('내 쪽 주소', fmt(p.local));
      setRow('상대 쪽 주소', fmt(p.remote));
      if (p.rttMs != null) setRow('왕복 지연 (RTT)', `${p.rttMs} ms`);
    },

    onPing(cb) {
      $('ping').onclick = cb;
    },
    onLeave(cb) {
      $('leave').onclick = cb;
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
