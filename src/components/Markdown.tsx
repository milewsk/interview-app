import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rehypeHighlight } from './rehypeHighlight'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

// External links (e.g. "Sources" sections) open in a new tab so the app stays open.
const link: Components['a'] = ({ node: _node, href, ...props }) =>
  href && /^https?:\/\//.test(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props} />
  ) : (
    <a href={href} {...props} />
  )

const components: Components = { a: link }

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-pre:text-slate-800 dark:prose-pre:border-slate-800 dark:prose-pre:bg-slate-900 dark:prose-pre:text-slate-200">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

const inlineComponents: Components = { a: link, p: ({ children }) => <>{children}</> }

/** Renders a single line of markdown (e.g. a question) without wrapping it in a paragraph. */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={inlineComponents}>
      {children}
    </ReactMarkdown>
  )
}
