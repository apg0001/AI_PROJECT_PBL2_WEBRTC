# T2-2b · KT 5G 폰 ↔ 학교망 PC(Wi-Fi), STUN만 (T2-5의 대조군)

> 시험계획: [docs/05-test-plan.md](../../docs/05-test-plan.md) T2-2 · 이슈 #37, #38 · 2026-11-16 16:37~16:39 (KST)

T2-5(TURN 적용, 10/10 성공)와 **같은 폰·같은 PC 네트워크에서 TURN만 뺀** 시험이다. 오전 T2-2는 PC가 유선(공인 IP)이어서 조건이 달랐다.

## 조건

| 항목 | 내용 |
|---|---|
| 현장 (폰) | iPhone, KT 5G (Wi-Fi 끔), `field.html?room=w2stun&turn=0` |
| 전문가 (PC) | MacBook Air, Chrome(헤드리스) `expert.html?room=w2stun&turn=0`. 학교 Wi-Fi(`10.74.26.17`, 학교 NAT 뒤 `210.94.220.229`) |
| ICE | 서버는 TURN을 내려주지만 양쪽 모두 `?turn=0`으로 빼고 공용 STUN만 사용 |
| 절차 | `EXTRA='&turn=0' node e2e/measure-connection.mjs … w2stun 5` |

## 결과

| 지표 | 값 |
|---|---|
| 연결 성공 | **0 / 5** |
| 실패 양상 | 5회 모두 `connecting`에서 약 15초 뒤 `failed` |
| PC 후보 | srflx `210.94.220.229` (학교 NAT) |
| 폰 후보 | srflx `118.235.7.67`(KT), IPv6 `2001:e60:…` |

원자료: `runs.csv`, `runs.json`, `measure.log`, `expert-fail-run1~5.png`.

첫 실행에서는 폰이 늦게 들어와 1~3회가 '현장 작업자를 기다리는 중'으로 시간이 지나 무효가 되었다. 그 기록은 버리고, 폰이 방에 있는 상태로 다시 5회를 쟀다.

## 해석

| 시험 | PC 네트워크 | TURN | 결과 |
|---|---|---|---|
| T2-2 | 학교 유선, 공인 IP | 없음 | 0 / 10 |
| **T2-2b** | 학교 Wi-Fi, 학교 NAT | 없음 | **0 / 5** |
| T2-5 | 학교 Wi-Fi, 학교 NAT | Metered | **10 / 10** |

- PC 네트워크를 바꿔도 STUN만으로는 실패하고, 같은 조건에서 TURN을 넣으면 모두 성공한다. **연결을 살린 것은 TURN이다.**
- 실패 원인 추정은 T2-2와 같다. 폰 쪽 통신사 NAT가 목적지마다 포트를 바꾸고, 학교망은 바깥에서 먼저 들어오는 UDP를 받지 않는다. 양쪽 다 "상대가 먼저 보낸 패킷"을 받지 못한다.
