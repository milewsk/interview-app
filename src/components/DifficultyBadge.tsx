import type { Difficulty } from '../content/types'
import { useI18n } from '../i18n/context'

const STYLES: Record<Difficulty, string> = {
  junior: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300',
  mid: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300',
  senior: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300',
}

/** Difficulty label; `compact` shows only the first letter (for the sidebar). */
export function DifficultyBadge({ difficulty, compact = false }: { difficulty?: Difficulty; compact?: boolean }) {
  const { t } = useI18n()
  if (!difficulty) return null
  const name = t(`difficulty.${difficulty}`)
  return (
    <span
      title={`${t('difficulty.label')}: ${name}`}
      aria-label={`${t('difficulty.label')}: ${name}`}
      className={`inline-flex shrink-0 items-center rounded border font-medium ${STYLES[difficulty]} ${
        compact ? 'px-1 text-[10px] leading-4' : 'px-1.5 py-0.5 text-xs'
      }`}
    >
      {compact ? name[0] : name}
    </span>
  )
}
