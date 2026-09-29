# useEffect {mid}

`useEffect` is an escape hatch for synchronizing a component with an **external system**, meaning
something React doesn't control: a network connection, a subscription, a timer, a browser API,
a non-React widget. If there is no external system, you usually don't need an effect.

```tsx
useEffect(() => {
  const connection = createConnection(serverUrl, roomId) // setup
  connection.connect()
  return () => connection.disconnect() // cleanup
}, [serverUrl, roomId]) // dependencies
```

## Mental model: synchronization, not lifecycle

Don't think of an effect as "after mount" and "before unmount". An effect describes **how to start**
synchronizing (setup) and **how to stop** (cleanup). React decides when to do each:

1. mount: `setup` with values A,
2. dependencies change to B: `cleanup` with values A, then `setup` with values B,
3. unmount: `cleanup` with values B.

Cleanup "sees" the values from the render that created the effect (it's a plain closure).

## When an effect runs

- **After the render is committed to the DOM**, usually after the browser has painted, so it
  doesn't block painting.
- If the render was caused by an interaction (like a click), React may run the effect before paint
  so the result of the event is visible immediately.
- `useLayoutEffect` runs synchronously after DOM mutations but **before** paint. Use it to measure
  layout (e.g. a tooltip position) to avoid flicker. It blocks painting, so use it sparingly.
- `useInsertionEffect` is meant for CSS-in-JS libraries (injecting styles before layout effects).

## Dependency array

| Dependencies | When the effect runs                          |
| ------------ | --------------------------------------------- |
| none         | after every render                            |
| `[]`         | only after mount                              |
| `[a, b]`     | after mount and whenever `a` or `b` changes   |

- Each dependency is compared with `Object.is` to its value from the previous render.
- The array must include **every reactive value** the effect uses: props, state and anything
  computed in the component body. The `react-hooks/exhaustive-deps` lint rule enforces this.
  You don't *choose* dependencies, the code determines them.
- Want fewer dependencies? **Change the code** so the value isn't needed instead of omitting it
  and silencing the linter.

### Pitfall: objects and functions as dependencies

An object or function created in the component body is **new on every render**, so the effect
re-runs every time:

```tsx
const options = { serverUrl, roomId } // 🔴 new object on every render
useEffect(() => {
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [options]) // reconnects after every render
```

Fixes, best first:

1. create the object **inside** the effect and depend on primitives (`[serverUrl, roomId]`),
2. move constant objects and functions **outside the component**,
3. as a last resort, stabilize the reference with `useMemo` or `useCallback`.

## Data fetching and race conditions

When a dependency changes quickly (e.g. typing in a search box), responses may arrive in a
different order than the requests, and an older response overwrites a newer one. Cleanup fixes it:

```tsx
useEffect(() => {
  let ignore = false
  fetchResults(query).then((json) => {
    if (!ignore) setResults(json)
  })
  return () => {
    ignore = true
  }
}, [query])
```

Or by cancelling the request itself:

```tsx
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then((res) => res.json())
    .then(setResults)
    .catch((error) => {
      if (error.name !== 'AbortError') setError(error)
    })
  return () => controller.abort()
}, [query])
```

In real apps, prefer a library (TanStack Query, SWR) or your router/framework mechanism (e.g.
`loader` in React Router) over hand-written fetching in effects. They give you caching,
deduplication and race handling.

## Async functions in effects

An effect must return a cleanup function or nothing. An `async` function always returns a promise,
so it can't be passed directly. Define it inside and call it:

```tsx
useEffect(() => {
  async function load() {
    const data = await fetchUser(id)
    setUser(data)
  }
  load()
}, [id])
```

## useEffectEvent: latest values without re-synchronizing

Sometimes an effect should **read** a current value without **reacting** to its changes. Example:
after connecting to a room we show a notification in the current theme, but changing the theme
shouldn't reconnect. Since React 19.2 this is what `useEffectEvent` is for:

```tsx
const onConnected = useEffectEvent(() => {
  showNotification('Connected!', theme) // always the latest theme
})

useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.on('connected', () => onConnected())
  connection.connect()
  return () => connection.disconnect()
}, [roomId]) // theme and onConnected are not dependencies
```

Only call effect events from inside effects, and don't pass them to other components. Previously,
a `useRef` holding the latest value was used for this.

## Cleanup and StrictMode

In development, `StrictMode` mounts every component twice (setup → cleanup → setup) to surface
missing cleanup. A correctly written effect behaves the same whether it runs once or twice.
This doesn't happen in production.

## When you DON'T need an effect

- **Data derived from props or state**: compute it during render (wrap expensive work in `useMemo`).
- **Resetting state when a prop changes**: use `key`.
- **Logic caused by an event** (submitting a form, a notification after purchase): put it in the handler.
- **Chains of effects**, where one sets state that triggers another: compute everything in one handler.
- **Notifying a parent about a change**: call the parent's callback in the same handler that updates state.
- **Subscribing to an external store**: use `useSyncExternalStore`.

```tsx
// 🔴 redundant state and effect: an extra render with a stale value
const [fullName, setFullName] = useState('')
useEffect(() => setFullName(`${first} ${last}`), [first, last])

// ✅ computed during render
const fullName = `${first} ${last}`
```

## Sources

- [useEffect (react.dev)](https://react.dev/reference/react/useEffect)
- [Synchronizing with Effects (react.dev)](https://react.dev/learn/synchronizing-with-effects)
- [You Might Not Need an Effect (react.dev)](https://react.dev/learn/you-might-not-need-an-effect)
- [Separating Events from Effects (react.dev)](https://react.dev/learn/separating-events-from-effects)
- [useEffectEvent (react.dev)](https://react.dev/reference/react/useEffectEvent)

## Questions

### When exactly does `useEffect` run, and how is it different from `useLayoutEffect`? {mid}

`useEffect` runs after the render is committed to the DOM, usually after the browser has painted,
so it doesn't block painting. If the render was caused by an interaction, React may run it before
paint. `useLayoutEffect` runs synchronously after DOM mutations but always **before** paint. It suits
layout measurements and position fixes that would otherwise flicker, at the cost of blocking paint.

### What is the cleanup function for, and in what order does React call it? {mid}

It undoes what setup did: closes connections, removes listeners, clears timers, aborts requests.
When dependencies change, React first calls the **previous** effect's cleanup (with the old values),
then the new setup. On unmount it calls the last cleanup.

### Why does the effect run twice in development? {junior}

In development, `StrictMode` simulates unmounting and remounting the component (setup → cleanup →
setup). This checks that cleanup properly undoes setup. If running twice breaks something (e.g. two
connections, or two analytics requests sent), cleanup is missing. In production the effect runs once.

### What is a race condition when fetching data in an effect, and how do you avoid it? {mid}

When dependencies change quickly (e.g. `query`), responses can arrive in a different order than the
requests, and an older one overwrites a newer one. The fix is cleanup: an `ignore` flag set to `true`
to discard the late response, or `AbortController.abort()` to cancel the request. In practice, prefer
a data-fetching library or a router loader.

### Why does an effect with an object dependency run after every render? {mid}

Dependencies are compared with `Object.is`, i.e. by reference. An object or function created in the
component body is a new reference on every render. Move object creation into the effect and depend
on primitives, move it outside the component, or stabilize it with `useMemo`/`useCallback`.

### Why can't you write `useEffect(async () => { ... })`? {junior}

React expects an effect to return a cleanup function or `undefined`. An `async` function always
returns a promise, so React would have nothing to call as cleanup (in development it logs a warning).
Define the async function inside the effect, call it, and handle races in the cleanup.

### How can an effect read the latest value of a prop without adding it to the dependencies? {senior}

With `useEffectEvent` (React 19.2+). A function created with this hook always sees the latest props
and state, but it isn't a reactive value, so it doesn't go into the dependencies and its changes
don't restart the effect. Older code used a `useRef` updated on every render.

### Can you omit a dependency and silence the linter warning? {mid}

You shouldn't. The effect will then use a stale value from its closure (a stale closure), which
causes hard-to-find bugs. Change the code so the dependency isn't needed instead: use an updater
`setX(x => ...)`, move the object into the effect, extract an effect event, or move logic into a
handler.

### When do you **not** need `useEffect`? {mid}

When you aren't synchronizing with an external system. Compute values derivable from props or state
during render. Reset state on prop change with `key`. Put event-driven logic (clicks, form submits)
in handlers. Use `useSyncExternalStore` for external store subscriptions. Unnecessary effects cause
extra renders and a briefly inconsistent UI.

```tsx
// ❌ redundant state and effect
const [fullName, setFullName] = useState('')
useEffect(() => setFullName(`${first} ${last}`), [first, last])

// ✅ computed during render
const fullName = `${first} ${last}`
```

### In what order does React run parent and child effects? {mid}

Rendering goes top-down (parent, then child), but on mount effects run **bottom-up**: first the child's
`useLayoutEffect`, then the parent's, followed by the child's and the parent's `useEffect`. So in its
effect a parent can rely on its children's effects (e.g. measurements, attached refs) having already run.
All layout effects always come before regular effects. Don't build logic on the order of cleanups during
unmount.
