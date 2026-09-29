import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useI18n } from './context'
import { LANG_STORAGE_KEY, LanguageProvider } from './LanguageProvider'
import { translate } from './messages'

describe('translate', () => {
  it('interpolates params', () => {
    expect(translate('en', 'progress.summary', { mastered: 2, total: 5 })).toBe('Mastered 2 of 5')
  })

  it('uses Polish plural forms', () => {
    expect(translate('pl', 'category.topics', { count: 1 })).toBe('1 zagadnienie')
    expect(translate('pl', 'category.topics', { count: 3 })).toBe('3 zagadnienia')
    expect(translate('pl', 'category.topics', { count: 5 })).toBe('5 zagadnień')
    expect(translate('pl', 'category.topics', { count: 22 })).toBe('22 zagadnienia')
    expect(translate('pl', 'category.topics', { count: 0 })).toBe('0 zagadnień')
  })

  it('uses English plural forms', () => {
    expect(translate('en', 'category.topics', { count: 1 })).toBe('1 topic')
    expect(translate('en', 'category.topics', { count: 2 })).toBe('2 topics')
  })
})

function Probe() {
  const { lang, setLang, t } = useI18n()
  return (
    <button onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}>
      {lang}:{t('nav.home')}
    </button>
  )
}

describe('LanguageProvider', () => {
  beforeEach(() => localStorage.clear())

  it('restores the stored language and persists changes', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'pl')
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('pl:Start')
    expect(document.documentElement.lang).toBe('pl')

    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button').textContent).toBe('en:Home')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
