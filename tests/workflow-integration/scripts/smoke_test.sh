#!/usr/bin/env bash
set -euo pipefail
BASE="${MOCK_API_BASE:-http://127.0.0.1:18080}"
check() {
  local expected="$1"; local route="$2"; shift 2
  local received
  received="$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$@" "${BASE}${route}")"
  if [[ "$received" != "$expected" ]]; then
    echo "FAIL ${route}: got ${received}, expected ${expected}" >&2; exit 1
  fi
  echo "PASS ${route}: HTTP ${received}"
}
check 200 /health
check 200 /orders/A1001
check 404 /orders/NOT-FOUND
check 429 /fail/rate-limited
check 500 /fail/server-error
check 401 /secure/orders/A1001
check 200 /secure/orders/A1001 -H 'X-Tool-Key: tool-test-key'
check 403 /secure/admin -H 'X-Tool-Key: tool-test-key'
echo 'Fixture smoke tests passed.'
