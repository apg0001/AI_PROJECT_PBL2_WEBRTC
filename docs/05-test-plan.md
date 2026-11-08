# 05. PoC 계획 및 시험계획

> 상태: v1.0 (1주차) · 관련 이슈 #7 · 결과는 [06-quality-results.md](06-quality-results.md)(3주차)에 기록한다.

## 1. PoC 범위

| 단계 | 내용 | 이슈 | 주차 |
|---|---|---|---|
| P1 | 시그널링 + 1:1 연결 + 연결 과정 로그 | #9, #10, #11 | 1 |
| P2 | Smartphone ↔ PC 동일 LAN, 다른 네트워크 연결 | #13, #37 | 2 |
| P3 | Video·Audio, DataChannel(채팅·포인터·지시 ack) | #15, #16, #17 | 2 |
| P4 | getStats 수집·CSV, Glass-to-Glass 측정 도구 | #18, #19 | 2 |
| P5 | 품질·G2G 실험, 장애 시나리오 | #21, #22, #24 | 3 |
| (선택) | 호스팅 TURN 비교, Stats 대시보드 | #38, #32 | 3 |

## 2. KPI 후보와 측정 방법

1차 KPI는 3주차(#23)에 측정 결과를 보고 확정한다. 현재 가설은 **"원격지원은 대화가 되는 것이 먼저"** 이므로 **연결 성공률**과 **Glass-to-Glass 지연**이 1차 후보다.

| 지표 | 정의 | 측정 방법 | 출처 |
|---|---|---|---|
| 연결 성공률 | 시도 중 `connected` 도달 비율 | 조합별 N회 시도 | 앱 로그 |
| Connection Time | t0(join) → t5(connected) | [03 §5](03-connection-sequence.md#5-측정-시점-connection-time-정의) | 앱 로그 |
| Time to First Frame | t0 → t7(첫 프레임 표시) | `requestVideoFrameCallback` | 앱 로그 |
| **Glass-to-Glass 지연** | 카메라 앞 사건 → 상대 화면 표시까지 | G2G 도구(#19) | 측정 도구 |
| RTT | ICE 경로 왕복 시간 | `candidate-pair.currentRoundTripTime` | getStats |
| Packet Loss | 수신 손실률 | `inbound-rtp.packetsLost / (packetsReceived + packetsLost)` | getStats |
| Jitter | 패킷 도착 간격 변동 | `inbound-rtp.jitter` | getStats |
| Bitrate | 수신 비트레이트 | `bytesReceived` 1초 차분 × 8 | getStats |
| FPS / Resolution | 표시 프레임률, 해상도 | `framesPerSecond`, `frameWidth/Height` | getStats |
| Freeze | 영상 정지 횟수·시간 | `freezeCount`, `totalFreezesDuration` (Chrome) | getStats |
| 품질 제한 원인 | 송신 측이 화질을 낮춘 이유 | `outbound-rtp.qualityLimitationReason` (bandwidth / cpu) | getStats |
| 선택 경로 | host / srflx / relay | 선택된 `candidate-pair`의 local/remote candidateType | getStats |
| Recovery Time | `disconnected` → `connected` 복귀 시간 | 앱 로그 | 앱 로그 |

## 3. 시험 항목

### T1. 동일 LAN 기준값 (#13)

| 항목 | 내용 |
|---|---|
| 조합 | PC Chrome ↔ PC Chrome (같은 PC 두 탭), PC ↔ Android Chrome, PC ↔ iOS Safari |
| 반복 | 조합별 연결 10회 |
| 기록 | 성공 여부, Connection Time, 선택 경로(host 예상), 수집된 Candidate 종류 |

### T2. 다른 네트워크 간 연결 (#37)

시그널링 서버는 ngrok으로 공개한다. 영상 경로가 P2P인지(srflx) Relay인지 선택된 Candidate Pair로 확인한다.

| ID | 현장 (폰) | 전문가 (PC) | 예상 | 반복 |
|---|---|---|---|---|
| T2-1 | LTE/5G | 집 Wi-Fi | 성공 가능성 높음 (통신사 NAT 유형에 따라 다름) | 10회 |
| T2-2 | LTE/5G | 학교 Wi-Fi | 학교 방화벽이 UDP를 막으면 실패 가능 | 10회 |
| T2-3 | 다른 폰의 핫스팟 | 집 Wi-Fi | 핫스팟 NAT 유형 확인용 | 5회 |
| T2-4 | 집 Wi-Fi | 학교 Wi-Fi | 서로 다른 고정망 | 5회 |
| T2-5 | (T2 중 실패 조합) | 〃 | 호스팅 TURN 적용 시 성공 여부 (#38, 선택) | 5회 |

실패하면 다음을 남긴다: 수집된 Candidate 목록(srflx가 있었는가), `iceConnectionState` 전이와 시각, 실패까지 걸린 시간. 이 근거로 원인(UDP 차단, Symmetric NAT 등)을 추정한다(#14).

### T3. 네트워크 조건별 품질 (#21)

| 조건 | 네트워크 | 화질 |
|---|---|---|
| C1 | 동일 LAN 정상 | A (1080p30 요청) |
| C2 | 동일 LAN 정상 | B (480p15 요청) |
| C3 | 대역폭 제한 1 Mbps, 손실 5%, 지연 100ms | A |
| C4 | 〃 | B |
| C5 | 실제 Wi-Fi ↔ LTE (T2에서 성공한 조합) | 기본 프로파일 |

- 조건별 **2분 이상** 연속 수집, 같은 장면(계기판·볼트가 있는 사물)을 촬영한다.
- **네트워크 제한 방법 주의:** Chrome DevTools의 Network throttling은 HTTP 요청에만 적용되고 **WebRTC 트래픽에는 적용되지 않는다.** 따라서 다음 중 하나를 쓴다.
  - iPhone: 설정 → 개발자 → Network Link Conditioner (폰 쪽 제한)
  - macOS: Network Link Conditioner (Xcode Additional Tools), 또는 `dnctl` + `pfctl` dummynet
- 판정 질문: "A와 B 중 원격지원에 무엇이 나은가?" 계기판 숫자 판독 가능 여부를 함께 기록한다.

### T4. Glass-to-Glass 지연 (#22)

| 항목 | 내용 |
|---|---|
| 배치 | PC 화면 왼쪽에 `clock.html`(ms 타임스탬프 QR), 폰 후면 카메라로 촬영, 같은 PC 오른쪽에 전문가 화면 |
| 조건 | T3의 C1 ~ C5와 동일 |
| 표본 | 조건별 ≥ 100개 |
| 보고 | 중앙값, p95, 최대값 |
| 보정 | 수동 검증: 두 화면을 한 사진에 담아 자동값과 비교. 디스플레이 60Hz ≈ ±16.7ms 오차를 명시 |
| 해석 | getStats RTT/2와의 차이 = 캡처·인코딩·지터 버퍼·디코딩·렌더링 지연 |

### T5. 장애 시나리오 (#24)

| ID | 시나리오 | 관찰 |
|---|---|---|
| T5-1 | 폰 Wi-Fi 끄기 → LTE로 전환 | `disconnected` → `failed` 까지 시간, 자동 복구 여부 |
| T5-2 | 폰 Wi-Fi 10초 끊었다 다시 연결 | Recovery Time |
| T5-3 | 전문가 탭 닫기 | `peer-left` 수신까지 시간 |
| T5-4 | 시그널링 서버 재시작 | 기존 통화 유지 여부 |
| T5-5 | 카메라 권한 거부 | 오류 표시 |

## 4. 시험 환경

| 역할 | 기기 | OS | 브라우저 |
|---|---|---|---|
| 현장 | iPhone | iOS 27.2 | Chrome(CriOS 157, WebKit 엔진), Safari |
| 전문가 | MacBook Air | macOS | Chrome |
| (가능하면) 현장 2 | Android 폰 (빌릴 수 있으면) | | Chrome |

iOS의 모든 브라우저는 WebKit 엔진이므로 iPhone Chrome과 Safari의 WebRTC 동작은 거의 같다.

## 5. 기록 규칙

- 경로: `experiments/YYYY-MM-DD_<시험ID>-<설명>/` (예: `2026-11-20_T2-1-lte-home-wifi/`)
- 파일
  - `README.md`: 날짜, 기기·브라우저·네트워크, 조건, 절차, 특이사항, 결과 요약
  - `stats.csv`: getStats 1초 주기 원자료
  - `events.json`: 연결 로그(시그널링, ICE 상태 전이, Candidate)
  - `g2g.csv`: G2G 표본
  - `screenshots/`
- 결과 문서([06](06-quality-results.md), [07](07-failure-analysis.md))는 이 폴더를 링크한다.
- 실패한 시험도 지우지 않는다. 실패도 결과다(과제 명세 §23).
