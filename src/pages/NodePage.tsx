import { lazy, Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { CategoryNode } from '../content/types'
import type { NodeLoaderData } from '../routes'
import { CategoryPage } from './CategoryPage'
import { loadTopicPage } from './topicPageChunk'

const TopicPage = lazy(() => loadTopicPage().then((m) => ({ default: m.TopicPage })))

/** Renders whatever the splat route resolved to: a category or a topic. */
export function NodePage({ tree }: { tree: CategoryNode }) {
  const { node, content } = useLoaderData() as NodeLoaderData
  return node.kind === 'topic' ? (
    <Suspense>
      <TopicPage key={node.path} tree={tree} topic={node} content={content ?? {}} />
    </Suspense>
  ) : (
    <CategoryPage tree={tree} category={node} />
  )
}
