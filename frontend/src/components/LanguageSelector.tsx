// Переключатель языка интерфейса: ҚАЗ / РУС / ENG. Выбор сохраняется (localStorage 'lang').

import { LOCALES, useT } from '../i18n'

export function LanguageSelector() {
  const { locale, setLocale, t } = useT()
  return (
    <div className="segmented segmented-sm" role="group" aria-label={t('app.language.label')}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          aria-pressed={locale === l.id}
          title={l.name}
          onClick={() => setLocale(l.id)}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}
