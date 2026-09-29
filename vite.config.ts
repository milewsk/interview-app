import { readFile } from 'node:fs/promises'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { topicMeta } from './src/content/parseTopic'

/**
 * `import 'x.md?meta'` resolves to `{ title, difficulty }` extracted at build time,
 * so the navigation tree is bundled without the topics' full markdown.
 */
function contentMeta(): Plugin {
  const suffix = '?meta'
  return {
    name: 'content-meta',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith(suffix)) return null
      const file = id.slice(0, -suffix.length)
      this.addWatchFile(file)
      return `export default ${JSON.stringify(topicMeta(await readFile(file, 'utf8')))}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [contentMeta(), react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
