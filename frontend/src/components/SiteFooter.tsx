// Подвал: проект сделан в рамках хакатона HackAlem AI + организаторы и партнёры хакатона.
// Логотипы и их порядок — блок «Организаторы и партнёры» с https://hackalem.ai/ (скачаны 23.09.2026 в public/partners/),
// используются только для указания организаторов. Если картинка не загрузилась — показываем название текстом.

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import './SiteFooter.css'

type Partner = { name: string; file: string; h: number; mono?: 'invert' }

// h — высота логотипа в px: у знаков разные пропорции, подбираем визуально равный вес (как на лендинге)
const PARTNERS: Partner[] = [
  { name: 'Министерство искусственного интеллекта и цифрового развития РК', file: 'ai-digital-ministry.svg', h: 30 },
  // у MNVO внутри есть тёмные детали: вместо заливки в один цвет — инверсия в светлой теме
  { name: 'Министерство науки и высшего образования РК', file: 'mnvo.svg', h: 30, mono: 'invert' },
  { name: 'Astana Hub', file: 'astana-hub.svg', h: 28 },
  { name: 'Silkroad Innovation Hub', file: 'silkroad.svg', h: 30 },
  { name: 'OpenAI', file: 'openai.svg', h: 26 },
  { name: 'AI & Digital Bridge', file: 'digital-bridge.svg', h: 34 },
  { name: 'BAITC', file: 'baitc.svg', h: 24 },
  { name: 'NVIDIA', file: 'nvidia.png', h: 26 },
  { name: 'Arizona State University', file: 'asu.svg', h: 52 },
  { name: 'Palo Alto Networks', file: 'paloalto.svg', h: 26 },
]

function Logo(props: { p: Partner; hidden?: boolean }) {
  const [failed, setFailed] = useState(false)
  const { p } = props
  return (
    <li className="sf-logo" aria-hidden={props.hidden || undefined} title={p.name}>
      {failed ? (
        <span className="sf-logo-text">{p.name}</span>
      ) : (
        <img
          src={`/partners/${p.file}`}
          alt={props.hidden ? '' : p.name}
          style={{ height: p.h }}
          className={p.mono === 'invert' ? 'sf-img sf-img-invert' : 'sf-img'}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </li>
  )
}

export function SiteFooter() {
  return (
    <footer className="sf" aria-labelledby="sf-title">
      <div className="sf-glow" aria-hidden />

      <div className="sf-top">
        <a className="sf-event" href="https://hackalem.ai/" target="_blank" rel="noopener noreferrer" title="HackAlem AI — официальный сайт хакатона">
          <img src="/partners/hackalem.svg" alt="HackAlem AI" className="sf-event-logo" />
        </a>

        <div className="sf-claim">
          <div className="eyebrow">Alem OpenAI Hackathon · Астана, EXPO · 23.09.2026</div>
          <h2 id="sf-title" className="sf-title">
            Проект создан в рамках хакатона <span className="sf-accent">HackAlem AI</span>
          </h2>
          <p className="sf-sub">
            <b>Анемо</b> — агентный прогноз почасовой выработки ветроэлектростанции · команда <b>KU group</b> · трек
            «Энергетика»
          </p>
        </div>

        <a className="btn btn-sm sf-site" href="https://hackalem.ai/" target="_blank" rel="noopener noreferrer">
          hackalem.ai <ExternalLink size={14} aria-hidden />
        </a>
      </div>

      <div className="sf-partners">
        <div className="sf-partners-head">
          <span className="eyebrow">Организаторы и партнёры</span>
          <span className="sf-line" aria-hidden />
        </div>

        {/* бегущая лента: второй экземпляр списка — для бесшовной прокрутки, скрыт от скринридеров */}
        <div className="sf-marquee">
          <div className="sf-track">
            <ul className="sf-list" aria-label="Организаторы и партнёры хакатона">
              {PARTNERS.map((p) => (
                <Logo key={p.file} p={p} />
              ))}
            </ul>
            <ul className="sf-list sf-list-clone" aria-hidden>
              {PARTNERS.map((p) => (
                <Logo key={p.file} p={p} hidden />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="sf-bottom">
        <span>Погода: Open-Meteo Previous Runs API (CC BY 4.0)</span>
        <span aria-hidden>·</span>
        <span>данные турбин — организатор хакатона</span>
        <span aria-hidden>·</span>
        <span>логотипы — hackalem.ai, указаны как организаторы и партнёры хакатона</span>
      </div>
    </footer>
  )
}
