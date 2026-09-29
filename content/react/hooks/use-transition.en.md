# useTransition and useDeferredValue {mid}

Both hooks belong to **concurrent rendering** (React 18+). They let you mark some updates as **less urgent**, so
urgent interactions (typing, clicking) stay smooth even when re-rendering a large part of the UI is expensive.

- **Urgent** updates: the response to a direct user action (text in a field, a button's state) must be immediate.
- **Transition**: moving between views (search results, switching tabs, navigation) can wait a moment, and React may
  interrupt it if a more urgent update arrives.

## useTransition

```tsx
function Tabs() {
  const [tab, setTab] = useState('about')
  const [isPending, startTransition] = useTransition()

  function selectTab(next: string) {
    startTransition(() => {
      setTab(next)              // a low-priority update
    })
  }

  return (
    <>
      <TabButtons onSelect={selectTab} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <TabContent tab={tab} />   {/* may be expensive or suspend */}
      </div>
    </>
  )
}
```

- `isPending` signals an ongoing transition, so you can show a subtle indicator instead of blocking the UI.
- A render inside a transition is **interruptible**: if the user clicks another tab meanwhile, React discards the
  unfinished work.
- If the new content **suspends** (Suspense), React **keeps the current UI** instead of showing a fallback. That's how
  router navigations work.
- React 19: `startTransition` accepts an **async function** (that's an "Action"). `isPending` stays `true` for its whole
  duration. State updates **after an `await`** must be wrapped in `startTransition` again.
- Errors thrown in a transition go to the nearest Error Boundary.
- Outside a component (e.g. in a router), use the standalone `startTransition` function from `react`.

**Limitation**: don't drive a text input's value with a transition. `setText` must be urgent, or typing will stutter.
Split the state into urgent (the field's text) and deferred (the results):

## useDeferredValue

When you don't control where the update happens (e.g. the value comes in via props), you can **defer the value itself**:

```tsx
function SearchPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />   {/* urgent */}
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <SlowResults query={deferredQuery} />                              {/* deferred */}
      </div>
    </>
  )
}
```

- React first renders with the **old** value (the field responds instantly), then tries a background render with the new
  one. If another keystroke arrives meanwhile, it discards that render.
- `SlowResults` should be wrapped in `memo` so the urgent render with the old value is cheap.
- React 19: the second argument `initialValue` (`useDeferredValue(query, '')`) lets the first render show a lightweight
  initial value and then the target one.
- Unlike debouncing, there's **no fixed delay**: on a fast device the result appears almost immediately, and on a slow one
  the render is interrupted instead of blocking the thread.

## Which to use when

| Situation | Tool |
| --- | --- |
| you have access to the `setState` that triggers the expensive render | `useTransition` / `startTransition` |
| the value comes from outside (props, another hook) | `useDeferredValue` |
| you want to limit the number of network requests | debounce / throttle (not a rendering problem) |
| a form action with submission state | Actions: `useActionState` (React 19) |

## Sources

- [useTransition (react.dev)](https://react.dev/reference/react/useTransition)
- [useDeferredValue (react.dev)](https://react.dev/reference/react/useDeferredValue)
- [startTransition (react.dev)](https://react.dev/reference/react/startTransition)
- [React 19: Actions (react.dev)](https://react.dev/blog/2024/12/05/react-19#actions)

## Questions

### What is `useTransition` for? {mid}

For marking state updates as non-urgent. React renders them at a lower priority and can interrupt them when a more urgent
update arrives (e.g. typing), so the UI stays responsive. It returns `[isPending, startTransition]`, where `isPending` lets
you show an indicator of the ongoing transition. Typical uses are switching tabs, filtering large lists and navigation.

### How does `useTransition` differ from `useDeferredValue`? {mid}

`useTransition` wraps a **state update**, so you need access to `setState`. `useDeferredValue` defers a **value**, which
helps when it comes from props or another hook and you don't control where it's updated. The effect is similar: an urgent
render with the old value, then an interruptible render with the new one.

### Why can't you use a transition to update a text input's value? {mid}

A controlled input must reflect the typed character immediately. If `setText` were in a transition, React could delay or
discard that update, and typing would lag or drop characters. Split the state into urgent (the field's text) and non-urgent
(e.g. results), or use `useDeferredValue` for the value passed to the expensive component.

### How does `useDeferredValue` differ from debouncing? {senior}

Debouncing waits a fixed time after the last change, even on a fast device, and doesn't interrupt an ongoing render.
`useDeferredValue` has no artificial delay: React immediately tries to render the new value in the background and discards
that render when another change arrives, while the urgent render isn't blocked. Debouncing still makes sense for limiting
network requests, because that's a network problem, not a rendering one.

### What happens with Suspense when the update is a transition? {senior}

If the new content suspends, React doesn't replace already visible content with a fallback; it keeps the old UI until the
new data is ready, with `isPending` set to `true`. Without a transition, the visible content would be replaced by a spinner.
Smooth navigations in routers and frameworks are built on this.

### How does `startTransition` work with an async function in React 19? {senior}

An async function passed to `startTransition` is an Action. `isPending` is `true` from the start until the whole function
finishes, and errors go to an Error Boundary. State updates made **after** an `await`, however, aren't automatically marked
as a transition (a limitation of async context in JS), so they must be wrapped in `startTransition` again. For forms and
queuing actions, `useActionState` is more convenient.

### How would you optimize a search where filtering a large list slows down typing? {mid}

Keep the field's text in ordinary (urgent) state and pass `useDeferredValue(query)` to the list. Wrap the list component in
`memo` so the urgent render with the old value is cheap, and dim it while `query !== deferredQuery`. If filtering happens on
the server, also debounce the requests. For very long lists, virtualization helps.

### Does a transition run computations on a separate thread? {mid}

No. React still renders on the main thread. A transition splits the render into smaller chunks and checks between them
whether more urgent work is waiting, so it can yield to the browser and interrupt the render. A single very slow function
(e.g. synchronously sorting a million items in one component) will still block the thread. That's what Web Workers or
splitting the work are for.

### What does `isPending` return, and how do you use it in the UI? {junior}

`true` while a transition started with that hook's `startTransition` hasn't finished (in React 19 also for the whole
duration of an async function). It's for subtle feedback: dimming the old content, a spinner in a button, preventing a
repeated click. The old content stays visible meanwhile.

### What is concurrent rendering? {senior}

It's React's ability (since version 18) to prepare several versions of the UI at once and to interrupt, pause and discard a
render. Urgent updates can overtake an ongoing non-urgent render. Fiber and a priority-based scheduler make this possible. As
a developer you opt in through `startTransition`, `useDeferredValue` and Suspense, and the condition for correctness is pure
rendering.
