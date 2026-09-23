#!/usr/bin/env bash
# Smoke основного сценария против запущенного приложения: ./scripts/smoke.sh [base_url]
# Шаги P0 добавляются ниже по мере реализации (см. README, «Проверка основного сценария»).
set -euo pipefail
BASE="${1:-http://localhost:8000}"
fail() { echo "FAIL: $*"; exit 1; }

curl -fsS "$BASE/health" | grep -q '"status":"ok"' || fail "/health"
echo "OK   /health"
curl -fsS "$BASE/" | grep -q '<div id="root">' || fail "главная страница"
echo "OK   главная страница"
ASSET=$(curl -fsS "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)
curl -fsS -o /dev/null "$BASE$ASSET" || fail "статика frontend ($ASSET)"
echo "OK   статика frontend"
curl -sS "$BASE/api/__nope__" | grep -q '"detail"' || fail "ошибки API не в JSON"
echo "OK   ошибки API — JSON"

echo "Smoke пройден"
