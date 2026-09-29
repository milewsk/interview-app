import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('highlights registered languages and aliases', () => {
    const { container } = render(<Markdown>{'```tsx\nconst x: number = 1\n```'}</Markdown>)
    const code = container.querySelector('pre code')!
    expect(code.classList.contains('hljs')).toBe(true)
    expect(code.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(code.textContent).toBe('const x: number = 1\n')
  })

  it('leaves unknown languages as plain text', () => {
    const { container } = render(<Markdown>{'```cobol\nDISPLAY 1\n```'}</Markdown>)
    const code = container.querySelector('pre code')!
    expect(code.classList.contains('hljs')).toBe(false)
    expect(code.textContent).toBe('DISPLAY 1\n')
  })

  it('highlights C# and SQL', () => {
    const { container } = render(<Markdown>{'```csharp\nvar x = 1;\n```\n\n```sql\nSELECT 1\n```'}</Markdown>)
    const blocks = container.querySelectorAll('pre code.hljs')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].querySelector('.hljs-keyword')?.textContent).toBe('var')
    expect(blocks[1].querySelector('.hljs-keyword')?.textContent).toBe('SELECT')
  })

  it('opens external links in a new tab, keeping relative links in place', () => {
    const { container } = render(<Markdown>{'[docs](https://learn.microsoft.com) and [local](/react)'}</Markdown>)
    const [external, local] = container.querySelectorAll('a')
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')).toBe('noopener noreferrer')
    expect(local.hasAttribute('target')).toBe(false)
  })

  it('renders GFM tables', () => {
    const { container } = render(<Markdown>{'| a | b |\n|---|---|\n| 1 | 2 |'}</Markdown>)
    expect(container.querySelector('table')).not.toBeNull()
  })
})
