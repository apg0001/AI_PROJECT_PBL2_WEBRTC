#!/bin/sh
# 서버 Python 고르기: server/.venv가 있으면 그것, 없으면 python3 (npm start, npm test가 씀)
# 처음 한 번: npm run setup  (server/.venv 만들고 aiohttp 설치)
cd "$(dirname "$0")"
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3
if ! "$PY" -c "import aiohttp" 2>/dev/null; then
  echo "aiohttp가 없습니다 ($PY). 저장소 루트에서 npm run setup 을 먼저 실행하세요." >&2
  exit 1
fi
exec "$PY" "$@"
