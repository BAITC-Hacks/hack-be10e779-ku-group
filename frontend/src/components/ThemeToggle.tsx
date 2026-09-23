// Переключатель темы: светлая / тёмная / как в системе.

import { Monitor, Moon, Sun } from 'lucide-react'
import { useT } from '../i18n'
import type { ThemeMode } from '../lib/themeManager'

const MODES: { id: ThemeMode; icon: typeof Sun }[] = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
]

export function ThemeToggle(props: { mode: ThemeMode; onChange: (m: ThemeMode) => void }) {
  const { t } = useT()
  return (
    <div className="segmented segmented-sm" role="group" aria-label={t('app.theme.label')}>
      {MODES.map(({ id, icon: Icon }) => {
        const label = t(`app.theme.${id}`)
        return (
          <button key={id} type="button" aria-pressed={props.mode === id} aria-label={label} title={label} onClick={() => props.onChange(id)}>
            <Icon size={15} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
