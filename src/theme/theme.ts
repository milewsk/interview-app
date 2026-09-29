import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/** Must match the inline script in index.html, which applies the theme before React loads. */
export const THEME_STORAGE_KEY = 'interview-app:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

/**
 * Current theme and a toggle. Follows the system preference until the user
 * picks a theme explicitly; the choice is then remembered in localStorage.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY)
    if (!query) return
    const onChange = () => {
      if (!storedTheme()) setTheme(systemTheme())
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Ignore: the theme still applies for this session.
      }
      return next
    })
  }, [])

  return [theme, toggle]
}
