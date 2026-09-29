import { useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { nodeTitle, topicDifficulty } from '../content/tree'
import type { CategoryNode, TopicNode } from '../content/types'
import { useI18n } from '../i18n/context'
import { statusOf, useProgress } from '../progress/store'
import { DifficultyBadge } from './DifficultyBadge'
import { StatusDot } from './StatusBadge'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-sm ${
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`

export function NavTree({ category }: { category: CategoryNode }) {
  return (
    <ul className="space-y-0.5">
      {category.children.map((child) => (
        <li key={child.path}>
          {child.kind === 'category' ? <CategoryItem category={child} /> : <TopicItem topic={child} />}
        </li>
      ))}
    </ul>
  )
}

function TopicItem({ topic }: { topic: TopicNode }) {
  const { lang } = useI18n()
  const progress = useProgress()
  return (
    <div className="flex pl-6">
      <NavLink to={`/${topic.path}`} end className={linkClass}>
        <StatusDot status={statusOf(progress, topic.path)} />
        <span className="min-w-0 flex-1 truncate">{nodeTitle(topic, lang)}</span>
        <DifficultyBadge difficulty={topicDifficulty(topic, lang)} compact />
      </NavLink>
    </div>
  )
}

function CategoryItem({ category }: { category: CategoryNode }) {
  const { lang, t } = useI18n()
  const { pathname } = useLocation()
  const childrenId = useId()
  const title = nodeTitle(category, lang)

  // Expanded while the current page is inside this category; the user can still toggle it.
  const containsCurrent = pathname === `/${category.path}` || pathname.startsWith(`/${category.path}/`)
  const [open, setOpen] = useState(containsCurrent)
  const [prevContainsCurrent, setPrevContainsCurrent] = useState(containsCurrent)
  if (containsCurrent !== prevContainsCurrent) {
    setPrevContainsCurrent(containsCurrent)
    if (containsCurrent) setOpen(true)
  }

  const hasChildren = category.children.length > 0
  return (
    <>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={childrenId}
            aria-label={open ? t('nav.collapse', { title }) : t('nav.expand', { title })}
            onClick={() => setOpen((o) => !o)}
            className="flex size-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}
              fill="currentColor"
            >
              <path d="M6 3.5 10.5 8 6 12.5z" />
            </svg>
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <NavLink to={`/${category.path}`} end className={linkClass}>
          <span className="truncate font-medium">{title}</span>
        </NavLink>
      </div>
      {hasChildren ? (
        <div id={childrenId} hidden={!open} className="ml-3 border-l border-slate-200 pl-1 dark:border-slate-800">
          <NavTree category={category} />
        </div>
      ) : null}
    </>
  )
}
