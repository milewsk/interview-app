# Performance {senior}

A React Native app feels slow when it **drops frames** (janky scrolling and animations), responds late to touches, or **starts slowly**. Devices refresh at 60 Hz or more, so
each frame has **at most 16.67 ms** (less on 120 Hz screens). Most problems come from doing too much on the **JavaScript thread**; the fixes are the same React techniques as on the
web plus a few RN-specific tools.

## Two frame rates

- **JS frame rate**: your React code, business logic, touch handling and network responses. If a re-render takes 200 ms, the docs note that about 12 frames are dropped, and
  JS-driven UI and presses freeze.
- **UI frame rate**: the main thread. Native scrolling and **native-driven animations** keep running even when the JS thread is blocked.

Measure in a **release build**: development mode adds checks and warnings that make JS much slower, so numbers from dev builds are misleading. Use the Performance Monitor (dev menu),
the profiler in **React Native DevTools**, and native tools (Android Studio profiler, Xcode Instruments) for CPU, memory and startup.

## Avoid unnecessary renders

Verified in Jest: after three state updates in a parent, a plain child rendered **4** times, a `memo` child with a `useCallback` prop **once**, and a `memo` child with an inline
arrow function **4** times (the new function breaks memoization).

- Memoize expensive rows and components (`React.memo`), keep callbacks and objects stable (`useCallback`, `useMemo`) where they're passed to memoized children, or let the
  **React Compiler** do it automatically.
- Keep state as local as possible; a global store update that re-renders the whole tree is a common cause of jank. Use selectors (Zustand, Redux) so components subscribe only to
  what they use.
- Lists: `FlatList` tuning, `getItemLayout`, memoized rows, or FlashList/Legend List (see the lists topic).

## Keep the JS thread free

- Split long tasks and defer non-urgent work with **`requestIdleCallback`**. `InteractionManager` has been **removed from core**: in RN 0.87, accessing it throws "InteractionManager
  has been removed from react-native core. Please refactor long tasks into smaller ones, and use 'requestIdleCallback' instead."
- Use `startTransition` for expensive updates that can wait (e.g. filtering a big list while typing).
- Move heavy computation to native code or a worklet/thread library.
- Remove `console.log` from production builds (e.g. `babel-plugin-transform-remove-console`); logging is a real JS-thread cost.
- Run animations on the UI thread: `useNativeDriver: true` or Reanimated (see the animations topic). Animate `transform` and `opacity`, not `width`/`height`/`top`.

## Startup time

- Hermes bytecode is precompiled at build time (release builds), so JS isn't parsed at launch.
- **Inline requires** (enabled by default in `@react-native/metro-config`, verified in 0.87: `inlineRequires: true`) delay loading modules until they're first used; lazy-load
  screens and heavy libraries.
- Turbo Native Modules load lazily; avoid initializing many SDKs before the first screen.
- Keep the bundle small: remove unused dependencies, avoid huge JSON imports, and check bundle composition.

## Images and memory

Use appropriately sized, cached images (e.g. `expo-image`), avoid decoding huge images for thumbnails, and clean up listeners, timers and subscriptions to prevent leaks. Memory
pressure on low-end Android devices shows up as crashes, not just slowness.

## Sources

- [Performance overview](https://reactnative.dev/docs/performance)
- [Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- [React Native DevTools](https://reactnative.dev/docs/react-native-devtools)
- [Using Hermes](https://reactnative.dev/docs/hermes)
- [React Compiler](https://react.dev/learn/react-compiler)

## Questions

### What is the frame budget and what happens when it's exceeded? {junior}

At 60 frames per second each frame has at most 16.67 ms (less on 90 or 120 Hz screens). If the work for a frame isn't done in time, the frame is dropped and the user sees stutter:
jerky scrolling or animations, or a delay after tapping. In React Native you watch two frame rates, the JS thread's and the UI thread's, because they drop frames for different reasons.

### What is the difference between the JS frame rate and the UI frame rate? {mid}

The JS frame rate reflects the JavaScript thread, which runs React rendering, business logic, event handlers and JS-driven animations. The UI frame rate reflects the main thread,
which draws native views and runs native scrolling and native-driven animations. A blocked JS thread freezes JS-driven updates and delays touch responses, but native scrolling and
native animations can keep running at full speed.

### Why must you measure performance in a release build? {junior}

Development builds run extra validation, warnings and debugging support and don't use precompiled bytecode, which makes JavaScript much slower. Performance problems in dev mode may not
exist in production, and real bottlenecks may be hidden by general slowness. Profile release (or profiling) builds on real, preferably low-end, devices.

### How do you prevent unnecessary re-renders in React Native? {mid}

The same way as in React: `React.memo` for components whose props rarely change, stable callbacks and objects via `useCallback` and `useMemo` when passed to memoized children, state
kept close to where it's used, and store selectors so components re-render only for relevant changes. The React Compiler can apply memoization automatically. In a test, a memoized child
re-rendered once with a stable callback but on every update with an inline one.

### How do you keep the JS thread responsive during heavy work? {senior}

Split long tasks into smaller chunks and schedule non-urgent work with `requestIdleCallback` (InteractionManager was removed from core), mark expensive updates as transitions with
`startTransition`, move heavy computation to native code or worklet-based libraries, avoid synchronous native calls that do slow work, and remove `console.log` from production. Run
animations on the UI thread so they don't depend on the JS thread.

### Which properties should you animate for smooth animations? {mid}

`transform` (translate, scale, rotate) and `opacity`, which can be animated on the UI thread without recalculating layout. Animating `width`, `height`, `top`, `margin` or `flex`
triggers layout on every frame and, with the classic `Animated` API, can't use the native driver. For an image, the docs recommend `transform: [{ scale }]` instead of changing its size.

### How can you improve app startup time? {senior}

Ship Hermes bytecode (the default in release builds), keep inline requires on so modules load when first used, lazy-load screens and heavy libraries, defer SDK initialization until
after the first screen renders, reduce bundle size and dependencies, avoid large synchronous work (e.g. reading big storage values) before the first render, and measure time to
interactive on real devices with native profilers.

### What tools do you use to profile a React Native app? {mid}

The in-app Performance Monitor for JS and UI frame rates, React Native DevTools (React profiler, component highlighting, JS profiling), native profilers such as Android Studio's CPU and
memory profilers and Xcode Instruments for native code, memory and startup, and tools that measure performance on real devices over repeated runs. Profiling should be done on release
builds.

### Why is `console.log` a performance problem? {junior}

Each call does work on the JS thread and, in development, sends data to the debugging tools; logging inside renders, scroll handlers or loops can noticeably slow the app, and large
objects are expensive to serialize. Production builds should strip it, e.g. with `babel-plugin-transform-remove-console`, and use a proper logger with levels for what must be kept.

### What causes memory problems in React Native apps and how do you find them? {senior}

Common causes are listeners, timers and subscriptions not removed on unmount, large images decoded at full resolution, caches without limits, huge lists rendered without
virtualization, and closures holding references to large objects. Use heap snapshots in React Native DevTools for the JS heap and Android Studio or Xcode Instruments for native memory,
and test on low-memory devices, where problems appear as crashes.
