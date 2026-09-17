#!/bin/sh
set -eu
BEATLOOM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$BEATLOOM_ROOT"
BEATLOOM_NODE=${BEATLOOM_NODE:-$(command -v node || true)}
if [ -z "$BEATLOOM_NODE" ]; then
  BEATLOOM_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$BEATLOOM_NODE" ]; then echo 'Chưa tìm thấy Node.js 22 trở lên.'; exit 1; fi
BEATLOOM_NO_OPEN=1 "$BEATLOOM_ROOT/Start BEATLOOM.command"
"$BEATLOOM_NODE" "$BEATLOOM_ROOT/scripts/remote.js" start
if [ "${BEATLOOM_NO_OPEN:-0}" != 1 ]; then /usr/bin/open 'http://127.0.0.1:3000'; fi
