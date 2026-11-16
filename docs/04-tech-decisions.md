# 04. Technology Decision

> 상태: v1.0 (1주차) · 관련 이슈 #6 · 최종 제출물 3
> 결정이 바뀌면 지우지 않고 **번복 이력**을 남긴다.

## 요약

| ID | 항목 | 선택 | 핵심 이유 |
|---|---|---|---|
| TD-01 | 실시간 통신 기술 | WebRTC | 브라우저 내장, 설치 불필요, Video·Audio·Data를 P2P로 전송 |
| TD-02 | Signaling 전송 | WebSocket (aiohttp 내장) | 서버 → 클라이언트 push가 필요, 의존성 최소 |
| TD-03 | Signaling 서버 런타임 | ~~Node.js~~ → Python aiohttp 단일 프로세스, Room은 메모리 | PoC 규모에서 가장 단순. 멘토 권고로 Python 전환 (#66) |
| TD-04 | Room 식별 | 추측하기 어려운 Room ID (URL에 포함) | 링크 공유만으로 입장 |
| TD-05 | Offer 역할 | Room에 먼저 있던 쪽 | glare 방지 |
| TD-06 | 외부 노출·HTTPS | ngrok 터널 | 모바일 Secure Context + 다른 네트워크 접속을 한 번에 해결 |
| TD-07 | NAT 통과 | 공용 STUN + 호스팅 TURN(Cloudflare, 서버가 짧은 유효기간 접속 정보 발급) | KT LTE ↔ 학교망 P2P 0/10 실패(#37). TURN 자체 구축은 범위 밖 |
| TD-08 | 영상 기본 프로파일 | 720p / 24~30fps 상한, 혼잡 시 해상도 유지보다 프레임 유지 | 원격지원은 끊김 없는 움직임이 우선 (가설) |
| TD-09 | 부가 데이터 전송 | DataChannel 2개 (`control` reliable, `pointer` unreliable) | 데이터별 요구 특성이 다름 |
| TD-10 | 클라이언트 스택 | Vanilla JS ES Modules, 빌드 없음 | PoC 범위, 학습·빌드 비용 0 |
| TD-11 | 품질 측정 | `getStats()` 1초 주기 + CSV | 표준 API, 원자료 보존 |
| TD-12 | 종단 지연 측정 | Glass-to-Glass (QR 타임스탬프) | RTT로는 사용자 체감 지연을 알 수 없음 |
| TD-13 | 미디어 켜고 끄기 | 연결 때 송수신 통로 3개(음성, 카메라, 화면 공유)를 미리 열고 `replaceTrack`으로 바꿔 끼움 | 켜고 끌 때마다 offer/answer를 다시 주고받지 않는다 (#15, #62) |

## 상세

### TD-01 실시간 통신 기술: WebRTC

| | 내용 |
|---|---|
| 대안 | HTTP 스트리밍(HLS/DASH), WebSocket으로 프레임 전송, RTSP |
| 선택 이유 | 브라우저에 내장되어 설치가 필요 없다. 코덱·지터 버퍼·혼잡 제어·암호화(DTLS-SRTP)가 표준으로 포함된다. P2P라 서버가 영상 트래픽을 감당하지 않는다 |
| 대안을 고르지 않은 이유 | HLS/DASH는 수 초 지연으로 대화형 지원에 맞지 않는다. WebSocket은 TCP라 패킷 손실 시 뒤 프레임까지 막힌다(Head-of-line blocking). RTSP는 브라우저가 기본 지원하지 않는다 |
| 단점 | NAT 환경에 따라 P2P가 실패할 수 있다. 시그널링은 직접 만들어야 한다 |

### TD-02 Signaling 전송: WebSocket (aiohttp 내장)

| | 내용 |
|---|---|
| 대안 | Socket.IO, HTTP long polling, Firebase 등 BaaS |
| 선택 이유 | 상대 입장·Offer·ICE Candidate를 서버가 즉시 밀어줘야 한다. 표준 WebSocket이라 브라우저의 `WebSocket`과 바로 통하고, aiohttp에 들어 있어 따로 설치할 것이 없다. 연결 확인(30초 ping, pong이 없으면 끊음)도 aiohttp의 `heartbeat` 옵션으로 처리한다 |
| 단점 | 재연결·Room 브로드캐스트를 직접 구현해야 한다 (Socket.IO는 기본 제공). 프록시가 WebSocket을 막는 환경은 고려하지 않는다 |
| 번복 이력 | 1주차에는 Node.js `ws` 라이브러리였다. TD-03 전환(#66)과 함께 aiohttp 내장 WebSocket으로 바꿨다. 메시지 형식은 그대로다 |

### TD-03 Signaling 서버: Python aiohttp 단일 프로세스, 메모리 Room

| | 내용 |
|---|---|
| 대안 | Redis로 Room 상태 공유, 서버 여러 대. 런타임은 Node.js(1주차), FastAPI, Flask-SocketIO |
| 선택 이유 | 1:1 PoC에서 동시 Room이 몇 개뿐이다. 메시지 몇 개를 중계하는 작업이라 부하가 거의 없다. aiohttp 하나로 정적 파일, `/healthz`, `/api/info`, WebSocket을 모두 처리한다(의존성 1개) |
| Python으로 바꾼 이유 | 프로젝트 멘토 권고(2주차, #66). 인공지능 과목이라 서버 언어를 Python으로 맞추고, 나중에 서버가 영상을 받는 확장(aiortc)을 검토할 때 같은 aiohttp 위에 붙일 수 있다 |
| 바꾸지 않은 것 | 메시지 형식(03 §3), 엔드포인트, 포트 3000, HTTPS 인증서 처리, 브라우저 코드. 영상은 계속 브라우저끼리 직접(P2P) 가고 서버는 연결 정보만 전달한다 |
| 확인 | 서버 단위 시험 8개(기존 5개 이전 + 정적 파일 3개) 통과, 브라우저 코드 변경 없이 Chrome E2E 20개 항목 통과 |
| 단점 | 서버가 재시작되면 Room 정보가 사라진다. 수평 확장 불가. 상용화 시 Room 상태를 외부 저장소로 옮겨야 한다 (#27) |
| 참고 | 시그널링 서버가 죽어도 이미 연결된 P2P 통화는 유지된다 |
| 번복 이력 | 1주차는 Node.js(`server/src/index.js`, `signaling.js`)였다. #66에서 `server/app.py`, `server/signaling.py`로 바꿨다 |

### TD-04 Room 식별: 추측하기 어려운 Room ID

| | 내용 |
|---|---|
| 대안 | 순번 Room(1, 2, 3…), 로그인 기반 Session |
| 선택 이유 | 링크를 공유하는 것만으로 입장할 수 있어 현장 작업자가 쉽다. 무작위 ID라 다른 Room을 추측하기 어렵다 |
| 단점 | 링크를 아는 사람은 누구나 들어올 수 있다 (정원 2명으로만 제한). 상용화 시 인증과 임시 Access Token 필요 (Think 1, 4) |

### TD-05 Offer 역할: Room에 먼저 있던 쪽

| | 내용 |
|---|---|
| 대안 | 역할 고정(전문가가 항상 Offer), Perfect Negotiation 패턴 |
| 선택 이유 | 서버가 `peer-joined`를 기존 참가자에게만 보내므로 Offerer가 항상 한 명이다. 누가 먼저 들어오든 동작한다 |
| 단점 | 연결 중 재협상(트랙 추가, ICE Restart)이 양쪽에서 동시에 일어나면 여전히 충돌할 수 있다. 재연결(#24, #34)에서 필요하면 Perfect Negotiation으로 바꾼다 |

### TD-06 외부 노출·HTTPS: ngrok 터널

| | 내용 |
|---|---|
| 대안 | mkcert 자체 인증서(동일 LAN), cloudflared 터널, 클라우드 서버 배포(Render, Fly.io, AWS) |
| 선택 이유 | 모바일 `getUserMedia`는 HTTPS(Secure Context)가 필요하다. LTE의 폰이 개발자 PC 서버에 접속해야 다른 네트워크 시험(#37)이 가능하다. ngrok은 이미 설치·설정되어 있고 두 문제를 한 번에 해결한다 |
| 단점 | 무료 플랜은 실행할 때마다 URL이 바뀐다. 처음 접속 시 경고 페이지가 뜬다. 시그널링에 터널 왕복 지연이 더해진다(Connection Time에 반영). 영상 지연에는 영향이 없다 |
| 번복 이력 | 1주차 초안은 "다른 네트워크 실측 제외 + mkcert/cloudflared"였다. #36에서 다른 네트워크 시험을 포함하며 ngrok으로 확정 |

### TD-07 NAT 통과: 공용 STUN, TURN은 필요 시 호스팅

| | 내용 |
|---|---|
| 대안 | STUN 없음(동일 LAN만), coturn 자체 구축, 호스팅 TURN(Metered, Cloudflare, Twilio) |
| 선택 이유 | 대부분의 가정용 공유기(Cone NAT)는 STUN으로 얻은 공인 주소로 P2P가 된다. 공용 STUN은 비용이 없다. TURN 자체 구축은 과제 범위 밖이다 |
| 단점 | 이동통신망 CGNAT, Symmetric NAT, UDP 차단 방화벽에서는 STUN만으로 실패한다. 공용 STUN은 SLA가 없다 |
| 검증 계획 | #37에서 조합별 성공·실패와 Candidate를 기록하고, 실패 조합에 #38 호스팅 TURN을 적용해 비교한다 |
| 실측 (#37) | KT LTE 폰 ↔ 학교망 PC(공인 IP)에서 STUN만으로 10회 모두 실패. 자세한 분석은 #14 |
| 호스팅 TURN 선택 (#38) | Cloudflare Realtime TURN. 매달 1,000 GB 무료, UDP·TCP·TLS(443) 포트를 모두 제공해 UDP를 막는 방화벽도 통과할 수 있다. Metered Open Relay는 무료 한도가 작고 고정 접속 정보라 비밀 관리가 어렵다 |
| 접속 정보 관리 | TURN 키는 서버의 `server/.env`(git 제외)에만 둔다. 브라우저는 연결 전에 `GET /api/ice`로 유효기간 4시간짜리 접속 정보를 받는다(`server/ice.py`). 키가 공개 저장소나 브라우저 코드에 들어가지 않고, 새어도 몇 시간 뒤 쓸 수 없다. 상용 서비스의 방식과 같다 |
| 시험 옵션 | 주소에 `?relay=1`(TURN만 사용), `?turn=0`(TURN 빼고 STUN만), `?stun=0`(host만) |

### TD-08 영상 기본 프로파일

| | 내용 |
|---|---|
| 대안 | A: 1080p30 최고 화질, B: 480p15 저화질 고정 |
| 선택 | 요청 720p / 24~30fps, 대역폭이 부족하면 브라우저 적응에 맡기되 `degradationPreference`로 무엇을 먼저 포기할지 실험 |
| 이유 | 과제 명세 §10-11: 원격지원에서는 영상이 멈추지 않는 것, 즉시 대화할 수 있는 것이 최고 화질보다 중요하다. 다만 계기판 숫자를 읽을 해상도는 필요하다 |
| 검증 | #21에서 A vs B를 정상·제한 망에서 비교해 확정한다 |

### TD-09 부가 데이터: DataChannel 2개

| 채널 | 설정 | 데이터 |
|---|---|---|
| `control` (id 0) | `ordered: true`, 재전송 무제한 (reliable) | 채팅, 작업 지시, `ack`, 장비 상태 |
| `pointer` (id 1) | `ordered: false`, `maxRetransmits: 0` | 포인터 좌표 |

| | 내용 |
|---|---|
| 대안 | DataChannel 1개에 모두, WebSocket(시그널링 서버) 경유, 영상에 포인터를 그려서 전송 |
| 선택 이유 | 작업 지시는 반드시 순서대로 도착해야 하지만, 포인터는 최신 좌표만 의미가 있다. 한 채널에 섞으면 포인터 재전송이 지시를 지연시키거나(reliable), 지시가 유실된다(unreliable). DataChannel은 P2P라 서버 경유보다 지연이 짧고, 서버를 거치지 않으므로 서버 부하·노출이 없다 |
| 단점 | 메시지 형식·`ack`를 직접 설계해야 한다. P2P가 실패하면 DataChannel도 함께 끊긴다 |
| 메시지 형식 | `{ type, seq, ts, payload }` JSON으로 확정(#16). 종류와 규칙은 [03 §6](03-connection-sequence.md#6-datachannel-메시지-스펙-16) |
| 확인(ack) | 작업 지시만 확인을 받는다. 앱이 받으면 자동 `received`, 작업자가 누르면 `done`. 연결이 끊겨 `received`를 못 받은 지시는 재연결 때 다시 보내고 받는 쪽이 `id`로 중복을 거른다. reliable 채널은 연결이 살아 있는 동안의 유실만 막아 주기 때문이다 |
| 포인터 처리 | 받는 쪽은 `seq`가 더 작은(늦게 온) 좌표를 버린다. 보내는 쪽은 대기열이 16KB를 넘으면 좌표를 건너뛴다 |

### TD-10 클라이언트: Vanilla JS, 빌드 없음

| | 내용 |
|---|---|
| 대안 | React/Vue, TypeScript + 번들러 |
| 선택 이유 | 화면이 두 개뿐인 PoC다. 빌드 없이 서버가 파일을 그대로 서빙하면 폰에서 바로 확인할 수 있다 |
| 단점 | 타입 검사가 없다. 화면이 커지면 상태 관리가 번거롭다 |

### TD-11 품질 측정: `getStats()` 1초 주기 + CSV

| | 내용 |
|---|---|
| 대안 | `chrome://webrtc-internals` 덤프만 사용 |
| 선택 이유 | 표준 API라 Safari·Chrome에서 같은 코드로 수집한다. 실험 조건별 원자료를 CSV로 남겨 그래프와 재분석이 가능하다. 상용 서비스의 Telemetry(Think 7)와 같은 방식이다 |
| 단점 | 브라우저마다 지원하는 필드가 다르다 (예: Safari의 일부 필드 누락). 1초 평균이라 순간 정지를 놓칠 수 있다 → `freezeCount` 보완 |
| 구현 (#18) | `client/js/stats.js`. 경로·RTT(`candidate-pair`), 받는 영상(`inbound-rtp`: 해상도, fps, 비트레이트, 손실률, 지터, 지터 버퍼, 디코딩 시간, 정지), 보내는 영상(`outbound-rtp`: 비트레이트, 화질을 낮춘 이유), 받는 음성을 30열로 기록. 누적 값은 1초 차이로 바꾼다. 열 목록은 [05 §5](05-test-plan.md#statscsv-열-18) |
| 차이 계산 주의 | 통로의 트랙이 바뀌면(화면 공유 다시 시작 등) 누적 값이 처음부터 다시 쌓이므로, 값이 줄면 그 1초는 비워 둔다 |

### TD-12 종단 지연 측정: Glass-to-Glass

| | 내용 |
|---|---|
| 대안 | `getStats` RTT만 사용, 초시계를 같이 찍어 수동 비교 |
| 선택 | PC 화면에 ms 타임스탬프 QR을 띄우고 → 폰 카메라로 촬영·송출 → 같은 PC의 수신 화면에서 QR을 읽어 `현재 시각 − 영상 속 시각` 계산 |
| 이유 | RTT는 네트워크 왕복만 보여준다. 실제로 전문가가 보는 지연은 카메라 캡처 + 인코딩 + 네트워크 + 지터 버퍼 + 디코딩 + 렌더링의 합이다. 같은 PC 시계를 쓰므로 기기 간 시계 동기화가 필요 없다 |
| 단점 | 디스플레이 주사율(60Hz ≈ 16.7ms)과 카메라 노출 시간만큼 오차가 있다. 반복 측정해 중앙값과 p95로 보고한다 |
| 구현 (#19) | `tools/g2g-latency/`. 표시 시각은 `requestVideoFrameCallback`의 `expectedDisplayTime`, QR 읽기는 `BarcodeDetector`(없으면 jsQR). `receiveTime`으로 '받기 전'(카메라·인코딩·네트워크)과 '받은 뒤'(지터 버퍼·디코딩·표시)를 나눈다. 같은 시계 값은 한 번만 센다. 절차·오차: [도구 README](../tools/g2g-latency/README.md) |
| 기준값 | 현장 `?fake=clock`(카메라 대신 시계 캔버스를 보냄)으로 카메라·모니터를 뺀 내부 지연을 따로 잰다. PC 한 대 가짜 연결에서 중앙값 49 ms(받은 뒤 42 ms) |

### TD-13 미디어 켜고 끄기: 미리 연 송수신 통로 + `replaceTrack`

| | 내용 |
|---|---|
| 대안 | 켤 때마다 `addTrack` 후 offer/answer 재협상 (perfect negotiation 패턴) |
| 선택 | Offerer가 처음 offer를 만들기 전에 `addTransceiver`로 음성, 카메라, 화면 공유 통로 3개를 `sendrecv`로 연다. Answerer는 받은 순서대로 같은 이름을 붙이고 `sendrecv`로 바꾼다. 카메라나 화면 공유를 켜고 끌 때는 `RTCRtpSender.replaceTrack`만 부른다. 켜짐·꺼짐은 `control` DataChannel로 `{type:'media', slot, on}`을 보내 알린다 |
| 이유 | 재협상이 없으니 시그널링 서버를 다시 거치지 않고, 양쪽이 동시에 재협상하는 충돌(glare)도 생기지 않는다. 연결이 끊겼다가 다시 연결되어도 켜 둔 트랙을 새 연결의 통로에 그대로 다시 붙인다 |
| 단점 | 쓰지 않는 통로도 SDP에 들어간다(수백 바이트). 통로 수가 고정이라 카메라 두 대 같은 확장은 재협상이 필요하다. 꺼진 동안 받는 쪽 영상은 마지막 프레임에 멈추므로 `control` 메시지로 화면을 숨긴다 |
| 화질 | 프로파일 A(1080p 30fps, 최대 2.5 Mbps), B(480p 15fps, 최대 0.5 Mbps). 기본 B. 전문가가 고르면 `control`로 `{type:'profile'}`을 보내 현장이 카메라를 다시 연다 |
