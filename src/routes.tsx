import { data, type LoaderFunctionArgs, type RouteObject } from 'react-router'
import { PageLoading } from './components/Loading'
import { findNode, loadTopic } from './content/tree'
import type { CategoryNode, ContentNode, Localized, ParsedTopic } from './content/types'
import { ErrorPage } from './pages/ErrorPage'
import { HomePage } from './pages/HomePage'
import { Layout } from './pages/Layout'
import { NodePage } from './pages/NodePage'
import { loadTopicPage } from './pages/topicPageChunk'

export interface NodeLoaderData {
  node: ContentNode
  /** Parsed markdown of every language variant; only for topics. */
  content?: Localized<ParsedTopic>
}

/** Routes for a content tree: `/` is the home page, any deeper path is a category or topic. */
export function createRoutes(tree: CategoryNode): RouteObject[] {
  return [
    {
      path: '/',
      element: <Layout tree={tree} />,
      hydrateFallbackElement: <PageLoading />,
      children: [
        {
          errorElement: <ErrorPage />,
          children: [
            { index: true, element: <HomePage tree={tree} /> },
            {
              path: '*',
              loader: async ({ params }: LoaderFunctionArgs): Promise<NodeLoaderData> => {
                const node = findNode(tree, params['*'] ?? '')
                if (!node || node === tree) throw data(null, { status: 404 })
                if (node.kind === 'category') return { node }
                const [content] = await Promise.all([loadTopic(node), loadTopicPage()])
                return { node, content }
              },
              element: <NodePage tree={tree} />,
            },
          ],
        },
      ],
    },
  ]
}
