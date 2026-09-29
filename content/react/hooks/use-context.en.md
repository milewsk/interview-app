# useContext and the Context API {mid}

Context lets you pass a value **deep into the tree** without threading it through props at every level (prop
drilling). Typical uses: theme, the logged-in user, language, configuration, dependencies (an API client).

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light')   // default value

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  return (
    <ThemeContext value={theme}>          {/* React 19; previously <ThemeContext.Provider value> */}
      <Toolbar />
    </ThemeContext>
  )
}

function Button() {
  const theme = useContext(ThemeContext)   // or use(ThemeContext)
  return <button className={theme}>OK</button>
}
```

## How it works

- A component reads the value of the **nearest provider above it** in the tree. A nested provider overrides the
  value for its subtree.
- Without a provider, `useContext` returns the **default value** from `createContext`. It's not "global" state,
  just a fallback.
- When the provider's value changes (compared with `Object.is`), **every consumer** re-renders, **even if wrapped in
  `memo`**, because `memo` compares only props.
- `use(Context)` (React 19) works like `useContext`, but it can be called conditionally or in a loop.
- In React 19 the context object itself can be the provider (`<Ctx value>`). `Ctx.Provider` still works but is slated
  for deprecation.

## Performance pitfalls

**A new object on every provider render** makes every consumer re-render, even when the data hasn't changed:

```tsx
<AuthContext value={{ user, login, logout }}>           {/* 🔴 a new object every time */}

const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
<AuthContext value={value}>                               {/* ✅ */}
```

Context **has no selectors**: a component using one field still re-renders when any field of the value changes. Fixes:

- **split contexts**: frequently changing data separately from stable data (e.g. a `StateContext` and a
  `DispatchContext` with `useReducer`, since `dispatch` has a stable identity),
- move the provider lower, closer to its consumers,
- for frequently changing global state: an external store with fine-grained subscriptions (Zustand, Redux,
  `useSyncExternalStore`).

## Context is not "state management"

Context is a mechanism for **passing** values (dependency injection). The state itself still lives in the provider's
`useState` / `useReducer`. Context plus a reducer is enough for many apps, but with many updates and consumers
dedicated libraries are more efficient.

## Sources

- [useContext (react.dev)](https://react.dev/reference/react/useContext)
- [Passing data deeply with context (react.dev)](https://react.dev/learn/passing-data-deeply-with-context)
- [Scaling up with reducer and context (react.dev)](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [React 19: Context as a provider (react.dev)](https://react.dev/blog/2024/12/05/react-19#context-as-a-provider)

## Questions

### What is the Context API for? {junior}

For passing a value to many components deep in the tree without passing it through props at every intermediate level.
It suits data needed in many places that changes rarely: theme, the logged-in user, language, configuration, an API
client. For local data, props and composition are better.

### What does `useContext` return if there's no provider above the component? {junior}

The default value given to `createContext(defaultValue)`. It's not shared state, just a fallback. If a default makes no
sense, use `createContext<T | null>(null)` and a hook that throws when there's no provider.

### Which components re-render when a context value changes? {mid}

Every component that reads it (`useContext`/`use`) under that provider, including ones wrapped in `memo`, since `memo`
compares only props. Intermediate components that don't read the context don't re-render because of it (unless their
parent renders). The change is detected with `Object.is` on the provider's value.

### Why wrap an object passed as `value` in `useMemo`? {mid}

The literal `{ user, logout }` is a new object on every provider render, so `Object.is` always sees the value as
changed and every consumer re-renders, even if `user` is the same. `useMemo` (and `useCallback` for functions) means a
new reference is created only when the data actually changes.

### How do you limit re-renders of consumers of a frequently changing context? {senior}

Split it into smaller contexts, e.g. state and actions separately, because `useReducer`'s `dispatch` is stable, so
components that only dispatch actions don't re-render. Move the provider closer to the consumers. For global state that
changes often, use a store with selectors (Zustand, Redux Toolkit, `useSyncExternalStore`), which re-renders only the
components depending on the changed slice.

### Does the Context API replace Redux? {mid}

Partly. Context only passes a value, and `useState`/`useReducer` holds the state. For simple global state (theme, user)
that's enough. Redux Toolkit or Zustand offer selectors (re-rendering only when the needed slice changes), middleware,
DevTools with action history and convenient handling of complex updates. Server state is better kept in TanStack Query
than in either.

### How does `use(Context)` differ from `useContext(Context)`? {mid}

They return the same thing, but `use` (React 19) isn't bound by the Rules of Hooks' call-order constraint: you can call
it in an `if` or a loop, e.g. only when the component actually needs the value. It still must be called in a component
or hook. `use` also accepts a promise, which ties data reading to Suspense.

### How do you change a context value from a component deep in the tree? {junior}

Pass an updater function through the context as well, e.g. `{ theme, setTheme }` or `useReducer`'s `dispatch`. The state
still lives in the provider component, and the consumer calls the passed function. It's worth keeping it stable
(`useCallback`; `dispatch` already is) and often in a separate context.

### What happens when two providers of the same context are nested? {junior}

A component reads the value of the **nearest** provider above it. The inner provider overrides the value for its
subtree, which lets you e.g. use a dark theme in one section of the page or override dependencies in tests.

### What are the downsides of overusing context? {mid}

Components become dependent on a provider, so they're harder to reuse and test in isolation. Every value change
re-renders all consumers, which hurts performance with a large, frequently changing context. The data flow is also less
explicit than with props. Before reaching for context, consider composition (`children`, slots) or moving state.
