import { Link, Outlet } from 'react-router'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { NavigationProgress } from '../components/Loading'
import { NavTree } from '../components/NavTree'
import { ThemeToggle } from '../components/ThemeToggle'
import type { CategoryNode } from '../content/types'
import { useI18n } from '../i18n/context'

export function Layout({ tree }: { tree: CategoryNode }) {
  const { t } = useI18n()
  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <NavigationProgress />
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            {t('appTitle')}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[16rem_1fr]">
        <aside aria-label={t('nav.label')} className="md:sticky md:top-20 md:self-start">
          <nav className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-2 md:max-h-[calc(100vh-7rem)] md:border-0 md:p-0 dark:border-slate-800">
            <NavTree category={tree} />
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
