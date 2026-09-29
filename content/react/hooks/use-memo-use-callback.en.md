# useMemo, useCallback and React.memo {mid}

Three tools for **memoization**, i.e. remembering a result between renders. They are **performance
optimizations**, not a correctness mechanism: the code must work the same without them.

```tsx
const visibleTodos = useMemo(() => filterTodos(todos, tab), [todos, tab]) // a value
const handleSubmit = useCallback((data) => post(url, data), [url])      // a function
const List = memo(function List({ items, onSelect }) { /* ... */ })     // a component
```

## Why bother

On every render the component function runs again, so:

1. expensive calculations are recomputed,
2. objects, arrays and functions created in the component are **new references** on every render.

Point 2 only matters when the reference is **compared**: in the props of a component wrapped in `memo`, or
in the dependency array of `useEffect`, `useMemo` or `useCallback`. React compares values with `Object.is`,
i.e. objects and functions by reference.

## `useMemo`

It caches the **result** of a function and recomputes it only when a dependency changes.

It makes sense when:

- the calculation is noticeably slow (e.g. filtering thousands of items) and the dependencies rarely change,
- the result is passed as a prop to a component wrapped in `memo`,
- the result is a dependency of another hook.

Otherwise it doesn't help and only clutters the code. In `StrictMode` (dev) React calls the function twice
to detect impurity. The cached value is an optimization, not a guarantee: React may discard the cache (e.g.
when the component suspends during its initial mount). If a value must persist, use state or a ref.

## `useCallback`

It caches **the function itself**, not the result of calling it. `useCallback(fn, deps)` is exactly
`useMemo(() => fn, deps)`. On its own it **speeds up nothing**: the function is still created on every
render, and React just returns the previous reference. It's useful when the function is passed:

- to a child wrapped in `memo`,
- into an effect's dependency array (yours or a child's),
- out of a custom hook, whose users may put it in dependencies.

## `React.memo`

A wrapped component skips rendering if **all props are shallowly equal** (`Object.is` for each). A single
new object, array or function among the props is enough to defeat memoization:

```tsx
const Child = memo(Child)

<Child onClick={() => save()} />         // 🔴 a new function: re-renders every time
<Child style={{ color: 'red' }} />       // 🔴 a new object: re-renders every time
<Child onClick={handleClick} />          // ✅ when handleClick comes from useCallback
```

`memo` doesn't block renders caused by the component's **own state** or by a **context** it reads. You can
pass a custom comparison `memo(C, (prev, next) => ...)`, but it's easy to get wrong, e.g. by skipping a
function with a new closure.

## Before you reach for memoization

Structural changes are often better:

- **move state down**: put state used by only part of the UI into a smaller component,
- **pass JSX as `children`**: elements created higher up don't re-render when the wrapper's state changes,
- keep rendering pure and avoid unnecessary effects that update state.

## React Compiler

React Compiler (stable since 1.0, October 2025) automatically memoizes components and values at build time,
so in new code manual `useMemo`/`useCallback`/`memo` are rarely needed. The React team recommends **not
removing** manual memoization from existing code without testing (it can change the compilation output),
and treating `useMemo`/`useCallback` as an escape hatch when you need precise control, e.g. over effect
dependencies. The compiler supports React 17+. Compiler-powered lint rules ship in
`eslint-plugin-react-hooks`.

## Sources

- [useMemo (react.dev)](https://react.dev/reference/react/useMemo)
- [useCallback (react.dev)](https://react.dev/reference/react/useCallback)
- [memo (react.dev)](https://react.dev/reference/react/memo)
- [React Compiler v1.0 (react.dev blog)](https://react.dev/blog/2025/10/07/react-compiler-1)

## Questions

### What's the difference between `useMemo` and `useCallback`? {junior}

`useMemo` caches the **result** of calling a function, while `useCallback` caches **the function itself**.
`useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`. Both return the same reference until the
dependencies (compared with `Object.is`) change.

### Should you wrap every function in `useCallback` and every value in `useMemo`? {mid}

No. Memoization helps only when a calculation is expensive or a reference is compared (a prop of a `memo`
component, a hook dependency). Otherwise it brings no benefit, adds the cost of comparing dependencies and
hurts readability. `useCallback` without `memo` in the child and without being used in dependencies is
useless, because the function is created on every render anyway.

### Why does a component wrapped in `React.memo` still re-render? {mid}

Usually some prop is a new reference on every parent render: an inline arrow function in JSX, an object or
array literal, or even `children` as JSX (every element is a new object). Other reasons: the component's own
state changes, or a context it reads (`useContext`) changes, because `memo` compares only props. Fixes:
`useCallback`/`useMemo` for the passed values, or restructuring.

### How can you reduce unnecessary re-renders without memoization? {mid}

Move state down into the component that actually uses it, so the rest of the tree doesn't re-render. Pass
heavy subtrees as `children` (or other JSX props): elements created by a parent higher up don't re-render when
the wrapper's state changes. Split large contexts and avoid effects that merely copy data into state.

### Does `useMemo` guarantee the calculation won't run again? {senior}

No. It's purely an optimization. React may discard the cache, e.g. in development when you edit the file, or
when the component suspends (Suspense) during its initial mount. In `StrictMode` the function runs twice.
Code must not rely on `useMemo` semantically. If a value must be created exactly once, use lazily initialized
state (`useState(() => create())`) or a ref.

### Why use `useCallback` for a function used in `useEffect`? {mid}

A function defined in a component is new on every render. If it's an effect dependency, the effect would run
after every render. `useCallback` stabilizes the reference, so the effect reacts only to changes in the
function's real dependencies. Often it's simpler, though, to move the function **inside the effect** or
outside the component.

### How does `React.memo` compare props, and when should you use a custom comparison? {mid}

By default `memo` compares each prop with `Object.is`, i.e. shallowly: primitives by value, objects and
functions by reference. The second argument `memo(Component, arePropsEqual)` lets you write your own
comparison, e.g. by `id` only. It must account for **all** props that affect the output, including
functions. Skipping a callback makes the component use a stale closure. A deep comparison can cost more than
the render itself.

### What does React Compiler change about memoization? {mid}

The compiler analyzes components and hooks at build time and automatically memoizes values, functions and JSX,
so in new code manual `useMemo`, `useCallback` and `memo` are rarely needed. It requires code to follow the
Rules of React (pure rendering, no mutating props and state). Don't remove existing memoization without
tests. `useMemo`/`useCallback` remain as an escape hatch for precise control. It works with React 17+ and has
been stable since 1.0 (2025).

### Does passing `children` break `React.memo`? {senior}

Yes, if `children` is JSX created during the parent's render. Every JSX element is a new object, so the
shallow prop comparison sees them as different and `memo` has no effect. Fixes: memoize the element
(`useMemo` around the JSX), pass data instead of JSX, or move `memo` to the component that's actually
expensive.

### When should you use `useMemo` to stabilize an object passed through context? {mid}

When a provider passes an object `value={{ user, login }}`. A new object on every provider render makes all
context consumers re-render, even when the data hasn't changed. Wrapping the value in `useMemo` (and functions
in `useCallback`) means consumers re-render only when the data actually changes. The alternative is splitting
it into several smaller contexts.
