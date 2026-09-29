import { NodeCard } from '../components/NodeCard'
import type { CategoryNode } from '../content/types'
import { useI18n } from '../i18n/context'

export function HomePage({ tree }: { tree: CategoryNode }) {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('home.title')}</h1>
        <p className="text-slate-600 dark:text-slate-400">{t('home.intro')}</p>
      </div>
      {tree.children.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">{t('home.empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tree.children.map((child) => (
            <li key={child.path}>
              <NodeCard node={child} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
