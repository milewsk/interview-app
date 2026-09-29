# useRef and refs {mid}

`useRef(initialValue)` returns an object `{ current }` that **persists between renders**, and changing it
**doesn't trigger a render**. It has two main uses:

1. **a reference to a DOM element** (focus, measuring, scrolling, integrating non-React libraries),
2. **a value that's remembered but doesn't affect the UI**: a timer id, a previous value, a flag, an object
   instance.

```tsx
function SearchBox() {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>Search</button>
    </>
  )
}
```

## Ref vs state

| | `useState` | `useRef` |
| --- | --- | --- |
| a change triggers a render | yes | no |
| value in the current render | a snapshot (immutable) | `current` changes immediately |
| read during render | yes | **no** (except lazy initialization) |
| purpose | data shown in the UI | data "under the hood", DOM |

If a value is displayed, it should be state. A ref changed in a handler won't show up on screen until
something else triggers a render.

## Rules

- **Don't read or write `ref.current` during render** (except one-time initialization). Rendering must be
  pure, and ref changes are invisible to React. Read and write refs in handlers and effects.
- A DOM ref is `null` during the first render. React sets `current` only after committing to the DOM and
  resets it on unmount.
- Lazy initialization of an expensive object:

```tsx
const playerRef = useRef<VideoPlayer | null>(null)
if (playerRef.current === null) playerRef.current = new VideoPlayer() // only once
```

## Examples of non-UI values

```tsx
// an interval id to stop later
const intervalRef = useRef<number | null>(null)
function start() { intervalRef.current = window.setInterval(tick, 1000) }
function stop() { if (intervalRef.current) clearInterval(intervalRef.current) }

// the latest value for a long-lived callback (alternative: useEffectEvent)
const latestOnMessage = useRef(onMessage)
useEffect(() => { latestOnMessage.current = onMessage })
```

## Passing a ref to your own component (React 19)

Since React 19, `ref` is a **regular prop** of a function component, so `forwardRef` is no longer needed
(it will be deprecated in future versions):

```tsx
function TextInput({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}

<TextInput ref={inputRef} />
```

In React 18 and earlier you had to wrap the component in `forwardRef((props, ref) => ...)`.

## Callback refs

Instead of an object you can pass a function. React calls it with the element after mounting. Since React
19 the function can **return a cleanup**, called on detach (previously React called it again with `null`):

```tsx
<div
  ref={(node) => {
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    return () => observer.disconnect()
  }}
/>
```

Callback refs are useful for measuring, lists of elements (e.g. a `Map` of id → node) and attaching
observers. Note: an arrow function in JSX is a new function on every render, so React detaches the old one
and attaches the new one on every update. `useCallback` gives you a stable function.

## `useImperativeHandle`

It lets you expose a **limited API** to the parent instead of the whole DOM node:

```tsx
function VideoPlayer({ ref }: { ref?: React.Ref<{ play(): void; pause(): void }> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }))
  return <video ref={videoRef} />
}
```

Refs are an escape hatch. If something can be expressed with props (e.g. `isOpen`), the declarative approach
beats an imperative `ref.current.open()`.

## Sources

- [useRef (react.dev)](https://react.dev/reference/react/useRef)
- [Referencing values with refs (react.dev)](https://react.dev/learn/referencing-values-with-refs)
- [Manipulating the DOM with refs (react.dev)](https://react.dev/learn/manipulating-the-dom-with-refs)
- [React 19: ref as a prop, cleanup functions for refs](https://react.dev/blog/2024/12/05/react-19)
- [useImperativeHandle (react.dev)](https://react.dev/reference/react/useImperativeHandle)

## Questions

### How is `useRef` different from `useState`? {junior}

A state change schedules a re-render, and within the current render the value is a snapshot. Changing
`ref.current` **doesn't trigger a render** and is visible immediately. A ref is for data that doesn't affect
the UI (a timer id, a previous value, an object instance) and for DOM elements. Anything that's displayed
should be state.

### Why shouldn't you read or write `ref.current` during render? {mid}

Rendering should be a pure function of props and state. React doesn't track ref changes, so UI that depends
on `ref.current` won't update when it changes, and writing during render breaks purity (in `StrictMode`
render runs twice, and with concurrent features it can be discarded). The exception is one-time lazy
initialization (`if (ref.current === null) ref.current = ...`). Read and write refs in handlers and effects.

### When is a `ref.current` pointing to a DOM element available? {mid}

After the changes are committed to the DOM. During the first render it's `null`, and React sets it before
running `useLayoutEffect`/`useEffect`. When the element unmounts, React resets `current` (or calls the
callback ref's cleanup). That's why you use `ref.current?.` in handlers and effects rather than reading it in
JSX.

### How do you pass a ref to your own function component? {mid}

Since React 19 `ref` is a regular prop: the component accepts `{ ref }` and passes it on to a DOM element,
e.g. `<input ref={ref} />`. In React 18 and earlier you needed `forwardRef((props, ref) => ...)`, which will
be deprecated in future versions. To expose only selected methods instead of the whole node, use
`useImperativeHandle`.

### What is a callback ref, and what changed in React 19? {senior}

Instead of an object you pass a function, which React calls with the DOM node once it's attached. It's useful
for measuring, lists of dynamic elements and observers. Since React 19 the function can return a cleanup,
called on detach. Previously React called it again with `null`, and when it returns a cleanup that step is
skipped. A new function on every render causes a detach and re-attach, so it's worth stabilizing it with
`useCallback`.

### What is `useImperativeHandle` for? {mid}

It lets you decide what the parent sees in a child component's `ref.current`: instead of the full DOM node
you expose a limited API, e.g. `{ focus, scrollToTop }`. This encapsulates the implementation and prevents
the parent from manipulating the DOM arbitrarily. Use it sparingly, because declarative props are usually
better.

### How do you remember a prop's previous value? {mid}

Traditionally with a ref updated in an effect: `useEffect(() => { prevRef.current = value })`, where during
render `prevRef.current` holds the value from the previous render. Reading a ref during render violates the
rules, though. If the previous value affects the UI, state compared during render
(`if (value !== prevValue) { setPrevValue(value); ... }`) is safer, as the React docs recommend.

### How do you use a ref to store an interval id, and why not state? {junior}

`const intervalRef = useRef<number | null>(null)`. `start` does `intervalRef.current = setInterval(...)`,
and `stop` calls `clearInterval(intervalRef.current)`. The id isn't displayed, so state would cause needless
renders. A plain variable in the component wouldn't survive between renders, and a variable outside the
component would be shared by all instances.

### How do you keep refs to many list elements? {senior}

You can't call `useRef` in a loop, because that breaks the Rules of Hooks. Use one ref holding a collection
(e.g. `useRef(new Map())`) and a callback ref per element: `ref={(node) => { map.set(item.id, node);
return () => map.delete(item.id) }}`. React 19's ref cleanup makes removing detached elements simple. The
alternative is extracting an item component with its own ref.

### When is a ref the wrong choice? {mid}

When the value affects what's on screen: changing a ref won't trigger a render, and the UI will show stale
data. Also when imperative calls (`ref.current.open()`) replace what could be expressed as a prop
(`isOpen`). Refs are an escape hatch to the world outside React (DOM, timers, external libraries), not a
replacement for state.
