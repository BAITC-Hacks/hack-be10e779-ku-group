# Toolbox: публичные библиотеки и репозитории по модулям

> Подготовлено до старта соревнования (заготовка, раскрывается в README).
> Существование, лицензии и активность репозиториев проверены через GitHub API 19.09.2026.
> Это **меню, а не список покупок**: берём только то, что нужно для P0 из `CASE.md`.

## Правила использования

1. **Всё использованное — в раздел раскрытия README** (название, ссылка, лицензия). Требование п. 6.4 положения.
2. **Подключаем как зависимость** (`pip` / `npm`), а не копируем чужой код в репозиторий. Исключение — библиотеки,
   которые так и задуманы (shadcn/ui, Magic UI, React Bits: компоненты копируются CLI-командой) — их тоже раскрываем.
3. **Лицензии.** Свободно: MIT, BSD, Apache-2.0, ISC, MPL-2.0. LGPL — только как зависимость, не копировать исходники.
   **AGPL / GPL — не берём** (помечены ⛔): обязывают открыть весь проект под той же лицензией. Рядом указана замена.
4. **Тяжёлые зависимости** (помечены 🐘: torch, большие модели) — образ Docker на гигабайты, сборка 10+ минут,
   у эксперта может не собраться. Это −20 баллов за воспроизводимость. По умолчанию — вызов API + кэш ответов (демо-режим).
5. Чужой проект «целиком» не берём: «проект преимущественно сделан третьими лицами» — основание для дисквалификации,
   а 25 баллов технической реализации ставят за нашу работу.
6. ✅ — выбор по умолчанию в модуле, чтобы не выбирать на площадке.

---

# BACKEND

## Каркас и шаблоны
- ✅ [fastapi/fastapi](https://github.com/fastapi/fastapi) — веб-фреймворк · MIT
- [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) — официальный шаблон FastAPI + React + Postgres + JWT · MIT.
  ⚠ Тяжёлый (Postgres, Traefik, почта, миграции): вырезать лишнее дольше, чем сгенерировать свой каркас. Использовать как **справочник решений**, не как основу.
- ✅ [pydantic/pydantic-settings](https://github.com/pydantic/pydantic-settings) — конфигурация из `.env` · MIT
- ✅ [astral-sh/uv](https://github.com/astral-sh/uv) — быстрая установка зависимостей · Apache-2.0
- ✅ [astral-sh/ruff](https://github.com/astral-sh/ruff) — линтер и форматтер · MIT

## База данных
- ✅ [sqlalchemy/sqlalchemy](https://github.com/sqlalchemy/sqlalchemy) — ORM · MIT
- [fastapi/sqlmodel](https://github.com/fastapi/sqlmodel) — SQLAlchemy + Pydantic в одной модели, меньше кода · MIT
- [duckdb/duckdb](https://github.com/duckdb/duckdb) — аналитика по CSV/Parquet SQL-запросами без сервера · MIT
- [pgvector/pgvector](https://github.com/pgvector/pgvector) — векторы в Postgres (только если уже взяли Postgres) · PostgreSQL License

## Авторизация
> Сначала вопрос: **нужна ли она кейсу?** Если нет — переключатель ролей без пароля («войти как прораб / заказчик»),
> честно описанный в README как упрощение. Это 10 минут вместо часа.
- ✅ [jpadilla/pyjwt](https://github.com/jpadilla/pyjwt) + [frankie567/pwdlib](https://github.com/frankie567/pwdlib) — JWT и хеширование паролей; вместе с рецептом из документации FastAPI (OAuth2 password flow) это ~60 строк · MIT
- [fastapi-users/fastapi-users](https://github.com/fastapi-users/fastapi-users) — готовые регистрация, логин, сброс пароля, OAuth · MIT. Тяжелее рецепта выше (async SQLAlchemy, своя схема пользователей); брать, только если кейс требует полноценного управления пользователями.
- [authlib/authlib](https://github.com/authlib/authlib) — вход через Google и другие OAuth-провайдеры · BSD-3

## Готовая админка (CRUD без фронтенда)
- ✅ [smithyhq/sqladmin](https://github.com/smithyhq/sqladmin) — админ-панель поверх SQLAlchemy-моделей за 15 строк (бывш. aminalaee/sqladmin) · BSD-3
- [jowilf/starlette-admin](https://github.com/jowilf/starlette-admin) — аналог · MIT

## Сервисные мелочи
- [encode/httpx](https://github.com/encode/httpx) — HTTP-клиент с таймаутами · BSD-3
- [jd/tenacity](https://github.com/jd/tenacity) — повторы внешних вызовов · Apache-2.0
- [laurentS/slowapi](https://github.com/laurentS/slowapi) — rate limiting (балл за безопасность) · MIT
- [Delgan/loguru](https://github.com/Delgan/loguru) — логирование · MIT
- [Kludex/python-multipart](https://github.com/Kludex/python-multipart) — нужен FastAPI для загрузки файлов · Apache-2.0
- [sysid/sse-starlette](https://github.com/sysid/sse-starlette) — стриминг ответа модели в браузер (SSE) · BSD-3
- [agronholm/apscheduler](https://github.com/agronholm/apscheduler) — фоновые задачи по расписанию · MIT
- [aiogram/aiogram](https://github.com/aiogram/aiogram) — Telegram-бот, если кейс его требует · MIT

---

# AI

## LLM: клиенты и структурированный вывод
- ✅ [openai/openai-python](https://github.com/openai/openai-python) — SDK OpenAI · Apache-2.0
- ✅ [anthropics/anthropic-sdk-python](https://github.com/anthropics/anthropic-sdk-python) — SDK Claude · MIT
- ✅ [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — агенты с инструментами и типизированным выводом, смена провайдера одной строкой · MIT
- [567-labs/instructor](https://github.com/567-labs/instructor) — JSON по Pydantic-схеме с авто-повтором · MIT
- [BerriAI/litellm](https://github.com/BerriAI/litellm) — единый интерфейс к 100+ провайдерам · MIT (кроме папки enterprise)
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — граф агентов · MIT. ⚠ Много абстракций; для 5 часов обычно лишнее.
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain), [run-llama/llama_index](https://github.com/run-llama/llama_index) — комбайны для RAG · MIT. Брать только ради конкретного загрузчика или сплиттера.
- [ollama/ollama](https://github.com/ollama/ollama) — локальные модели · MIT. 🐘 Эксперт вряд ли будет качать модель на несколько ГБ — только как опция.

## MCP / ChatGPT App (P1)
- ✅ [PrefectHQ/fastmcp](https://github.com/PrefectHQ/fastmcp) — MCP-сервер декораторами (бывш. jlowin/fastmcp) · Apache-2.0
- [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) — официальный SDK · MIT
- [tadata-org/fastapi_mcp](https://github.com/tadata-org/fastapi_mcp) — превращает существующие эндпоинты FastAPI в MCP-инструменты · MIT (обновлялся в ноябре 2025 — проверить совместимость)
- [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples) — примеры ChatGPT Apps · MIT

## Поиск и RAG
- ✅ [dorianbrown/rank_bm25](https://github.com/dorianbrown/rank_bm25) — поиск по ключевым словам без моделей и сети; для небольшого корпуса часто достаточно · Apache-2.0
- ✅ [chroma-core/chroma](https://github.com/chroma-core/chroma) — встраиваемая векторная БД, без сервера · Apache-2.0
- [asg017/sqlite-vec](https://github.com/asg017/sqlite-vec) — векторы прямо в SQLite · Apache-2.0
- [lancedb/lancedb](https://github.com/lancedb/lancedb) — встраиваемая векторная БД · Apache-2.0
- [qdrant/fastembed](https://github.com/qdrant/fastembed) — эмбеддинги локально на ONNX, без torch, есть мультиязычные модели · Apache-2.0
- [facebookresearch/faiss](https://github.com/facebookresearch/faiss) — векторный индекс · MIT
- [huggingface/sentence-transformers](https://github.com/huggingface/sentence-transformers) — эмбеддинги · Apache-2.0 · 🐘 тянет torch
> Для демо-режима эмбеддинги демо-корпуса считаются заранее и кладутся в репозиторий — поиск работает без ключа.

## Разбор документов
- ✅ [microsoft/markitdown](https://github.com/microsoft/markitdown) — PDF, DOCX, XLSX, PPTX → Markdown для LLM · MIT
- ✅ [py-pdf/pypdf](https://github.com/py-pdf/pypdf) — текст из PDF, чистый Python · BSD-3
- [jsvine/pdfplumber](https://github.com/jsvine/pdfplumber) — таблицы из PDF · MIT
- [python-openxml/python-docx](https://github.com/python-openxml/python-docx) — чтение и запись DOCX · MIT
- openpyxl (PyPI) — чтение и запись XLSX · MIT
- [docling-project/docling](https://github.com/docling-project/docling) — сложные PDF с вёрсткой и таблицами · MIT · 🐘
- ⛔ [pymupdf/PyMuPDF](https://github.com/pymupdf/PyMuPDF) — AGPL-3.0. Замена: pypdf + pdfplumber.
> Сканы и фото документов проще отдать vision-модели по API, чем поднимать OCR.

## Генерация документов (акты, отчёты)
- ✅ [python-openxml/python-docx](https://github.com/python-openxml/python-docx) — DOCX · MIT
- [elapouya/python-docx-template](https://github.com/elapouya/python-docx-template) — DOCX из шаблона с Jinja-полями · LGPL-2.1 (как зависимость)
- [Kozea/WeasyPrint](https://github.com/Kozea/WeasyPrint) — HTML → PDF · BSD-3 (нужны системные библиотеки в Dockerfile)
- [py-pdf/fpdf2](https://github.com/py-pdf/fpdf2) — PDF на чистом Python · LGPL-3.0 (как зависимость)

## OCR
- [madmaze/pytesseract](https://github.com/madmaze/pytesseract) — обёртка Tesseract; нужен `tesseract-ocr` + языковые пакеты `rus`, `kaz` в Dockerfile · Apache-2.0
- [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) · Apache-2.0 · 🐘
- [JaidedAI/EasyOCR](https://github.com/JaidedAI/EasyOCR) · Apache-2.0 · 🐘

## Компьютерное зрение
- ✅ Vision-модель по API + кэш ответов — для «что на фото», фотофиксации, сравнения с планом.
- [roboflow/supervision](https://github.com/roboflow/supervision) — отрисовка детекций, подсчёт, зоны · MIT
- [opencv/opencv-python](https://github.com/opencv/opencv-python) (брать `opencv-python-headless`) · MIT
- [python-pillow/Pillow](https://github.com/python-pillow/Pillow) — базовая работа с изображениями · MIT-CMU
- ⛔ [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics) (YOLO) — AGPL-3.0 и 🐘.

## Речь
- ✅ Распознавание по API (проверить качество казахского заранее).
- [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) — локальный Whisper · MIT · 🐘
- [IS2AI/Kazakh_TTS](https://github.com/IS2AI/Kazakh_TTS) — синтез казахской речи (ISSAI) · CC-BY-4.0, обязательна атрибуция

## Данные и классический ML
- ✅ [pandas-dev/pandas](https://github.com/pandas-dev/pandas) · BSD-3 · [pola-rs/polars](https://github.com/pola-rs/polars) · MIT
- [scikit-learn/scikit-learn](https://github.com/scikit-learn/scikit-learn) · BSD-3
- [catboost/catboost](https://github.com/catboost/catboost) — табличные данные без тюнинга · Apache-2.0
- [Nixtla/statsforecast](https://github.com/Nixtla/statsforecast) — прогноз временных рядов · Apache-2.0

---

# FRONTEND

## Основа
- ✅ Vite + React + TypeScript
- ✅ [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) · MIT
- ✅ [shadcn-ui/ui](https://github.com/shadcn-ui/ui) — компоненты копируются в проект CLI-командой, выглядят современно из коробки; ассистенты знают её лучше всего · MIT
- ✅ [lucide-icons/lucide](https://github.com/lucide-icons/lucide) — иконки · ISC
- [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) — готовая админ-панель на **Vite** + shadcn: сайдбар, таблицы, настройки, тёмная тема · MIT. Справочник раскладок и источник отдельных экранов.
- [jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) — визуальный редактор тем shadcn: за 5 минут фирменные цвета вместо стандартного серого · Apache-2.0
- [birobirobiro/awesome-shadcn-ui](https://github.com/birobirobiro/awesome-shadcn-ui) — каталог всего вокруг shadcn · MIT
- Альтернативы «всё в одном»: [ant-design/ant-design](https://github.com/ant-design/ant-design) + [pro-components](https://github.com/ant-design/pro-components) (быстрее всего для тяжёлых таблиц и форм, выглядит «корпоративно») · [mantinedev/mantine](https://github.com/mantinedev/mantine) · [heroui-inc/heroui](https://github.com/heroui-inc/heroui) · [saadeghi/daisyui](https://github.com/saadeghi/daisyui). **Одна библиотека на проект, не смешивать.**

## Базовые договорённости по UI — чтобы не выбирать на площадке

Предложение; утверждает владелец `frontend/` (Владимир). Сам интерфейс продукта до старта не пишем.

- Одна библиотека компонентов — shadcn/ui; одна тема (светлая), один акцентный цвет через tweakcn.
- Шрифт — **системный стек** или пакет `@fontsource/inter`. Не Google Fonts по ссылке: у эксперта может не быть интернета.
- Раскладка: сайдбар + шапка + основная область. Экран P0 открывается первым, без логина.
- У каждого экрана P0 три состояния: загрузка, ошибка с понятным текстом, пусто.
- Карточка вывода AI: уровень (цвет + слово, не только цвет) · вывод · **цитата-доказательство с источником** · пометка «демо-режим», если ответ сохранённый.
- Один тип графиков (Recharts) и не больше одного «главного визуала» из списка ниже — выбор после `CASE.md`.

## Связь с backend
- ✅ [hey-api/hey-api](https://github.com/hey-api/hey-api) (`@hey-api/openapi-ts`) — генерирует типизированный TS-клиент из `/openapi.json` FastAPI: контракт синхронизируется одной командой · MIT
- [openapi-ts/openapi-typescript](https://github.com/openapi-ts/openapi-typescript) — только типы · MIT
- ✅ [TanStack/query](https://github.com/TanStack/query) — запросы, кэш, состояния загрузки и ошибок · MIT
- [remix-run/react-router](https://github.com/remix-run/react-router) · MIT · [pmndrs/zustand](https://github.com/pmndrs/zustand) — глобальное состояние, если нужно · MIT

## Формы, таблицы, файлы
- ✅ [react-hook-form/react-hook-form](https://github.com/react-hook-form/react-hook-form) + [colinhacks/zod](https://github.com/colinhacks/zod) · MIT
- ✅ [TanStack/table](https://github.com/TanStack/table) · MIT · [sadmann7/tablecn](https://github.com/sadmann7/tablecn) — готовая таблица shadcn с фильтрами и сортировкой · MIT
- [react-dropzone/react-dropzone](https://github.com/react-dropzone/react-dropzone) — drag-and-drop загрузка · MIT
- [wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf) — просмотр PDF с подсветкой источника · MIT
- [emilkowalski/sonner](https://github.com/emilkowalski/sonner) — уведомления · MIT
- [dip/cmdk](https://github.com/dip/cmdk) — командная палитра Ctrl+K · MIT

## Интерфейс AI-чата
- ✅ [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) — готовый чат: стриминг, вызовы инструментов, вложения; работает с любым backend · MIT
- [ibelick/prompt-kit](https://github.com/ibelick/prompt-kit) — блоки AI-интерфейса для shadcn · MIT
- [vercel/ai-elements](https://github.com/vercel/ai-elements) — компоненты: сообщения, рассуждения, источники, вызовы инструментов · Apache-2.0
- [vercel/ai](https://github.com/vercel/ai) — `useChat` и протокол стриминга · Apache-2.0
- [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown) — рендер Markdown-ответов · MIT

---

# FRONTEND: WOW-ЭФФЕКТ ДЛЯ ЖЮРИ

> Это про Demo Day (ориентиры жюри: презентация и демо — 20, инновационность — 15; п. 5.7.2). В техническом отборе за красоту баллов нет,
> поэтому — **только после того, как P0 проходит smoke**.
>
> Что реально создаёт «вау», по убыванию отдачи:
> 1. Цельный вид: одна тема, одни отступы, тёмный режим, нормальные пустые состояния и загрузки.
> 2. **Один** главный визуал, связанный с сутью кейса: карта, 3D-модель, граф связей, диаграмма Ганта.
> 3. Ответ AI появляется потоком, с источниками и видимыми шагами («читаю документ → сверяю с нормой → найдено 3 отклонения»).
> 4. Микроанимации цифр и появления элементов.
> 5. Кнопка «Загрузить демо-данные» и тур по интерфейсу — судья проходит сценарий сам, без объяснений.
>
> Эффекты на каждом экране выглядят дёшево. Один сильный визуал + аккуратность — дорого.

## Анимированные компоненты (копируются в проект, совместимы с shadcn)
- ✅ [magicuidesign/magicui](https://github.com/magicuidesign/magicui) — анимированные блоки: бегущая рамка, сетки, счётчики, маркизы, глобус, bento-сетка · MIT
- ✅ [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) — 100+ анимированных текстов, фонов, карточек · MIT + Commons Clause (использовать в проекте можно, перепродавать сами компоненты нельзя)
- [ibelick/motion-primitives](https://github.com/ibelick/motion-primitives) — сдержанные, «продуктовые» анимации · MIT
- [nolly-studio/cult-ui](https://github.com/nolly-studio/cult-ui) — эффектные компоненты для shadcn · MIT
- Aceternity UI (ui.aceternity.com) — самые «хакатонские» эффекты: spotlight, 3D-карточки, лучи. Публичного репозитория нет, компоненты копируются с сайта — условия использования проверить и раскрыть.
- [serafimcloud/21st](https://github.com/serafimcloud/21st) — 21st.dev, маркетплейс shadcn-компонентов с установкой одной командой · MIT
- ⛔ [cosscom/coss](https://github.com/cosscom/coss) (бывш. Origin UI) — AGPL-3.0.

## Движение
- ✅ [motiondivision/motion](https://github.com/motiondivision/motion) — анимации (бывш. Framer Motion) · MIT
- ✅ [formkit/auto-animate](https://github.com/formkit/auto-animate) — плавные списки одной строкой · MIT
- ✅ [barvian/number-flow](https://github.com/barvian/number-flow) — «перелистывающиеся» цифры в KPI · MIT
- [LottieFiles/dotlottie-web](https://github.com/LottieFiles/dotlottie-web) — готовые Lottie-анимации для пустых состояний и загрузки · MIT (у каждой анимации своя лицензия)
- [tsparticles/tsparticles](https://github.com/tsparticles/tsparticles) — частицы на фоне · MIT
- GSAP — лицензия нестандартная, не берём; `motion` закрывает всё нужное.

## Графики и дашборды
- ✅ [recharts/recharts](https://github.com/recharts/recharts) — на нём построены графики shadcn · MIT
- [apache/echarts](https://github.com/apache/echarts) + [hustcc/echarts-for-react](https://github.com/hustcc/echarts-for-react) — самые эффектные: санкей, радар, тепловая карта, 3D · Apache-2.0 / MIT
- [plouc/nivo](https://github.com/plouc/nivo) — красивые из коробки · MIT
- [tremorlabs/tremor](https://github.com/tremorlabs/tremor) — KPI-карточки и блоки дашборда · Apache-2.0 (обновлялся в октябре 2025)
- [react-grid-layout/react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) — перетаскиваемые виджеты · MIT

## Главный визуал — выбрать один под кейс
- **Карта:** ✅ [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js) — векторная карта без токена · BSD-3 · [visgl/react-map-gl](https://github.com/visgl/react-map-gl) — обёртка для React · MIT · [visgl/deck.gl](https://github.com/visgl/deck.gl) — 3D-столбцы, дуги, тепловые слои поверх карты · MIT · [Leaflet/Leaflet](https://github.com/Leaflet/Leaflet) — проще всего · BSD-2.
  ⚠ [react-leaflet](https://github.com/PaulLeCam/react-leaflet) — Hippocratic License, нестандартная: обойтись чистым Leaflet.
  ⚠ Тайлы карты требуют интернета — предусмотреть запасной статичный вид.
- **Глобус:** [vasturiano/react-globe.gl](https://github.com/vasturiano/react-globe.gl) · MIT
- **Граф связей / знаний:** [vasturiano/react-force-graph](https://github.com/vasturiano/react-force-graph) (2D и 3D) · MIT
- **Схема процесса / пайплайн агентов:** ✅ [xyflow/xyflow](https://github.com/xyflow/xyflow) (React Flow) — показать, как агент идёт по шагам · MIT
- **3D:** [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) + [pmndrs/drei](https://github.com/pmndrs/drei) · MIT
- **Диаграмма Ганта, канбан, календарь:** ✅ [shadcnblocks/kibo](https://github.com/shadcnblocks/kibo) (Kibo UI: Gantt, Kanban, Calendar в стиле shadcn) · MIT · [frappe/gantt](https://github.com/frappe/gantt) · MIT · [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit) — перетаскивание · MIT

## Проведение судьи по сценарию
- ✅ [gilbarbara/react-joyride](https://github.com/gilbarbara/react-joyride) — пошаговый тур по интерфейсу · MIT

## Запасной UI на крайний случай
- [streamlit/streamlit](https://github.com/streamlit/streamlit) · Apache-2.0 · [gradio-app/gradio](https://github.com/gradio-app/gradio) · Apache-2.0 —
  интерфейс на Python за 20 минут, если к третьему часу React-фронт не собрался. Некрасиво, но сценарий работает.

---

# СТРОИТЕЛЬСТВО / BIM (ARCHIVED: трек снят 20.09.2026; только если ТЗ окажется про это)
- [ThatOpen/engine_components](https://github.com/ThatOpen/engine_components) — просмотр IFC-моделей в браузере · MIT
- [ThatOpen/engine_web-ifc](https://github.com/ThatOpen/engine_web-ifc) — чтение IFC в браузере (WASM) · MPL-2.0
- [IfcOpenShell/IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) — разбор IFC на Python · LGPL-3.0 (как зависимость)
- ⛔ [xeokit/xeokit-sdk](https://github.com/xeokit/xeokit-sdk) — AGPL-3.0.

# ИНФРАСТРУКТУРА
- [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared) — публичный HTTPS-туннель для MCP / ChatGPT App без регистрации · Apache-2.0
- [vitest-dev/vitest](https://github.com/vitest-dev/vitest) — тесты фронтенда · MIT · pytest — тесты backend · MIT
