import { Link } from 'react-router'
import { nodeTitle, topicDifficulty, topicsIn } from '../content/tree'
import type { ContentNode } from '../content/types'
import { useI18n } from '../i18n/context'
import { statusOf, useProgress } from '../progress/store'
import { DifficultyBadge } from './DifficultyBadge'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

/** A card linking to a category (with topic count and progress) or a topic (with its status). */
export function NodeCard({ node }: { node: ContentNode }) {
  const { lang, t } = useI18n()
  const progress = useProgress()
  return (
    <Link
      to={`/${node.path}`}
      className="block h-full space-y-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{nodeTitle(node, lang)}</span>
        {node.kind === 'topic' ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <DifficultyBadge difficulty={topicDifficulty(node, lang)} />
            <StatusBadge status={statusOf(progress, node.path)} />
          </span>
        ) : (
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {t('category.topics', { count: topicsIn(node).length })}
          </span>
        )}
      </div>
      {node.kind === 'category' ? <ProgressBar node={node} /> : null}
    </Link>
  )
}
