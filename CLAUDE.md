# CLAUDE.md

- 계획: `docs/PROJECT_PLAN.md` (4주 일정, 4주차는 버퍼). 진행 상태: `docs/project-status.md`
- Git 규칙은 `CONTRIBUTING.md`를 따른다: 이슈 `[type] 설명`, 브랜치 `type/#번호-영문-설명` (develop에서 분기), 커밋 `[type] 설명 (#번호)`, PR은 develop 대상 + 본문 첫 줄 `Closes #번호`. 모두 한국어.
- 모든 작업 PR에서 `docs/project-status.md`, 그 주의 `weekly/weekN/report.md`(작업 기록), 관련 설계 문서를 함께 갱신한다.
- 1인 프로젝트다. 역할분담·팀원 배정은 하지 않는다.
- 범위: 다른 네트워크 간 연결 시험(#37, ngrok으로 시그널링 공개)과 Glass-to-Glass 지연 측정 포함. TURN은 자체 구축하지 않고 필요 시 호스팅 TURN(#38).
- PoC는 최소 수준이다. 상용 UI, 프레임워크, 복잡한 Backend를 추가하지 않는다.
