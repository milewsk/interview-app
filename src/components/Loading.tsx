import { useNavigation } from 'react-router'
import { useI18n } from '../i18n/context'

/** Full-page placeholder shown while the first route (e.g. a deep link to a topic) loads. */
export function PageLoading() {
  const { t } = useI18n()
  return (
    <div role="status" className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
      {t('loading')}
    </div>
  )
}

/** Thin bar at the top of the page while a navigation is loading a topic. */
export function NavigationProgress() {
  const { t } = useI18n()
  const navigation = useNavigation()
  if (navigation.state === 'idle') return null
  return (
    <div
      role="progressbar"
      aria-label={t('loading')}
      className="fixed inset-x-0 top-0 z-20 h-0.5 animate-pulse bg-violet-500"
    />
  )
}
