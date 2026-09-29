import type { ContentNode } from '../content/types'
import { useI18n } from '../i18n/context'
import { useProgressSummary } from '../progress/store'

export function ProgressBar({ node }: { node: ContentNode }) {
  const { t } = useI18n()
  const summary = useProgressSummary(node)
  const percent = summary.total === 0 ? 0 : Math.round((summary.mastered / summary.total) * 100)
  const reviewPercent = summary.total === 0 ? 0 : Math.round((summary.review / summary.total) * 100)
  const label = t('progress.summary', { mastered: summary.mastered, total: summary.total })

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={t('progress.label')}
        aria-valuemin={0}
        aria-valuemax={summary.total}
        aria-valuenow={summary.mastered}
        aria-valuetext={label}
        className="flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div className="bg-emerald-500" style={{ width: `${percent}%` }} />
        <div className="bg-amber-400" style={{ width: `${reviewPercent}%` }} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
