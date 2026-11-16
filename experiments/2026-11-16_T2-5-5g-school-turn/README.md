# T2-5 · KT 5G 폰 ↔ 학교망 PC(Wi-Fi), 호스팅 TURN 적용

> 시험계획: [docs/05-test-plan.md](../../docs/05-test-plan.md) T2-5 · 이슈 #37, #38 · 2026-11-16 16:29~16:30 (KST)

## 조건

| 항목 | 내용 |
|---|---|
| 현장 (폰) | iPhone, **KT 5G** (Wi-Fi 끔), `https://<ngrok>/field.html?room=w2nr` |
| 전문가 (PC) | MacBook Air, Chrome(헤드리스, puppeteer) `expert.html?room=w2nr`. **학교 Wi-Fi만** 연결(`10.74.26.17`, 학교 NAT 뒤 `210.94.220.229`). 오전 T2-2와 달리 유선은 뺀 상태 |
| 서버 | `server/app.py`, ngrok HTTPS 터널로 공개 |
| ICE | 공용 STUN + **Metered Open Relay TURN** (`global.relay.metered.ca`, UDP·TCP 80, UDP 443, TLS 443). 서버가 `server/.env`에서 읽어 `/api/ice`로 내려줌 |
| 절차 | 폰이 Room에 머물고, PC가 들어갔다 나오기를 반복 (`server/e2e/measure-connection.mjs`, 10회) |

## 결과

| 지표 | 값 | 표본 |
|---|---|---|
| 연결 성공 | **10 / 10**, 모두 TURN 중계 | 10회 |
| Connection Time ↓ (PC가 나중 입장) | 중앙값 **568.5 ms** (최소 323, 최대 967) | 10회 |
| ICE RTT ↓ | 중앙값 **31.5 ms** (24~44) | 10회 |
| DataChannel 왕복 ↓ | 중앙값 **32.4 ms** (29.6~41.5) | 10회 |
| 선택 경로 | PC srflx `210.94.220.229` ↔ 폰 relay `158.247.200.82` (TURN까지 UDP) | 10회 모두 같은 모양 |

폰의 공인 주소가 KT 대역(srflx `118.235.7.67`, IPv6 `2001:e60:…`)인 것을 `runs.json`의 후보로 확인했다. 원자료: `runs.csv`, `runs.json`, `measure.log`, `expert-run1.png`.

## 해석

- **폰 쪽만 TURN을 쓰고 PC는 TURN 없이 붙었다.** PC는 학교 NAT를 지나 TURN 서버(폰의 중계 주소)로 직접 보낸다. PC가 먼저 바깥으로 보내는 방향은 학교망이 막지 않는다는 뜻이다.
- 폰의 통신사 NAT는 목적지마다 포트를 바꾸므로(T2-2 참고), 폰은 TURN 서버에 자리를 받아 두고 그 주소를 상대에게 알려 준다. 그러면 상대가 보낸 패킷이 TURN 서버를 거쳐 폰에 도착한다.
- Connection Time은 같은 Wi-Fi 직접 연결(T1, 중앙값 50.5 ms)보다 약 0.5초 길다. TURN 자리 받기(인증 왕복)와 후보 교환이 더해진 시간이다. 사람이 느끼기에는 큰 차이가 아니다.
- RTT 약 30 ms는 TURN 서버를 한 번 거쳐 돌아오는 시간이다. 중계 서버 `158.247.x.x`는 지연으로 보아 국내 또는 가까운 지역에 있는 것으로 보인다(위치는 확인하지 않음).
- 같은 조건에서 TURN을 뺀 비교: [`2026-11-16_T2-2b-5g-school-stun`](../2026-11-16_T2-2b-5g-school-stun/).

## 한계

- 오전 T2-2(실패)와 PC 네트워크가 다르다(유선 공인 IP > 학교 Wi-Fi). 그래서 같은 조건에서 TURN만 뺀 시험을 따로 했다.
- 영상 없이 연결만 쟀다. 중계를 거칠 때의 영상 품질·지연은 #21, #22에서 잰다.
- 무료 TURN(매달 20 GB)이라 사용량을 확인하며 시험한다.
