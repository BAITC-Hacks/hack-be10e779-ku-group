// Вкладка «О проекте» — презентация продукта: зачем, как работает, что делает ИИ, как устроена модель, честность данных,
// развитие, ограничения, команда и версии. Факты — из README.md, CASE.md и кода; метрики — живые, из /api/metrics.

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CircleAlert,
  Cpu,
  Database,
  ExternalLink,
  Gauge,
  Layers,
  Map as MapIcon,
  Rocket,
  ShieldCheck,
  Users,
  Wind,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ProjectTabProps } from '../../app/shared'
import type { Metrics } from '../../api/types'
import { pct } from '../../lib/format'
import './project.css'

const TOOLS: { name: string; title: string; text: string }[] = [
  { name: 'rank_weather_sources', title: 'Оценивает источники погоды', text: 'Точность 7 источников погоды за последние 30 дней и пропуски данных на часы прогноза.' },
  { name: 'fetch_weather', title: 'Берёт архивный прогноз погоды', text: 'Только выпуски, опубликованные до момента прогноза; неполные источники исключает.' },
  { name: 'build_features', title: 'Готовит данные', text: '48 строк признаков: ветер разных моделей, их среднее и разброс, горизонт, календарь.' },
  { name: 'run_forecast', title: 'Запускает модель', text: 'Прогноз станции и каждой турбины по часам + вероятный диапазон p10–p90.' },
  { name: 'validate_forecast', title: 'Проверяет результат', text: '48 часов подряд, значения 0–100 %, порядок p10 ≤ p50 ≤ p90, время публикации погоды. Ошибку исправляет.' },
  { name: 'analyze_forecast', title: 'Анализирует прогноз', text: 'Пики, провалы, неуверенные часы, расхождение моделей погоды.' },
  { name: 'compare_with_previous', title: 'Пересчитывает и сравнивает', text: 'Сравнивает сегодняшний прогноз на завтра со вчерашним на те же часы и отмечает пересмотр.' },
]

const ROADMAP: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <MapIcon size={18} />,
    title: 'Карта парка владельца',
    text: 'Все ВЭС и турбины компании на одной карте; у каждой турбины — своя история, модель и прогноз.',
  },
  {
    icon: <Layers size={18} />,
    title: 'Анализ по турбине, группе и району',
    text: 'Сравнение турбин между собой при одном ветре: «Т2 выдаёт на 20 % меньше Т1» — ранний признак неисправности.',
  },
  {
    icon: <CalendarClock size={18} />,
    title: 'Заявка на рынок до 08:00',
    text: 'Перевод прогноза в МВт по номинальной мощности и готовая почасовая заявка на следующие сутки.',
  },
  {
    icon: <Gauge size={18} />,
    title: 'Внутридневная коррекция',
    text: 'Уточнение прогноза по телеметрии SCADA в течение дня и оценка риска дисбаланса по часам.',
  },
  {
    icon: <Bot size={18} />,
    title: 'Агент-помощник диспетчера',
    text: 'Уведомления о пересмотре прогноза, ответы на вопросы «почему упал прогноз на 15:00?», сводка утром.',
  },
]

const LIMITS = [
  'Факта выработки за февраль 2026 нет — качество проверено на октябре 2025 – январе 2026.',
  'Мощность дана в долях от максимума: без номинала станции перевести в МВт нельзя.',
  'У турбины 1 разрыв данных в мае–июле 2024 года; неполные часы исключаются.',
  'Вероятный диапазон после калибровки накрывает 77,5 % часов января при цели 80 %.',
  'Модель обучена для этих двух турбин; для другой станции нужна её история.',
  'Пороги карточек диспетчера (10 и 30 п.п.) — настройки команды, а не норматив.',
]

const TEAM = [
  { name: 'Максим Поляков', role: 'Данные, погода, модель, ИИ-агент, API' },
  { name: 'Оксана Леонтьева', role: 'Веб-интерфейс, дизайн, контракт API, координация' },
  { name: 'Владимир Головко', role: 'Функции сверх ТЗ, презентация' },
]

const STACK = [
  'Python 3.12 · pandas · NumPy',
  'scikit-learn — квантильный градиентный бустинг',
  'FastAPI · Uvicorn · Pydantic',
  'OpenAI API — function calling в LIVE',
  'React · TypeScript · Vite · ECharts · Leaflet',
  'Open-Meteo Previous Runs (CC BY 4.0) · OpenStreetMap',
  'Docker Compose — один контейнер, один порт',
]

/** MAE модели, кривой мощности и персистентности на горизонте D+1 из /api/metrics. */
function headline(m: Metrics | null) {
  if (!m) return null
  const d1 = m.rows.filter((r) => (r.lead ?? 'D+1') === 'D+1' && r.mae != null)
  const model = d1.find((r) => /модел/i.test(r.model) && !/без/i.test(r.model))?.mae
  const curve = d1.find((r) => /кривая/i.test(r.model))?.mae
  const persist = d1.find((r) => /персист/i.test(r.model))?.mae
  if (model == null || curve == null) return null
  return { model, curve, persist: persist ?? null, gain: 1 - model / curve }
}

function Section(props: { n: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card pj-section">
      <div className="pj-section-head">
        <span className="pj-n mono">{props.n}</span>
        <span className="pj-ico" aria-hidden>
          {props.icon}
        </span>
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  )
}

export default function ProjectTab(props: ProjectTabProps) {
  const h = headline(props.metrics)
  const commit = props.health?.commit

  return (
    <div className="pj">
      <header className="pj-hero">
        <div className="pj-hero-text">
          <div className="eyebrow">HackAlem AI 2026 · трек «Энергетика» · команда KU group</div>
          <h1>
            Анемо
            <span> — ИИ-агент, который прогнозирует выработку ветростанции по часам на двое суток вперёд</span>
          </h1>
          <p>
            Диспетчер выбирает дату — агент сам берёт прогнозы погоды из 7 источников (6 моделей мировых метеоцентров и автовыбор Open-Meteo), запускает модель, проверяет
            результат и объясняет, сколько энергии ждать, где пики и провалы и на какие часы держать резерв.
          </p>
          <div className="pj-hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => props.onOpenTab('forecast')}>
              Открыть прогноз <ArrowRight size={16} />
            </button>
            <button type="button" className="btn" onClick={() => props.onOpenTab('february')}>
              Прогноз на период
            </button>
          </div>
        </div>
        <div className="pj-stats">
          <div className="pj-stat">
            <span className="pj-stat-num mono">{h ? pct(h.model, 1) : '—'}</span>
            <span className="pj-stat-cap">средняя ошибка прогноза на завтра, от максимальной мощности</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">{h ? `−${pct(h.gain, 0)}` : '—'}</span>
            <span className="pj-stat-cap">ошибки по сравнению с простым расчётом по ветру</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">7</span>
            <span className="pj-stat-cap">шагов агента: от погоды до проверки и пересчёта</span>
          </div>
          <div className="pj-stat">
            <span className="pj-stat-num mono">28</span>
            <span className="pj-stat-cap">прогнозов на весь февраль 2026 «как в прошлом»</span>
          </div>
        </div>
      </header>

      <Section n="01" icon={<Wind size={18} />} title="Зачем это нужно">
        <div className="pj-cols">
          <p>
            Ветер меняется быстро: станция может сутки стоять, а потом за несколько часов выйти на полную мощность. Энергосистеме нужно
            заранее знать, сколько электричества будет в каждый час, — иначе приходится покрывать недостачу или излишки, а
            это деньги.
          </p>
          <ul className="pj-list">
            <li>
              Производитель ВИЭ подаёт почасовую заявку на поставку до 08:00 накануне операционных суток —{' '}
              <a href="https://adilet.zan.kz/rus/docs/V1500010662" target="_blank" rel="noopener">
                приказ Минэнерго РК № 164, п. 9 <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              Дисбаланс считается за каждый час —{' '}
              <a href="https://zakon.uchet.kz/rus/docs/V1500010532" target="_blank" rel="noopener">
                правила балансирующего рынка, п. 78 <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>
              В Казахстане 57 ВЭС на 1 525,7 МВт —{' '}
              <a href="https://ar2024.kegoc.kz/ru/electricity-balance.html" target="_blank" rel="noopener">
                годовой отчёт KEGOC 2024 <ExternalLink size={12} />
              </a>
              .
            </li>
          </ul>
        </div>
      </Section>

      <Section n="02" icon={<Bot size={18} />} title="Что делает ИИ-агент">
        <p className="pj-lead">
          Агент проходит полный цикл сам — 7 шагов-инструментов. В режиме <b>LIVE</b> порядок шагов и решения (например,
          исключить источник погоды) выбирает LLM через вызовы инструментов. В <b>режиме проверки</b> (без ключа) тот же цикл
          выполняет планировщик по тем же правилам. <b>Числа LLM не придумывает</b> — всё считает код; агент управляет шагами
          и объясняет результат.
        </p>
        <ol className="pj-pipeline">
          {TOOLS.map((t, i) => (
            <li key={t.name}>
              <span className="pj-step mono">{i + 1}</span>
              <div>
                <b>{t.title}</b>
                <code>{t.name}</code>
                <p>{t.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="small muted">
          Результат каждого запуска сохраняется как неизменяемая версия с «паспортом»: какие данные и выпуски погоды
          использованы, версии модели и калибровки, хеши входа и результата.
        </p>
      </Section>

      <Section n="03" icon={<Cpu size={18} />} title="Как устроена модель">
        <div className="pj-grid3">
          <div>
            <h3>
              <Database size={16} /> Данные
            </h3>
            <p>
              История двух турбин от организатора: замеры каждые 10 минут с 11.03.2023 по 31.01.2026 — ветер, мощность,
              температура. Станция = среднее двух турбин.
            </p>
          </div>
          <div>
            <h3>
              <Wind size={16} /> Погода
            </h3>
            <p>
              Архив прогнозов Open-Meteo: 6 моделей мировых метеоцентров (ECMWF, ICON, GFS, JMA, CMA, GEM) и автовыбор
              best_match. Для каждого часа берётся самый свежий
              выпуск, который уже был опубликован к моменту прогноза (с запасом 7 часов на публикацию).
            </p>
          </div>
          <div>
            <h3>
              <Cpu size={16} /> Модель
            </h3>
            <p>
              Градиентный бустинг (scikit-learn) выдаёт три уровня — p10, p50, p90 — и прогноз каждой турбины. Диапазон
              дополнительно калибруется (split-conformal) по режимам ветра.
            </p>
          </div>
        </div>
        {h && (
          <div className="pj-compare">
            <div className="eyebrow">Проверка на истории · {props.metrics?.holdout}</div>
            <div className="pj-bars">
              <Bar label="Наша модель" value={h.model} max={h.persist ?? h.curve} tone="primary" />
              <Bar label="Простой расчёт по ветру" value={h.curve} max={h.persist ?? h.curve} tone="curve" />
              {h.persist != null && <Bar label="«Завтра как сегодня»" value={h.persist} max={h.persist} tone="muted" />}
            </div>
            <p className="small muted">Средняя ошибка прогноза на завтра, % от максимальной мощности. Меньше — лучше.</p>
          </div>
        )}
      </Section>

      <Section n="04" icon={<ShieldCheck size={18} />} title="Честность данных">
        <ul className="pj-list">
          <li>
            Прогноз строится «как в прошлом»: вечером дня D на D+1 и D+2 — только по тому, что было известно к 23:59.
          </li>
          <li>Фактическая погода прогнозируемых суток и реанализ не используются нигде.</li>
          <li>
            Тест в коде перебирает каждый использованный выпуск погоды и проверяет, что он опубликован до момента прогноза.
          </li>
          <li>Факта выработки за февраль нет — в интерфейсе для февраля только прогнозы, без выдуманных «фактов».</li>
          <li>Режим (LIVE или режим проверки без ключа) всегда подписан: записанные ответы не выдаются за живую работу LLM.</li>
        </ul>
      </Section>

      <Section n="05" icon={<Rocket size={18} />} title="Как развивать дальше">
        <p className="pj-lead">План развития — в текущую версию не входит.</p>
        <div className="pj-roadmap">
          {ROADMAP.map((r) => (
            <div key={r.title} className="pj-road">
              <span className="pj-ico" aria-hidden>
                {r.icon}
              </span>
              <b>{r.title}</b>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section n="06" icon={<CircleAlert size={18} />} title="Ограничения — честно">
        <ul className="pj-list">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>

      <Section n="07" icon={<Users size={18} />} title="Команда и версии">
        <div className="pj-cols">
          <div>
            <h3>KU group</h3>
            <ul className="pj-team">
              {TEAM.map((t) => (
                <li key={t.name}>
                  <b>{t.name}</b>
                  <span>{t.role}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">
              При разработке использовались AI-ассистенты Claude Code и OpenAI Codex. Основная функциональность создана
              23.09.2026 с 13:00 до 18:00.
            </p>
          </div>
          <div>
            <h3>Версия</h3>
            <dl className="pj-dl">
              <dt>Сборка сервера</dt>
              <dd className="mono">{commit ?? '—'}</dd>
              <dt>Режим агента</dt>
              <dd>{props.meta.mode === 'live' ? `LIVE · ${props.meta.llm_model ?? 'LLM'}` : 'Режим проверки (без ключа)'}</dd>
              <dt>Прогнозы за период</dt>
              <dd>
                {props.meta.issue_range.first} … {props.meta.issue_range.last}
              </dd>
              <dt>История данных</dt>
              <dd>
                {props.meta.history_range.first.slice(0, 10)} … {props.meta.history_range.last.slice(0, 10)}
              </dd>
            </dl>
            <h3>Технологии</h3>
            <ul className="pj-stack">
              {STACK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Bar(props: { label: string; value: number; max: number; tone: 'primary' | 'curve' | 'muted' }) {
  const w = props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0
  return (
    <div className={`pj-bar pj-bar-${props.tone}`}>
      <span className="pj-bar-label">{props.label}</span>
      <span className="pj-bar-track">
        <span style={{ width: `${w}%` }} />
      </span>
      <span className="pj-bar-val mono">{pct(props.value, 1)}</span>
    </div>
  )
}
