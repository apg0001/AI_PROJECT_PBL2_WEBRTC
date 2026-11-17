// 화면 표시: 상태, 연결 정보, 상태 변화, 연결 후보, 연결 기록, 기록 저장
// 기준: docs/DESIGN.md
//  - 현장(폰): 점검 태그 하나가 상태를 크게 보여 주고, 기술 정보는 접어 둔다.
//  - 전문가(PC): 상태는 조용한 한 줄, 연결 정보와 후보를 펼쳐 둔다.
// 목적: "어디까지 성공했고 어디서 실패했는가"를 화면과 파일로 남긴다 (과제 명세 §18, §23)

const ROLE_NAME = { field: '현장 작업자', expert: '원격 전문가' };
const STATE_KINDS = ['signalingState', 'iceGatheringState', 'iceConnectionState', 'connectionState'];
const STATUS_CLASS = { ok: 'ok', error: 'error' }; // 그 밖(대기, 진행, 불안정)은 주의(노랑)
const CATEGORY = { signaling: '시그널링', state: '상태', ice: '후보', data: '데이터', media: '영상', status: '화면', error: '오류' };
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
  const qualityTable = `
    <h2>통신 품질 <span class="muted small" id="qualityNote">(1초마다)</span></h2>
    <table class="kv" id="quality"><tr><td class="muted">연결되면 표시합니다</td></tr></table>`;
  const statesTable = `
    <h2>상태 변화</h2>
    <table id="states"><thead><tr><th>시각</th><th>항목</th><th>값</th></tr></thead><tbody></tbody></table>`;
  const candsTable = `
    <h2>연결 후보 <span class="muted" id="candSummary"></span></h2>
    <p class="muted small">${TERMS}</p>
    <table id="cands"><thead><tr><th>시각</th><th>쪽</th><th>종류</th><th>방식</th><th>주소</th></tr></thead><tbody></tbody></table>`;
  const chatBlock = `
    <h2>대화</h2>
    <ol class="chat" id="chat" aria-live="polite"></ol>
    <form class="send" id="chatForm">
      <input id="chatText" maxlength="500" autocomplete="off" aria-label="보낼 말" placeholder="보낼 말">
      <button type="submit">보내기</button>
    </form>`;
  const logBlock = `<details id="logBox"><summary>연결 기록</summary><ol id="log" class="log"></ol></details>`;

  // 영상 무대: 큰 화면 하나와 오른쪽 아래 작은 화면 하나
  //  - 현장: 큰 화면 = 전문가 화면 공유(있을 때) 또는 내 카메라, 작은 화면 = 공유 중일 때 내 카메라
  //  - 전문가: 큰 화면 = 현장 카메라, 작은 화면 = 내가 공유 중인 화면
  const stage = `
    <div class="stage" id="stage">
      <video id="vMain" playsinline autoplay muted></video>
      <video id="vPip" class="pip" playsinline autoplay muted hidden></video>
      <p class="stage-note" id="stageNote"></p>
      <span class="pointer" id="ptr" hidden></span>
    </div>
    <audio id="remoteAudio" autoplay></audio>`;

  if (role === 'field') {
    app.innerHTML = `
      ${head}
      <div id="status" class="tag" role="status" aria-live="polite">준비</div>
      ${stage}
      <p class="muted small" id="mediaNote"></p>
      <div class="actions">
        <button id="cam" aria-pressed="false">카메라 켜기</button>
        <button id="flip" disabled>전면 카메라로</button>
        <button id="mic" aria-pressed="false">마이크 켜기</button>
      </div>
      <h2>받은 지시</h2>
      <ol class="instr" id="instr"><li class="empty muted">아직 없습니다</li></ol>
      ${chatBlock}
      <div class="actions">
        <button id="device">장비 상태 보내기</button>
        <button id="ping">연결 확인</button>
        <button id="leave">나가기</button>
      </div>
      <details>
        <summary>연결 정보 자세히</summary>
        ${qualityTable}${resultTable}${statesTable}${candsTable}
        <div class="actions"><button id="export">기록 저장 (JSON)</button><button id="exportCsv">품질 기록 저장 (CSV)</button></div>
      </details>
      ${logBlock}`;
  } else {
    app.innerHTML = `
      ${head}
      <div class="columns">
        <section>
          <div id="status" class="state-line" role="status" aria-live="polite">준비</div>
          ${stage}
          <p class="inbound" id="inbound">받는 영상 없음</p>
          <p class="muted small" id="mediaNote"></p>
          <div class="actions">
            <button id="screen" aria-pressed="false">화면 공유</button>
            <button id="mic" aria-pressed="false">마이크 켜기</button>
            <label class="select">현장 화질
              <select id="profile">
                <option value="B">저화질 480p 15fps</option>
                <option value="A">고화질 1080p 30fps</option>
              </select>
            </label>
          </div>
          <p class="muted small">영상을 누르거나 끌면 현장 화면의 같은 위치에 표시됩니다.</p>
          <h2>작업 지시</h2>
          <form class="send" id="instrForm">
            <input id="instrText" maxlength="500" autocomplete="off" aria-label="지시 내용" placeholder="예: 3번 밸브를 잠그세요">
            <button type="submit">지시 보내기</button>
          </form>
          <table id="instrTable"><thead><tr><th>지시</th><th>상태</th></tr></thead><tbody></tbody></table>
          <p class="muted small" id="device">장비 상태: 받은 것 없음</p>
          <details id="g2gBox">
            <summary>종단 지연 측정 (Glass-to-Glass)</summary>
            <p class="muted small">
              <a href="/tools/g2g-latency/clock.html" target="_blank" rel="noopener">G2G 시계</a>를 이 PC 화면 왼쪽에 띄우고
              현장 폰 카메라로 찍게 한 뒤 시작합니다. 받은 영상 속 QR 시각과 이 화면에 표시되는 시각의 차이를 잽니다.
            </p>
            <div class="actions">
              <button id="g2gStart" aria-pressed="false">측정 시작</button>
              <button id="g2gReset">비우기</button>
              <button id="g2gCsv">측정값 저장 (CSV)</button>
            </div>
            <table class="kv" id="g2g"><tr><td class="muted">측정 전</td></tr></table>
          </details>
          ${chatBlock}
          ${resultTable}
          <div class="actions">
            <button id="ping">연결 확인</button>
            <button id="export">기록 저장 (JSON)</button>
            <button id="exportCsv">품질 기록 저장 (CSV)</button>
            <button id="leave">나가기</button>
          </div>
        </section>
        <section>${qualityTable}${statesTable}${candsTable}</section>
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

  // ---- 영상 ----
  const remote = { audio: null, camera: null, screen: null };
  const remoteOn = { camera: false, screen: false };
  const local = { camera: null, screen: null };
  const show = (video, track) => {
    const want = track ?? null;
    const cur = video.srcObject?.getTracks()[0] ?? null;
    if (cur !== want) video.srcObject = want ? new MediaStream([want]) : null;
    video.hidden = !want;
    if (want) video.play().catch(() => {});
  };

  function renderStage() {
    let main = null;
    let pip = null;
    let note = '';
    if (role === 'field') {
      if (remoteOn.screen && remote.screen) {
        main = remote.screen;
        pip = local.camera;
      } else {
        main = local.camera;
        note = local.camera ? '' : '카메라가 꺼져 있습니다. 켜면 전문가에게 보입니다';
      }
    } else {
      main = remoteOn.camera ? remote.camera : null;
      pip = local.screen;
      note = main ? '' : '현장 카메라가 꺼져 있습니다';
    }
    show($('vMain'), main);
    show($('vPip'), pip);
    $('vMain').classList.toggle('mirror', role === 'field' && main === local.camera && local.facing === 'user');
    $('stage').classList.toggle('sharing', role === 'field' && main === remote.screen && !!main);
    $('stageNote').textContent = note;
    $('stageNote').hidden = !note;
  }
  renderStage();

  // ---- 포인터 (#17) ----
  // 영상은 object-fit: contain이라 위아래나 양옆에 빈 띠가 생길 수 있다. 실제 영상이 그려진 사각형을 구한다.
  function contentRect(video) {
    const r = video.getBoundingClientRect();
    const vw = video.videoWidth || r.width;
    const vh = video.videoHeight || r.height;
    const scale = Math.min(r.width / vw, r.height / vh);
    const w = vw * scale;
    const h = vh * scale;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }
  let ptrTimer = 0;
  function placePointer(x, y, video) {
    const ptr = $('ptr');
    if (!video || video.hidden || !video.videoWidth) return false;
    const stageBox = $('stage').getBoundingClientRect();
    const c = contentRect(video);
    ptr.style.left = `${c.left - stageBox.left + x * c.width}px`;
    ptr.style.top = `${c.top - stageBox.top + y * c.height}px`;
    ptr.hidden = false;
    ptr.classList.remove('fade');
    clearTimeout(ptrTimer);
    ptrTimer = setTimeout(() => ptr.classList.add('fade'), 3000); // 3초 동안 움직임이 없으면 흐려진다
    return true;
  }
  const clock = () => new Date().toTimeString().slice(0, 8); // 14:03:18
  const WHO = { me: '나', peer: role === 'field' ? '전문가' : '현장' };

  function pressed(id, on, label) {
    const b = $(id);
    if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    if (label) b.textContent = label;
  }

  return {
    log,
    record,

    // ---- 영상 ----
    setLocal(slot, track, { facing } = {}) {
      local[slot] = track;
      if (facing) local.facing = facing;
      if (slot === 'camera') {
        pressed('cam', !!track, track ? '카메라 끄기' : '카메라 켜기');
        if ($('flip')) {
          $('flip').disabled = !track;
          $('flip').textContent = local.facing === 'user' ? '후면 카메라로' : '전면 카메라로';
        }
      }
      if (slot === 'screen') pressed('screen', !!track, track ? '화면 공유 중지' : '화면 공유');
      if (slot === 'audio') pressed('mic', !!track, track ? '마이크 끄기' : '마이크 켜기');
      renderStage();
    },
    setRemoteTrack(slot, track) {
      remote[slot] = track;
      if (slot === 'audio') {
        const a = $('remoteAudio');
        a.srcObject = new MediaStream([track]);
        a.play().catch(() => {});
      }
      renderStage();
    },
    setRemoteOn(slot, on) {
      if (!(slot in remoteOn)) return;
      remoteOn[slot] = on;
      if (!on && role === 'expert' && slot === 'camera') $('inbound').textContent = '받는 영상 없음';
      renderStage();
    },
    resetRemote() {
      remoteOn.camera = remoteOn.screen = false;
      remote.audio = remote.camera = remote.screen = null;
      if ($('inbound')) $('inbound').textContent = '받는 영상 없음';
      renderStage();
    },
    // 현장 카메라 수신 품질 (전문가 화면)
    showInbound(v) {
      const el = $('inbound');
      if (!el) return;
      if (!v || !v.width) {
        el.textContent = remoteOn.camera ? '받는 영상: 첫 화면을 기다리는 중' : '받는 영상 없음';
        return;
      }
      const parts = [`${v.width}×${v.height}`];
      if (v.fps != null) parts.push(`${Math.round(v.fps)} fps`);
      if (v.kbps != null) parts.push(`${v.kbps.toLocaleString()} kbps`);
      if (v.codec) parts.push(v.codec);
      el.textContent = `받는 영상: ${parts.join(', ')}`;
      record.result['받는 영상'] = el.textContent;
    },
    setMediaNote(text) {
      $('mediaNote').textContent = text ?? '';
    },
    disable(id, why) {
      const b = $(id);
      if (!b) return;
      b.disabled = true;
      if (why) b.title = why;
    },
    // 소리가 자동 재생되지 않은 경우를 위해, 아무 버튼이나 누르면 다시 재생한다
    resumeAudio() {
      const a = $('remoteAudio');
      if (a.srcObject && a.paused) a.play().catch(() => {});
    },
    onCamera(cb) { $('cam') && ($('cam').onclick = cb); },
    onFlip(cb) { $('flip') && ($('flip').onclick = cb); },
    onMic(cb) { $('mic').onclick = cb; },
    onScreen(cb) { $('screen') && ($('screen').onclick = cb); },
    onProfile(cb) { $('profile') && ($('profile').onchange = () => cb($('profile').value)); },

    // ---- 대화 (#17) ----
    onChat(cb) {
      $('chatForm').onsubmit = (e) => {
        e.preventDefault();
        if (cb($('chatText').value)) $('chatText').value = '';
      };
    },
    addChat(who, text) {
      const li = document.createElement('li');
      li.className = who;
      li.innerHTML = `<span class="who"></span><span class="x"></span><span class="t muted"></span>`;
      li.querySelector('.who').textContent = WHO[who];
      li.querySelector('.x').textContent = text;
      li.querySelector('.t').textContent = clock();
      $('chat').append(li);
      while ($('chat').children.length > 50) $('chat').firstElementChild.remove();
      li.scrollIntoView({ block: 'nearest' });
      record.events.push({ t: Number(sec()), category: 'chat', text: `${WHO[who]}: ${text}` });
    },

    // ---- 작업 지시 (#17) ----
    // 전문가: 보낸 지시와 확인 상태
    onInstruct(cb) {
      const form = $('instrForm');
      if (!form) return;
      form.onsubmit = (e) => {
        e.preventDefault();
        if (cb($('instrText').value)) $('instrText').value = '';
      };
    },
    showInstruction(item) {
      const body = $('instrTable')?.tBodies[0];
      if (!body) return;
      let tr = [...body.rows].find((r) => r.dataset.id === item.id);
      if (!tr) {
        tr = body.insertRow(0);
        tr.dataset.id = item.id;
        tr.insertCell().textContent = item.text;
        tr.insertCell();
      }
      const state = item.done
        ? '현장 확인'
        : item.receivedMs != null
          ? `도착 (${item.receivedMs} ms), 확인 대기`
          : item.sent
            ? '보냄, 도착 대기'
            : '연결되면 보냄';
      tr.cells[1].textContent = state;
      tr.className = item.done ? 'state-connected' : item.receivedMs != null ? '' : 'state-disconnected';
      log('data', `지시 "${item.text}": ${state}`);
    },
    // 현장: 받은 지시와 확인 버튼
    addInstruction({ id, text }, onConfirm) {
      $('instr').querySelector('.empty')?.remove();
      const li = document.createElement('li');
      li.className = 'todo';
      li.dataset.id = id;
      li.innerHTML = `<span class="x"></span><span class="t muted"></span><button aria-pressed="false">확인</button>`;
      li.querySelector('.x').textContent = text;
      li.querySelector('.t').textContent = clock();
      const btn = li.querySelector('button');
      btn.onclick = () => {
        if (li.classList.contains('todo') && onConfirm(id)) {
          li.classList.remove('todo');
          btn.setAttribute('aria-pressed', 'true');
          btn.textContent = '확인함';
          btn.disabled = true;
        }
      };
      $('instr').prepend(li);
      navigator.vibrate?.(200); // 지원하는 폰(안드로이드)만 진동
      log('data', `받은 지시: ${text}`);
    },

    // ---- 장비 상태 (#17, 더미) ----
    onDeviceStatus(cb) {
      if (role === 'field') $('device').onclick = cb;
    },
    showDevice(s) {
      const parts = [s.equipmentId, s.state, s.temperature != null ? `${s.temperature}°C` : null, s.errorCode ? `오류 ${s.errorCode}` : null];
      $('device').textContent = `장비 상태 (${clock()}): ${parts.filter(Boolean).join(', ')}`;
      $('device').className = s.errorCode ? 'small warn-text' : 'small muted';
    },

    // ---- 포인터 (#17) ----
    // 전문가: 받은 영상을 누르거나 끌면 0~1 좌표로 알린다 (초당 최대 30번)
    onPointerInput(cb) {
      if (role !== 'expert') return;
      const v = $('vMain');
      let down = false;
      let last = 0;
      const emit = (e, isDown, force) => {
        if (v.hidden || !v.videoWidth) return;
        const c = contentRect(v);
        const x = (e.clientX - c.left) / c.width;
        const y = (e.clientY - c.top) / c.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        const now = performance.now();
        if (!force && now - last < 33) return;
        last = now;
        placePointer(x, y, v); // 내 화면에도 표시
        cb({ x: +x.toFixed(4), y: +y.toFixed(4), down: isDown });
      };
      v.addEventListener('pointerdown', (e) => {
        down = true;
        v.setPointerCapture(e.pointerId);
        emit(e, true, true);
      });
      v.addEventListener('pointermove', (e) => down && emit(e, true, false));
      v.addEventListener('pointerup', (e) => {
        down = false;
        emit(e, false, true);
      });
    },
    // 현장: 내 카메라 영상 위에 표시. 전면 카메라 미리보기는 거울처럼 뒤집혀 있으므로 x도 뒤집는다
    showPointer({ x, y }) {
      const v = [$('vMain'), $('vPip')].find((el) => el.srcObject?.getTracks()[0] === local.camera && !el.hidden);
      if (!v) return false;
      return placePointer(local.facing === 'user' && v === $('vMain') ? 1 - x : x, y, v);
    },

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

    // 연결 복구 기록 (#34): 끊긴 시각, 이유, 복구까지 걸린 시간, 방법
    showRecovery(list) {
      record.recoveries = list;
      const last = list.at(-1);
      setRow('복구', `${list.length}회, 마지막 ${(last.recoveryMs / 1000).toFixed(1)}초 (${last.how})`);
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
      const fmt = (c) =>
        c ? `${c.type} ${c.protocol} ${c.address || '숨김'}:${c.port ?? '?'}${c.relayProtocol ? ` (TURN까지 ${c.relayProtocol})` : ''}` : '-';
      const relay = p.local?.type === 'relay' || p.remote?.type === 'relay';
      setRow('경로', relay ? 'TURN 서버 중계' : '직접 연결 (서버를 거치지 않음)');
      setRow('내 쪽 주소', fmt(p.local));
      setRow('상대 쪽 주소', fmt(p.remote));
      if (p.rttMs != null) setRow('왕복 지연 (RTT)', `${p.rttMs} ms`);
    },

    // ---- 통신 품질 (#18) ----
    showQuality(r, count) {
      const rows = [];
      const join = (...xs) => xs.filter((x) => x != null && x !== '').join(', ');
      const ms = (v) => (v != null ? `${v} ms` : null);
      rows.push(['연결 상태', r.conn]);
      if (r.path) rows.push(['경로 (내 쪽/상대 쪽)', r.path]);
      if (r.rtt_ms != null) rows.push(['왕복 지연 (RTT)', `${r.rtt_ms} ms`]);
      if (r.avail_out_kbps != null) rows.push(['보낼 수 있는 대역폭 추정', `${r.avail_out_kbps.toLocaleString()} kbps`]);
      const label = { camera: '현장 카메라', screen: '화면 공유' };
      if (r.in_w) {
        rows.push([`받는 영상 (${label[r.in_slot]})`, join(`${r.in_w}×${r.in_h}`, r.in_fps != null && `${r.in_fps} fps`, r.in_kbps != null && `${r.in_kbps.toLocaleString()} kbps`, r.in_codec)]);
        rows.push(['손실 / 지터', join(r.in_loss_pct != null && `${r.in_loss_pct}% (${r.in_lost}개)`, ms(r.in_jitter_ms))]);
        rows.push(['지터 버퍼 / 디코딩', join(ms(r.in_jb_ms), r.in_decode_ms != null && `프레임당 ${r.in_decode_ms} ms`)]);
        if (r.in_freezes != null) rows.push(['영상 정지 (누적)', `${r.in_freezes}회, ${r.in_freeze_s ?? 0}초`]);
      }
      if (r.out_w) {
        const why = { none: '없음', bandwidth: '대역폭 부족', cpu: 'CPU 부족', other: '기타' };
        rows.push([`보내는 영상 (${label[r.out_slot]})`, join(`${r.out_w}×${r.out_h}`, r.out_fps != null && `${r.out_fps} fps`, r.out_kbps != null && `${r.out_kbps.toLocaleString()} kbps`)]);
        rows.push(['화질을 낮춘 이유', why[r.out_limit] ?? r.out_limit ?? '-']);
      }
      if (r.aud_jitter_ms != null) rows.push(['받는 음성 손실 / 지터', join(r.aud_loss_pct != null && `${r.aud_loss_pct}%`, ms(r.aud_jitter_ms))]);
      const t = $('quality');
      t.innerHTML = '';
      for (const [k, v] of rows) {
        const tr = t.insertRow();
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = k;
        tr.append(th);
        tr.insertCell().textContent = v ?? '-';
      }
      $('qualityNote').textContent = `(1초마다, 기록 ${count}줄)`;
    },
    onExportCsv(cb) {
      $('exportCsv').onclick = () => {
        const blob = new Blob([cb()], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stats_${role}_${room}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    },

    // ---- 종단 지연 (#19) ----
    onG2G({ toggle, reset, csv }) {
      if (!$('g2gStart')) return;
      $('g2gStart').onclick = toggle;
      $('g2gReset').onclick = reset;
      $('g2gCsv').onclick = () => {
        const blob = new Blob([csv()], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `g2g_${room}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    },
    showG2G(sum, running, readerName) {
      if (!$('g2g')) return;
      pressed('g2gStart', running, running ? '측정 중지' : '측정 시작');
      const fmt = (x) => (x ? `중앙값 ${x.median} ms, p95 ${x.p95} ms (최소 ${x.min}, 최대 ${x.max})` : '-');
      const rows = [
        ['표본 수', sum.g2g ? `${sum.g2g.n}개` : '0개'],
        ['Glass-to-Glass 지연', fmt(sum.g2g)],
        ['받기 전 (시계 화면, 카메라, 인코딩, 네트워크)', fmt(sum.before)],
        ['받은 뒤 (지터 버퍼, 디코딩, 표시)', fmt(sum.after)],
        ['살펴본 프레임', `${sum.frames}개 (QR 못 읽음 ${sum.unread}, 건너뜀 ${sum.skipped}), 읽기 ${readerName}`],
      ];
      const t = $('g2g');
      t.innerHTML = '';
      for (const [k, v] of rows) {
        const tr = t.insertRow();
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = k;
        tr.append(th);
        tr.insertCell().textContent = v;
      }
      if (sum.g2g) record.result['G2G 지연'] = fmt(sum.g2g);
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
