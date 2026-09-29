import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildTreeFromRaw } from '../content/fromRaw'
import { findNode } from '../content/tree'
import {
  PROGRESS_STORAGE_KEY,
  reloadProgress,
  setStatus,
  summarize,
  useProgressSummary,
  useTopicStatus,
} from './store'

const tree = buildTreeFromRaw({
  '/content/react/hooks/use-effect.en.md': '# useEffect',
  '/content/react/hooks/use-state.en.md': '# useState',
  '/content/react/components.en.md': '# Components',
})
const react = findNode(tree, 'react')!

beforeEach(() => {
  localStorage.clear()
  reloadProgress()
})

describe('progress store', () => {
  it('treats unknown topics as new and aggregates recursively', () => {
    setStatus('react/hooks/use-effect', 'mastered')
    setStatus('react/components', 'review')
    expect(summarize(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)!), react)).toEqual({
      total: 3,
      new: 1,
      review: 1,
      mastered: 1,
    })
  })

  it('removes the entry when a topic goes back to new', () => {
    setStatus('react/components', 'review')
    setStatus('react/components', 'new')
    expect(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)!)).toEqual({})
  })

  it('ignores corrupted storage', () => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, '{"a":"bogus","b":"mastered"')
    reloadProgress()
    localStorage.setItem(PROGRESS_STORAGE_KEY, '{"a":"bogus","b":"mastered"}')
    reloadProgress()
    setStatus('c', 'review')
    expect(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)!)).toEqual({ b: 'mastered', c: 'review' })
  })
})

function Topic() {
  const [status, setTopicStatus] = useTopicStatus('react/hooks/use-state')
  return <button onClick={() => setTopicStatus('mastered')}>{status}</button>
}

function Category() {
  const summary = useProgressSummary(react)
  return (
    <output>
      {summary.mastered}/{summary.total}
    </output>
  )
}

describe('progress hooks', () => {
  it('updates category aggregates when a topic status changes', () => {
    render(
      <>
        <Topic />
        <Category />
      </>,
    )
    expect(screen.getByRole('button').textContent).toBe('new')
    expect(screen.getByRole('status').textContent).toBe('0/3')

    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button').textContent).toBe('mastered')
    expect(screen.getByRole('status').textContent).toBe('1/3')
  })

  it('picks up changes made in another tab', () => {
    render(<Category />)
    act(() => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ 'react/components': 'mastered' }))
      window.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_STORAGE_KEY }))
    })
    expect(screen.getByRole('status').textContent).toBe('1/3')
  })
})
