import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { useI18n } from '../i18n/context'

export function ErrorPage() {
  const error = useRouteError()
  const { t } = useI18n()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-2xl font-bold">{notFound ? t('notFound.title') : t('error.title')}</h1>
      {notFound ? <p className="text-slate-600 dark:text-slate-400">{t('notFound.body')}</p> : null}
      <Link to="/" className="inline-block text-sm font-medium text-slate-900 underline dark:text-slate-100">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
