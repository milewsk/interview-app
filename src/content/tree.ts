import {
  LANGS,
  type CategoryNode,
  type ContentNode,
  type Difficulty,
  type Lang,
  type Localized,
  type ParsedTopic,
  type TopicNode,
  type TopicSource,
} from './types'

interface CategoryMeta {
  title?: Localized<string>
  order?: string[]
}

const TOPIC_FILE = /^(?:(.*)\/)?([^/]+)\.([a-z]{2})\.md$/
const META_FILE = /^(?:(.*)\/)?_meta\.json$/

/** `use-effect` -> `Use effect` */
export function humanize(slug: string): string {
  const text = slug.replace(/[-_]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value)
}

function joinPath(dir: string, slug: string): string {
  return dir ? `${dir}/${slug}` : slug
}

/**
 * Builds the category tree from files keyed by path, as returned by
 * `import.meta.glob` (e.g. `/content/react/hooks/use-effect.en.md`).
 * Folders become categories, `<slug>.<lang>.md` files become topics and
 * `_meta.json` (raw JSON) sets a category's localized title and child order.
 */
export function buildTree(
  categoryMetas: Record<string, string>,
  topics: Record<string, TopicSource>,
  root = '/content/',
): CategoryNode {
  const rootNode: CategoryNode = { kind: 'category', slug: '', path: '', title: {}, children: [] }
  const categories = new Map<string, CategoryNode>([['', rootNode]])
  const metas = new Map<string, CategoryMeta>()

  function category(path: string): CategoryNode {
    const existing = categories.get(path)
    if (existing) return existing
    const slash = path.lastIndexOf('/')
    const parentPath = slash === -1 ? '' : path.slice(0, slash)
    const slug = path.slice(slash + 1)
    const node: CategoryNode = { kind: 'category', slug, path, title: {}, children: [] }
    categories.set(path, node)
    category(parentPath).children.push(node)
    return node
  }

  for (const [key, raw] of Object.entries(categoryMetas)) {
    const meta = key.startsWith(root) && META_FILE.exec(key.slice(root.length))
    if (!meta) continue
    const dir = meta[1] ?? ''
    category(dir)
    metas.set(dir, JSON.parse(raw) as CategoryMeta)
  }

  for (const [key, source] of Object.entries(topics)) {
    if (!key.startsWith(root)) continue
    const relative = key.slice(root.length)
    const topic = TOPIC_FILE.exec(relative)
    if (!topic || !isLang(topic[3])) {
      console.warn(`[content] Skipping unrecognized file: ${key}`)
      continue
    }
    const [, dir = '', slug, lang] = topic
    const parent = category(dir)
    const path = joinPath(dir, slug)
    let node = parent.children.find((c) => c.kind === 'topic' && c.slug === slug)
    if (!node) {
      node = { kind: 'topic', slug, path, sources: {} }
      parent.children.push(node)
    }
    if (node.kind === 'topic') node.sources[lang] = source
  }

  for (const node of categories.values()) {
    const meta = metas.get(node.path) ?? {}
    node.title = meta.title ?? {}
    const order = meta.order ?? []
    const rank = (c: ContentNode) => {
      const i = order.indexOf(c.slug)
      return i === -1 ? order.length : i
    }
    node.children.sort((a, b) => rank(a) - rank(b) || a.slug.localeCompare(b.slug))
  }

  return rootNode
}

export function findNode(root: CategoryNode, path: string): ContentNode | undefined {
  const segments = path.split('/').filter(Boolean)
  let node: ContentNode = root
  for (const segment of segments) {
    if (node.kind !== 'category') return undefined
    const child: ContentNode | undefined = node.children.find((c) => c.slug === segment)
    if (!child) return undefined
    node = child
  }
  return node
}

/** Nodes from the root's first child down to the node at `path` (for breadcrumbs). */
export function ancestry(root: CategoryNode, path: string): ContentNode[] {
  const segments = path.split('/').filter(Boolean)
  return segments
    .map((_, i) => findNode(root, segments.slice(0, i + 1).join('/')))
    .filter((n): n is ContentNode => n !== undefined)
}

export interface Picked<T> {
  value: T
  lang: Lang
  isFallback: boolean
}

/** Picks the value for `lang`, falling back to any other available language. */
export function pickLocalized<T>(values: Localized<T>, lang: Lang): Picked<T> | undefined {
  const own = values[lang]
  if (own !== undefined) return { value: own, lang, isFallback: false }
  for (const other of LANGS) {
    const value = values[other]
    if (value !== undefined) return { value, lang: other, isFallback: true }
  }
  return undefined
}

export function nodeTitle(node: ContentNode, lang: Lang): string {
  const title =
    node.kind === 'category'
      ? pickLocalized(node.title, lang)?.value
      : pickLocalized(node.sources, lang)?.value.meta.title
  return title || humanize(node.slug)
}

/** Difficulty of the topic variant shown in `lang` (with the usual language fallback). */
export function topicDifficulty(topic: TopicNode, lang: Lang): Difficulty | undefined {
  return pickLocalized(topic.sources, lang)?.value.meta.difficulty
}

export function topicsIn(node: ContentNode): TopicNode[] {
  if (node.kind === 'topic') return [node]
  return node.children.flatMap(topicsIn)
}

const loaded = new WeakMap<TopicNode, Promise<Localized<ParsedTopic>>>()

async function parseAll(topic: TopicNode): Promise<Localized<ParsedTopic>> {
  // The parser (remark) is loaded with the first topic, keeping it out of the main bundle.
  const { parseTopic } = await import('./parseTopic')
  const entries = await Promise.all(
    Object.entries(topic.sources).map(
      async ([lang, source]) => [lang, parseTopic(await source.load(), humanize(topic.slug))] as const,
    ),
  )
  return Object.fromEntries(entries)
}

/** Loads and parses every language variant of a topic (cached per topic). */
export function loadTopic(topic: TopicNode): Promise<Localized<ParsedTopic>> {
  let promise = loaded.get(topic)
  if (!promise) {
    promise = parseAll(topic)
    promise.catch(() => loaded.delete(topic)) // allow a retry after a failed chunk load
    loaded.set(topic, promise)
  }
  return promise
}

