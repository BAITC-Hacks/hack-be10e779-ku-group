# <Название> — <одна фраза: для кого и что делает>

> Скелет README подготовлен до старта соревнования как шаблон; содержательные разделы заполняются по ходу разработки 23.09.2026.

## Задача и что реализовано

| Требование ТЗ | Статус | Где в коде | Как проверить |
| --- | --- | --- | --- |
| … | … | … | … |

## Быстрый запуск

Нужен только Docker (см. «Системные требования»). Ключи API не нужны: без ключа приложение работает в демо-режиме.

```bash
git clone <URL репозитория> && cd <папка>
cp .env.example .env
docker compose up --build
```

Откройте http://localhost:8000. Проверка: `curl http://localhost:8000/health` → `{"status":"ok",...}`.
Первая сборка — около 2–3 минут. Если порт 8000 занят — укажите другой в `.env`: `APP_PORT=8080`.

## Проверка основного сценария

1. …

Автоматически: `./scripts/smoke.sh` (при запущенном приложении).

## Как устроено

```text
backend/app/
  main.py        точка входа FastAPI: /health, роутеры /api/*, раздача собранного frontend
  config.py      настройки из переменных окружения
  api/           роутеры
  services/      бизнес-логика
  ai/llm.py      LLMClient: живой вызов OpenAI API, JSON по схеме, демо-режим из data/ai-cache/
  ai/agent.py    агентный цикл: модель вызывает инструменты, код их исполняет, журнал шагов
  db.py models.py schemas.py
backend/tests/   тесты (pytest)
frontend/src/    интерфейс (React + Vite + TypeScript); api/client.ts — клиент к backend
data/demo/       демо-данные
data/ai-cache/   сохранённые ответы модели для демо-режима
scripts/         smoke.sh — проверка сценария; preflight.sh — проверка окружения разработчика
```

Один контейнер, один порт: FastAPI отдаёт и API, и собранный frontend. БД — SQLite (файл `data/app.db`, создаётся при старте).

## AI: агент, инструменты, режимы

- **Живой режим** (`APP_MODE=live` и задан `LLM_API_KEY`): запросы к OpenAI API; ответы сохраняются в `data/ai-cache/`.
- **Демо-режим** (по умолчанию, без ключа): показываются сохранённые ответы реальной модели на демо-данных; в интерфейсе
  это явно помечено. Для входа без сохранённого ответа приложение честно сообщает, что нужен ключ.

## Данные

…

## Переменные окружения

| Имя | Назначение | По умолчанию | Обязательна |
| --- | --- | --- | --- |
| `APP_MODE` | `demo` или `live` | `demo` | нет |
| `LLM_API_KEY` | ключ OpenAI API для живого режима | пусто | нет |
| `LLM_MODEL` | модель OpenAI | `gpt-5.4-mini` | нет |
| `LLM_BASE_URL` | адрес OpenAI-совместимого API; пусто — OpenAI | пусто | нет |
| `APP_PORT` | порт на хосте | `8000` | нет |

## Системные требования

- Docker 24+ с Docker Compose v2; 2 ГБ свободной памяти, 1 ГБ диска; Linux, macOS или Windows (WSL2).
- Для первой сборки нужен интернет (скачиваются образы и зависимости); дальше приложение работает без интернета в демо-режиме.

Запуск без Docker (для разработки): Python 3.12 и Node.js 20+.

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && npm ci && npm run dev    # http://localhost:5173, /api проксируется на :8000
```

## Надёжность и безопасность

- Ошибки API — JSON `{"detail": "…"}` с корректным HTTP-кодом; трассировки наружу не отдаются.
- Контейнер работает не от root; наружу открыт один порт; секреты только в `.env` (не в репозитории).
- Тесты: `cd backend && .venv/bin/pytest -q`.

## Известные ограничения

…

## Как использованы AI-инструменты

- Разработка: Claude Code (Максим, Оксана), OpenAI Codex (Владимир).
- В продукте: OpenAI API через `backend/app/ai/llm.py`.

## Использованные заготовки и внешние материалы

До официального старта команда подготовила общие организационные и инфраструктурные материалы,
не содержащие решения Задачи (п. 5.4.4.2 положения):

- `AGENTS.md` и `CLAUDE.md` — инструкции для AI-ассистентов (Codex и Claude Code);
- `docs/hackathon-rules.md`, `docs/hackathon-regulations-full.md`, `docs/playbook.md`, `docs/architecture.md`,
  `docs/deploy.md`, `docs/toolbox.md` — выжимка правил, текст положения, процедуры команды, архитектура по умолчанию, список библиотек;
- команды в `.claude/commands/` и настройки Claude Code `.claude/settings.json`;
- `scripts/preflight.sh` — проверка окружения ноутбука, к решению Задачи не относится;
- типовой каркас без предметной логики: `backend/` (FastAPI с `/health`, конфигурация, подключение SQLite, обработка ошибок, `LLMClient` с демо-режимом,
  общий агентный цикл с инструментами без предметных инструментов, хелпер безопасной загрузки файлов),
  `frontend/` (шаблон `create-vite` react-ts, очищенный от демо-содержимого, экран статуса), `Dockerfile`, `docker-compose.yml`,
  `.env.example`, `scripts/smoke.sh` (проверка `/health` и главной страницы), этот скелет README.

До старта команда также провела с помощью AI-ассистентов обзор отраслей и возможных треков. В репозиторий он
не включён; всё, что из него вошло в проект, приведено со ссылкой на первоисточник.

Основная функциональность решения создана в соревновательной части 23.09.2026 с 13:00 до 18:00.

Сторонние компоненты:

| Компонент | Назначение | Лицензия | Источник |
| --- | --- | --- | --- |
| FastAPI, Starlette, Pydantic, pydantic-settings | backend, валидация, конфигурация | MIT | https://github.com/fastapi/fastapi |
| Uvicorn | ASGI-сервер | BSD-3 | https://github.com/encode/uvicorn |
| SQLAlchemy | ORM, SQLite | MIT | https://github.com/sqlalchemy/sqlalchemy |
| python-multipart | загрузка файлов в FastAPI | Apache-2.0 | https://github.com/Kludex/python-multipart |
| openai-python | клиент OpenAI API | Apache-2.0 | https://github.com/openai/openai-python |
| pytest, httpx, ruff | тесты и линт | MIT / BSD-3 / MIT | PyPI |
| React, React DOM | интерфейс | MIT | https://github.com/facebook/react |
| Vite, @vitejs/plugin-react, create-vite (шаблон react-ts) | сборка и шаблон frontend | MIT | https://github.com/vitejs/vite |
| TypeScript, oxlint | типизация и линт | Apache-2.0 / MIT | npm |
