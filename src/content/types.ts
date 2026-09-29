export const LANGS = ['pl', 'en'] as const
export type Lang = (typeof LANGS)[number]

export type Localized<T> = Partial<Record<Lang, T>>

export const DIFFICULTIES = ['junior', 'mid', 'senior'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface Question {
  /** Question text as inline markdown (without the leading `###` and the difficulty label). */
  question: string
  /** Answer as markdown. */
  answer: string
  difficulty?: Difficulty
}

export interface ParsedTopic {
  title: string
  difficulty?: Difficulty
  /** Note body as markdown, without the H1 and without the questions section. */
  body: string
  questions: Question[]
}

/** What is known about a topic without loading its markdown (bundled eagerly). */
export interface TopicMeta {
  /** Empty when the file has no `# H1`; the tree then falls back to the humanized slug. */
  title: string
  difficulty?: Difficulty
}

export interface TopicSource {
  meta: TopicMeta
  /** Loads the raw markdown (a separate chunk in the production build). */
  load: () => Promise<string>
}

export interface TopicNode {
  kind: 'topic'
  slug: string
  /** Path without leading slash, e.g. `react/hooks/use-effect`. */
  path: string
  sources: Localized<TopicSource>
}

export interface CategoryNode {
  kind: 'category'
  slug: string
  /** Path without leading slash; the root category has an empty path. */
  path: string
  title: Localized<string>
  children: ContentNode[]
}

export type ContentNode = CategoryNode | TopicNode
