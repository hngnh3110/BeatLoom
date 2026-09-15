#!/bin/sh
set -eu
BEATLOOM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$BEATLOOM_ROOT"
BEATLOOM_NODE=${BEATLOOM_NODE:-$(command -v node || true)}
if [ -z "$BEATLOOM_NODE" ]; then
  BEATLOOM_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$BEATLOOM_NODE" ]; then
  echo 'Chưa tìm thấy Node.js. Hãy cài Node.js 22 trở lên rồi mở lại.'
  exit 1
fi
if [ ! -d node_modules/express ]; then
  echo 'Chưa có thư viện phụ thuộc. Chạy npm install trong thư mục music-player trước.'
  exit 1
fi
export PORT=${PORT:-3000}
export HOST=127.0.0.1
BEATLOOM_URL="http://127.0.0.1:$PORT"
BEATLOOM_HEALTH=$(/usr/bin/curl -fsS --max-time 2 "$BEATLOOM_URL/api/health" 2>/dev/null || true)
case "$BEATLOOM_HEALTH" in
  *'"app":"BEATLOOM"'*)
    echo "BEATLOOM đang chạy: $BEATLOOM_URL"
    if [ "${BEATLOOM_NO_OPEN:-0}" != 1 ]; then /usr/bin/open "$BEATLOOM_URL/connect"; fi
    exit 0
    ;;
esac
mkdir -p .logs
BEATLOOM_PID=$("$BEATLOOM_NODE" - "$BEATLOOM_NODE" "$BEATLOOM_ROOT" <<'JS'
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [node, root] = process.argv.slice(2);
const log = fs.openSync(path.join(root, '.logs/server.log'), 'a');
const child = spawn(node, [path.join(root, 'server.js')], {
  cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env
});
child.unref();
fs.closeSync(log);
console.log(child.pid);
JS
)
echo "$BEATLOOM_PID" > .logs/server.pid
BEATLOOM_ATTEMPT=0
while [ "$BEATLOOM_ATTEMPT" -lt 25 ]; do
  if ! kill -0 "$BEATLOOM_PID" 2>/dev/null; then
    echo 'Không thể khởi động. Kiểm tra cổng đang được sử dụng và file .logs/server.log.'
    exit 1
  fi
  BEATLOOM_HEALTH=$(/usr/bin/curl -fsS --max-time 1 "$BEATLOOM_URL/api/health" 2>/dev/null || true)
  case "$BEATLOOM_HEALTH" in
    *'"app":"BEATLOOM"'*)
      echo "BEATLOOM đã sẵn sàng: $BEATLOOM_URL"
      if [ "${BEATLOOM_NO_OPEN:-0}" != 1 ]; then /usr/bin/open "$BEATLOOM_URL/connect"; fi
      exit 0
      ;;
  esac
  BEATLOOM_ATTEMPT=$((BEATLOOM_ATTEMPT+1))
  sleep 0.2
done
echo 'Khởi động chưa hoàn tất. Xem file .logs/server.log để biết chi tiết.'
exit 1
