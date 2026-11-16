# 2주차 보고서 — Media/Data 및 측정 도구

> 기간: 2026-11-16 ~ 11-22 · Milestone: 2주차 · Media/Data 및 측정 도구 · 작업(PR)마다 갱신한다.
> 1주차 발표 이후에 한 작업은 날짜가 11/16 이전이어도 이 보고서에 적는다 (1주차 발표자료는 제출 완료).

## 이번 주 목표

1. 다른 네트워크 간 연결 시험 (#37)과 NAT/STUN/TURN 분석 (#14)
2. DataChannel 프로토콜, 채팅·Pointer (#16, #17)
3. getStats 수집, Glass-to-Glass 지연 측정 도구 (#18, #19)
4. 발표자료 (#20)

## 진행 현황

| 구분 | 이슈 |
|---|---|
| 완료 | #66 시그널링 서버 aiohttp 전환 · #16 DataChannel 프로토콜 · #17 대화·지시·포인터 · #18 품질 기록 · #19 G2G 측정 도구 · #72 실행 환경 · #37 다른 네트워크 연결 |
| 진행 중 | #62 전문가 화면 공유 (실제 폰 표시 확인 남음) · #38 TURN (연결 확인, 품질 비교 남음) |
| 남음 | #14 · #20 · 실제 폰 측정(#19 G2G, #62 화면 공유, #17 포인터) |

## 작업 기록

| 날짜 | 이슈 · PR | 한 일 | 결과 · 근거 |
|---|---|---|---|
| 11/09 | #66 | 멘토 권고로 시그널링 서버를 Node.js(`ws`)에서 Python aiohttp로 전환. `server/app.py`(정적 파일, `/healthz`, `/api/info`, HTTPS 인증서), `server/signaling.py`(Room, 중계, 오류 코드, 30초 heartbeat, 64KB 제한). 단위 시험을 Python unittest로 옮기고 정적 파일 시험 3개 추가. E2E·화면 캡처 스크립트가 Python 서버를 띄우도록 변경 | 단위 시험 8/8 통과(`npm test`). 브라우저 코드 변경 없이 Chrome E2E 20/20 통과(`npm run e2e`). 경로 조작(`/%2e%2e/`) 403, LAN 주소 순서가 Node 때와 같음(Wi-Fi 먼저). 기술 결정 TD-02·TD-03에 번복 이력, 서버 구성도·아키텍처 그림 다시 그림 |
| 11/16 | #16 | DataChannel 메시지 프로토콜 `client/js/datachannel.js`: 봉투 `{type, seq, ts, payload}`, 종류 9개(chat, instruction, ack, device-status, media, profile, ping, pong, pointer), 받을 때 형식 검사. 작업 지시는 자동 도착 확인(`received`)과 작업자 확인(`done`) 2단계. 연결이 끊긴 동안의 지시는 재연결 후 다시 보내고 `id`로 중복을 거름. 포인터는 늦게 온 번호를 버림. 기존 화면 제어 메시지(media, profile, ping)도 같은 봉투로 옮김 | E2E 24/24 통과(새 항목 4개: 형식 검사 7가지, 지시 도착 확인 왕복 1 ms, 포인터 5개 도착, 재연결 후 재전송 1회). 스펙: 03 §6, TD-09 |
| 11/16 | #17 | 대화(양방향, 50개 유지), 작업 지시(전문가 입력 > 현장 목록, 확인 전은 노란 띠, '확인' 버튼 > 전문가 표에 '현장 확인'), 포인터(전문가가 영상을 누르거나 끌면 초당 최대 30번 0~1 좌표 전송, 현장은 내 카메라 영상 위 같은 위치에 노란 고리, 전면 카메라 거울 화면은 x를 뒤집음, 3초 뒤 흐려짐), 장비 상태 더미(PUMP-03). 영상 빈 띠(object-fit: contain)를 빼고 실제 영상 영역 기준으로 좌표 계산 | E2E 28/28 통과(새 항목 4개). 포인터: 전문가 (0.25, 0.75) > 현장 (0.252, 0.753). 화면: `docs/screens/field-instructions.png`, `expert-instructions.png`. 실제 폰 확인 남음 |
| 11/16 | #18 | 통신 품질 수집 `client/js/stats.js`: 1초마다 getStats를 한 줄(30열)로 기록. 끊긴 동안도 기록하고 재연결은 `sess`로 구분. 화면에 '통신 품질' 표, 'CSV 저장' 버튼. 그래프 스크립트 `tools/stats/plot_stats.py`(matplotlib), PC 안에서 가짜 카메라로 N초 수집하는 `server/e2e/collect-stats.mjs` | E2E 32/32 통과(새 항목 4개). 가짜 카메라 20초 수집: 받는 영상 중앙값 175 kbps·15 fps, 손실 0%, 지터 버퍼 7.6 ms. 연결 직후 현장 송신의 '화질을 낮춘 이유'가 bandwidth로 나옴(대역폭 추정이 낮게 시작) |
| 11/16 | #19 | Glass-to-Glass 지연 측정 도구 `tools/g2g-latency/`: `clock.html`(지금 시각 ms를 QR과 숫자로 매 프레임), 전문가 화면 '종단 지연 측정'(받은 프레임의 QR을 `BarcodeDetector`로 읽어 `표시 시각 - QR 시각`, 중앙값·p95·받기 전/받은 뒤·CSV). 현장 시험 모드 `?fake=clock`(카메라 대신 시계 캔버스 송출). 절차·수동 검증·오차 요인 README | E2E 34/34 통과. 시험 모드 8초: 표본 108개, 중앙값 49.3 ms, p95 49.9 ms, 받기 전 7.6 ms / 받은 뒤 41.6 ms, 못 읽음 0. 화면: `docs/screens/g2g-clock.png`, `expert-g2g.png`. 실제 폰 카메라 측정은 남음 |
| 11/16 | #72 | 실기기 시험 준비 중 `npm start`가 `No module named 'aiohttp'`로 실패. 사용자 터미널의 `python3`는 Homebrew 3.13이고 aiohttp는 anaconda에만 있었다(개발 시험은 anaconda로 해서 놓침). `server/.venv` 가상환경(`npm run setup`), `server/run.sh`가 가상환경 Python을 먼저 고름. E2E·캡처·수집 스크립트도 같은 경로로 서버를 띄움 | Homebrew `python3` 셸에서 `npm test` 통과, 서버 `/healthz` 200, E2E 34/34 통과 |
| 11/16 | #38 | 호스팅 TURN 지원 준비: 서버 `GET /api/ice`(`server/ice.py`)가 Cloudflare Realtime TURN에서 4시간짜리 접속 정보를 받아 STUN과 함께 내려줌(키는 `server/.env`, git 제외). 고정 TURN 설정도 가능. 브라우저는 연결 전에 받아 씀. 시험 옵션 `?relay=1`, `?turn=0`. 선택된 relay 경로에 TURN까지의 방식(udp/tcp/tls) 표시. 반복 측정 스크립트에 `EXTRA` 옵션 | 단위 시험 11/11(설정 없음, 고정 TURN, 잘못된 Cloudflare 키에서 STUN으로 대체), E2E 35/35. 실제 TURN 연결은 Cloudflare 키 설정 후 |
| 11/16 | #37 | 다른 네트워크 연결 실측. ngrok으로 시그널링을 공개하고 폰(KT)이 `field.html`, PC가 `measure-connection.mjs`로 반복 입장. 같은 조건에서 TURN 있음·없음을 나눠 잼 | T2-2 STUN만 0/10(PC 유선 공인 IP) · T2-2b STUN만 0/5(PC 학교 Wi-Fi) · T2-5 Metered TURN 10/10, Connection Time 중앙값 568.5 ms, RTT 31.5 ms. 폰만 TURN 주소를 쓰고 PC는 학교 NAT로 TURN에 직접 보냄. `experiments/2026-11-16_T2-*`, TD-07, 05 시험계획 |
| 11/16 | #38 | Cloudflare TURN이 결제 수단 등록을 요구해 Metered Open Relay(매달 20 GB 무료)로 바꿈. 코드 변경 없이 `server/.env`의 고정 TURN 설정만 사용. `.env.example`에 Metered 예시 | 서버 `/api/ice` 응답 `stun+turn(static)` 확인. 위 T2-5 10/10 |


## 트러블슈팅

발표자료에 자세히 넣는다 (증상 > 확인한 것 > 원인 > 조치 > 결과 순서).

### 실기기 시험 중 (11/16)

| # | 증상 | 확인한 것 | 원인 | 조치 | 결과 |
|---|---|---|---|---|---|
| 1 | 사용자 터미널에서 `npm start`가 `ModuleNotFoundError: No module named 'aiohttp'`로 바로 종료 | 개발 셸과 사용자 셸의 `which python3` 비교 | 사용자 셸은 Homebrew Python 3.13(aiohttp 없음, pip 설치 막힘), 개발 셸은 anaconda 3.11(aiohttp 있음). 개발 중 시험이 다른 Python으로 돌아 놓침 | `server/.venv` 가상환경(`npm run setup`), 실행 스크립트 `server/run.sh`가 가상환경 Python을 먼저 고름 (#72) | 사용자 셸에서 `npm start`, `npm test`, E2E 통과. 이후 실행 확인은 사용자 셸(`zsh -ic`)로 함 |
| 2 | KT LTE 폰 ↔ 학교망 PC가 10번 모두 연결 실패. 매번 `checking`에서 약 15초 뒤 `failed` | 회차마다 양쪽 후보 전체와 상태 전이 저장. 후보는 양쪽 모두 정상 수집(PC srflx `210.94.172.67`, 폰 srflx `118.235.6.65`·IPv6). macOS 방화벽에서 Chrome 들어오는 연결 허용 확인 | 폰 쪽 통신사 NAT는 목적지마다 포트를 바꾸고(Symmetric NAT 동작), 학교망은 바깥에서 먼저 들어오는 UDP를 받지 않는 것으로 추정. 양쪽 모두 상대가 먼저 보낸 패킷을 받지 못함 | 중계 서버(TURN) 도입. 서버가 `/api/ice`로 TURN 접속 정보를 내려주도록 구현 (#38) | 아래 6·7 이후 같은 조건에서 TURN 있음 10/10, 없음 0/5 |
| 3 | Cloudflare TURN 키를 만들려는데 결제 수단 등록을 요구 | Cloudflare는 매달 1,000 GB 무료지만 카드 필요. 대안 비교: Metered Open Relay(20 GB, 카드 불필요), 라즈베리파이에 coturn 자체 구축 | 자체 구축은 집 공유기 포트 포워딩, 공인 IP, DDNS, TLS 인증서가 필요하고 과제 범위(자체 구축 안 함) 밖 | Metered Open Relay 사용. 코드는 이미 고정 TURN 설정을 지원해 `server/.env`만 채움 | 서버 시작 로그 `ICE 서버: static`, `/api/ice`가 `stun+turn(static)` 응답 |
| 4 | 설정 후에도 TURN이 쓰이지 않음 | `/api/ice`가 404. 3000번 포트 프로세스의 시작 시각이 11:57로, TURN 코드 병합(12:08)보다 이전 | 서버를 다시 켜지 않아 옛 코드가 계속 돌고 있었음 | `npm start` 재시작 요청 | `/api/ice` 200, TURN 주소 4개 확인 |
| 5 | TURN 시험이 10/10 성공했지만 상대 주소가 이상함 | 상대 srflx가 `210.94.220.228`(학교 대역). KT라면 `118.235.x.x`여야 함. 상대 host 후보가 모두 `.local`(카메라 권한 없는 PC 브라우저 모양) | 같은 방 이름(`w2lte`)에 PC 쪽 현장 탭이 남아 있어 폰 대신 그 탭과 연결된 것으로 추정 | 그 기록은 결과에서 제외. 새 방 이름(`w2nr`)으로 다시 재고, 기록 전에 상대 주소가 통신사 대역인지 먼저 확인 | 상대 srflx `118.235.7.67`(KT) 확인 후 T2-5 10/10 |
| 6 | 오전 실패(T2-2)와 오후 성공(T2-5)의 조건이 다름 | PC 네트워크가 오전 유선(공인 IP `210.94.172.67`)에서 오후 학교 Wi-Fi(`10.74.26.17`, NAT 뒤 `210.94.220.229`)로 바뀜 | TURN 효과인지 PC 네트워크 변화 효과인지 구분할 수 없음 | 같은 조건에서 TURN만 뺀 대조 시험(T2-2b, 양쪽 `?turn=0`) | STUN만 0/5. 연결을 살린 것은 TURN임을 확인 |
| 7 | 대조 시험 1~3회가 '현장 작업자를 기다리는 중'으로 시간 초과 | 회차별 기록에 후보·상태 전이가 비어 있음 | 측정 스크립트가 폰 입장보다 먼저 시작 | 해당 실행 전체를 버리고, 폰이 방에 있는 상태로 다시 5회 | T2-2b 0/5 (5회 모두 폰 KT 주소 확인) |

### 개발 중 (11/09~11/16)

| # | 증상 | 원인 | 조치 |
|---|---|---|---|
| 8 | Python 서버로 바꾼 뒤 시작 화면의 폰용 링크가 다른 주소(유선)를 먼저 보여 줌 | 표준 라이브러리로 주소를 구하는 순서가 Node와 다름 | `ifconfig` 출력 순서(Wi-Fi 먼저)를 따르도록 변경 (#66) |
| 9 | E2E 포인터 시험이 가끔 실패 | 대화 입력 뒤 화면이 스크롤되어 클릭 위치가 영상 밖 | 클릭 전에 영상을 화면 안으로 스크롤 (#17) |
| 10 | E2E에서 메시지를 받기 전에 보내 놓쳐 실패 | 받는 쪽 구독보다 보내기가 먼저 실행되는 경쟁 | 구독 후 0.1초 기다린 뒤 보내기 (#16) |
| 11 | 품질 수집 스크립트가 CSV 저장 후 끝나지 않음 | 서버 출력 파이프를 아무도 읽지 않아 서버가 멈추고 종료도 막힘 | 서버 출력 무시, 브라우저 종료 5초 제한, 명시적 종료 (#18) |
| 12 | 화면 시계가 '11시 3분 18초'처럼 길게 표시 | 지역 형식 시각 문자열 사용 | `HH:MM:SS` 고정 형식 (#17) |
| 13 | 그래프 스크립트가 글꼴 경고를 수십 줄 출력 | 설치되지 않은 한글 글꼴 이름까지 후보로 넘김 | 설치된 한글 글꼴만 골라 씀 (#18) |

## 발표자료에 넣을 것

- 서버를 Python aiohttp로 바꾼 이유(멘토 권고, 과목 언어 통일)와 바꾸지 않은 것(메시지 형식, P2P 구조). 근거: 단위 시험 8개, E2E 20항목
- DataChannel 두 채널의 차이(순서·재전송)와 작업 지시 확인 흐름 그림 (03 §6)
- 현장·전문가 화면 캡처(포인터, 지시 확인 상태): `docs/screens/field-instructions.png`, `expert-instructions.png`. 가능하면 실제 폰 캡처로 바꾼다
- 품질 기록: 화면의 통신 품질 표 캡처(`docs/screens/expert-video.png`)와 CSV로 그린 그래프. 실제 폰 데이터로 다시 그린다
- G2G 측정 원리 그림(시계 > 폰 카메라 > WebRTC > 같은 PC 화면)과 측정 화면. 실제 폰 측정값과 시험 모드 내부 지연(49 ms)을 나란히
- 기술 스택 장의 "Node.js + ws" 줄을 "Python aiohttp"로 고친다
- 트러블슈팅: 위 표의 실기기 7건은 한 건씩 증상, 확인한 것, 원인, 조치, 결과를 캡처(`experiments/…/expert-fail-run*.png`, 후보 표)와 함께 자세히 넣는다. 개발 중 6건은 한 장에 표로
- 다른 네트워크 결과 표(T2-2 0/10, T2-2b 0/5, T2-5 10/10)와 'TURN이 있을 때 패킷 경로' 그림(폰 > TURN 서버 > 학교 NAT > PC)
