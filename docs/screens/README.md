# 화면

`server/e2e/screens.mjs`로 자동 캡처한 화면이다 (Chrome, 폰 390px와 PC 1280px). 디자인 기준은 [../DESIGN.md](../DESIGN.md).

| 파일 | 화면 |
|---|---|
| `start-pc.png`, `start-phone.png` | 시작 화면: Room 번호, 폰용 QR, 전문가 링크 |
| `field-waiting.png` | 현장 화면, 전문가를 기다리는 중 (노란 점검 태그) |
| `field-connected.png` | 현장 화면, 연결됨 (초록 점검 태그) |
| `expert-connected.png` | 전문가 화면, 연결 정보와 상태 변화, 연결 후보, 연결 기록 |
| `expert-video.png` | 전문가 화면, 현장 카메라 수신과 받는 영상 품질(해상도, fps, kbps, 코덱). 카메라는 Chrome 가짜 장치(초록 시험 패턴) |
| `field-instructions.png` | 현장 화면, 전문가 포인터(노란 고리)가 내 카메라 위에 표시되고, 받은 지시 목록(확인 전은 왼쪽 노란 띠, 확인한 것은 '확인함'), 대화 |
| `expert-instructions.png` | 전문가 화면, 영상을 눌러 가리킨 위치, 작업 지시 표(현장 확인 / 도착·확인 대기), 장비 상태, 대화 |
| `field-sharing.png` | 현장 화면, 전문가 화면 공유가 크게, 내 카메라는 오른쪽 아래 작은 화면. 공유 화면도 가짜 장치 |

다시 캡처: `cd server && node e2e/screens.mjs ../docs/screens`
