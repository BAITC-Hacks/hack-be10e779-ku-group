// Подвал: проект сделан в рамках хакатона HackAlem AI + организаторы и партнёры хакатона.
// Логотипы и их порядок — блок «Организаторы и партнёры» с https://hackalem.ai/ (скачаны 23.09.2026 в public/partners/),
// используются только для указания организаторов. Если картинка не загрузилась — показываем название текстом.

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useT, type TKey } from '../i18n'
import './SiteFooter.css'

// nameKey — у названий, которые переводятся (министерства); компании не переводим
type Partner = { name: string; nameKey?: TKey; file: string; h: number; mono?: 'invert' }

// h — высота логотипа в px: у знаков разные пропорции, подбираем визуально равный вес (как на лендинге)
const PARTNERS: Partner[] = [
  { name: 'Министерство искусственного интеллекта и цифрового развития РК', nameKey: 'footer.ministries.ai', file: 'ai-digital-ministry.svg', h: 30 },
  // у MNVO внутри есть тёмные детали: вместо заливки в один цвет — инверсия в светлой теме
  { name: 'Министерство науки и высшего образования РК', nameKey: 'footer.ministries.science', file: 'mnvo.svg', h: 30, mono: 'invert' },
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
  const { t } = useT()
  const { p } = props
  const name = p.nameKey ? t(p.nameKey) : p.name
  return (
    <li className="sf-logo" aria-hidden={props.hidden || undefined} title={name}>
      {failed ? (
        <span className="sf-logo-text">{name}</span>
      ) : (
        <img
          src={`/partners/${p.file}`}
          alt={props.hidden ? '' : name}
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
  const { t } = useT()
  const titleAfter = t('footer.titleAfter')
  return (
    <footer className="sf" aria-labelledby="sf-title">
      <div className="sf-glow" aria-hidden />

      <div className="sf-top">
        <a className="sf-event" href="https://hackalem.ai/" target="_blank" rel="noopener noreferrer" title={t('footer.eventLinkTitle')}>
          <img src="/partners/hackalem.svg" alt="HackAlem AI" className="sf-event-logo" />
        </a>

        <div className="sf-claim">
          <div className="eyebrow">{t('footer.eyebrow')}</div>
          <h2 id="sf-title" className="sf-title">
            {t('footer.titleBefore')} <span className="sf-accent">HackAlem AI</span>
            {titleAfter && ` ${titleAfter}`}
          </h2>
          <p className="sf-sub">
            <b>{t('app.brand.name')}</b> {t('footer.subBefore')} <b>KU group</b> {t('footer.subAfter')}
          </p>
        </div>

        <a className="btn btn-sm sf-site" href="https://hackalem.ai/" target="_blank" rel="noopener noreferrer">
          hackalem.ai <ExternalLink size={14} aria-hidden />
        </a>
      </div>

      <div className="sf-partners">
        <div className="sf-partners-head">
          <span className="eyebrow">{t('footer.partners')}</span>
          <span className="sf-line" aria-hidden />
        </div>

        {/* бегущая лента: второй экземпляр списка — для бесшовной прокрутки, скрыт от скринридеров */}
        <div className="sf-marquee">
          <div className="sf-track">
            <ul className="sf-list" aria-label={t('footer.partnersAria')}>
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
        <span>{t('footer.weather')}</span>
        <span aria-hidden>·</span>
        <span>{t('footer.turbineData')}</span>
        <span aria-hidden>·</span>
        <span>{t('footer.logos')}</span>
      </div>
    </footer>
  )
}
