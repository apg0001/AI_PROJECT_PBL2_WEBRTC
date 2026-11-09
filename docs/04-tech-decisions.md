# 04. Technology Decision

> 상태: v1.0 (1주차) · 관련 이슈 #6 · 최종 제출물 3
> 결정이 바뀌면 지우지 않고 **번복 이력**을 남긴다.

## 요약

| ID | 항목 | 선택 | 핵심 이유 |
|---|---|---|---|
| TD-01 | 실시간 통신 기술 | WebRTC | 브라우저 내장, 설치 불필요, Video·Audio·Data를 P2P로 전송 |
| TD-02 | Signaling 전송 | WebSocket (`ws`) | 서버 → 클라이언트 push가 필요, 의존성 최소 |
| TD-03 | Signaling 서버 런타임 | Node.js 단일 프로세스, Room은 메모리 | PoC 규모에서 가장 단순 |
| TD-04 | Room 식별 | 추측하기 어려운 Room ID (URL에 포함) | 링크 공유만으로 입장 |
| TD-05 | Offer 역할 | Room에 먼저 있던 쪽 | glare 방지 |
| TD-06 | 외부 노출·HTTPS | ngrok 터널 | 모바일 Secure Context + 다른 네트워크 접속을 한 번에 해결 |
| TD-07 | NAT 통과 | 공용 STUN, TURN은 필요 시 호스팅 | 과제 범위, 비용 없음 |
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

### TD-02 Signaling 전송: WebSocket (`ws` 라이브러리)

| | 내용 |
|---|---|
| 대안 | Socket.IO, HTTP long polling, Firebase 등 BaaS |
| 선택 이유 | 상대 입장·Offer·ICE Candidate를 서버가 즉시 밀어줘야 한다. `ws`는 의존성이 하나뿐이고 브라우저 표준 `WebSocket`과 바로 통한다 |
| 단점 | 재연결·Room 브로드캐스트를 직접 구현해야 한다 (Socket.IO는 기본 제공). 프록시가 WebSocket을 막는 환경은 고려하지 않는다 |

### TD-03 Signaling 서버: Node.js 단일 프로세스, 메모리 Room

| | 내용 |
|---|---|
| 대안 | Redis로 Room 상태 공유, 서버 여러 대 |
| 선택 이유 | 1:1 PoC에서 동시 Room이 몇 개뿐이다. 메시지 몇 개를 중계하는 작업이라 부하가 거의 없다 |
| 단점 | 서버가 재시작되면 Room 정보가 사라진다. 수평 확장 불가. 상용화 시 Room 상태를 외부 저장소로 옮겨야 한다 (#27) |
| 참고 | 시그널링 서버가 죽어도 이미 연결된 P2P 통화는 유지된다 |

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
| 메시지 형식 | `{ type, seq, ts, payload }` JSON. 상세는 #16에서 확정 |

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

### TD-12 종단 지연 측정: Glass-to-Glass

| | 내용 |
|---|---|
| 대안 | `getStats` RTT만 사용, 초시계를 같이 찍어 수동 비교 |
| 선택 | PC 화면에 ms 타임스탬프 QR을 띄우고 → 폰 카메라로 촬영·송출 → 같은 PC의 수신 화면에서 QR을 읽어 `현재 시각 − 영상 속 시각` 계산 |
| 이유 | RTT는 네트워크 왕복만 보여준다. 실제로 전문가가 보는 지연은 카메라 캡처 + 인코딩 + 네트워크 + 지터 버퍼 + 디코딩 + 렌더링의 합이다. 같은 PC 시계를 쓰므로 기기 간 시계 동기화가 필요 없다 |
| 단점 | 디스플레이 주사율(60Hz ≈ 16.7ms)과 카메라 노출 시간만큼 오차가 있다. 반복 측정해 중앙값과 p95로 보고한다 |

### TD-13 미디어 켜고 끄기: 미리 연 송수신 통로 + `replaceTrack`

| | 내용 |
|---|---|
| 대안 | 켤 때마다 `addTrack` 후 offer/answer 재협상 (perfect negotiation 패턴) |
| 선택 | Offerer가 처음 offer를 만들기 전에 `addTransceiver`로 음성, 카메라, 화면 공유 통로 3개를 `sendrecv`로 연다. Answerer는 받은 순서대로 같은 이름을 붙이고 `sendrecv`로 바꾼다. 카메라나 화면 공유를 켜고 끌 때는 `RTCRtpSender.replaceTrack`만 부른다. 켜짐·꺼짐은 `control` DataChannel로 `{type:'media', slot, on}`을 보내 알린다 |
| 이유 | 재협상이 없으니 시그널링 서버를 다시 거치지 않고, 양쪽이 동시에 재협상하는 충돌(glare)도 생기지 않는다. 연결이 끊겼다가 다시 연결되어도 켜 둔 트랙을 새 연결의 통로에 그대로 다시 붙인다 |
| 단점 | 쓰지 않는 통로도 SDP에 들어간다(수백 바이트). 통로 수가 고정이라 카메라 두 대 같은 확장은 재협상이 필요하다. 꺼진 동안 받는 쪽 영상은 마지막 프레임에 멈추므로 `control` 메시지로 화면을 숨긴다 |
| 화질 | 프로파일 A(1080p 30fps, 최대 2.5 Mbps), B(480p 15fps, 최대 0.5 Mbps). 기본 B. 전문가가 고르면 `control`로 `{type:'profile'}`을 보내 현장이 카메라를 다시 연다 |
