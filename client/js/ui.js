// 화면 표시: 연결 상태, 연결 결과, 상태 전이, ICE Candidate, 이벤트 로그, 로그 내보내기
// 목적: "어디까지 성공했고 어디서 실패했는가"를 화면과 파일로 남긴다 (과제 명세 §18, §23)
// PoC용 최소 UI. DOM은 페이지의 #app 안에 만든다.

const ROLE_NAME = { field: '현장 작업자', expert: '원격 전문가' };
const STATE_KINDS = ['signalingState', 'iceGatheringState', 'iceConnectionState', 'connectionState'];

export function createUi({ role, room }) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header>
      <h1>${ROLE_NAME[role] ?? role}</h1>
      <div class="meta">Room <code>${escapeHtml(room ?? '-')}</code></div>
      <div id="status" class="status">준비</div>
    </header>
    <section class="actions">
      <button id="ping">DataChannel ping</button>
      <button id="export">로그 내보내기 (JSON)</button>
      <button id="leave">나가기</button>
    </section>
    <section>
      <h2>연결 결과</h2>
      <table class="kv" id="result"></table>
    </section>
    <section>
      <h2>상태 전이</h2>
      <table class="grid" id="states"><thead><tr><th>시각</th><th>상태</th><th>값</th></tr></thead><tbody></tbody></table>
    </section>
    <section>
      <h2>ICE Candidate <span class="meta" id="candSummary"></span></h2>
      <table class="grid" id="cands"><thead><tr><th>시각</th><th>방향</th><th>type</th><th>proto</th><th>address:port</th></tr></thead><tbody></tbody></table>
    </section>
    <section>
      <h2>이벤트 로그</h2>
      <ol id="log" class="log"></ol>
    </section>`;

  const $ = (id) => document.getElementById(id);
  const t0 = performance.now();
  const sec = () => ((performance.now() - t0) / 1000).toFixed(3);

  // 내보내기용 기록
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
    li.innerHTML = `<span class="t">${t}s</span> <span class="c">${category}</span> <span class="x"></span>`;
    li.querySelector('.x').textContent = text;
    $('log').prepend(li);
  }

  function addGridRow(tableId, cells, className = '') {
    const tr = $(tableId).tBodies[0].insertRow();
    tr.className = className;
    for (const c of cells) tr.insertCell().textContent = c;
  }

  function setRow(key, value) {
    record.result[key] = value;
    let row = [...$('result').rows].find((r) => r.dataset.key === key);
    if (!row) {
      row = $('result').insertRow();
      row.dataset.key = key;
      row.insertCell().textContent = key;
      row.insertCell();
    }
    row.cells[1].textContent = value;
  }

  function updateCandSummary() {
    const count = (dir) => {
      const m = {};
      record.candidates.filter((c) => c.dir === dir).forEach((c) => (m[c.type] = (m[c.type] ?? 0) + 1));
      return Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ') || '없음';
    };
    $('candSummary').textContent = `local: ${count('local')} / remote: ${count('remote')}`;
  }

  function onCandidate(dir, c) {
    const t = sec();
    record.candidates.push({ t: Number(t), dir, ...c });
    const addr = c.address && c.address !== '?' ? c.address : '(숨김)';
    addGridRow('cands', [`${t}s`, dir, c.type, c.protocol, `${addr}:${c.port ?? '?'}`], `ctype-${c.type}`);
    log('ice', `${dir} ${c.type} ${c.protocol} ${addr}:${c.port}`);
    updateCandSummary();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `events_${role}_${room}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('export').onclick = exportJson;

  return {
    log,
    record,

    setStatus(kind, text) {
      $('status').className = `status ${kind}`;
      $('status').textContent = text;
      log('status', text);
    },

    logSignal(direction, msg) {
      const arrow = direction === 'out' ? '→ 서버' : '← 서버';
      let detail = '';
      if (msg.sdp) detail = `(${msg.sdp.type}, ${msg.sdp.sdp?.length ?? 0} bytes)`;
      else if (msg.type === 'ice') detail = msg.candidate ? msg.candidate.candidate.split(' ').slice(4, 8).join(' ') : '(수집 완료)';
      else if (msg.type === 'joined') detail = `self=${msg.selfId}, peers=${msg.peers.length}`;
      else if (msg.type === 'error') detail = msg.code;
      log('signaling', `${arrow} ${msg.type} ${detail}`);
    },

    attachSession(s) {
      // 새 세션(재연결)마다 표를 비운다. 이전 세션 기록은 events에 남아 있다.
      // 이전 세션의 연결 결과가 남지 않게 비운다 (재연결 시 역할이 바뀔 수 있음)
      $('result').innerHTML = '';
      record.result = {};
      $('states').tBodies[0].innerHTML = '';
      $('cands').tBodies[0].innerHTML = '';
      record.candidates = [];
      updateCandSummary();
      // 초기 상태도 한 줄씩 남겨 전이 시작점을 보이게 한다
      for (const kind of STATE_KINDS) addGridRow('states', [`${sec()}s`, kind, s.pc[kind]], 'muted');

      s.on('state', ({ kind, value }) => {
        const t = sec();
        record.states.push({ t: Number(t), kind, value });
        addGridRow('states', [`${t}s`, kind, value], `state-${value}`);
        log('state', `${kind} = ${value}`);
      });
      s.on('local-candidate', (c) => onCandidate('local', c));
      s.on('remote-candidate', (c) => onCandidate('remote', c));
      s.on('gathering-done', () => log('ice', 'local Candidate 수집 완료'));
      s.on('control-open', () => log('data', 'DataChannel control open'));
    },

    showTimings(m) {
      record.marks = { ...m };
      const d = (a, b) => (m[a] != null && m[b] != null ? `${(m[b] - m[a]).toFixed(0)} ms` : '-');
      if (m.t1_peerJoined != null) {
        setRow('역할', 'Offerer (먼저 입장)');
        setRow('peer-joined → connected', d('t1_peerJoined', 't5_connected'));
        setRow('offer 송신 → answer 수신', d('t2_offerSent', 't3_answerReceived'));
      } else {
        setRow('역할', 'Answerer (나중 입장)');
        setRow('Connection Time (join → connected)', d('t0_join', 't5_connected'));
      }
      setRow('첫 local ICE → connected', d('t4_firstLocalIce', 't5_connected'));
    },

    showSelectedPair(p) {
      record.selectedPair = p;
      // 카메라 권한이 없으면 브라우저가 사설 IP를 mDNS 이름으로 숨겨 stats에 주소가 비어 나온다
      const fmt = (c) => (c ? `${c.type} ${c.protocol} ${c.address || '(mDNS로 숨김)'}:${c.port ?? '?'}` : '-');
      setRow('선택 경로 (local)', fmt(p.local));
      setRow('선택 경로 (remote)', fmt(p.remote));
      setRow('경로 종류', p.local?.type === 'relay' || p.remote?.type === 'relay' ? 'TURN Relay' : 'P2P Direct');
      if (p.rttMs != null) setRow('RTT (ICE)', `${p.rttMs} ms`);
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
