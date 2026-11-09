# AI_PROJECT_PBL2_WEBRTC

WebRTC 기반 실시간 원격 현장 지원 시스템. 설치 없이 웹 브라우저만으로 **현장 작업자(Smartphone)** 와 **원격 전문가(PC/Tablet)** 를 1:1로 연결하고, Video·Audio·Message·Pointer를 전달하는 PoC를 만들어 품질을 검증한다.

- 계획: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)
- 진행 상태: [docs/project-status.md](docs/project-status.md)
- 협업 규칙: [CONTRIBUTING.md](CONTRIBUTING.md)
- 디자인 기준: [docs/DESIGN.md](docs/DESIGN.md) (화면 캡처: [docs/screens/](docs/screens/))
- 이슈: GitHub Issues (Milestone = 주차)

## 구조

| 경로 | 내용 |
|---|---|
| `docs/` | 설계·분석 문서 (최종 제출물 원본) |
| `server/` | Signaling Server (Python aiohttp, `app.py`·`signaling.py`) + Node 도구(E2E, 화면 캡처, 그림) |
| `client/` | 브라우저 클라이언트 (현장 / 전문가) |
| `tools/g2g-latency/` | Glass-to-Glass 지연 측정 도구 |
| `experiments/` | 실험 원자료 |
| `weekly/` | 주차별 발표자료·제출물 |

## 실행

요구사항: Python 3.10 이상 + aiohttp(서버), Node.js 20 이상(자동 시험·그림 도구만), (모바일·외부 네트워크 시험 시) ngrok

```bash
python3 -m pip install -r server/requirements.txt   # aiohttp
python3 server/app.py                               # http://localhost:3000 (npm start도 같음)
```

시험:

```bash
npm install          # E2E용 puppeteer-core (처음 한 번)
npm test             # 서버 단위 시험 (Python unittest)
npm run e2e          # Chrome 2~3개로 연결·영상 자동 시험
```

PC 브라우저는 `http://localhost:3000` 에서 바로 카메라를 쓸 수 있다(localhost는 Secure Context).
**스마트폰은 HTTPS가 필요하다.** 다른 터미널에서 터널을 연다.

```bash
cd server
npm run tunnel       # ngrok http 3000 → https://xxxx.ngrok-free.app
```

- 출력된 `https://…ngrok-free.app` 주소를 폰에서 연다. 처음 한 번 ngrok 경고 페이지에서 **Visit Site**를 누른다.
- `check.html`에서 Secure Context, 카메라·마이크 권한을 확인한다.
- 터널은 시그널링·정적 파일만 지난다. 영상·음성·DataChannel은 WebRTC P2P로 직접 흐른다.
- 폰이 LTE/5G여도 같은 주소로 접속되므로 다른 네트워크 간 연결 시험(#37)에 그대로 쓴다.
- ngrok 무료 플랜은 실행할 때마다 주소가 바뀐다.

(선택) 동일 LAN 전용 HTTPS: `server/certs/cert.pem`, `server/certs/key.pem`(mkcert 등으로 생성)을 두면 서버가 HTTPS로 뜬다.
