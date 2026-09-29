import { beforeAll, describe, expect, it } from 'vitest'
import { contentTree, LANGS, loadTopic, topicsIn } from '.'
import type { CategoryNode, ContentNode, Localized, ParsedTopic, TopicNode } from './types'

function categoriesIn(node: ContentNode): CategoryNode[] {
  if (node.kind === 'topic') return []
  return [node, ...node.children.flatMap(categoriesIn)]
}

/** Guards the real files in /content, loaded the same way as in the app (metadata eagerly, markdown lazily). */
describe('content folder', () => {
  const topics = topicsIn(contentTree)
  const loaded = new Map<TopicNode, Localized<ParsedTopic>>()

  beforeAll(async () => {
    for (const topic of topics) loaded.set(topic, await loadTopic(topic))
  })

  it('loads topics from nested folders', () => {
    expect(topics.length).toBeGreaterThan(0)
    expect(topics.every((t) => t.path.includes('/'))).toBe(true)
  })

  it('bundles the same title and difficulty as the full markdown', () => {
    for (const topic of topics) {
      for (const [lang, source] of Object.entries(topic.sources)) {
        const parsed = loaded.get(topic)![lang as keyof typeof topic.sources]!
        expect(source.meta, `${topic.path} [${lang}]`).toEqual(
          parsed.difficulty ? { title: parsed.title, difficulty: parsed.difficulty } : { title: parsed.title },
        )
      }
    }
  })

  it('gives every topic a title and at least one question in each available language', () => {
    for (const topic of topics) {
      for (const lang of LANGS) {
        const variant = loaded.get(topic)![lang]
        if (!variant) continue
        expect(variant.title, `${topic.path} [${lang}] title`).not.toBe('')
        expect(variant.questions.length, `${topic.path} [${lang}] questions`).toBeGreaterThan(0)
        for (const q of variant.questions) {
          expect(q.answer, `${topic.path} [${lang}] answer to "${q.question}"`).not.toBe('')
        }
      }
    }
  })

  it('labels every topic and question with a difficulty', () => {
    for (const topic of topics) {
      for (const [lang, variant] of Object.entries(loaded.get(topic)!)) {
        expect(variant.difficulty, `${topic.path} [${lang}] title needs {junior|mid|senior}`).toBeDefined()
        variant.questions.forEach((q, i) => {
          expect(q.difficulty, `${topic.path} [${lang}] question ${i + 1} needs a difficulty`).toBeDefined()
        })
      }
    }
  })

  it('keeps language versions of a topic in sync (difficulty and number of questions)', () => {
    for (const topic of topics) {
      const variants = Object.values(loaded.get(topic)!)
      if (variants.length < 2) continue
      const shape = (v: ParsedTopic) => ({ difficulty: v.difficulty, questions: v.questions.map((q) => q.difficulty) })
      for (const variant of variants.slice(1)) {
        expect(shape(variant), topic.path).toEqual(shape(variants[0]))
      }
    }
  })

  it('has a title in every language for every category', () => {
    for (const category of categoriesIn(contentTree).filter((c) => c !== contentTree)) {
      expect(Object.keys(category.title).sort(), `${category.path}/_meta.json title`).toEqual([...LANGS].sort())
    }
  })
})
