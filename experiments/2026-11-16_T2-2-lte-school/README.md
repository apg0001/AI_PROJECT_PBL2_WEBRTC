# T2-2 · KT LTE 폰 ↔ 학교망 PC(유선), STUN만

> 시험계획: [docs/05-test-plan.md](../../docs/05-test-plan.md) T2-2 · 이슈 #37 · 2026-11-16 12:01~12:06 (KST)

## 조건

| 항목 | 내용 |
|---|---|
| 현장 (폰) | iPhone, **KT LTE** (Wi-Fi 끔), `https://<ngrok>/field.html?room=w2lte`, 카메라 허용 |
| 전문가 (PC) | MacBook Air, Chrome(헤드리스, puppeteer) `expert.html?room=w2lte`. **유선과 Wi-Fi 동시 연결**, 외부로 나가는 주소는 유선의 공인 IP `210.94.172.67`(NAT 없음) |
| 서버 | `server/app.py`, ngrok HTTPS 터널로 공개. 시그널링만 터널을 지나고 영상은 P2P |
| ICE | 공용 STUN `stun.l.google.com:19302`만. TURN 없음 |
| 절차 | 폰이 Room에 머물고, PC가 들어갔다 나오기를 반복 (`server/e2e/measure-connection.mjs`, 10회) |

## 결과

| 지표 | 값 |
|---|---|
| 연결 성공 | **0 / 10** |
| 실패 양상 | 10회 모두 `checking`에서 약 15초 머문 뒤 `disconnected` > `failed` |
| 후보 수집 | 양쪽 모두 정상. 실패 원인은 수집이 아니라 연결성 검사 |

| 쪽 | 수집된 후보 |
|---|---|
| PC | host(mDNS 이름), srflx `210.94.172.67` (host와 같은 포트, 즉 NAT 없음) |
| 폰 | host `192.0.0.2`(464XLAT용 IPv4), host·srflx IPv6 `2001:e60:956a:…`, srflx IPv4 `118.235.6.65`(회차마다 포트가 다름) |

원자료: `runs.csv`, `runs.json`(회차별 상태 전이·후보 전체), `measure.log`, `expert-fail-run1~10.png`.

## 해석

- 폰 IPv4는 KT의 **464XLAT**(IPv6 망 위에서 IPv4를 변환)로 나간다. `192.0.0.2`는 이 변환용 주소이고, 공인 주소 `118.235.6.65`는 통신사 NAT(CGNAT)의 주소다.
- PC에는 전역 IPv6가 없어서 폰의 IPv6 후보와는 짝이 되지 않는다. 남는 짝은 IPv4 srflx끼리뿐이다.
- **PC가 NAT 없이 공인 IP인데도 실패했다.** 폰이 PC 공인 주소로 검사 패킷을 보내면, 보통은 PC가 그 패킷이 온 주소를 새 후보(prflx)로 배워 연결된다. 이것이 안 됐다는 것은 **바깥에서 PC로 들어오는 UDP가 학교 방화벽에서 막혔다**는 뜻으로 본다.
- 폰 쪽 NAT도 문제다. 같은 폰인데 srflx 포트가 회차·후보마다 다르다. 목적지마다 새 포트를 쓰는 **Symmetric NAT** 동작으로 보인다. 그러면 STUN 서버로 알아낸 주소로 PC가 먼저 보내도 받지 못한다.
- 결론: 양쪽 모두 상대가 먼저 보낸 패킷을 받지 못하는 조합이라 STUN만으로는 직접 연결할 수 없다. 중계(TURN)가 필요하다. TURN을 넣은 재시험: [`2026-11-16_T2-5-5g-school-turn`](../2026-11-16_T2-5-5g-school-turn/).

## 한계

- 방화벽 차단과 Symmetric NAT 판정은 후보 모양과 실패 양상으로 추정한 것이다. 학교 방화벽 설정이나 NAT 유형을 직접 측정하지 않았다(#14).
- PC 쪽은 헤드리스 Chrome이다. macOS 방화벽은 켜져 있으나 Chrome의 들어오는 연결은 허용되어 있었다.
