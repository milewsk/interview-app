# useState {junior}

`useState` adds local state to a function component. It returns a pair: the **current value**
and a **setter** that schedules an update and a re-render.

```tsx
const [count, setCount] = useState(0)

return <button onClick={() => setCount(count + 1)}>{count}</button>
```

## How it works under the hood

React stores state **outside the component function**, in an internal structure (a fiber) tied
to the component's position in the tree. The component function runs from scratch on every
render, and `useState` returns the value React remembered.

Hooks **have no names or keys**. React identifies them solely by **call order**, hence the
Rules of Hooks:

- call hooks only at the top level of a component or a custom hook,
- never inside conditions, loops, after an early `return` or in nested functions.

```tsx
// 🔴 hook order changes between renders
if (isLoggedIn) {
  const [name, setName] = useState('')
}
```

## State as a snapshot

Every render has **its own immutable copy** of state. The setter does not change `count` in the
current render. It records a request, and the new value appears in the next render.

```tsx
function handleClick() {
  setCount(count + 1)
  console.log(count) // still the old value, e.g. 0
  setTimeout(() => alert(count), 3000) // also 0: the closure "remembers" its render
}
```

## Update queue and batching

Since React 18, **automatic batching** applies everywhere. Multiple setter calls within one event
(including inside `setTimeout`, promises and native listeners) produce **a single** render.

A setter accepts either a value or an **updater function**. React processes the queue in call
order: a value replaces the state, while a function receives the result of the previous step.

```tsx
// number === 0
setNumber(number + 5) // replace: 5
setNumber((n) => n + 1) // 5 + 1 = 6
// next render: number === 6
```

Convention: name the updater argument after the first letter of the state (`c` for `count`) or
`prev` (`prevCount`).

If you really need the DOM to update synchronously (e.g. before scrolling to a newly added list
item), use `flushSync` from `react-dom`.

## When React skips a render

React compares the next state with the previous one using `Object.is`. If they are equal it skips
re-rendering the component and its children. It may still need to call the component once before
bailing out, but that does not affect the result.

Consequence: **mutating an object in place does not trigger a render**, because the reference
stays the same.

## Updating objects and arrays (immutability)

Treat state as read-only and always create a new value:

```tsx
// object
setUser({ ...user, name: 'Alice' })
// nested object: copy every level along the path of the change
setUser({ ...user, address: { ...user.address, city: 'Krakow' } })

// arrays
setItems([...items, newItem]) // add
setItems(items.filter((i) => i.id !== id)) // remove
setItems(items.map((i) => (i.id === id ? { ...i, done: true } : i))) // update an item
setItems(items.toSorted((a, b) => a.order - b.order)) // sort a copy (ES2023)
```

Only call mutating methods (`push`, `splice`, `sort`, `reverse`, `arr[i] = x`) on a copy. For
deeply nested state, Immer (`useImmer`) or flattening the data structure helps.

## Lazy initialization

The initial value is only used on the first render. If computing it is expensive, pass
**the function**, not its result:

```tsx
const [todos, setTodos] = useState(createInitialTodos()) // 🔴 called on every render
const [todos, setTodos] = useState(createInitialTodos) // ✅ called once
```

## Resetting state with `key`

State belongs to the **component's position in the tree**. The same component at the same position
keeps its state even when props change. Changing `key` makes React create the component from
scratch with fresh state:

```tsx
<ProfileForm key={userId} userId={userId} />
```

## What not to keep in state

- **Values you can compute** from props or other state. Compute them during render (optionally
  with `useMemo`) instead of syncing them with an effect.
- **Copies of props**. `useState(props.color)` only remembers the first value. If that is
  intentional, call the prop `initialColor`.
- **Values that don't affect the output** (a timer id, a previous value for comparisons). Use
  `useRef`, whose changes do not trigger renders.

## useState vs useReducer

`useReducer` fits when several values change together, when the next state depends on the kind
of event, or when update logic grows and you want to test it as a pure function outside the
component.

## Sources

- [useState (react.dev)](https://react.dev/reference/react/useState)
- [State as a snapshot (react.dev)](https://react.dev/learn/state-as-a-snapshot)
- [Queueing a series of state updates (react.dev)](https://react.dev/learn/queueing-a-series-of-state-updates)
- [Updating objects in state (react.dev)](https://react.dev/learn/updating-objects-in-state)
- [Preserving and resetting state (react.dev)](https://react.dev/learn/preserving-and-resetting-state)

## Questions

### Why does calling `setCount(count + 1)` twice in one handler only increment by 1? {junior}

Both calls see the same `count` from the current render (the snapshot), so both updates set
`count + 1`. React batches them into one render. The updater form receives the latest queued
state instead:

```tsx
setCount((c) => c + 1)
setCount((c) => c + 1) // +2
```

### What is `number` after a click if the handler calls `setNumber(number + 5)` and then `setNumber(n => n + 1)`? {mid}

With `number === 0` the result is **6**. React processes the queue in order: `number + 5` is a plain
value, so it replaces the state (`5`), and the updater receives that result and returns `5 + 1`.
If `setNumber(42)` came last, the result would be 42, because a value replaces everything before it.

### Is the `useState` setter synchronous? {junior}

No. The setter **queues** an update, and the variable in the current render never changes (it is a
constant captured by the closure). The new value is available in the next render. If you need it
right away, compute it into a variable first (`const next = count + 1; setCount(next); use(next)`).

### What is the difference between `useState(expensive())` and `useState(() => expensive())`? {mid}

In the first case `expensive()` runs on **every** render even though its result is only used on the
first one. In the second, React calls the initializer only once. In development under `StrictMode`
it calls it twice to detect impure functions.

### Why doesn't mutating an object in state trigger a re-render? {junior}

React compares the previous and next state with `Object.is`. After a mutation the reference is the
same, so React treats the state as unchanged and skips the render. Even if a render happens for
another reason, the mutation breaks assumptions elsewhere, such as comparisons in `memo`, `useMemo`
and effect dependencies. Create a new copy instead, e.g. `setUser({ ...user, name })`.

### Does calling the setter with the same value cause a render? {mid}

Usually not. If `Object.is(next, prev)` is `true`, React skips rendering the component and its
children. It may still call the component function once before bailing out, which is why rendering
must be pure and you must not rely on how many times it runs.

### Why can't hooks be called conditionally? {junior}

React maps state to hooks **by call order** within the component. If a hook is skipped in one render,
every following hook receives state "shifted" by one position. Hooks must therefore be called in the
same order on every render.

### How do you reset a component's state when a prop (e.g. `userId`) changes? {mid}

The simplest way is to give the component `key={userId}`. React treats it as a new component and
creates fresh state. You don't need an effect that resets state, since that causes an extra render
with stale data.

### What does the "Too many re-renders" error mean? {junior}

A setter was called **unconditionally during render**, so each render schedules another one. The usual
cause is `onClick={setOpen(true)}` instead of `onClick={() => setOpen(true)}`.

### When should you choose `useReducer` over `useState`? {mid}

When state has several related fields that change together, when transitions depend on the kind of
action (`'added'`, `'deleted'`…), or when you want to extract and test the update logic as a pure
function. For simple, independent values `useState` is more readable.
