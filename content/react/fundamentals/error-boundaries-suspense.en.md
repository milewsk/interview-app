# Error Boundaries and Suspense {mid}

Two mechanisms for declaratively handling the "unhappy paths" in a component tree:

- An **Error Boundary** catches **errors** thrown while rendering a subtree and shows a fallback UI.
- **Suspense** shows a **fallback** while a subtree is **waiting** for something (code, data).

Both act like a `try/catch` for part of the tree, and they're usually used together.

## Error Boundary

Without a boundary, an unhandled render error **unmounts the whole application** (a blank screen). A boundary is a
class component with at least one of these methods:

```tsx
class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }                 // render phase: switch to the fallback
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack)   // commit phase: logging (Sentry etc.)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
```

- **There's no function version**. In practice you use the `react-error-boundary` library
  (`<ErrorBoundary FallbackComponent={...} onReset={...} resetKeys={[...]}>`).
- A boundary catches errors in rendering, constructors, lifecycle methods and effects of its **descendants**.
- It **doesn't catch** errors in: event handlers, async code (`setTimeout`, promise callbacks outside render), SSR,
  or the boundary itself. The exception is errors in `startTransition`, which boundaries do catch. Errors in handlers
  are handled with `try/catch` and state, and errors from async code can be "forwarded" to a boundary by setting
  state that throws during render (that's what `useErrorBoundary().showBoundary(error)` does).
- **Granularity**: one boundary for the whole app (the last line of defense) plus smaller ones around independent
  sections (a widget, a panel, a route), so one part failing doesn't take down the rest.
- React 19: `createRoot(el, { onCaughtError, onUncaughtError, onRecoverableError })` lets you report errors
  centrally.

## Suspense

```tsx
const Settings = lazy(() => import('./Settings'))   // a separate chunk

<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>
```

A component **suspends** when it waits for:

- code loaded with `React.lazy`,
- data read with `use(promise)` or Suspense-enabled libraries (TanStack Query `useSuspenseQuery`, Relay, frameworks with
  Server Components).

Plain data fetching in `useEffect` does **not** trigger Suspense.

Rules:

- The **nearest** `Suspense` up the tree shows the fallback. Nested boundaries let you reveal UI progressively (page
  skeleton first, then details).
- A promise passed to `use` must be **stable** (from a cache or a Server Component). Creating it during render causes
  endless suspending.
- A rejected promise goes to the nearest **Error Boundary**, so an `ErrorBoundary` + `Suspense` pair handles both the
  "loading" and "error" states.
- When already visible content would be replaced by a fallback, mark the update as a **transition** (`startTransition`,
  `useTransition`). React then keeps the old UI instead of showing a spinner (that's how router navigations work).
- In streaming SSR, Suspense boundaries define the HTML chunks sent progressively.

## Sources

- [Catching rendering errors with an error boundary (react.dev)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Suspense (react.dev)](https://react.dev/reference/react/Suspense)
- [lazy (react.dev)](https://react.dev/reference/react/lazy)
- [use (react.dev)](https://react.dev/reference/react/use)
- [react-error-boundary (GitHub)](https://github.com/bvaughn/react-error-boundary)

## Questions

### What is an Error Boundary, and what happens without one? {junior}

It's a component that catches errors thrown while rendering its subtree and displays a fallback UI instead. Without
any boundary, an unhandled render error unmounts the entire tree, so the user sees a blank page. A boundary limits the
impact of a failure to part of the interface.

### Which errors won't an Error Boundary catch? {mid}

Errors in event handlers, in async code (`setTimeout`, promise callbacks running outside render), during server-side
rendering, and in the boundary itself, since it only catches its descendants' errors. The exception is errors thrown in
`startTransition`. Handle errors in handlers with `try/catch`, and you can pass them to a boundary by setting state that
makes render throw.

### Why must an Error Boundary be a class component? {mid}

The mechanism relies on the lifecycle methods `static getDerivedStateFromError` (updating state in the render phase to show
the fallback) and `componentDidCatch` (side effects such as logging, in the commit phase), which have no hook equivalents.
In practice you don't write your own class but use `react-error-boundary`, which provides a convenient API with reset
support and a `useErrorBoundary` hook.

### How do `getDerivedStateFromError` and `componentDidCatch` differ? {mid}

`getDerivedStateFromError` is static and called during the render phase. It returns new state (e.g. `{ hasError: true }`),
so it must be pure. `componentDidCatch` runs in the commit phase and receives the error and the `componentStack`, so it's for
side effects, e.g. sending a report to Sentry. Both are usually used.

### Where should you place Error Boundaries? {mid}

In layers: one at the app level as the last line of defense, and smaller ones around independent sections: routes,
widgets, panels, parts that depend on external data. A failure in the comments then doesn't take down the whole product
page. Boundaries that are too fine-grained clutter the code, and ones that are too coarse show a blank screen for a minor
error.

### What is Suspense, and what can a component wait for? {mid}

It's a boundary that displays its `fallback` while some component in its subtree is suspended. A component suspends when
it waits for code (`React.lazy`) or for data read through a Suspense-compatible mechanism (`use(promise)`,
`useSuspenseQuery`, frameworks with Server Components). Plain `useEffect` + `setState` doesn't trigger Suspense.

### How do you combine Suspense with an Error Boundary? {mid}

Wrap `Suspense` in an `ErrorBoundary`: `<ErrorBoundary fallback={<Error />}><Suspense fallback={<Spinner />}>`. Waiting shows
the spinner, and a rejected promise (e.g. a failed fetch read with `use`) goes to the boundary. This handles the three
states (loading, error, success) declaratively, without `isLoading` / `error` flags in every component.

### How do you avoid replacing visible content with a spinner during a transition? {senior}

Mark the update as a transition (`startTransition` or `useTransition`). If the new content suspends, React keeps the current
UI instead of showing the nearest Suspense fallback, and `isPending` lets you show a subtle indicator. That's how
navigations in modern routers behave. The fallback appears only for new boundaries that had no content before.

### Why can't the promise passed to `use` be created during render? {senior}

Every render would create a new promise, and React compares them by reference. The component would suspend on every attempt
to resume, giving an endless fallback or a loop. The promise must be stable: coming from a cache (e.g. a `Map` by key), a
data-fetching library, or a Server Component passing it as a prop.

### How do you report render errors centrally in React 19? {mid}

Through the `createRoot` options: `onCaughtError` (errors caught by a boundary), `onUncaughtError` (unhandled ones) and
`onRecoverableError` (errors React recovered from itself, e.g. a hydration mismatch). They receive the error and
`errorInfo.componentStack`, so they're suitable for sending to a monitoring system without duplicating logic in every
boundary.
