# 화면

`server/e2e/screens.mjs`로 자동 캡처한 화면이다 (Chrome, 폰 390px와 PC 1280px). 디자인 기준은 [../DESIGN.md](../DESIGN.md).

| 파일 | 화면 |
|---|---|
| `start-pc.png`, `start-phone.png` | 시작 화면: Room 번호, 폰용 QR, 전문가 링크 |
| `field-waiting.png` | 현장 화면, 전문가를 기다리는 중 (노란 점검 태그) |
| `field-connected.png` | 현장 화면, 연결됨 (초록 점검 태그) |
| `expert-connected.png` | 전문가 화면, 연결 정보와 상태 변화, 연결 후보, 연결 기록 |

다시 캡처: `cd server && node e2e/screens.mjs ../docs/screens`
