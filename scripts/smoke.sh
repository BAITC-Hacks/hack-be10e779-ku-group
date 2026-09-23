#!/usr/bin/env bash
# Smoke основного сценария против запущенного приложения: ./scripts/smoke.sh [base_url]
# health → прогрев модели → прогноз на 2026-02-09 → метрики → история. Нужны только curl и grep.
set -euo pipefail
BASE="${1:-http://localhost:8000}"
WAIT_S="${SMOKE_WAIT_S:-300}"
fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "OK   $*"; }

# 1. приложение отвечает
curl -fsS "$BASE/health" | grep -q '"status":"ok"' || fail "/health"
ok "/health"

# 2. модель прогрета (обучение при старте ~1 мин)
for ((i = 0; i < WAIT_S; i += 5)); do
  STATE=$(curl -fsS "$BASE/health" | grep -o '"model":"[a-z]*"' | cut -d'"' -f4)
  [ "$STATE" = "ready" ] && break
  [ "$STATE" = "error" ] && fail "прогрев модели завершился ошибкой (см. docker compose logs)"
  sleep 5
done
[ "$STATE" = "ready" ] || fail "модель не прогрелась за ${WAIT_S} с (состояние: $STATE)"
ok "модель прогрета ($((i)) с)"

# 3. прогноз агента на 2026-02-09: 48 часов, погода выпущена до момента прогноза, есть шаги цикла
F=$(curl -fsS --max-time 120 -X POST "$BASE/api/forecast" -H 'Content-Type: application/json' \
  -d '{"issue_date":"2026-02-09"}') || fail "POST /api/forecast"
[ "$(grep -o '"lead_day"' <<<"$F" | wc -l)" -eq 48 ] || fail "прогноз: не 48 часов"
grep -q '"time_integrity":{[^}]*"ok":true' <<<"$F" || fail "прогноз: проверка честности по времени не пройдена"
for step in fetch_weather run_forecast analyze_forecast compare_with_previous; do
  grep -q "\"name\":\"$step\"" <<<"$F" || fail "прогноз: нет шага $step"
done
ok "прогноз 2026-02-09: 48 ч, режим $(grep -o '"mode":"[a-z]*"' <<<"$F" | cut -d'"' -f4)"

# 4. ошибка на дату вне тестового периода — 400 с понятным текстом
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/forecast" -H 'Content-Type: application/json' \
  -d '{"issue_date":"2026-03-15"}')
[ "$CODE" = "400" ] || fail "дата вне периода: ожидался 400, получен $CODE"
ok "дата вне периода → 400"

# 5. метрики на отложенной выборке
curl -fsS "$BASE/api/metrics" | grep -q '"mae"' || fail "GET /api/metrics"
ok "метрики"

# 6. история факта: 2 дня = 48 часов
H=$(curl -fsS "$BASE/api/history?start=2026-01-30&end=2026-01-31") || fail "GET /api/history"
[ "$(grep -o '"time"' <<<"$H" | wc -l)" -eq 48 ] || fail "история: не 48 часов"
ok "история 30–31.01.2026: 48 ч"

# 7. интерфейс отдаётся
curl -fsS "$BASE/" | grep -q '<div id="root">' || fail "главная страница"
ok "главная страница"

echo "Smoke пройден"
