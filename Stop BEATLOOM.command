#!/bin/sh
set -eu
BEATLOOM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$BEATLOOM_ROOT/Stop BEATLOOM Remote.command"
if [ ! -f "$BEATLOOM_ROOT/.logs/server.pid" ]; then
  echo 'Không có phiên BEATLOOM được khởi động bằng trình mở nhanh.'
  exit 0
fi
BEATLOOM_PID=$(cat "$BEATLOOM_ROOT/.logs/server.pid")
case "$BEATLOOM_PID" in *[!0-9]*|'') echo 'Mã tiến trình không hợp lệ.'; exit 1;; esac
BEATLOOM_PROCESS=$(/bin/ps -p "$BEATLOOM_PID" -o args= || true)
case "$BEATLOOM_PROCESS" in
  *"$BEATLOOM_ROOT/server.js"*) kill "$BEATLOOM_PID"; rm -f "$BEATLOOM_ROOT/.logs/server.pid"; echo 'Đã dừng BEATLOOM. Thư viện nhạc được giữ nguyên.' ;;
  *) echo 'Phiên BEATLOOM này đã dừng.' ;;
esac
