#!/usr/bin/env bash
# Проверка окружения ноутбука перед хакатоном. Подготовлено до старта соревнования (заготовка, раскрывается в README).
# Ничего не устанавливает и не меняет. Использование:
#   ./scripts/preflight.sh          — проверить инструменты
#   ./scripts/preflight.sh --pull   — ещё и скачать базовые Docker-образы
#   OPENAI_API_KEY=... ./scripts/preflight.sh --api   — ещё и проверить ключ OpenAI (ключ не печатается)
#   + NVIDIA_API_KEY=... — заодно проверить доступ к NVIDIA API
set -u

PULL=0
API=0
for arg in "$@"; do
  case "$arg" in
    --pull) PULL=1 ;;
    --api) API=1 ;;
    *) echo "Неизвестный флаг: $arg"; exit 2 ;;
  esac
done

FAIL=0
WARN=0
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mНЕТ\033[0m   %s\n' "$1"; FAIL=$((FAIL + 1)); }
warn() { printf '  \033[33mВНИМ\033[0m  %s\n' "$1"; WARN=$((WARN + 1)); }

# need <команда> <обязательна: 1|0> <подсказка>
need() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1 — $("$1" --version 2>&1 | head -n 1 | cut -c1-60)"
  elif [ "$2" = 1 ]; then
    bad "$1 не найден. $3"
  else
    warn "$1 не найден. $3"
  fi
}

echo "== Обязательное =="
need git 1 "Установить git."
need docker 1 "Установить Docker Engine или Docker Desktop."
need node 1 "Установить Node.js LTS."
need npm 1 "Ставится вместе с Node.js."
need curl 1 "Установить curl."
need jq 1 "Установить jq."

if command -v python3.12 >/dev/null 2>&1; then
  ok "python3.12 — $(python3.12 --version 2>&1)"
elif command -v python3 >/dev/null 2>&1; then
  warn "python3.12 не найден, есть $(python3 --version 2>&1). В Docker это не мешает; для локального backend нужен 3.12."
else
  bad "python3 не найден."
fi

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose — $(docker compose version 2>&1 | head -n 1)"
  else
    bad "docker compose (v2) не работает."
  fi
  if docker info >/dev/null 2>&1; then
    ok "демон Docker запущен, прав хватает"
  else
    bad "docker info не отвечает: демон не запущен или пользователь не в группе docker."
  fi
fi

echo "== Git и GitHub =="
NAME=$(git config user.name 2>/dev/null || true)
EMAIL=$(git config user.email 2>/dev/null || true)
if [ -n "$NAME" ] && [ -n "$EMAIL" ]; then
  ok "git user: $NAME <$EMAIL> — убедиться, что это СВОЙ аккаунт GitHub"
else
  bad "не заданы git config user.name / user.email."
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
    ok "доступ к origin есть (чтение). Запись проверяется только реальным push после старта"
  else
    bad "нет доступа к origin: проверить вход в GitHub (ssh-ключ или gh auth login)."
  fi
fi

echo "== AI-ассистенты (нужен хотя бы свой) =="
need claude 0 "Нужен Максиму и Оксане."
need codex 0 "Нужен Владимиру."

echo "== Необязательное =="
need uv 0 "Ускоряет локальную установку Python-зависимостей."
need cloudflared 0 "Нужен только для P1 (туннель для MCP / ChatGPT App)."
need gh 0 "GitHub CLI — удобно, но не обязательно."

echo "== Ресурсы =="
FREE_GB=$(df -Pk . | awk 'NR==2 {printf "%d", $4 / 1024 / 1024}')
if [ "$FREE_GB" -ge 15 ]; then
  ok "свободно на диске: ${FREE_GB} ГБ"
else
  warn "свободно на диске: ${FREE_GB} ГБ — для образов Docker и node_modules лучше 15+ ГБ."
fi
if curl -fsSI -m 8 -o /dev/null https://registry.npmjs.org/ && curl -fsSI -m 8 -o /dev/null https://pypi.org/simple/pip/; then
  ok "npm registry и PyPI доступны"
else
  warn "npm registry или PyPI недоступны из этой сети."
fi

if [ "$PULL" = 1 ]; then
  echo "== Базовые Docker-образы =="
  for image in python:3.12-slim node:22-slim; do
    if docker pull -q "$image" >/dev/null 2>&1; then ok "скачан $image"; else bad "не удалось скачать $image"; fi
  done
fi

if [ "$API" = 1 ]; then
  echo "== Ключ OpenAI API =="
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    bad "переменная OPENAI_API_KEY не задана."
  else
    CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' https://api.openai.com/v1/models \
      -H "Authorization: Bearer ${OPENAI_API_KEY}")
    case "$CODE" in
      200) ok "ключ принят (HTTP 200). Баланс и лимиты проверить в кабинете — отсюда их не видно" ;;
      401) bad "ключ отклонён (HTTP 401)." ;;
      429) warn "HTTP 429: лимит или нет средств на балансе." ;;
      000) bad "api.openai.com недоступен из этой сети." ;;
      *) warn "неожиданный ответ: HTTP $CODE." ;;
    esac
  fi
  if [ -n "${NVIDIA_API_KEY:-}" ]; then
    echo "== Ключ NVIDIA API (build.nvidia.com) =="
    CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' https://integrate.api.nvidia.com/v1/models \
      -H "Authorization: Bearer ${NVIDIA_API_KEY}")
    case "$CODE" in
      200) ok "NVIDIA API отвечает (HTTP 200); список моделей открыт. Сам ключ проверится первым вызовом модели" ;;
      401|403) bad "ключ NVIDIA отклонён (HTTP $CODE)." ;;
      000) bad "integrate.api.nvidia.com недоступен из этой сети." ;;
      *) warn "NVIDIA: неожиданный ответ HTTP $CODE." ;;
    esac
  fi
fi

echo
echo "Итог: ошибок — $FAIL, предупреждений — $WARN."
[ "$FAIL" -eq 0 ]
