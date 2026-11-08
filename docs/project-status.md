# 프로젝트 진행 상태

> 모든 PR에서 갱신한다. 최신 항목을 위에 둔다.

## 현재 상태 (2026-11-09, 1주차)

- System Design v1.0 문서 완료: 01 Requirement, 02 Architecture, 03 Connection Sequence, 04 Technology Decision, 05 시험계획
- 4주 일정 계획 수립, GitHub Issue #1~#34 및 주차별 Milestone 생성
- Git 컨벤션(`CONTRIBUTING.md`), Issue·PR 템플릿, 저장소 디렉터리 골격 추가
- 범위 결정
  - ~~서로 다른 네트워크 실측 제외~~ → **다른 네트워크 간 연결 시험 포함**(#36, #37). 실패하면 원인 분석, 여유가 있으면 호스팅 TURN 비교(#38)
  - **Glass-to-Glass 지연 측정 도구**(#19, 실험 #22)를 추가 범위로 포함한다

## 다음 작업 (1주차)

> #2 미검증: ngrok 터널 경유 폰 접속은 아직 실제로 시험하지 않음

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
- [ ] #12 1주차 발표자료 — **팀 템플릿을 받아 그 형식으로 작성** (직접 디자인하지 않음)
- [ ] PC ↔ iPhone 같은 Wi-Fi 연결 직접 확인 (`http://192.168.0.111:3000` → QR)
- [ ] #12 1주차 발표자료

## 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-09 | 일정을 4주로 압축, 4주차는 버퍼 | 마지막 주의 요구사항·일정 변동 가능성 |
| 2026-11-09 | ~~다른 네트워크 실측 제외~~ | (아래 결정으로 번복) |
| 2026-11-09 | 다른 네트워크 간 연결 시험 포함 (#37) | NAT 통과 P2P가 WebRTC의 핵심이고, ngrok으로 시그널링을 공개하면 비용 없이 시험할 수 있음 |
| 2026-11-09 | 1인 진행, 역할분담 없음 (#8 종료) | 과제를 혼자 수행 |
| 2026-11-09 | 작업마다 주차별 보고서 갱신 | `weekly/weekN/report.md`. 주간 발표자료의 원천 |
| 2026-11-09 | HTTPS·외부 접속은 ngrok 터널 | 이미 설치·설정되어 있고 모바일 Secure Context와 외부 시그널링 접속을 함께 해결 |
| 2026-11-09 | G2G 지연 측정 도구 추가 | getStats RTT로는 사용자가 체감하는 종단 지연을 알 수 없음 |

## 미해결 위험

- 이동통신망(CGNAT, Symmetric NAT 가능성)에서는 STUN만으로 P2P가 실패할 수 있다. 실패도 증거와 함께 결과로 남긴다(#37).
- ngrok 무료 플랜은 실행할 때마다 URL이 바뀐다. 시험 때 URL을 공유하는 절차가 필요하다.
- Chrome DevTools 네트워크 제한은 WebRTC에 적용되지 않는다. 품질 실험은 Network Link Conditioner 등 OS 수준 제한이 필요하다(#21).
- 수업 요일을 모르므로 Milestone 마감일은 각 주 일요일로 임시 설정했다.
