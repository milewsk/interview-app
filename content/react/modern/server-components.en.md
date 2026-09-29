# Server Components and Server Functions {senior}

**React Server Components (RSC)** are components rendered **before anything is sent to the browser**, in a separate environment
(on the server per request, or once at build time). Their code **doesn't end up in the client bundle**. The browser receives the
render result (the RSC payload), which React combines with interactive **Client Components**.

```tsx
// A Server Component (the default in RSC frameworks, e.g. Next.js App Router)
import db from './db'
import LikeButton from './LikeButton'   // a Client Component

export default async function PostPage({ id }: { id: string }) {
  const post = await db.posts.find(id)          // access to the database / files / secrets
  return (
    <article>
      <h1>{post.title}</h1>
      <Markdown source={post.body} />            {/* a heavy library stays on the server */}
      <LikeButton postId={id} initialLikes={post.likes} />
    </article>
  )
}
```

```tsx
'use client'                                     // boundary: this module and its imports go to the client
import { useState } from 'react'

export default function LikeButton({ postId, initialLikes }: { postId: string; initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes)
  return <button onClick={() => setLikes(likes + 1)}>♥ {likes}</button>
}
```

## How they differ

| Server Component | Client Component |
| --- | --- |
| can be `async` and read data directly (database, files, secrets) | fetches data through an API |
| no state, effects, event handlers or browser APIs | `useState`, `useEffect`, `onClick`, `window` |
| code isn't in the client bundle | code is in the bundle |
| no directive (the default in an RSC environment) | module marked `'use client'` (or imported by such a module) |

**RSC isn't the same as SSR.** SSR renders (Client Components too) to HTML for a fast first paint, and then the client code is
hydrated. RSC determines which components **need no client-side code** at all. In practice frameworks combine both: RSC plus SSR
plus streaming with Suspense.

## Composition rules

- `'use client'` marks **a boundary in the module graph**: the module and everything it imports becomes client code. You don't add
  it to every component, only to the entry points of interactivity.
- A Client Component **can't import** a Server Component, but it can **receive one as a prop** (e.g. `children`). The pattern: a
  server layout passes server content to a client wrapper.
- Props passed from server to client must be **serializable**: primitives, arrays, plain objects, `Date`, `Map`/`Set`, JSX, promises,
  Server Functions. They can **not** be ordinary functions or class instances.
- A promise passed from the server can be read on the client with `use(promise)` and Suspense, which lets data stream.

## Server Functions (`'use server'`)

Async functions executed on the server that a Client Component can call like a regular function. React then sends a request to the
server. The `'use server'` directive goes at the top of a file (all exports) or inside a function body. It does not mark Server
Components.

```tsx
// actions.ts
'use server'
export async function addComment(postId: string, formData: FormData) {
  const session = await auth()                        // ⚠️ always authorize
  const text = z.string().min(1).parse(formData.get('text'))   // ⚠️ always validate
  await db.comments.create({ postId, text, userId: session.userId })
}
```

- They work with `<form action>`, `useActionState` and `useTransition`. A form with a Server Function works even before JS loads
  (progressive enhancement).
- **Security**: every Server Function is effectively a **public HTTP endpoint**. Treat arguments as untrusted, and perform
  authentication, authorization and validation inside the function.
- Since 2024, "Server Actions" is the name for Server Functions used as an Action (e.g. in `action`).

## Requirements

RSC requires a framework or bundler that supports them (e.g. Next.js App Router), because the module graph must be split and the RSC
protocol handled. A plain Vite SPA doesn't use them. Actions, `use` and Suspense do work there on the client.

## Sources

- [Server Components (react.dev)](https://react.dev/reference/rsc/server-components)
- [Server Functions (react.dev)](https://react.dev/reference/rsc/server-functions)
- ['use client' (react.dev)](https://react.dev/reference/rsc/use-client)
- ['use server' (react.dev)](https://react.dev/reference/rsc/use-server)

## Questions

### What are React Server Components? {mid}

Components rendered outside the browser (on the server per request or at build time), whose code doesn't go into the client bundle.
They can be async and read data directly from a database or files. The client receives the result, combined with interactive Client
Components. They have no state, effects or event handlers.

### How do RSC differ from SSR? {senior}

SSR renders components (client ones too) to HTML to show the page quickly, but all their code still goes to the browser and is
hydrated. RSC decide which components need no client-side code at all: they render only in the server environment, and the client
gets the result, not the code. The techniques are complementary, and frameworks combine them with streaming.

### What does the `'use client'` directive mean? {mid}

It marks a boundary in the module graph: a file with `'use client'` and every module it imports are client code, so they go into the
bundle and can use state, effects and browser APIs. You don't add it to every component, only where a server component imports an
interactive one. It doesn't mean "render only in the browser", because such components can still be prerendered with SSR.

### Can a Client Component render a Server Component? {senior}

It can't **import** one, because an import in a client module makes it client code. It can, however, receive one as a prop, e.g.
`children`, from a server component: `<ClientTabs><ServerContent /></ClientTabs>`. The server then renders the content, and the client
just places it. This is the basic pattern for interleaving the two kinds of components.

### Which props can be passed from a Server Component to a Client Component? {mid}

Serializable ones: primitives, arrays, plain objects, `Date`, `Map`, `Set`, typed arrays, JSX elements, promises and Server Functions.
You can't pass ordinary functions (e.g. an `onClick` defined on the server), class instances or unregistered symbols, because they must
travel over the network in the RSC payload.

### What are Server Functions, and how do you secure them? {senior}

Functions marked `'use server'` that run on the server and that client components call like regular functions, with React turning the
call into an HTTP request. In practice they're public endpoints: anyone can call them with any arguments. So every one must check
authentication and permissions, validate arguments (e.g. with Zod), not trust IDs from the client, and not return sensitive data.

### What are the benefits of Server Components? {mid}

A smaller JS bundle, because libraries used only for rendering (Markdown, formatting, queries) stay on the server. Direct access to data
and secrets without building a separate API. Fewer waterfalls, because data is fetched close to the source. Streaming content with
Suspense. Better SEO and a faster first paint combined with SSR.

### What are the limitations and costs of Server Components? {senior}

They require a framework with RSC support and a server (or prerendering). They have no state, effects or interactivity. The mental
model is more complex, because you have to watch the `'use client'` boundaries and prop serializability. Navigation needs requests to
the server. Some libraries (relying on context or state) must be wrapped in client components.

### Does `'use server'` mark a Server Component? {junior}

No. Server Components have no directive, because they're the default in an RSC environment. `'use server'` marks Server Functions:
functions called from the client and executed on the server, e.g. for handling forms and mutations.

### How do Server Components work with Suspense and streaming? {senior}

An async Server Component can wait for data, and a surrounding `Suspense` lets the server immediately send the rest of the page with
the fallback and stream the suspended part once the data is ready. The server can also pass an unresolved promise to a Client Component,
which the client reads with `use`, so data flows in parallel with rendering.
