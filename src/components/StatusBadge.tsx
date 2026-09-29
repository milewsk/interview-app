import { useI18n } from '../i18n/context'
import { STATUSES, useTopicStatus, type Status } from '../progress/store'

const STATUS_STYLES: Record<Status, { dot: string; badge: string }> = {
  new: {
    dot: 'bg-slate-300 dark:bg-slate-600',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  review: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  },
  mastered: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  },
}

export function StatusDot({ status }: { status: Status }) {
  const { t } = useI18n()
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_STYLES[status].dot}`}
      title={t(`status.${status}`)}
    />
  )
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useI18n()
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status].badge}`}>
      {t(`status.${status}`)}
    </span>
  )
}

export function StatusPicker({ path }: { path: string }) {
  const { t } = useI18n()
  const [current, setStatus] = useTopicStatus(path)
  return (
    <div role="group" aria-label={t('status.label')} className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={current === status}
          onClick={() => setStatus(status)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            current === status ? STATUS_STYLES[status].badge + ' font-medium' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          {t(`status.${status}`)}
        </button>
      ))}
    </div>
  )
}
