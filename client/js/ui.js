// 화면 표시: 연결 상태, 이벤트 로그, 측정 시점, 선택된 경로
// PoC용 최소 UI. DOM은 페이지의 #app 안에 만든다.

const ROLE_NAME = { field: '현장 작업자', expert: '원격 전문가' };

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
      <button id="leave">나가기</button>
    </section>
    <section>
      <h2>연결 결과</h2>
      <table class="kv" id="result"></table>
    </section>
    <section>
      <h2>이벤트 로그</h2>
      <ol id="log" class="log"></ol>
    </section>`;

  const $ = (id) => document.getElementById(id);
  const t0 = performance.now();

  function log(category, text) {
    const li = document.createElement('li');
    li.className = `cat-${category}`;
    li.innerHTML = `<span class="t">${((performance.now() - t0) / 1000).toFixed(3)}s</span>
      <span class="c">${category}</span> <span class="x"></span>`;
    li.querySelector('.x').textContent = text;
    $('log').prepend(li);
  }

  function setRow(key, value) {
    let row = [...$('result').rows].find((r) => r.dataset.key === key);
    if (!row) {
      row = $('result').insertRow();
      row.dataset.key = key;
      row.insertCell().textContent = key;
      row.insertCell();
    }
    row.cells[1].textContent = value;
  }

  return {
    log,

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
      s.on('state', ({ kind, value }) => log('state', `${kind} = ${value}`));
      s.on('local-candidate', (c) => log('ice', `local ${c.type} ${c.protocol} ${c.address}:${c.port}`));
      s.on('remote-candidate', (c) => log('ice', `remote ${c.type} ${c.protocol} ${c.address}:${c.port}`));
      s.on('control-open', () => log('data', 'DataChannel control open'));
    },

    showTimings(m) {
      const d = (a, b) => (m[a] != null && m[b] != null ? `${(m[b] - m[a]).toFixed(0)} ms` : '-');
      if (m.t1_peerJoined != null) {
        setRow('역할', 'Offerer (먼저 입장)');
        setRow('peer-joined → connected', d('t1_peerJoined', 't5_connected'));
      } else {
        setRow('역할', 'Answerer (나중 입장)');
        setRow('Connection Time (join → connected)', d('t0_join', 't5_connected'));
      }
      setRow('첫 local ICE → connected', d('t4_firstLocalIce', 't5_connected'));
    },

    showSelectedPair(p) {
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
