import type { Heading, RootContent } from 'mdast'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { DIFFICULTIES, type Difficulty, type ParsedTopic, type Question, type TopicMeta } from './types'

const QUESTIONS_HEADINGS = ['pytania', 'questions']
const DIFFICULTY_SUFFIX = new RegExp(`\\s*\\{(${DIFFICULTIES.join('|')})\\}\\s*$`, 'i')

/** `useEffect {mid}` -> `{ text: 'useEffect', difficulty: 'mid' }` */
function splitDifficulty(text: string): { text: string; difficulty?: Difficulty } {
  const match = DIFFICULTY_SUFFIX.exec(text)
  if (!match) return { text }
  return { text: text.slice(0, match.index).trim(), difficulty: match[1].toLowerCase() as Difficulty }
}

const parser = unified().use(remarkParse)

function start(node: RootContent): number {
  return node.position?.start.offset ?? 0
}

function end(node: RootContent): number {
  return node.position?.end.offset ?? 0
}

function headingText(source: string, heading: Heading): string {
  return source
    .slice(start(heading), end(heading))
    .replace(/^#+\s*/, '')
    .replace(/\s*#*\s*$/, '')
    .trim()
}

function isHeading(node: RootContent, depth?: number): node is Heading {
  return node.type === 'heading' && (depth === undefined || node.depth === depth)
}

/**
 * Splits a topic markdown file into title, note body and questions.
 *
 * Format: the first `# H1` is the title. A top-level `## Pytania` / `## Questions`
 * section holds the questions: every `###` heading is a question and everything
 * below it (up to the next `###` or the end of the section) is its answer.
 * The title and each question may end with a difficulty label: `{junior}`, `{mid}`, `{senior}`.
 */
export function parseTopic(source: string, fallbackTitle: string): ParsedTopic {
  const nodes = parser.parse(source).children

  const titleNode = nodes.find((n): n is Heading => isHeading(n, 1))
  const { text: title, difficulty } = titleNode
    ? splitDifficulty(headingText(source, titleNode))
    : { text: fallbackTitle, difficulty: undefined }

  const sectionIndex = nodes.findIndex(
    (n) => isHeading(n, 2) && QUESTIONS_HEADINGS.includes(headingText(source, n).toLowerCase()),
  )

  let sectionNodes: RootContent[] = []
  let sectionStart = source.length
  let sectionEnd = source.length
  if (sectionIndex !== -1) {
    const after = nodes.slice(sectionIndex + 1)
    const endIndex = after.findIndex((n) => isHeading(n) && n.depth <= 2)
    sectionNodes = endIndex === -1 ? after : after.slice(0, endIndex)
    sectionStart = start(nodes[sectionIndex])
    sectionEnd = endIndex === -1 ? source.length : start(after[endIndex])
  }

  const questions: Question[] = []
  sectionNodes.forEach((node, i) => {
    if (!isHeading(node, 3)) return
    const next = sectionNodes.slice(i + 1).find((n) => isHeading(n, 3))
    const answerEnd = next ? start(next) : sectionEnd
    const { text: question, difficulty } = splitDifficulty(headingText(source, node))
    questions.push({
      question,
      answer: source.slice(end(node), answerEnd).trim(),
      ...(difficulty && { difficulty }),
    })
  })

  // Remove the title and the questions section, cutting from the end so offsets stay valid.
  const ranges: [number, number][] = [[sectionStart, sectionEnd]]
  if (titleNode) ranges.push([start(titleNode), end(titleNode)])
  const body = ranges
    .sort((a, b) => b[0] - a[0])
    .reduce((text, [from, to]) => text.slice(0, from) + text.slice(to), source)

  return { title, body: body.trim(), questions, ...(difficulty && { difficulty }) }
}

/** Title and difficulty of a topic file, bundled eagerly into the navigation tree (see vite.config.ts). */
export function topicMeta(raw: string): TopicMeta {
  const { title, difficulty } = parseTopic(raw, '')
  return difficulty ? { title, difficulty } : { title }
}
