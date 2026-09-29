import { describe, expect, it } from 'vitest'
import {
  ancestry,
  findNode,
  humanize,
  loadTopic,
  nodeTitle,
  pickLocalized,
  topicDifficulty,
  topicsIn,
} from './tree'
import { buildTreeFromRaw } from './fromRaw'

const files = {
  '/content/react/_meta.json': JSON.stringify({
    title: { pl: 'React (PL)', en: 'React' },
    order: ['hooks', 'components'],
  }),
  '/content/react/components.en.md': '# Components\n\nText',
  '/content/react/hooks/use-effect.pl.md': '# useEffect PL\n\nTreść',
  '/content/react/hooks/use-effect.en.md': '# useEffect\n\nBody',
  '/content/react/hooks/use-state.en.md': 'No title here',
  '/content/javascript/closures.pl.md': '# Domknięcia',
  '/content/readme.txt': 'ignored',
}

describe('buildTree', () => {
  const tree = buildTreeFromRaw(files)

  it('builds arbitrarily nested categories from folders', () => {
    const node = findNode(tree, 'react/hooks/use-effect')
    expect(node?.kind).toBe('topic')
    expect(findNode(tree, 'react/hooks')?.kind).toBe('category')
    expect(findNode(tree, 'react/nope')).toBeUndefined()
    expect(findNode(tree, 'react/hooks/use-effect/deeper')).toBeUndefined()
  })

  it('merges language variants into one topic and keeps only metadata eagerly', () => {
    const node = findNode(tree, 'react/hooks/use-effect')
    if (node?.kind !== 'topic') throw new Error('expected topic')
    expect(node.sources.pl?.meta).toEqual({ title: 'useEffect PL' })
    expect(nodeTitle(node, 'en')).toBe('useEffect')
  })

  it('loads and parses all language variants on demand, once', async () => {
    const node = findNode(tree, 'react/hooks/use-effect')
    if (node?.kind !== 'topic') throw new Error('expected topic')
    const content = await loadTopic(node)
    expect(content.pl?.body).toBe('Treść')
    expect(content.en?.title).toBe('useEffect')
    expect(loadTopic(node)).toBe(loadTopic(node))
  })

  it('reads the difficulty from metadata without loading the topic', () => {
    const labeled = buildTreeFromRaw({ '/content/a/b.en.md': '# B {senior}' })
    const node = findNode(labeled, 'a/b')
    if (node?.kind !== 'topic') throw new Error('expected topic')
    expect(topicDifficulty(node, 'pl')).toBe('senior')
  })

  it('orders children by _meta order, then alphabetically', () => {
    expect(tree.children.map((c) => c.slug)).toEqual(['javascript', 'react'])
    const react = findNode(tree, 'react')
    if (react?.kind !== 'category') throw new Error('expected category')
    expect(react.children.map((c) => c.slug)).toEqual(['hooks', 'components'])
  })

  it('uses localized category titles with humanized fallback', () => {
    const react = findNode(tree, 'react')!
    expect(nodeTitle(react, 'pl')).toBe('React (PL)')
    expect(nodeTitle(react, 'en')).toBe('React')
    expect(nodeTitle(findNode(tree, 'react/hooks')!, 'pl')).toBe('Hooks')
  })

  it('falls back to the slug when a topic has no H1', () => {
    expect(nodeTitle(findNode(tree, 'react/hooks/use-state')!, 'en')).toBe('Use state')
  })

  it('falls back to another language for topic titles', () => {
    expect(nodeTitle(findNode(tree, 'javascript/closures')!, 'en')).toBe('Domknięcia')
  })

  it('lists topics recursively and builds breadcrumbs', () => {
    expect(topicsIn(findNode(tree, 'react')!).map((t) => t.path)).toEqual([
      'react/hooks/use-effect',
      'react/hooks/use-state',
      'react/components',
    ])
    expect(ancestry(tree, 'react/hooks/use-effect').map((n) => n.slug)).toEqual([
      'react',
      'hooks',
      'use-effect',
    ])
  })
})

describe('pickLocalized', () => {
  it('prefers the requested language and marks fallbacks', () => {
    expect(pickLocalized({ pl: 'a', en: 'b' }, 'en')).toEqual({ value: 'b', lang: 'en', isFallback: false })
    expect(pickLocalized({ pl: 'a' }, 'en')).toEqual({ value: 'a', lang: 'pl', isFallback: true })
    expect(pickLocalized({}, 'en')).toBeUndefined()
  })
})

describe('humanize', () => {
  it('turns slugs into titles', () => {
    expect(humanize('event-loop')).toBe('Event loop')
  })
})
