import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { buildTreeFromRaw } from '../content/fromRaw'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { createRoutes } from '../routes'

const tree = buildTreeFromRaw({
  '/content/react/_meta.json': JSON.stringify({ title: { pl: 'React', en: 'React' } }),
  '/content/react/hooks/_meta.json': JSON.stringify({ title: { pl: 'Hooki', en: 'Hooks' } }),
  '/content/react/hooks/use-effect.en.md': '# useEffect',
  '/content/javascript/closures.en.md': '# Closures',
})

async function renderNav(path: string) {
  const router = createMemoryRouter(createRoutes(tree), { initialEntries: [path] })
  render(
    <LanguageProvider lang="en">
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
  const nav = within(await screen.findByRole('complementary'))
  return { router, nav }
}

describe('NavTree', () => {
  it('starts with categories collapsed on the home page', async () => {
    const { nav } = await renderNav('/')
    expect(nav.getByRole('link', { name: 'React' })).toBeTruthy()
    expect(nav.queryByRole('link', { name: 'Hooks' })).toBeNull()
    expect(nav.getByRole('button', { name: 'Expand React' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('expands and collapses subcategories with the toggle', async () => {
    const user = userEvent.setup()
    const { nav } = await renderNav('/')

    await user.click(nav.getByRole('button', { name: 'Expand React' }))
    await user.click(nav.getByRole('button', { name: 'Expand Hooks' }))
    expect(nav.getByRole('link', { name: /useEffect/ })).toBeTruthy()

    await user.click(nav.getByRole('button', { name: 'Collapse React' }))
    expect(nav.queryByRole('link', { name: 'Hooks' })).toBeNull()
    expect(nav.queryByRole('link', { name: /useEffect/ })).toBeNull()
  })

  it('expands the path to the current page, including after navigation', async () => {
    const { router, nav } = await renderNav('/react/hooks/use-effect')
    expect(nav.getByRole('link', { name: /useEffect/ }).getAttribute('aria-current')).toBe('page')
    expect(nav.queryByRole('link', { name: /Closures/ })).toBeNull()

    await act(() => router.navigate('/javascript/closures'))
    expect(nav.getByRole('link', { name: /Closures/ })).toBeTruthy()
    // Previously expanded categories stay open.
    expect(nav.getByRole('link', { name: /useEffect/ })).toBeTruthy()
  })
})
