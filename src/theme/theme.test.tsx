import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { THEME_STORAGE_KEY } from './theme'

function mockSystemDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderToggle() {
  render(
    <LanguageProvider lang="en">
      <ThemeToggle />
    </LanguageProvider>,
  )
}

const isDark = () => document.documentElement.classList.contains('dark')

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('follows the system preference when nothing is stored', () => {
    mockSystemDark(true)
    renderToggle()
    expect(isDark()).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeTruthy()
  })

  it('prefers the stored choice over the system preference', () => {
    mockSystemDark(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    renderToggle()
    expect(isDark()).toBe(false)
  })

  it('toggles the theme and remembers the choice', async () => {
    mockSystemDark(false)
    const user = userEvent.setup()
    renderToggle()
    expect(isDark()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(isDark()).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(isDark()).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
