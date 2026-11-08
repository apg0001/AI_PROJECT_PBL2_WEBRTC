# AI_PROJECT_PBL2_WEBRTC

WebRTC 기반 실시간 원격 현장 지원 시스템. 설치 없이 웹 브라우저만으로 **현장 작업자(Smartphone)** 와 **원격 전문가(PC/Tablet)** 를 1:1로 연결하고, Video·Audio·Message·Pointer를 전달하는 PoC를 만들어 품질을 검증한다.

- 계획: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)
- 진행 상태: [docs/project-status.md](docs/project-status.md)
- 협업 규칙: [CONTRIBUTING.md](CONTRIBUTING.md)
- 이슈: GitHub Issues (Milestone = 주차)

## 구조

| 경로 | 내용 |
|---|---|
| `docs/` | 설계·분석 문서 (최종 제출물 원본) |
| `server/` | Signaling Server (Node.js + WebSocket) |
| `client/` | 브라우저 클라이언트 (현장 / 전문가) |
| `tools/g2g-latency/` | Glass-to-Glass 지연 측정 도구 |
| `experiments/` | 실험 원자료 |
| `weekly/` | 주차별 발표자료·제출물 |

## 실행

#2(개발 환경 세팅)에서 작성한다.
