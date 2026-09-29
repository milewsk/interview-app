# Optimizing React app performance {mid}

Rule one: **measure first**. Most renders are cheap, and optimizing "by eye" adds complexity without effect. Bottlenecks
usually lie in: a JS bundle that's too large, request waterfalls, long lists, expensive computations during render, and
re-rendering subtrees that are too large on every change.

## How to measure

- **React DevTools Profiler**: which components rendered, how many times, for how long and **why** (the "Record why each
  component rendered" option). Render highlighting shows renders live.
- The `<Profiler id="..." onRender={...}>` component for programmatic measurement.
- **Chrome DevTools, Performance tab**: long tasks (> 50 ms), layout, painting.
- **Core Web Vitals** measured on real users: **LCP** (loading of the main content), **INP** (responsiveness to interactions;
  it replaced FID in 2024) and **CLS** (layout shifts). Lighthouse shows lab results.
- Measure a **production build**: React's development mode is many times slower (extra checks, StrictMode).

## Fewer renders

1. **State colocation**: keep state in the smallest component that needs it. A state change at the root re-renders the whole app.
2. **`children` / slots**: elements passed from above don't re-render when the wrapper's state changes.
3. **`memo` + stable props** (`useCallback`, `useMemo`) for expensive components. Alternatively **React Compiler** memoizes
   automatically.
4. **Splitting contexts** and stores with selectors for frequently changing global state.
5. Avoiding effects that merely copy data into state, because every such effect is an extra render.

## Less work during render

- Expensive computations in `useMemo`, or computed once outside the component.
- `useTransition` / `useDeferredValue`, so an expensive render doesn't block typing.
- **Virtualizing long lists** (TanStack Virtual, react-window): only rows visible on screen are rendered, not 10,000 DOM nodes.
- Very heavy computations move to a **Web Worker**.

## Less code up front

```tsx
const AdminPanel = lazy(() => import('./AdminPanel'))   // a separate chunk

<Suspense fallback={<Spinner />}>
  {isAdmin && <AdminPanel />}
</Suspense>
```

- **Code splitting** at the route level (routers do this natively) and for large, rarely used views (editors, charts, admin
  panels).
- Create `React.lazy` **at module level**, not inside a component, otherwise every render creates a new type and state is lost.
- **Bundle analysis** (`rollup-plugin-visualizer`, `source-map-explorer`): replace large dependencies (dates, icons, lodash)
  with lighter ones or import them selectively so tree-shaking works.
- **Preload / prefetch** chunks and data on link hover.

## Images and assets

- `loading="lazy"` for off-screen images, explicit `width`/`height` (prevents CLS), modern formats (AVIF/WebP) and `srcset`.
- Fonts with `font-display: swap`, and critical assets with `preload`.

## Sources

- [React Developer Tools: Profiler (react.dev)](https://react.dev/learn/react-developer-tools)
- [&lt;Profiler&gt; (react.dev)](https://react.dev/reference/react/Profiler)
- [lazy (react.dev)](https://react.dev/reference/react/lazy)
- [Web Vitals (web.dev)](https://web.dev/articles/vitals)
- [TanStack Virtual](https://tanstack.com/virtual/latest)

## Questions

### Where do you start optimizing a slow React app? {mid}

By measuring on a production build. React DevTools Profiler shows which components render often and slowly, and why. Chrome's
Performance tab shows long tasks, and Core Web Vitals (LCP, INP, CLS) measure what the user experiences. Optimize a specific
bottleneck, not everything at once, and measure again after the change.

### What are the most common causes of unnecessary renders, and how do you remove them? {mid}

State placed too high (re-rendering a large subtree), new objects and functions in the props of `memo` components, a large context
with a frequently changing value, and effects that copy data into state. Fixes: colocating state, passing subtrees as
`children`, `memo` with stable props (or React Compiler), splitting context or using a store with selectors, and computing values
during render.

### What is code splitting and how do you do it in React? {junior}

Splitting the JS bundle into smaller parts loaded on demand, so the initial load contains only the code that's needed. In React you
do it with `React.lazy(() => import('./Component'))` combined with `Suspense` for the fallback, most often at the route level and for
large, rarely used views. Routers and frameworks split by route automatically.

### What is list virtualization, and when should you use it? {mid}

Rendering only the list items currently visible (plus a small buffer) instead of all of them. Items are swapped as you scroll, and
the container's height simulates the full list. Use it for hundreds or thousands of rows, when the number of DOM nodes slows
rendering and scrolling (TanStack Virtual, react-window). Downsides: in-page search (Ctrl+F) suffers, and variable-height items
are harder.

### Why measure performance on a production build? {junior}

React's development mode runs extra checks and warnings, and in `StrictMode` it double-renders components and double-mounts effects,
so it's much slower. Development numbers are misleading. There's a special build with the profiler enabled for profiling production.

### What are Core Web Vitals? {mid}

Google's metrics describing user experience: **LCP** (Largest Contentful Paint, time to display the largest content element, target ≤
2.5 s), **INP** (Interaction to Next Paint, responsiveness to interactions, target ≤ 200 ms; it replaced FID in 2024) and **CLS**
(Cumulative Layout Shift, layout stability, target ≤ 0.1). They're measured on real users (the `web-vitals` library, CrUX), while
Lighthouse gives lab results.

### How can React hurt INP, and how do you fix it? {senior}

A long synchronous render after an interaction (e.g. filtering a large list after a keystroke) blocks the main thread, so the browser
can't paint a response. Helpful: splitting into urgent and non-urgent updates (`useTransition`, `useDeferredValue`), shrinking the
rendered subtree (colocation, `memo`), virtualization, moving heavy computation to a Web Worker, and avoiding expensive work in
handlers.

### Why should `React.lazy` be called at module level? {mid}

Calling `lazy()` inside a component creates a new component, i.e. a new type, on every render. React then unmounts the previous one and
mounts the new one, losing state and possibly suspending again. Declaring it outside the component gives one stable type. The chunk is
still fetched only on first render.

### How do you reduce bundle size? {mid}

Analyze it with a visualizer, replace heavy libraries with lighter ones (e.g. native `Intl` instead of date libraries), import
selectively so tree-shaking works (avoid `import * as` and barrel-file imports), split code by routes and views (`lazy`), load rarely
used features dynamically (`await import()`), and don't ship code to the client that can run on the server (Server Components).

### When should you use the `<Profiler>` component? {senior}

When you need programmatic measurement of a specific subtree's render time, e.g. in performance tests, for collecting metrics in a test
environment, or to compare implementation variants. `onRender` receives the `id`, the phase (`mount`, `update`), the render duration
with and without memoization, and the start and commit times. In production it requires a special profiling build, and for everyday
diagnosis the Profiler in React DevTools is enough.
