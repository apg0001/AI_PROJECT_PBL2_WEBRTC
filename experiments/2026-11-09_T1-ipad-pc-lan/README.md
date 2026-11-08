# T1 · iPad ↔ PC 같은 Wi-Fi 연결 시험

> 시험계획: [docs/05-test-plan.md](../../docs/05-test-plan.md) T1 · 이슈 #13 · 2026-11-09 02:59~03:00 (KST) · 같은 날 iPhone 시험: [../2026-11-09_T1-iphone-pc-lan](../2026-11-09_T1-iphone-pc-lan/README.md)

## 조건

iPhone 시험과 같고, 현장 기기만 iPad로 바꿨다.

| 항목 | 내용 |
|---|---|
| 현장 | iPad (192.168.0.105), 브라우저·OS 버전은 기록하지 못함 (이후 서버가 User-Agent를 기록하도록 수정) |
| 전문가 | MacBook Air, Chrome(헤드리스, puppeteer) |
| 네트워크 | 같은 공유기 Wi-Fi |
| 서버 | 포트 3000, HTTP. ICE는 공용 STUN만 |
| 미디어 | 없음 (DataChannel만) |
| 절차 | iPad가 Room `w1ipad`에 머물고 PC가 10회 입장·퇴장 (`server/e2e/measure-connection.mjs`) |

## 결과

| 지표 | 값 | 표본 |
|---|---|---|
| 연결 성공 | **10 / 10** (P2P Direct) | 1~10회 |
| Connection Time ↓ (PC가 나중 입장) | 중앙값 **46 ms** (최소 39, 최대 172) | 2~10회, 9회 |
| ICE RTT ↓ | 중앙값 **9 ms** (3~14) | 10회 |
| DataChannel 왕복 ↓ | 중앙값 **39.3 ms** (8.1~64.2) | 10회 |
| 선택 경로 | host(mDNS) ↔ prflx | 10회 모두 |

원자료: `runs.csv`, `runs.json`, `server.log`, `measure.log`, `expert-run1.png`.

- 1회째는 PC가 먼저 들어와 Offerer였으므로 join 기준 Connection Time이 없다.
- 서버 로그 앞부분의 Room `wlipsd`, `wlipad`는 iPad에서 Room 이름을 잘못 입력한 기록이다(`w1ipad`가 맞음). 측정에는 영향 없다.

## iPhone 시험과 비교

| 지표 | iPhone (Chrome) | iPad |
|---|---|---|
| 연결 성공 | 9 / 9 | 10 / 10 |
| Connection Time 중앙값 ↓ | 50.5 ms (8회) | 46 ms (9회) |
| ICE RTT 중앙값 ↓ | 9 ms | 9 ms |
| DataChannel 왕복 중앙값 ↓ | 21.8 ms | 39.3 ms |
| 연결 시점 srflx 있음 | 9회 중 2회 | 10회 중 3회 |

- 두 기기 모두 같은 Wi-Fi에서 직접 연결되고, 연결 시간은 0.1초 안팎이다.
- DataChannel 왕복은 두 기기 모두 7~77 ms로 흩어져 있어 중앙값 차이(21.8 vs 39.3)를 기기 차이로 해석하기 어렵다.
- srflx 후보가 연결 시점에 대부분 없다는 관찰이 iPad에서도 같다(10회 중 7회 host만). 다른 네트워크 연결(#37) 전에 #14에서 원인을 확인한다.

## 한계

- iPad 브라우저·OS를 기록하지 못했다.
- 영상·음성 없이 DataChannel만 연결했다. 같은 Wi-Fi 1곳, 1회 시험.
