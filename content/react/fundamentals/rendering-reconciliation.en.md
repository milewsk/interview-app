# Rendering, reconciliation and keys {mid}

In React, "rendering" means **calling your component functions** to get a new description of the UI, not
painting the screen. An update happens in three steps:

1. **Trigger**: the initial mount (`createRoot(...).render(<App />)`) or a state change in the component or
   one of its ancestors (including a change of a context the component reads).
2. **Render phase**: React calls the component functions and compares the new element tree with the previous
   one (**reconciliation**). This phase must be pure, and React may interrupt, repeat or discard it.
3. **Commit phase**: React applies the **minimal** set of changes to the DOM, attaches refs and runs layout
   effects. Then the browser paints, and after that `useEffect`s run.

If the render result is the same as before, the DOM isn't touched. A render by itself doesn't mean an
expensive DOM operation.

## The virtual DOM and reconciliation heuristics

The element tree is sometimes called the "virtual DOM". A full comparison of two trees is expensive (O(n³)),
so React uses two heuristics and runs in O(n):

- **A different element type at the same position** (e.g. `<div>` instead of `<section>`, `Counter` instead of
  `Timer`) means the whole subtree is torn down and mounted from scratch, **including its state**.
- **The same type** means updating the props of the existing instance. State is preserved.
- **Lists** are compared by **keys** (`key`), which tell React which item is which between renders.

The internal structure React uses for this is **Fiber**. It lets React split work into chunks, prioritize it
and interrupt rendering (concurrent rendering, e.g. with `startTransition`).

## State is tied to a position in the tree

```tsx
{isFancy ? <Counter fancy /> : <Counter />}   // same type and position: state preserved
{isPlayerA ? <Counter key="A" /> : <Counter key="B" />} // different keys: separate state
```

A pitfall: **defining a component inside another component**. Each parent render creates a new function, i.e.
**a new type**, so React unmounts the inner component and loses its state (and focus in form fields).

```tsx
function Parent() {
  function Inner() { /* 🔴 a new type on every Parent render */ }
  return <Inner />
}
```

## Keys in lists

```tsx
{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}
```

- A key must be **stable** and **unique among siblings**. An ID from the data is best.
- **An index as a key** works when the list never changes. With inserts, deletes or sorting, state (e.g. the
  text in an `<input>`, a checkbox) stays with the **position**, not the item, so it "jumps" between rows.
- **A random key** (`Math.random()`, `crypto.randomUUID()` during render) changes on every render, so every item
  is unmounted and mounted again each time. That's a disaster for performance and state.
- The key isn't passed as a prop. If the component needs the ID, pass it separately.
- Changing `key` is a deliberate way to **reset** a component's state (`<Profile key={userId} />`).

## When a component renders

- When its state or a context it reads changes.
- When **its parent renders**. By default children re-render regardless of whether their props changed. You can
  skip this with `memo` or through structure (state lower down, `children`).
- Setting state to the same value (`Object.is`) lets React skip the render.
- State updates are **batched**: several `setState` calls in one event produce one render.

## StrictMode

In development, `<StrictMode>` calls component functions, state initializers and reducers twice, and mounts,
unmounts and remounts effects. The goal is to surface impure rendering and missing cleanup. This doesn't happen
in production.

## Sources

- [Render and commit (react.dev)](https://react.dev/learn/render-and-commit)
- [Preserving and resetting state (react.dev)](https://react.dev/learn/preserving-and-resetting-state)
- [Rendering lists: keys (react.dev)](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)
- [StrictMode (react.dev)](https://react.dev/reference/react/StrictMode)
- [Reconciliation (legacy React docs)](https://legacy.reactjs.org/docs/reconciliation.html)

## Questions

### What causes a component to re-render? {junior}

A change in its state (`setState`, `dispatch`), a change in the value of a context it reads, and its parent's
render, because by default children render along with the parent even if their props didn't change. Changing a
plain variable or a ref does **not** trigger a render.

### How does the render phase differ from the commit phase? {mid}

In the render phase React calls components and computes the differences between the old and new tree. This
phase is pure, can be interrupted or repeated, and doesn't touch the DOM. In the commit phase React
synchronously applies the changes to the DOM, updates refs and runs `useLayoutEffect`. `useEffect`s run after
the commit, usually after the screen is painted.

### What is reconciliation, and what heuristics does React use? {mid}

It's comparing the new element tree with the previous one to determine the minimal DOM changes. Instead of an
expensive general algorithm, React assumes that elements of different types produce different subtrees (a
different type means unmount and mount from scratch, with state), and it identifies list items by `key`. That
makes the comparison linear.

### Why shouldn't you use the array index as a key? {mid}

A key should identify an item across renders. An index identifies only the **position**, so after inserting,
deleting or sorting items React attaches a component's state (e.g. field text, a checkbox, focus) to the wrong
item, because state stays with the position. An index is acceptable only for static lists that never change and
have no state.

### What happens if you use `Math.random()` as a key? {mid}

The key differs on every render, so React treats every item as new: it unmounts the old one and mounts a new one.
State and focus are lost, effects run again, and the DOM is rebuilt on every render. Keys must be stable, ideally
coming from the data (`id`).

### Why shouldn't you define a component inside another component? {mid}

Every parent render creates a new function, and React compares types by reference, so it sees a new component
type. The inner component is therefore unmounted and mounted again on every parent render: it loses state and
focus and reruns its effects. Define components at the top level of a module and pass them data via props.

### Does a child re-render when its parent renders and the child's props didn't change? {junior}

Yes, by default. React renders the entire subtree of the component whose state changed. It usually isn't a
problem, because rendering is cheap and the DOM changes only where there are real differences. When it is, you
can use `memo` (with stable props), move state down, or pass the subtree as `children`.

### How do you reset a component's state? {mid}

By changing its `key`: `<ProfileForm key={userId} />`. A different key means a different component to React, so
the old one is unmounted and a new one mounted with fresh state. Changing the element type or its position in the
tree has the same effect. It's better than an effect that manually clears state after a prop changes.

### Why does a component render twice in development? {junior}

That's `StrictMode`. In development React deliberately calls component functions, initializers and reducers twice
and mounts effects twice, to surface impure rendering and missing cleanup. One result is used and the other
discarded. There's no double invocation in production.

### What is React Fiber, and what does it enable? {senior}

It's the internal reconciliation architecture (since React 16), where every component in the tree has a "fiber"
node holding its type, props, state and links. Rendering work is split into units that can be paused, resumed,
discarded or prioritized. Concurrent rendering is built on this: `startTransition`, `useDeferredValue` and
Suspense, where urgent updates (e.g. typing) can interrupt a less urgent render.
