import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only auto-cleans when Vitest globals are enabled; we import explicitly instead.
afterEach(cleanup)

// The topic page and the markdown parser are lazy chunks in the app. Warm them up so the first
// test that opens a topic doesn't spend its findBy timeout on a cold module transform.
await Promise.all([import('../pages/TopicPage'), import('../content/parseTopic')])
