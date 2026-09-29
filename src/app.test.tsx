import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildTreeFromRaw } from './content/fromRaw'
import type { Lang } from './content/types'
import { LanguageProvider } from './i18n/LanguageProvider'
import { reloadProgress } from './progress/store'
import { createRoutes } from './routes'

const tree = buildTreeFromRaw({
  '/content/react/_meta.json': JSON.stringify({ title: { pl: 'React', en: 'React' } }),
  '/content/react/hooks/_meta.json': JSON.stringify({ title: { pl: 'Hooki', en: 'Hooks' } }),
  '/content/react/hooks/use-effect.pl.md':
    '# useEffect PL\n\nEfekty uboczne.\n\n## Pytania\n\n### Kiedy działa?\n\nPo renderze.\n',
  '/content/react/hooks/use-effect.en.md':
    '# useEffect {mid}\n\nSide effects.\n\n## Questions\n\n### When does it run? {senior}\n\nAfter render.\n',
  '/content/react/hooks/use-state.en.md': '# useState\n\nState.',
})

function renderApp(path: string, lang: Lang = 'en') {
  const router = createMemoryRouter(createRoutes(tree), { initialEntries: [path] })
  render(
    <LanguageProvider lang={lang}>
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
  return router
}

beforeEach(() => {
  localStorage.clear()
  reloadProgress()
})

describe('app', () => {
  it('lists top-level categories with topic counts on the home page', async () => {
    renderApp('/', 'pl')
    const main = await screen.findByRole('main')
    expect(within(main).getByRole('link', { name: /React/ }).textContent).toContain('2 zagadnienia')
  })

  it('resolves arbitrarily nested category paths', async () => {
    renderApp('/react/hooks')
    const main = await screen.findByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('Hooks')
    expect(within(main).getByRole('link', { name: /useEffect/ })).toBeTruthy()
    expect(within(main).getByRole('link', { name: /useState/ })).toBeTruthy()
  })

  it('renders a topic with hidden answers that can be revealed', async () => {
    const user = userEvent.setup()
    renderApp('/react/hooks/use-effect')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('useEffect')
    expect(screen.getByText('Side effects.')).toBeTruthy()

    const answer = screen.getByText('After render.').closest('[hidden]')
    expect(answer).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show answer' }))
    expect(screen.getByText('After render.').closest('[hidden]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Hide answer' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('updates category progress when a topic is marked as mastered', async () => {
    const user = userEvent.setup()
    const router = renderApp('/react/hooks/use-effect')
    await user.click(await screen.findByRole('button', { name: 'Mastered' }))
    expect(screen.getByRole('button', { name: 'Mastered' }).getAttribute('aria-pressed')).toBe('true')

    await act(() => router.navigate('/react'))
    const bar = await screen.findAllByRole('progressbar')
    expect(bar[0].getAttribute('aria-valuetext')).toBe('Mastered 1 of 2')
  })

  it('shows difficulty labels on the topic, its questions, cards and the sidebar', async () => {
    const router = renderApp('/react/hooks/use-effect')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('useEffect')
    const main = screen.getByRole('main')
    expect(within(main).getByLabelText('Level: Mid')).toBeTruthy()
    expect(within(main).getByLabelText('Level: Senior')).toBeTruthy()
    expect(within(screen.getByRole('complementary')).getByLabelText('Level: Mid').textContent).toBe('M')

    await act(() => router.navigate('/react/hooks'))
    const card = await within(screen.getByRole('main')).findByRole('link', { name: /useEffect/ })
    expect(within(card).getByLabelText('Level: Mid').textContent).toBe('Mid')
  })

  it('falls back to another language and says so', async () => {
    renderApp('/react/hooks/use-state', 'pl')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('useState')
    expect(screen.getByRole('note').textContent).toContain('English')
  })

  it('switches the UI and content language', async () => {
    const user = userEvent.setup()
    renderApp('/react/hooks/use-effect', 'en')
    await screen.findByText('Side effects.')
    await user.click(screen.getByRole('button', { name: 'pl' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('useEffect PL')
    expect(screen.getByRole('button', { name: 'Pokaż odpowiedź' })).toBeTruthy()
  })

  it('shows a 404 page inside the layout for unknown paths', async () => {
    renderApp('/react/nope/deeper')
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Page not found')
    expect(screen.getByRole('banner')).toBeTruthy()
  })
})
