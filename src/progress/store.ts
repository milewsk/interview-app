import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { topicsIn } from '../content/tree'
import type { ContentNode } from '../content/types'

export const STATUSES = ['new', 'review', 'mastered'] as const
export type Status = (typeof STATUSES)[number]

/** Topic path -> status. Topics without an entry are `new`. Replaced (never mutated) on every write. */
export type ProgressSnapshot = Readonly<Record<string, Status>>

export const PROGRESS_STORAGE_KEY = 'interview-app:progress'

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

function load(): ProgressSnapshot {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, status]) => isStatus(status)))
  } catch {
    return {}
  }
}

let snapshot: ProgressSnapshot = load()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  if (event.key !== PROGRESS_STORAGE_KEY && event.key !== null) return
  snapshot = load()
  emit()
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot() {
  return snapshot
}

export function setStatus(path: string, status: Status) {
  const next = { ...snapshot }
  if (status === 'new') delete next[path]
  else next[path] = status
  snapshot = next
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore: progress still works in memory for this session.
  }
  emit()
}

/** Re-reads progress from storage. Used by tests and after external changes. */
export function reloadProgress() {
  snapshot = load()
  emit()
}

export function statusOf(progress: ProgressSnapshot, path: string): Status {
  return progress[path] ?? 'new'
}

export interface ProgressSummary {
  total: number
  new: number
  review: number
  mastered: number
}

export function summarize(progress: ProgressSnapshot, node: ContentNode): ProgressSummary {
  const summary: ProgressSummary = { total: 0, new: 0, review: 0, mastered: 0 }
  for (const topic of topicsIn(node)) {
    summary.total++
    summary[statusOf(progress, topic.path)]++
  }
  return summary
}

export function useProgress(): ProgressSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useTopicStatus(path: string): [Status, (status: Status) => void] {
  const progress = useProgress()
  const update = useCallback((status: Status) => setStatus(path, status), [path])
  return [statusOf(progress, path), update]
}

export function useProgressSummary(node: ContentNode): ProgressSummary {
  const progress = useProgress()
  return useMemo(() => summarize(progress, node), [progress, node])
}
