import bash from 'highlight.js/lib/languages/bash'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import type { Element, Root } from 'hast'
import { toText } from 'hast-util-to-text'
import { createLowlight } from 'lowlight'
import { visit } from 'unist-util-visit'

// rehype-highlight always bundles lowlight's ~37 "common" grammars; registering only
// the ones we use keeps the bundle small. jsx/tsx/html/cs are aliases of these grammars.
const lowlight = createLowlight({ bash, csharp, css, javascript, json, sql, typescript, xml })

function languageOf(node: Element): string | undefined {
  const classes = node.properties.className
  if (!Array.isArray(classes)) return undefined
  for (const value of classes) {
    const match = /^language-(.+)$/.exec(String(value))
    if (match) return match[1]
  }
  return undefined
}

/** Highlights ```lang fenced code blocks with highlight.js grammars (no auto-detection). */
export function rehypeHighlight() {
  return (tree: Root) => {
    visit(tree, 'element', (node, _index, parent) => {
      if (node.tagName !== 'code' || parent?.type !== 'element' || parent.tagName !== 'pre') return
      const lang = languageOf(node)
      if (!lang || !lowlight.registered(lang)) return
      const result = lowlight.highlight(lang, toText(node, { whitespace: 'pre' }))
      node.children = result.children as Element['children']
      node.properties.className = [...((node.properties.className as string[]) ?? []), 'hljs']
    })
  }
}
