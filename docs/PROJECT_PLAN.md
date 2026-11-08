# PBL2 프로젝트 계획 — WebRTC 기반 실시간 원격 현장 지원 시스템

> 근거 문서: `PBL Project 2 — WebRTC 기반 실시간 원격 현장 지원 시스템 설계 및 품질 검증.pdf`(과제 명세), `WebRTC 기반 실시간 원격 현장 지원 시스템 설계.pdf`(오리엔테이션 슬라이드)

## 1. 목표

웹 브라우저만으로 **현장 작업자(Smartphone)** 와 **원격 전문가(PC/Tablet)** 를 1:1로 연결하는 시스템을 설계하고, 최소 PoC로 검증한다.
평가의 핵심은 기능의 양이 아니라 다음 흐름을 근거를 들어 설명하는 것이다.

```
요구사항 → 기술선택 → 기능검증 → 품질평가 → 실패분석 → 실제 서비스 확장
```

## 2. 범위

| 구분 | 내용 |
|---|---|
| **Core (필수)** | 1 Requirement · 2 Architecture · 3 Connection Sequence · 4 1:1 연결 · 5 Media · 6 DataChannel · 7 품질 측정 1개 이상 · 8 기업 확장문제(Think) 3개 이상 |
| **추가 범위 (팀 결정)** | **Glass-to-Glass(G2G) 지연 측정 도구**: 카메라로 ms 타임스탬프 화면을 찍어 수신 화면까지의 종단 지연을 측정<br>**다른 네트워크 간 연결 시험**(#37): 폰 LTE/5G ↔ PC Wi-Fi 등 서로 다른 NAT 뒤에서 STUN만으로 P2P가 되는지 실측. 시그널링은 ngrok 터널로 공개 |
| **축소** | 품질 비교의 기본은 동일 LAN + 대역폭 제한(throttling)으로 하고, 실제 Wi-Fi↔LTE 조건은 가능한 범위에서 추가한다. 다른 네트워크 연결이 실패하면 실패 단계와 원인을 증거로 설명한다(과제 명세 §23). |
| **하지 않는 것** | 상용 수준 UI, 모바일 App, 복잡한 Backend, TURN 자체 구축, SFU 구축, 다중 사용자 구현 |
| **Optional (+5점 이내)** | A 호스팅 TURN 적용·Direct vs Relay 비교(#38) → F Dashboard(#32) → C Adaptive Control(#33) → D Reconnection(#34) 순으로, 여유가 있을 때 진행 |

## 3. 일정 — 4주 (2026-11-09 ~ 12-06)

> 과목 명세는 5주 구성이지만 **4주 안에 끝내는 것으로 앞당긴다.** 마지막 주(4주차)는 요구사항이나 일정이 바뀔 수 있으므로 **버퍼**로 두고, 핵심 구현·실험·분석은 3주차까지 끝낸다.
> 문서는 작업이 끝날 때마다 갱신한다. 모든 PR은 `docs/project-status.md`를 함께 갱신한다.

| 주차 | 기간 | 주제 | 과목 대응 산출물 | 주간 발표자료 |
|---|---|---|---|---|
| 1주차 | 11/09 – 11/15 | 설계 및 연결 | System Design v1.0 + 1:1 연결 | #12 Progress Check 1장 |
| 2주차 | 11/16 – 11/22 | Media/Data 및 측정 도구 | LMS 제출물 (Sequence, Screenshot, 성공/실패 지점, 계획) | #20 |
| 3주차 | 11/23 – 11/29 | 품질 실험 및 분석 | Intermediate Check(5분) + 1페이지 Integration Report | #28 |
| 4주차 | 11/30 – 12/06 | 최종 정리 (버퍼) | 최종 제출물 8종, Final Presentation(12분 + Q&A 8분) | #30 |

### 1주차 — 설계 및 연결
- #1 프로젝트 계획·협업 규칙·저장소 구조 · #36 범위 변경(다른 네트워크 연결 포함)
- #2 개발 환경 (Node.js, 모바일 HTTPS)
- #3 Requirement · #4 Architecture · #5 Connection Sequence · #6 기술 결정 v1 · #7 PoC·시험계획 · #8 역할분담
- #9 Signaling Server · #10 1:1 RTCPeerConnection · #11 연결 과정 가시화
- #12 발표자료

### 2주차 — Media/Data 및 측정 도구
- #13 Smartphone ↔ PC 동일 LAN 연결 검증, Connection Time
- #37 **다른 네트워크 간 연결 시험 (Wi-Fi ↔ LTE/5G)**
- #14 NAT/STUN/TURN 필요조건 분석 (#37 결과 해석)
- #15 Video/Audio · #16 DataChannel 프로토콜 · #17 채팅·Pointer
- #18 getStats 수집 · #19 **Glass-to-Glass 지연 측정 도구**
- #20 발표자료

### 3주차 — 품질 실험 및 분석
- #21 네트워크 조건별 품질 실험 · #22 G2G 지연 실험 · #23 KPI 선정
- #24 Reliability (상태 표시, 장애 시나리오) · #25 실패 사례
- #26 Think ≥ 3 · #27 Scalability
- #28 발표자료 (Intermediate Check + Integration Report)
- (Optional) #38 TURN 적용·Direct vs Relay 비교 · #32 Stats Dashboard

### 4주차 — 최종 정리 (버퍼)
- #29 최종 제출물 8종 · #30 최종 발표·리허설 · #31 개인 Contribution Summary
- 바뀐 요구사항 반영
- (Optional, 여유 있을 때) #33 Adaptive Control · #34 Reconnection

## 4. 저장소 구조 (계획)

```
.
├── README.md                    # 프로젝트 소개, 실행 방법
├── docs/                        # 설계 문서 (최종 제출물의 원본)
│   ├── PROJECT_PLAN.md          # 이 문서
│   ├── project-status.md        # 진행 상태·다음 작업 (PR마다 갱신)
│   ├── 01-requirements.md       # Core 1
│   ├── 02-architecture.md       # Core 2 / 제출물 1
│   ├── 03-connection-sequence.md# Core 3 / 제출물 2
│   ├── 04-tech-decisions.md     # 제출물 3 (선택 이유 + 대안)
│   ├── 05-test-plan.md          # 시험계획, KPI 후보, 측정 방법
│   ├── 06-quality-results.md    # 제출물 5
│   ├── 07-failure-analysis.md   # 제출물 6
│   ├── 08-enterprise-think.md   # 제출물 7 (Think ≥ 3)
│   └── diagrams/                # Mermaid / 이미지 원본
├── server/                      # Signaling Server (Node.js + ws)
│   ├── package.json
│   └── src/
│       ├── index.js             # HTTPS + 정적 파일 + WebSocket
│       └── rooms.js             # Room / Session 관리
├── client/                      # 브라우저 클라이언트 (Vanilla JS ES Modules, 빌드 없음)
│   ├── index.html               # 역할·Room 선택
│   ├── field.html               # 현장 작업자 (모바일, 후면 카메라, Pointer 표시)
│   ├── expert.html              # 원격 전문가 (영상 수신, Pointer 전송, Stats 패널)
│   ├── css/
│   └── js/
│       ├── signaling.js         # WebSocket 클라이언트
│       ├── peer.js              # RTCPeerConnection, SDP/ICE
│       ├── media.js             # getUserMedia, 화질 프로파일
│       ├── datachannel.js       # 메시지 프로토콜 (reliable / unreliable)
│       ├── stats.js             # getStats 수집, CSV 내보내기
│       └── ui.js                # 상태 표시, 로그
├── tools/
│   └── g2g-latency/             # Glass-to-Glass 지연 측정 도구
├── experiments/                 # 실험 원자료 (stats CSV, 스크린샷, 측정 로그)
│   └── YYYY-MM-DD_<실험명>/
└── weekly/                      # 주차별 제출물·발표자료
    └── week1/ … week4/
```

### 주요 기술 결정 (초안 — 1주차 #6에서 확정)

| 항목 | 초안 | 이유 |
|---|---|---|
| Signaling | Node.js + `ws` WebSocket, Room ID 기반 | 양방향 push가 필요하고 구현이 가장 단순함. Socket.IO 대비 의존성이 적음 |
| 정적 서빙 | 시그널링 서버가 `client/`를 HTTPS로 함께 서빙 | 모바일의 `getUserMedia`는 Secure Context(HTTPS)가 필요함. **ngrok 터널**로 HTTPS와 외부 접속을 함께 해결(시그널링·정적 파일만 터널을 지나고 Media는 P2P). 동일 LAN 전용으로 mkcert 보조 |
| STUN | Google 공용 STUN (`stun:stun.l.google.com:19302`) | 과제 가정: 공용 서버 사용 |
| TURN | 자체 구축 안 함. P2P 실패 시 호스팅 TURN 적용 검토(#38) | 과제 기본 범위는 필요조건 분석. 자체 구축은 범위 밖 |
| Media | MediaStream Video(후면 카메라) + Audio 양방향 | 원격지원의 기본 |
| Data | DataChannel 2개: `control`(reliable, ordered) / `pointer`(unordered, maxRetransmits=0) | 작업지시는 반드시 도착해야 하고, Pointer는 최신 값만 의미 있음 |
| Client | Vanilla JS, 빌드 없음 | PoC 범위. 프레임워크 학습 비용 제거 |

### G2G 지연 측정 방식 (초안)

1. PC 화면에 ms 단위 타임스탬프(숫자 + QR)를 매 프레임 갱신해 표시한다.
2. 현장 Smartphone 카메라로 그 화면을 촬영해 WebRTC로 송출한다.
3. 같은 PC의 전문가 화면에서 수신 영상 프레임의 QR을 디코딩해 `현재 시각 − 영상 속 시각`을 계산한다. 같은 PC의 시계를 쓰므로 시계 동기화가 필요 없다.
4. 보조 방법: 두 화면(타임스탬프, 수신 영상)을 나란히 두고 사진을 찍어 수동으로 비교한다.
5. 오차 요인: 디스플레이 주사율(60Hz ≈ ±16.7ms), 카메라 노출·프레임 간격. 조건마다 N회 반복해 중앙값과 p95를 보고한다.

## 5. 이슈·브랜치·커밋 규칙

`CONTRIBUTING.md`를 따른다. 요약하면 다음과 같다.

- 이슈 제목: `[feat|fix|docs|chore|test|refactor] 한국어 설명`
- 브랜치: `develop`에서 `type/#이슈번호-영문-설명` (예: `feat/#9-signaling-server`)
- 커밋: `[type] 한국어 설명 (#이슈번호)`
- PR: `develop` 대상, 제목 `[type] 설명 (#번호)`, 본문 첫 줄 `Closes #번호`
- Milestone = 주차, Label = 영역(`signaling`, `connectivity`, `media-data`, `qos`) + 성격(`poc`, `presentation`, `optional`)
- 매주 마지막 이슈는 **주간 발표자료**로, 그 주 결과를 `weekly/weekN/`에 정리한다.
