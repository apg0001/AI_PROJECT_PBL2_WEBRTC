# 다이어그램

보고서와 발표에 쓰는 그림이다. 원본은 `src/*.html`(SVG), PNG는 렌더링 결과다. 디자인 기준은 [../DESIGN.md](../DESIGN.md) 하나다.

| 그림 | 원본 | 내용 |
|---|---|---|
| ![](system-architecture.png) | `src/system-architecture.html` | 시스템 아키텍처: 현장과 전문가, NAT, 시그널링 서버, ngrok, STUN, TURN, P2P 경로 |
| ![](server-config.png) | `src/server-config.html` | 서버 구성도: 개발자 PC의 Node 프로세스, 엔드포인트, 같은 LAN과 ngrok 접속 경로 |
| ![](client-modules.png) | `src/client-modules.html` | 클라이언트 모듈과 브라우저 API |
| ![](implementation-plan.png) | `src/implementation-plan.html` | 4주 구현 계획. 데이터(`status`, `TODAY`)만 고치면 다시 그려진다 |

## 그리는 규칙 (DESIGN.md §6 요약)

- 계통도처럼 그린다. 기기(폰, PC)는 기호와 이름표, 서버와 외부 서비스는 각진 사각형(먹 1.5px).
- 선의 뜻: 시그널링은 먹 점선, 영상과 데이터는 초록 굵은 실선, STUN 질의는 회색 짧은 점선, TURN 중계(선택)는 노랑 긴 점선.
- 색은 뜻으로만: 초록 연결·완료, 노랑 주의·진행 중, 빨강 실패. 꾸미기 위한 카드, 그림자, 그라디언트는 쓰지 않는다.
- 색과 글꼴은 `src/base.css`의 토큰만 쓴다. 글꼴은 IBM Plex Sans KR.

## 수정과 렌더링

```bash
npm run diagrams                     # 전체
npm run diagrams implementation-plan # 하나만
```

설치된 Google Chrome을 헤드리스로 띄워 `#diagram`(1600×900)을 2배 해상도 PNG로 저장한다 (`server/scripts/render-diagrams.mjs`). 글꼴을 Google Fonts에서 받으므로 인터넷 연결이 필요하다.
