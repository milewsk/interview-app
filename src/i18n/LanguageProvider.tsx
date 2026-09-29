import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LANGS, type Lang } from '../content/types'
import { I18nContext, type I18nContextValue } from './context'
import { translate } from './messages'

export const LANG_STORAGE_KEY = 'interview-app:lang'

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // Storage can be unavailable (e.g. privacy mode); fall through to the browser language.
  }
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en'
}

export function LanguageProvider({ children, lang: forcedLang }: { children: ReactNode; lang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => forcedLang ?? initialLang())

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // Ignore: the choice still applies for this session.
    }
  }, [])

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
