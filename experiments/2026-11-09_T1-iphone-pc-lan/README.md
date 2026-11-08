# T1 · iPhone ↔ PC 같은 Wi-Fi 연결 시험

> 시험계획: [docs/05-test-plan.md](../../docs/05-test-plan.md) T1 · 이슈 #13 · 2026-11-09 02:53~02:56 (KST)

## 조건

| 항목 | 내용 |
|---|---|
| 현장 (폰) | iPhone, iOS 27.2, Chrome(CriOS 157, WebKit 엔진), `http://192.168.0.111:3000/field.html?room=w1lan` |
| 전문가 (PC) | MacBook Air, macOS, Chrome(헤드리스, puppeteer 자동화) `expert.html?room=w1lan` |
| 네트워크 | 같은 공유기 Wi-Fi (PC 192.168.0.111, 폰 192.168.0.104) |
| 서버 | `server/src/index.js` 포트 3000, HTTP (카메라 미사용 → HTTPS 불필요) |
| ICE | 공용 STUN `stun.l.google.com:19302`, TURN 없음 |
| 미디어 | 없음. DataChannel(control, pointer)만 협상 |
| 절차 | 폰이 Room에 머물고, PC가 들어갔다 나오기를 반복 (`server/e2e/measure-connection.mjs`, 10회) |

## 결과

| 지표 | 값 | 표본 |
|---|---|---|
| 연결 성공 | 9 / 9 (P2P Direct) | 1~9회. 10회째는 아래 참고 |
| Connection Time ↓ (PC가 나중 입장) | 중앙값 **50.5 ms** (최소 40, 최대 102) | 2~9회, 8회 |
| Connection Time ↓ (폰이 나중 입장) | **192 ms** | 1회 (폰 화면 캡처) |
| ICE RTT ↓ | 중앙값 **9 ms** (3~16) | 1~9회 |
| DataChannel 왕복 ↓ | 중앙값 **21.8 ms** (7.1~76.7) | 1~8회 (9회째 응답 없음) |
| 선택 경로 | host(mDNS) ↔ prflx, 전부 P2P Direct | |

원자료: `runs.csv`, `runs.json`, `server.log`, `measure.log`, `expert-run1.png`, `screenshots/`(폰 화면).

- 1회째는 폰이 나중에 들어와서 PC가 Offerer였다. PC 쪽에서는 Connection Time(join 기준)이 나오지 않아 비어 있다. 폰 화면의 192 ms가 그 회차 값이다.
- **10회째 중단:** PC가 다시 입장한 직후(17:55:24Z) 폰의 WebSocket이 닫혔다(17:55:26Z `leave field (close)`). 폰 화면 캡처를 위해 앱을 전환해 iOS가 페이지를 멈춘 것으로 본다. 시스템 결함이 아니라 시험 중 조작이다. 9회째 DataChannel 응답이 없었던 것도 같은 시점이다.

## 해석

- 같은 Wi-Fi에서는 실제 폰과 PC가 서버를 거치지 않고 직접 연결된다. 연결 시간은 0.1초 안팎이다.
- 선택 경로의 한쪽이 **prflx(peer reflexive)** 로 나온다. 카메라 권한이 없으면 브라우저가 host 주소를 mDNS 이름(`xxxx.local`)으로 숨기므로, 상대는 연결성 검사 패킷이 실제로 온 주소를 새 후보(prflx)로 배운다.
- **srflx 후보가 연결 시점에 거의 없었다.** 연결 완료 시점 기준 9회 중 7회는 양쪽 모두 host 1개뿐이었고, srflx는 1회째 PC 쪽과 9회째 폰 쪽에서만 보였다. 같은 LAN에서는 host로 바로 연결되어 문제가 없지만, 다른 네트워크(#37)에서는 srflx가 있어야 직접 연결된다. STUN 응답이 늦는지, 이 공유기에서 막히는지 #14에서 확인한다.
- DataChannel 왕복은 7~77 ms로 편차가 크다. 표본이 8개뿐이고, 폰 Wi-Fi 절전 영향을 의심하지만 확인하지 않았다.

## 한계

- iPhone Chrome 1대만 시험했다 (iOS 브라우저는 모두 WebKit 엔진이라 Safari도 비슷할 것으로 보지만 미확인). Android 미시험.
- 영상·음성 없이 DataChannel만 연결했다. 미디어가 붙으면 연결 시간이 달라질 수 있다.
- PC 쪽은 헤드리스 Chrome이다.
- 같은 Wi-Fi 1곳, 1회 시험(02:53~02:56).

## 발견한 버그 (수정함)

- 재연결 시 화면의 "연결 결과" 표가 비워지지 않아, 이전 세션의 Connection Time(192 ms)이 Offerer가 된 뒤에도 남아 있었다 → `client/js/ui.js`에서 세션마다 표를 비우도록 수정.
- 측정 스크립트가 한 회차 실패에서 멈추고 결과를 쓰지 않았다 → 실패도 기록하고 회차마다 저장하도록 수정. 이번 `runs.csv`는 `measure.log`에서 다시 만들었다.
