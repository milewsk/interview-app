import { LANGS } from '../content/types'
import { useI18n } from '../i18n/context'
import { LANG_NAMES } from '../i18n/messages'

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('lang.label')} className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          title={LANG_NAMES[code]}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${
            lang === code
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
