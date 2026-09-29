import { useId, useState } from 'react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { InlineMarkdown, Markdown } from '../components/Markdown'
import { StatusPicker } from '../components/StatusBadge'
import { pickLocalized } from '../content/tree'
import type { CategoryNode, Localized, ParsedTopic, Question, TopicNode } from '../content/types'
import { useI18n } from '../i18n/context'
import { LANG_NAMES } from '../i18n/messages'

export function TopicPage({
  tree,
  topic,
  content: variants,
}: {
  tree: CategoryNode
  topic: TopicNode
  content: Localized<ParsedTopic>
}) {
  const { lang, t } = useI18n()
  const picked = pickLocalized(variants, lang)
  if (!picked) return null
  const { value: content, isFallback } = picked

  return (
    <article className="space-y-6" lang={picked.lang}>
      <Breadcrumbs tree={tree} path={topic.path} />
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
          <DifficultyBadge difficulty={content.difficulty} />
        </div>
        <StatusPicker path={topic.path} />
        {isFallback ? (
          <p role="note" lang={lang} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
            {t('topic.fallback', { lang: LANG_NAMES[picked.lang] })}
          </p>
        ) : null}
      </header>

      {content.body ? <Markdown>{content.body}</Markdown> : null}

      {content.questions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold" lang={lang}>
            {t('topic.questions')}
          </h2>
          <ol className="space-y-3">
            {content.questions.map((question, i) => (
              <QuestionItem key={i} index={i + 1} question={question} />
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  )
}

function QuestionItem({ index, question }: { index: number; question: Question }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const answerId = useId()
  return (
    <li className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 font-medium">
          <span className="mr-2 text-slate-400 dark:text-slate-500">{index}.</span>
          <InlineMarkdown>{question.question}</InlineMarkdown>
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <DifficultyBadge difficulty={question.difficulty} />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={answerId}
            onClick={() => setOpen((o) => !o)}
            className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {open ? t('topic.hideAnswer') : t('topic.showAnswer')}
          </button>
        </div>
      </div>
      <div id={answerId} hidden={!open} className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Markdown>{question.answer}</Markdown>
      </div>
    </li>
  )
}
