# 기여 가이드

## 기본 흐름

1. 기존 Issue를 선택하거나 한국어로 새 Issue를 작성한다.
2. `develop`에서 Issue 번호를 포함한 브랜치를 만든다.
3. 작은 커밋으로 구현·실험·문서를 함께 변경한다.
4. `develop` 대상 PR을 만들고, 리뷰 후 병합한다.
5. 주차가 끝나면 `develop` → `main` 릴리스 PR(`[release] N주차 결과`)로 반영한다.

## Issue 제목

`[type] 한국어 설명`

| type | 용도 |
|---|---|
| `feat` | PoC 기능 구현 |
| `fix` | 버그 수정 |
| `docs` | 설계·분석 문서, 발표자료, 제출물 |
| `test` | 측정·실험 |
| `chore` | 개발 환경, 설정, 저장소 관리 |
| `refactor` | 동작 변화 없는 코드 정리 |

Milestone은 주차, Label은 영역(`signaling`, `connectivity`, `media-data`, `qos`)과 성격(`poc`, `presentation`, `optional`)을 붙인다.

## 브랜치

`type/#이슈번호-영문-설명` (예: `feat/#9-signaling-server`, `docs/#3-requirements`, `test/#21-network-quality`)

`main`과 `develop`에는 직접 push하지 않는다.

## 커밋

`[type] 한국어 설명 (#이슈번호)` (예: `[feat] WebSocket Room Join/Leave 구현 (#9)`)

## PR

- 대상: `develop`
- 제목: `[type] 한국어 설명 (#이슈번호)`
- 본문 첫 줄: `Closes #이슈번호`
- 무엇을, 왜 바꿨는지와 실제로 실행한 검증(실행 기기·브라우저, 측정값)을 적는다.

## 문서 갱신

- 모든 PR은 `docs/project-status.md`의 진행 상태와 다음 작업을 갱신한다.
- 설계가 구현과 달라지면 같은 PR에서 `docs/0X-*.md`를 고친다.
- 실험 원자료는 `experiments/YYYY-MM-DD_<실험명>/`에 저장하고, 결과 문서에서 경로를 링크한다.
