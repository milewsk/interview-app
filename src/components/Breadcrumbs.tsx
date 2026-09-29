import { Link } from 'react-router'
import { ancestry, nodeTitle } from '../content/tree'
import type { CategoryNode } from '../content/types'
import { useI18n } from '../i18n/context'

const linkClass = 'hover:text-slate-900 dark:hover:text-slate-100'

export function Breadcrumbs({ tree, path }: { tree: CategoryNode; path: string }) {
  const { lang, t } = useI18n()
  const trail = ancestry(tree, path)
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link to="/" className={linkClass}>
            {t('nav.home')}
          </Link>
        </li>
        {trail.map((node, i) => (
          <li key={node.path} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-slate-900 dark:text-slate-100">
                {nodeTitle(node, lang)}
              </span>
            ) : (
              <Link to={`/${node.path}`} className={linkClass}>
                {nodeTitle(node, lang)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
