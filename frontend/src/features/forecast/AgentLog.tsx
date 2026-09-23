// E. Журнал агента: режим, степпер из 6 этапов, лента реальных шагов из ответа бэкенда, выгрузка JSON.
// Во время запроса прогресс по этапам не выдумываем: все этапы в состоянии «агент работает», шаги — после ответа.

import { useState } from 'react'
import { Bot, Check, ChevronDown, CircleCheck, CircleX, Info, RotateCcw, Wrench, X } from 'lucide-react'
import type { AgentStep, Forecast, Mode } from '../../api/types'
import { Badge, Spinner } from '../../components/ui'
import { dateRu, ms } from '../../lib/format'
import { prettyMaybeJson, stageStatus, STAGES, toolInfo } from '../../lib/steps'
import { prettyDates } from './model'

type LogState = 'idle' | 'running' | 'ready'

export function AgentLog(props: {
  f: Forecast | null
  visibleSteps: AgentStep[] // шаги, уже «проигранные» анимацией
  replaying: boolean
  running: boolean
  elapsed: number
  metaMode: Mode
  llmModel: string | null
  issueDate: string
  requestMs: number | null
}) {
  const { f, visibleSteps, running } = props
  const state: LogState = running ? 'running' : f ? 'ready' : 'idle'
  const steps = state === 'ready' ? visibleSteps : []
  const total = f?.steps ?? []
  const sumMs = total.reduce((a, s) => a + (s.ms || 0), 0)

  return (
    <section className="card fc-log" aria-label="Журнал агента">
      <div className="fc-log-head">
        <h2 className="card-title">Журнал агента</h2>
        <ModeBadge f={state === 'ready' ? f : null} metaMode={props.metaMode} llmModel={props.llmModel} />
      </div>

      <Stepper steps={steps} running={running} />

      <div className="fc-log-body">
        {state === 'idle' && (
          <p className="fc-log-empty">Агент ждёт задачу. Здесь появятся его шаги и вызовы инструментов.</p>
        )}
        {state === 'running' && (
          <div className="fc-log-running">
            <Spinner label={`Агент работает · идёт ${props.elapsed} с`} />
            <p className="muted small">
              Журнал придёт целиком вместе с ответом сервера — шаги покажем в том порядке, в каком их выполнил агент.
            </p>
          </div>
        )}
        {state === 'ready' && (
          <ol className="fc-steps">
            {steps.map((s, i) => (
              <StepRow key={`${f?.issue_date}-${i}`} step={s} index={i} repeated={isRepeat(total, i)} />
            ))}
          </ol>
        )}
      </div>

      {state === 'ready' && f && (
        <div className="fc-log-foot">
          <div className="fc-log-total">
            {props.replaying ? (
              <span className="muted">Шаг {steps.length} из {total.length}…</span>
            ) : (
              <>
                <CircleCheck size={14} aria-hidden /> Готово · {total.length} {plural(total.length)}
                {sumMs > 0 ? ` · ${ms(sumMs)}` : props.requestMs != null ? ` · ответ за ${ms(props.requestMs)}` : ''}
              </>
            )}
          </div>
          {sumMs === 0 && total.length > 0 && (
            <p className="fc-log-note">Длительность отдельных шагов не измерялась.</p>
          )}
        </div>
      )}
      {state === 'idle' && (
        <div className="fc-log-foot">
          <span className="muted small">Выпуск {dateRu(props.issueDate)}, 23:59 · прогноза ещё нет</span>
        </div>
      )}
    </section>
  )
}

function ModeBadge(props: { f: Forecast | null; metaMode: Mode; llmModel: string | null }) {
  const { f } = props
  if (!f) {
    return (
      <Badge tone="neutral" title="Режим сервера. У каждого прогноза режим указан отдельно.">
        {props.metaMode === 'live' ? 'LIVE' : 'Режим проверки'}
      </Badge>
    )
  }
  if (f.mode === 'live' && f.fallback) {
    return (
      <Badge tone="warn" title="LLM не завершила цикл в этом прогоне, дальше работал детерминированный планировщик">
        <span className="dot" /> LIVE · резерв: планировщик
      </Badge>
    )
  }
  if (f.mode === 'live') {
    return (
      <Badge tone="live" title="Решения о шагах принимала LLM через вызовы инструментов. Числа считает код.">
        <span className="dot" /> LIVE · LLM{props.llmModel ? `: ${props.llmModel}` : ''}
      </Badge>
    )
  }
  return (
    <Badge tone="demo" title="Тот же цикл прошёл детерминированный планировщик. Погода, модель и расчёты — настоящие.">
      <span className="dot" /> Режим проверки (без ключа)
    </Badge>
  )
}

function Stepper(props: { steps: AgentStep[]; running: boolean }) {
  return (
    <ol className="fc-stepper" aria-label="Этапы агентного цикла">
      {STAGES.map((stage) => {
        const st = props.running ? 'running' : stageStatus(props.steps, stage)
        const stageMs = props.steps
          .filter((s) => s.type === 'tool' && (toolInfo(s.name).stage === stage || (stage === 'Прогноз' && s.name === 'run_forecast')))
          .reduce((a, s) => a + (s.ms || 0), 0)
        const label = { ok: 'готово', error: 'ошибка', pending: 'ожидает', running: 'агент работает' }[st]
        return (
          <li key={stage} className={`fc-stage fc-stage-${st}`} title={`${stage}: ${label}`}>
            <span className={`fc-stage-dot ${st === 'running' ? 'pulse' : ''}`} aria-hidden>
              {st === 'ok' && <Check size={12} strokeWidth={3} />}
              {st === 'error' && <X size={12} strokeWidth={3} />}
            </span>
            <span className="fc-stage-name">{stage}</span>
            <span className="fc-stage-ms mono">{st === 'ok' && stageMs > 0 ? ms(stageMs) : ' '}</span>
            <span className="fc-sr-only">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Шаг инструмента ушёл на более ранний этап, чем уже пройденный, — возврат в цикле (напр. повторная погода). */
function isRepeat(steps: AgentStep[], index: number): boolean {
  const order = (s: AgentStep) => {
    if (s.type !== 'tool') return -1
    const st = toolInfo(s.name).stage
    return st ? STAGES.indexOf(st) : -1
  }
  const cur = order(steps[index])
  if (cur < 0) return false
  return steps.slice(0, index).some((s) => order(s) > cur)
}

function StepRow(props: { step: AgentStep; index: number; repeated: boolean }) {
  const { step } = props
  const [open, setOpen] = useState(false)

  if (step.type === 'model') {
    const isLlm = step.source != null // ход LLM (live / cache); без source — служебная запись бэкенда
    const text = step.content?.trim()
    const calls = step.tool_calls?.length ? `вызывает ${step.tool_calls.join(', ')}` : ''
    return (
      <li className={`fc-step fc-step-model ${isLlm ? '' : 'fc-step-service'}`}>
        <div className="fc-step-line">
          <span className="fc-step-icon">{isLlm ? <Bot size={14} /> : <Info size={14} />}</span>
          <span className="fc-step-text">
            {isLlm ? (
              <>
                <b>{step.source === 'cache' ? 'LLM (записанный ответ):' : 'LLM:'}</b> {text ? prettyDates(text) : calls || '—'}
                {text && calls && <span className="fc-step-calls mono"> → {step.tool_calls?.join(', ')}</span>}
              </>
            ) : (
              text || 'Служебная запись'
            )}
          </span>
          {step.ms > 0 && <span className="fc-step-ms mono">{ms(step.ms)}</span>}
        </div>
      </li>
    )
  }

  const info = toolInfo(step.name)
  const failed = step.ok === false
  const args = prettyMaybeJson(step.arguments)
  const out = prettyMaybeJson(step.output)
  const expandable = Boolean(args || out)
  const id = `fc-step-${props.index}`

  return (
    <li className={`fc-step ${failed ? 'fc-step-failed' : ''}`}>
      <button
        type="button"
        className="fc-step-line fc-step-btn"
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? id : undefined}
        disabled={!expandable}
      >
        <span className="fc-step-icon">{failed ? <CircleX size={14} /> : <Wrench size={14} />}</span>
        <span className="fc-step-text">
          <span className="fc-step-label">
            {info.label}
            {props.repeated && (
              <span className="fc-step-repeat" title="Возврат к более раннему этапу цикла">
                <RotateCcw size={11} /> повтор
              </span>
            )}
          </span>
          <span className="fc-step-name mono">{step.name ?? '—'}</span>
        </span>
        <span className="fc-step-meta">
          {step.ms > 0 && <span className="mono">{ms(step.ms)}</span>}
          <span className={failed ? 'fc-st-err' : 'fc-st-ok'}>{failed ? 'ошибка' : 'ok'}</span>
          {expandable && <ChevronDown size={14} className={`fc-chev ${open ? 'fc-chev-open' : ''}`} aria-hidden />}
        </span>
      </button>
      {open && (
        <div className="fc-step-detail" id={id}>
          {args && (
            <>
              <div className="eyebrow">Аргументы</div>
              <pre className="fc-pre mono">{args}</pre>
            </>
          )}
          {out && (
            <>
              <div className="eyebrow">Результат</div>
              <pre className="fc-pre mono">{out}</pre>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function plural(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'шаг'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'шага'
  return 'шагов'
}
