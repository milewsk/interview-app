import { topicMeta } from './parseTopic'
import { buildTree } from './tree'
import type { CategoryNode, TopicSource } from './types'

/**
 * Builds a tree from raw file contents (markdown and `_meta.json`) keyed by path.
 * Used by tests; the app bundles only metadata and loads markdown lazily (see index.ts).
 */
export function buildTreeFromRaw(files: Record<string, string>, root = '/content/'): CategoryNode {
  const categoryMetas: Record<string, string> = {}
  const topics: Record<string, TopicSource> = {}
  for (const [key, raw] of Object.entries(files)) {
    if (key.endsWith('.json')) categoryMetas[key] = raw
    else topics[key] = { meta: topicMeta(raw), load: () => Promise.resolve(raw) }
  }
  return buildTree(categoryMetas, topics, root)
}
