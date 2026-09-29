# App state: local, shared and global {mid}

"State management" starts with asking **what kind of state it is** and **where it should live**. Different kinds have
different best tools:

| Kind | Example | Where to keep it |
| --- | --- | --- |
| local UI | whether a menu is open, text in a field | `useState` / `useReducer` in the component |
| shared by a few components | the selected list item and its details | lifted to the common parent |
| global client | theme, language, cart, session state | context or a store (Zustand, Redux Toolkit, Jotai) |
| server | product list, user profile | a caching library: TanStack Query, SWR, RTK Query |
| URL | filters, page, tab, search phrase | path and query string parameters (router) |
| form | field values, validation errors | React Hook Form / TanStack Form / Actions |

## Principles

- **Colocation**: keep state as close as possible to where it's used. Lift it only when more components need it.
- **A single source of truth**: the same information shouldn't live in two places (e.g. in a prop and copied into
  state), because sooner or later they'll diverge.
- **Derived state** is computed during render, not stored: `const total = items.reduce(...)` instead of `useState` + an
  effect.
- **Minimal state**: instead of `selectedItem` (a copy of the object), keep `selectedId` and look the item up.
- **URL as state**: filters and pagination in the address give shareable links, a working back button, and reloads
  without losing state.
- **Don't copy server state into a global store**. It has its own lifecycle (cache, staleness, refetching), which
  dedicated libraries manage better.

## Lifting state up

```tsx
function Accordion() {
  const [activeIndex, setActiveIndex] = useState(0)   // state in the common parent
  return (
    <>
      <Panel isActive={activeIndex === 0} onShow={() => setActiveIndex(0)} />
      <Panel isActive={activeIndex === 1} onShow={() => setActiveIndex(1)} />
    </>
  )
}
```

## Global state: context or a store

**Context + `useReducer`** is enough for rarely changing data. It has no selectors, though, so every change re-renders all
consumers.

**Zustand**: a minimal store without a provider, with selectors:

```tsx
import { create } from 'zustand'

type CartStore = { items: CartItem[]; add: (item: CartItem) => void; clear: () => void }

const useCart = create<CartStore>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  clear: () => set({ items: [] }),
}))

const count = useCart((s) => s.items.length)   // re-renders only when the count changes
const add = useCart((s) => s.add)
```

**Redux Toolkit**: the standard for large apps with many teams. `createSlice` (reducers with Immer, so you can "mutate" a
draft), `configureStore` (DevTools and middleware included), memoized selectors (`createSelector`), and RTK Query for server
state. It gives predictability, action history and time-travel debugging, at the cost of more code than Zustand.

**Jotai / Recoil-like atoms**: state as small, independent atoms combined into derived ones. Good when state is "scattered"
across many independent pieces.

All these libraries integrate with React through `useSyncExternalStore`, which ensures consistency during concurrent
rendering.

## Sources

- [Choosing the state structure (react.dev)](https://react.dev/learn/choosing-the-state-structure)
- [Sharing state between components (react.dev)](https://react.dev/learn/sharing-state-between-components)
- [useSyncExternalStore (react.dev)](https://react.dev/reference/react/useSyncExternalStore)
- [Redux Toolkit: Why RTK is how to use Redux today](https://redux.js.org/introduction/why-rtk-is-redux-today)
- [Zustand (GitHub)](https://github.com/pmndrs/zustand)

## Questions

### What kinds of state exist in a React app, and where should each live? {mid}

Local UI state (in the component), state shared by a few components (lifted to the common parent), global client state
(context or a store), server state (a caching library, e.g. TanStack Query), URL state (the router) and form state (a form
library or Actions). The most common mistake is treating everything as "global state" and putting it in one store.

### What does "lifting state up" mean? {junior}

Moving state from several components to their closest common parent, which passes the value down via props and receives
changes via callbacks. The siblings stay in sync and share one source of truth. State is lifted only as high as necessary.

### Why shouldn't you copy props or derived data into state? {mid}

A copy creates a second source of truth: when the prop changes, the state stays stale, and syncing them with an effect causes
extra renders and a briefly inconsistent UI. Derived values (totals, filtered lists, a full name) are computed during render,
with `useMemo` if needed. State should contain the minimal set of data from which the rest can be computed.

### When should you keep state in the URL? {mid}

When it describes **what** the user is viewing: filters, sorting, page number, the selected tab, the search phrase, the ID of
an open item. Such state survives a reload, can be shared as a link, and back/forward buttons behave as expected. In React
Router you use path parameters and `useSearchParams` for this.

### How does Zustand differ from Redux Toolkit? {mid}

Both are external stores with selectors. Zustand is minimalist: a store is a hook created by `create`, it needs no provider,
actions or reducers, and changes are made with `set`. Redux Toolkit imposes structure (slices, actions, reducers with Immer,
middleware), has rich DevTools with history, and RTK Query for server data. It works better for large teams that need
predictability and conventions.

### Why not keep API data in a global store (e.g. Redux)? {mid}

Server state has different problems than client state: caching, request deduplication, staleness, background refetching,
retries, invalidation after mutations and pagination. Handling all of that by hand in reducers means a lot of repetitive,
error-prone code. TanStack Query, SWR or RTK Query do it declaratively, leaving the global store for genuine client state.

### How do selectors in stores limit re-renders? {senior}

A component subscribes only to a selector's result (e.g. `s => s.items.length`). When the store changes, the library compares
the new result with the previous one (`Object.is` by default) and re-renders the component only if they differ. A selector
returning a new object on every call (e.g. `s => ({ a: s.a, b: s.b })`) breaks this and requires a shallow comparison
(`useShallow` in Zustand, `shallowEqual` in Redux) or memoized selectors (`createSelector`).

### How do stores integrate with concurrent rendering? {senior}

Through `useSyncExternalStore`. React requires reads from an external source during render to be consistent: during an
interruptible render, different components must not see different versions of the data (so-called tearing). The hook subscribes
to the store, forces a synchronous render on change and handles the value for SSR and hydration. Custom stores should use it too.

### What is state colocation, and why does it matter? {junior}

Keeping state as close as possible to the components that use it. A change to such state re-renders only a small subtree, the
code is easier to understand and delete, and components are easier to reuse. Global state "just in case" increases coupling and
the number of renders. State is lifted only once more places need it.

### When is context enough, and when do you need a state library? {mid}

Context (with `useState`/`useReducer`) is enough for global data that changes rarely: theme, language, user, feature flags. A
library is worth it when global state changes often and many components use it (selectors are needed), when update logic is
complex, when you need DevTools and middleware, or when state must live outside the React tree.
