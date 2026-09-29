import { Breadcrumbs } from '../components/Breadcrumbs'
import { NodeCard } from '../components/NodeCard'
import { ProgressBar } from '../components/ProgressBar'
import { nodeTitle } from '../content/tree'
import type { CategoryNode } from '../content/types'
import { useI18n } from '../i18n/context'

export function CategoryPage({ tree, category }: { tree: CategoryNode; category: CategoryNode }) {
  const { lang, t } = useI18n()
  return (
    <div className="space-y-6">
      <Breadcrumbs tree={tree} path={category.path} />
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{nodeTitle(category, lang)}</h1>
        <div className="max-w-sm">
          <ProgressBar node={category} />
        </div>
      </div>
      {category.children.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">{t('category.empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {category.children.map((child) => (
            <li key={child.path}>
              <NodeCard node={child} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
