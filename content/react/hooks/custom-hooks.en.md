# Custom hooks {mid}

A custom hook is a plain function whose name starts with `use` and that calls other hooks. It lets you extract and
reuse **logic with state and effects**: subscriptions, data fetching, form handling, syncing with the browser.

```tsx
function useOnlineStatus() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback)
      window.addEventListener('offline', callback)
      return () => {
        window.removeEventListener('online', callback)
        window.removeEventListener('offline', callback)
      }
    },
    () => navigator.onLine,     // value on the client
    () => true,                 // value during SSR
  )
}

function StatusBar() {
  const isOnline = useOnlineStatus()
  return <p>{isOnline ? '✅ Online' : '❌ Offline'}</p>
}
```

## Rules

- The name **must** start with `use`. That's how the linter (`eslint-plugin-react-hooks`) recognizes a hook and checks
  the Rules of Hooks inside it (calls only at the top level, no conditions).
- A hook **shares logic, not state**. Every call has its own, independent state. Two components calling `useToggle()`
  have two separate toggles. To share state, lift it up, use context or a store.
- A hook runs on **every render** of the component and receives its current props and state. It's part of the component
  body, so it must be just as pure.
- A function that calls no hooks shouldn't have the `use` prefix. It's an ordinary helper function.

## Examples

```tsx
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}
```

## Designing a hook's API

- Return a **tuple** (`[value, setValue] as const`) when there are two values and the user should name them freely. With
  more values, return an **object** with named fields.
- Wrap functions returned from the hook in `useCallback` (and objects in `useMemo`) if they may end up in effect
  dependencies or props of `memo` components.
- Hooks should describe a **concrete purpose** (`useChatRoom`, `useOnlineStatus`). "Lifecycle hooks" such as `useMount(fn)`
  or `useEffectOnce` are an anti-pattern: they hide dependencies and bypass the linter.
- Before writing `useFetch`, consider a library (TanStack Query, SWR). It handles caching, deduplication, races and retries,
  which a simple hook usually doesn't.

## Testing

`renderHook` from React Testing Library renders a hook inside a test component:

```tsx
const { result } = renderHook(() => useCounter())
act(() => result.current.increment())
expect(result.current.count).toBe(1)
```

It's often better, though, to test a component that uses the hook, because the test then checks behavior visible to the user.

## Sources

- [Reusing logic with custom Hooks (react.dev)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Rules of Hooks (react.dev)](https://react.dev/reference/rules/rules-of-hooks)
- [useSyncExternalStore (react.dev)](https://react.dev/reference/react/useSyncExternalStore)
- [renderHook (Testing Library)](https://testing-library.com/docs/react-testing-library/api/#renderhook)

## Questions

### What is a custom hook, and why create one? {junior}

A function whose name starts with `use` and that calls other hooks. It extracts logic with state and effects
(subscriptions, data fetching, form handling) so it can be used in many components without copying code. Components get
shorter and describe **what** they do rather than **how**.

### Do two components using the same hook share state? {junior}

No. A hook shares **logic**, and every call creates its own, independent state and effects, as if the hook's code were
pasted into each component. For components to use the same state, lift it to a common parent, expose it through context or
keep it in an external store.

### Why must a hook's name start with `use`? {mid}

It's a convention tools rely on: the linter recognizes hooks by it and checks the rules inside them (no conditional calls,
complete dependencies), and React Compiler treats them differently from ordinary functions. A reader knows immediately that
the function may have state and effects and must be called at the top level of a component.

### Should a helper function with no hooks inside be named `useX`? {junior}

No. The `use` prefix is for functions that call hooks. An ordinary function (e.g. date formatting, a list filter) should have an
ordinary name, so it can be used anywhere, including conditionally and outside components. Marking it as a hook would
needlessly restrict where it can be used.

### What should a hook return: a tuple or an object? {mid}

A tuple (`[value, setValue] as const`) when there are two tightly related values the user should name freely, as with
`useState`. An object when there are more values or some are optional, because named fields are more readable and robust to
reordering. In TypeScript a tuple needs `as const`.

### Why wrap functions returned from a custom hook in `useCallback`? {mid}

The hook's users may put the returned function in an effect's dependency array or pass it to a `memo` component. A new function
on every render would re-run the effect or cause needless renders. Stabilizing it in the hook saves every user from having to
handle it themselves.

### Why are `useMount` / `useEffectOnce` considered an anti-pattern? {senior}

They hide a `useEffect` with an empty dependency array, so the linter doesn't check whether the effect uses reactive values. That
leads to stale closures and bugs when props change. They also think in lifecycle terms rather than synchronization. A hook should
have a concrete purpose (`useChatConnection(roomId)`) and explicit dependencies.

### How do you write a hook that subscribes to an external data source (e.g. online status, window width)? {mid}

Best with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`. `subscribe` registers a listener and returns an
unsubscribe function, and `getSnapshot` returns the current value. That value must be stable, i.e. return the same reference for
the same data. React itself handles consistency during concurrent rendering and hydration. A `useEffect` + `useState` combination
is more error-prone.

### How do you test custom hooks? {mid}

With `renderHook` from React Testing Library: `const { result } = renderHook(() => useCounter())`, actions inside `act()` and
assertions on `result.current`. You change parameters with `rerender(newProps)` and provide context via the `wrapper` option. Hooks
closely tied to UI are often better tested indirectly, through a component that uses them.

### When shouldn't you write your own `useFetch`? {mid}

Almost always, when the app does serious data fetching. A simple `useFetch` usually lacks caching, request deduplication,
cancellation, race handling, retries, background refresh and invalidation after mutations. Libraries (TanStack Query, SWR, RTK Query)
or router loaders solve this comprehensively. A custom hook makes sense for simple, one-off cases.
