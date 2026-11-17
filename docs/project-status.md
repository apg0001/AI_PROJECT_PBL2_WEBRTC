# 프로젝트 진행 상태

> 모든 PR에서 갱신한다. 최신 항목을 위에 둔다.

## 현재 상태 (2026-11-09, 1주차)

- System Design v1.0 문서 완료: 01 Requirement, 02 Architecture, 03 Connection Sequence, 04 Technology Decision, 05 시험계획
- 4주 일정 계획 수립, GitHub Issue #1~#34 및 주차별 Milestone 생성
- Git 컨벤션(`CONTRIBUTING.md`), Issue·PR 템플릿, 저장소 디렉터리 골격 추가
- 범위 결정
  - ~~서로 다른 네트워크 실측 제외~~ → **다른 네트워크 간 연결 시험 포함**(#36, #37). 실패하면 원인 분석, 여유가 있으면 호스팅 TURN 비교(#38)
  - **Glass-to-Glass 지연 측정 도구**(#19, 실험 #22)를 추가 범위로 포함한다

## 3·4주차 작업

> 2주차는 11/17에 마쳤고 3·4주차는 합본으로 발표한다(#28, #30). 작업 기록: `weekly/week3/report.md`

- [ ] #34 연결 복구: 서버 자동 재접속(같은 탭 번호로 자리 이어받기), `peer-left` 이유(leave/close), Offerer ICE 재시작(3초 대기, 최대 3번) 후 새 연결, 복구 시간 기록. E2E 40/40(서버 재시작에도 P2P 유지). 실기기 Wi-Fi 끄기 시험 남음
- [ ] #24 장애 시나리오: 자동 시험으로 T5-3, T5-4, T5-6, T5-7 통과. 실기기 T5-1, T5-2, T5-5 남음

## 2주차 작업

- [x] #66 시그널링 서버를 Python aiohttp로 전환 (멘토 권고): `server/app.py`, `server/signaling.py`. 메시지 형식·브라우저 코드 그대로, 단위 시험 8개·E2E 20항목 통과. 1주차 발표자료(제출 완료)는 고치지 않고 2주차 발표자료부터 반영
- [x] #16 DataChannel 메시지 프로토콜: 봉투 `{type, seq, ts, payload}`, 종류 9개, 작업 지시 2단계 확인(ack), 재연결 후 미확인 지시 재전송, 늦게 온 포인터 버리기 (`client/js/datachannel.js`, 03 §6). E2E 24항목 통과
- [x] #17 대화(양방향), 작업 지시(현장 확인 버튼, 전문가 표에 도착·확인 상태), 포인터(전문가가 영상을 누르면 현장 카메라 화면의 같은 위치에 노란 고리, 3초 뒤 흐려짐), 장비 상태(더미). E2E 28항목 통과, 위치 오차 0.003. 실제 폰 확인 남음
- [x] #18 통신 품질 1초 기록과 CSV(30열): 경로, RTT, 받는 영상(해상도, fps, kbps, 손실률, 지터, 지터 버퍼, 디코딩, 정지), 보내는 영상(화질을 낮춘 이유), 음성. 화면 표, CSV 저장, 그래프 스크립트(`tools/stats/plot_stats.py`), PC 수집 스크립트(`server/e2e/collect-stats.mjs`). E2E 32항목 통과
- [x] #37 다른 네트워크: KT 폰 ↔ 학교망 PC. STUN만 **0/10**(PC 유선, `T2-2-lte-school`), **0/5**(PC Wi-Fi, `T2-2b-5g-school-stun`) > TURN 적용 **10/10**(`T2-5-5g-school-turn`, 중앙값 568.5 ms). 트러블슈팅 7건은 2주차 보고서
- [ ] #38 호스팅 TURN: Cloudflare는 결제 수단 등록 요구 > **Metered Open Relay**(매달 20 GB 무료)로 연결 확인. Direct vs Relay 품질 비교(영상 bitrate, RTT, G2G) 남음
- [x] #72 서버 실행 Python 문제: 터미널의 `python3`(Homebrew 3.13)에 aiohttp가 없어 `npm start` 실패 > `server/.venv` 가상환경(`npm run setup`)과 실행 스크립트 `server/run.sh`
- [x] #19 Glass-to-Glass 지연 측정 도구 (`tools/g2g-latency/`): 시계 페이지(ms QR), 전문가 화면 '종단 지연 측정'(중앙값, p95, 받기 전/받은 뒤, CSV), 시험 모드 `?fake=clock`. E2E에서 8초 표본 108개, 내부 지연 중앙값 49 ms. 실제 폰 측정(100개 이상)과 사진 수동 검증 남음

## 다음 작업 (1주차)

> #2 확인 (11/09): ngrok https 주소로 iPhone 카메라가 켜지고 PC로 영상이 전달됨 (`experiments/2026-11-09_T2-media-iphone-pc/`)

- [x] #36 범위 변경
- [x] #2 개발 환경 세팅 (Node 정적 서버, `check.html`, ngrok 터널 스크립트)
- [x] #3 Requirement 정의 (`docs/01-requirements.md`)
- [x] #4 Architecture (`docs/02-architecture.md`)
- [x] #5 Connection Sequence·Signaling 메시지 스펙 (`docs/03-connection-sequence.md`)
- [x] #6 기술 결정 TD-01~12 (`docs/04-tech-decisions.md`)
- [x] #7 PoC·시험계획 T1~T5 (`docs/05-test-plan.md`)
- [x] #46 1인 진행 반영, 주차별 보고서 규칙 (#8 역할분담은 종료)
- [x] #9 Signaling Server (`server/src/signaling.js`, 테스트 5개)
- [x] #10 1:1 연결 (`client/`: field·expert 화면, Room 생성·QR) — Chrome 2개 E2E 통과
- [x] #11 연결 과정 가시화 (Candidate 표, 상태 전이 시각, 로그 JSON 내보내기)
- [x] #51 과제 설명 PDF를 `docs/reference/`로 정리
- [x] #53 보고서용 그림 4종 (`docs/diagrams/`: 시스템 아키텍처, 서버 구성도, 구현 계획 로드맵, 클라이언트 모듈 구조)
- [x] #58 디자인 정리: Anthropic `frontend-design` 기준으로 `docs/DESIGN.md` 작성, 웹 화면 5개·다이어그램 4종·발표자료 r2 다시 만듦
- [x] #12 1주차 발표자료 `weekly/week1/PBL2_1주차_261109.r1.pptx` (템플릿 사용, 5장)
- [x] #15 영상 전달 (2주차 작업을 앞당김): iPhone 후면 카메라 > PC, 854×480 15fps 459kbps H.264, 직접 연결(srflx). 마이크·화질 A/B는 자동 시험만 통과
- [ ] #62 전문가 화면 공유: 구현과 자동 시험 완료, 실제 폰 표시 확인 남음
- [x] #64 1주차 발표자료 r4: [영상 전달] 장 추가, 9장 (`weekly/week1/PBL2_1주차_261109.r4.pptx`)
- [x] #60 1주차 발표자료 r3: [기술 스택], [실행 화면], [연결 로그](실제 iPhone 캡처와 서버 기록) 3장 추가, 8장 (`weekly/week1/PBL2_1주차_261109.r3.pptx`)
- [x] #13 iPhone ↔ PC 같은 Wi-Fi 연결 시험: 9/9 P2P 직접 연결, Connection Time 중앙값 50.5 ms (`experiments/2026-11-09_T1-iphone-pc-lan/`). iPad도 10/10, 중앙값 46 ms (`experiments/2026-11-09_T1-ipad-pc-lan/`)

## 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-09 | 일정을 4주로 압축, 4주차는 버퍼 | 마지막 주의 요구사항·일정 변동 가능성 |
| 2026-11-09 | ~~다른 네트워크 실측 제외~~ | (아래 결정으로 번복) |
| 2026-11-09 | 다른 네트워크 간 연결 시험 포함 (#37) | NAT 통과 P2P가 WebRTC의 핵심이고, ngrok으로 시그널링을 공개하면 비용 없이 시험할 수 있음 |
| 2026-11-09 | 디자인 기준은 Anthropic `frontend-design` 하나 (`docs/DESIGN.md`) | 생성형 AI 티(둥근 카드, 가운뎃점 나열, 어두운 화면 등) 제거. 여러 기준을 섞으면 오히려 어색해짐 |
| 2026-11-09 | 1인 진행, 역할분담 없음 (#8 종료) | 과제를 혼자 수행 |
| 2026-11-09 | 미디어 켜고 끄기는 미리 연 통로 3개에 replaceTrack (TD-13) | 재협상 없이 켜고 끄고, 재연결 때도 켜 둔 트랙을 그대로 붙인다 |
| 2026-11-09 | 작업마다 주차별 보고서 갱신 | `weekly/weekN/report.md`. 주간 발표자료의 원천 |
| 2026-11-09 | HTTPS·외부 접속은 ngrok 터널 | 이미 설치·설정되어 있고 모바일 Secure Context와 외부 시그널링 접속을 함께 해결 |
| 2026-11-09 | 시그널링 서버를 Node.js에서 Python aiohttp로 전환 (TD-02, TD-03, #66) | 멘토 권고. 인공지능 과목이라 서버 언어를 Python으로 맞춤. 영상은 계속 P2P, 서버가 영상을 받는 구조(aiortc)는 범위 밖 |
| 2026-11-09 | G2G 지연 측정 도구 추가 | getStats RTT로는 사용자가 체감하는 종단 지연을 알 수 없음 |
| 2026-11-17 | 2주차 종료, 3·4주차 합본 발표 (#20 닫음) | 사용자 결정. 2주차 내용은 합본 발표에 넣는다 |
| 2026-11-17 | 연결 복구는 서버 재접속과 ICE 재시작을 따로 (TD-14) | 서버만 끊긴 경우 P2P를 건드리지 않고, 네트워크 전환은 ICE 재시작으로 충분 |
| 2026-11-16 | 호스팅 TURN은 Metered Open Relay (TD-07, #38) | Cloudflare TURN은 가입 시 결제 수단 등록 요구. 라즈베리파이 자체 TURN은 공인 IP·포트 포워딩·인증서가 필요하고 범위 밖이라 보류 |

## 미해결 위험

- 연결 시점에 srflx 후보가 거의 수집되지 않았다(9회 중 7회 host만). 다른 네트워크 연결(#37)에 결정적이므로 #14에서 원인을 확인한다.
- ~~이동통신망에서는 STUN만으로 P2P가 실패할 수 있다~~ > 실제로 실패했고(KT ↔ 학교망 0/15) TURN으로 해결(10/10, #37). 남은 위험: Metered 무료 한도 매달 20 GB, 접속 정보가 고정이라 새면 대시보드에서 다시 만들어야 함.
- ngrok 무료 플랜은 실행할 때마다 URL이 바뀐다. 시험 때 URL을 공유하는 절차가 필요하다.
- Chrome DevTools 네트워크 제한은 WebRTC에 적용되지 않는다. 품질 실험은 Network Link Conditioner 등 OS 수준 제한이 필요하다(#21).
- 수업 요일을 모르므로 Milestone 마감일은 각 주 일요일로 임시 설정했다.
