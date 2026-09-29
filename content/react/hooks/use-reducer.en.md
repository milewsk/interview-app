# useReducer {mid}

`useReducer` moves state update logic into a **pure function** outside the component. The component describes **what
happened** (an action), and the reducer decides **how the state changes**.

```tsx
type State = { items: Item[]; filter: 'all' | 'done' }
type Action =
  | { type: 'added'; text: string }
  | { type: 'toggled'; id: number }
  | { type: 'filterChanged'; filter: State['filter'] }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added':
      return { ...state, items: [...state.items, { id: Date.now(), text: action.text, done: false }] }
    case 'toggled':
      return { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, done: !i.done } : i)) }
    case 'filterChanged':
      return { ...state, filter: action.filter }
  }
}

function TodoApp() {
  const [state, dispatch] = useReducer(reducer, { items: [], filter: 'all' })
  return <AddTodo onAdd={(text) => dispatch({ type: 'added', text })} />
}
```

## Rules

- The reducer must be **pure**: it returns new state from the previous state and the action, with no mutation, requests,
  randomness (`Date.now()` in the example is a simplification; better to pass the `id` in the action) or side effects. In
  `StrictMode` React calls it **twice** to detect impurity.
- State is **immutable**: copy every level along the path of the change. For deeply nested data, Immer helps
  (`useImmerReducer`).
- If the reducer returns **the same object** (`Object.is`), React skips the render.
- `dispatch` has a **stable identity**, so you can safely pass it to children, context and effect dependencies without
  `useCallback`.
- Name actions like past-tense events (`added`, `filterChanged`), not commands (`setItems`). They describe what the user did.
- The third argument enables **lazy initialization**: `useReducer(reducer, userId, createInitialState)`.
  `createInitialState(userId)` runs only on mount.

## `useReducer` or `useState`

| `useState` | `useReducer` |
| --- | --- |
| a simple, independent value | several related fields changed together |
| updates scattered across handlers | logic in one place, easy to read |
| little code | more code, but the reducer can be tested without React |
| | the next state depends on the kind of event |

In React, `useState` is implemented as a special case of `useReducer`.

## Reducer + context

For state needed in many places, combine `useReducer` with two contexts: one for the state, one for `dispatch`. Components
that only dispatch actions don't re-render on state changes, because `dispatch` is stable. It's a lightweight alternative to
an external library. With frequent updates and many consumers, though, a store with selectors works better.

## Testing

A reducer is a pure function, so you test it like any function, without rendering:

```ts
expect(reducer(initial, { type: 'added', text: 'x' }).items).toHaveLength(1)
```

## Sources

- [useReducer (react.dev)](https://react.dev/reference/react/useReducer)
- [Extracting state logic into a reducer (react.dev)](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [Scaling up with reducer and context (react.dev)](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [use-immer (GitHub)](https://github.com/immerjs/use-immer)

## Questions

### What is `useReducer` and how does it work? {junior}

It's a hook that manages state through a `reducer(state, action) => newState` function. The component calls
`dispatch(action)` describing an event, React calls the reducer with the current state and that action, and the returned
value becomes the new state and triggers a render. The update logic lives in one place, outside the component.

### When should you choose `useReducer` over `useState`? {mid}

When state has several related fields changed together, when the next state depends on the kind of event, when update
logic grows and gets scattered across handlers, or when you want to test it in isolation. For simple, independent values
`useState` is more readable and shorter.

### Why must a reducer be pure? {mid}

React may call it several times: in `StrictMode` in development it deliberately does so twice, and with concurrent rendering
it can repeat or discard work. Mutating state, an HTTP request or randomness in a reducer would give inconsistent results and
duplicated effects. Side effects belong in event handlers and effects, and random values or timestamps are passed in the
action.

### Does `dispatch` need to be wrapped in `useCallback`? {junior}

No. React guarantees that `dispatch` keeps the same identity for the component's entire lifetime. You can pass it to `memo`
children, to context and to effect dependency arrays without worrying about extra renders or re-running effects.

### What happens if a reducer mutates the state object and returns it? {mid}

React compares old and new state with `Object.is`. It's the same reference, so React decides nothing changed and skips the
render, and the UI doesn't show the change. The mutation can also break other mechanisms that rely on immutability
(memoization, comparisons in effects). Always return a new copy or use Immer.

### How do you initialize `useReducer` state with an expensive computation? {mid}

With the third argument: `useReducer(reducer, initialArg, init)`. React calls `init(initialArg)` only on the first render.
Calling `useReducer(reducer, createInitialState(x))` would compute the state on every render, with the result ignored after
mounting.

### How should actions be named and shaped? {junior}

As events describing what happened (`added`, `itemRemoved`, `filterChanged`), not commands (`setItems`). An action is an
object with a `type` field and the data needed to compute the state. In TypeScript they're described with a discriminated
union, so the reducer gets narrowed types in each branch and the compiler catches an unhandled action.

### How do you share `useReducer` state across many components? {mid}

Place `useReducer` in a component high in the tree and expose the state and `dispatch` through context, ideally two separate
contexts. Components that only dispatch actions use the (stable) `dispatch` context and don't re-render on every state change.
At larger scale a store with selectors (Redux Toolkit, Zustand) works better.

### How do you test logic built on `useReducer`? {junior}

A reducer is a plain pure function, so you test it without React: pass a state and an action, then check the returned state.
The tests are fast and deterministic. The integration with the component (whether a click dispatches the right action and
the result is visible) is tested separately, by testing the component's behavior with React Testing Library.

### How does `useReducer` relate to Redux? {mid}

Both are built on the same pattern: a pure reducer, actions with a `type`, immutable state and `dispatch`. `useReducer`,
however, is **local** component state, without middleware (e.g. for async actions), DevTools with history, or selectors that
limit renders. Redux (today Redux Toolkit) is a global store with subscriptions. Knowing one makes the other easier.
