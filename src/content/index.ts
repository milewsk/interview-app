import { buildTree } from './tree'
import type { TopicMeta, TopicSource } from './types'

// Only titles and difficulty levels are bundled with the app (via the `?meta` plugin in
// vite.config.ts); each topic's markdown is a separate chunk loaded when the topic is opened.
const metas = import.meta.glob<TopicMeta>('/content/**/*.md', { query: '?meta', import: 'default', eager: true })
const bodies = import.meta.glob<string>('/content/**/*.md', { query: '?raw', import: 'default' })
const categoryMetas = import.meta.glob<string>('/content/**/_meta.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const topics: Record<string, TopicSource> = Object.fromEntries(
  Object.entries(metas).map(([path, meta]) => [path, { meta, load: bodies[path] }]),
)

export const contentTree = buildTree(categoryMetas, topics)

export * from './tree'
export * from './types'
