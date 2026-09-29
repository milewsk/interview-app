import { describe, expect, it } from 'vitest'
import { parseTopic } from './parseTopic'

const source = `# useEffect

Intro paragraph.

\`\`\`js
### not a heading
useEffect(() => {}, [])
\`\`\`

## Pytania

### Kiedy uruchamia się \`useEffect\`?

Po renderze.

\`\`\`js
### still code
\`\`\`

### Co zwraca funkcja cleanup?

Nic.

## Źródła

- link
`

describe('parseTopic', () => {
  const parsed = parseTopic(source, 'Fallback')

  it('takes the title from the first H1', () => {
    expect(parsed.title).toBe('useEffect')
  })

  it('extracts questions with markdown answers, ignoring ### inside code', () => {
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.questions[0].question).toBe('Kiedy uruchamia się `useEffect`?')
    expect(parsed.questions[0].answer).toContain('Po renderze.')
    expect(parsed.questions[0].answer).toContain('### still code')
    expect(parsed.questions[1]).toEqual({ question: 'Co zwraca funkcja cleanup?', answer: 'Nic.' })
  })

  it('removes the title and questions section from the body but keeps later sections', () => {
    expect(parsed.body).not.toContain('# useEffect\n')
    expect(parsed.body).not.toContain('Pytania')
    expect(parsed.body).toContain('Intro paragraph.')
    expect(parsed.body).toContain('### not a heading')
    expect(parsed.body).toContain('## Źródła')
  })

  it('accepts the English section name case-insensitively', () => {
    const en = parseTopic('# T\n\n## questions\n\n### Q?\n\nA.', 'x')
    expect(en.questions).toEqual([{ question: 'Q?', answer: 'A.' }])
  })

  it('handles a topic without title or questions', () => {
    expect(parseTopic('Just text.', 'Fallback')).toEqual({ title: 'Fallback', body: 'Just text.', questions: [] })
  })

  it('extracts difficulty labels from the title and questions', () => {
    const parsed = parseTopic('# useMemo {Mid}\n\n## Questions\n\n### Why? {senior}\n\nA.\n\n### How?\n\nB.', 'x')
    expect(parsed.title).toBe('useMemo')
    expect(parsed.difficulty).toBe('mid')
    expect(parsed.questions).toEqual([
      { question: 'Why?', answer: 'A.', difficulty: 'senior' },
      { question: 'How?', answer: 'B.' },
    ])
  })

  it('ignores unknown or non-trailing labels', () => {
    const parsed = parseTopic('# Title {expert}\n\n## Questions\n\n### Is {junior} here?\n\nA.', 'x')
    expect(parsed.title).toBe('Title {expert}')
    expect(parsed.difficulty).toBeUndefined()
    expect(parsed.questions[0]).toEqual({ question: 'Is {junior} here?', answer: 'A.' })
  })

  it('handles CRLF line endings', () => {
    const crlf = parseTopic('# T\r\n\r\nBody\r\n\r\n## Questions\r\n\r\n### Q?\r\n\r\nA.\r\n', 'x')
    expect(crlf.title).toBe('T')
    expect(crlf.body).toBe('Body')
    expect(crlf.questions).toEqual([{ question: 'Q?', answer: 'A.' }])
  })
})
