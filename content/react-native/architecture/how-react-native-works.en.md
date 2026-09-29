# How React Native works {mid}

A React Native app is a native iOS/Android app that embeds a **JavaScript engine** (Hermes) running your React code. React computes what the UI should look like, and the
**renderer** turns that into real native views. How JavaScript and native code talk to each other is the core of the architecture, and it changed fundamentally with the **New
Architecture**, which is the default since 0.76 and the **only** architecture since 0.82.

## The pieces

- **JavaScript engine: Hermes.** Default since RN 0.70; **Hermes V1** is the default since 0.84. In release builds your JS is **compiled to Hermes bytecode (`.hbc`) at build
  time**, so the app skips parsing and compiling at startup, which improves launch time and memory use. Verified: the `hermesc` compiler shipped with RN 0.87 (Hermes release
  1.0.0, bytecode version 98) compiled a small script into a 719-byte `.hbc` file and could dump its bytecode instructions. `global.HermesInternal` tells you Hermes is running.
  JavaScriptCore is now only available as a community package.
- **Metro**: the bundler that resolves modules (including `.ios`/`.android` files), transforms code with Babel and serves the bundle in development with Fast Refresh.
- **Threads**: the **UI (main) thread** is the only one allowed to touch native views; the **JavaScript thread** runs React's render phase and, in the New Architecture, layout.
  If the JS thread is busy, your app still scrolls natively but stops responding to JS-driven updates and presses.

## The old bridge and why it was replaced

In the legacy architecture, JS and native communicated through an **asynchronous bridge**: every call was serialized to JSON, batched and sent across. That meant:

- no synchronous calls (e.g. you couldn't measure a view and position another before painting, causing visual jumps);
- serialization overhead for large data (images, camera frames, big lists);
- all native modules initialized at startup, even unused ones;
- no support for React's concurrent features.

## The New Architecture

- **JSI (JavaScript Interface)**: a C++ API that lets JS hold references to C++ objects and call their methods **directly, synchronously, without serialization**. Everything
  else is built on it. The docs' example: VisionCamera processes camera frames of around 30 MB (about 2 GB per second) through JSI.
- **Fabric**: the new renderer, largely in C++, shared by both platforms. Its pipeline:
  1. **Render**: React creates the element tree in JS, and the renderer creates an **immutable Shadow Tree** in C++;
  2. **Commit**: the new tree is promoted as the next tree, and **Yoga** calculates layout (in C++, except platform-measured components like `Text`);
  3. **Mount**: the renderer diffs the previous and next tree in C++ and applies atomic mutations (`createView`, `updateView`, `removeView`...) to the host views on the UI thread.
- **Turbo Native Modules**: native modules accessed through JSI, **loaded lazily** on first use, with typed interfaces.
- **Codegen**: generates the C++ glue from TypeScript/Flow specs of modules and components at build time, so JS and native agree on types.
- **Bridgeless mode**: the bridge is removed entirely; interop layers keep most older libraries working.

What you get as a developer: **synchronous layout** (`useLayoutEffect` can measure and update before the user sees a frame), React 18/19 **concurrent features** (transitions,
Suspense, automatic batching), and DOM-like node APIs on refs since 0.82 (`getBoundingClientRect()`, `parentNode`, `children`).

## Timeline to remember

0.68: New Architecture opt-in → 0.70: Hermes default → 0.76: New Architecture default → 0.82: New Architecture only (`newArchEnabled=false` is ignored) → 0.84: Hermes V1 default,
legacy code removed from iOS builds, precompiled iOS binaries by default.

## Sources

- [About the New Architecture](https://reactnative.dev/architecture/landing-page)
- [Render, Commit, and Mount](https://reactnative.dev/architecture/render-pipeline)
- [Threading model](https://reactnative.dev/architecture/threading-model)
- [Using Hermes](https://reactnative.dev/docs/hermes)
- [React Native 0.82: A New Era](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- [React Native 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84)

## Questions

### How does React Native turn React components into native UI? {junior}

Your JavaScript runs in an embedded engine (Hermes). React renders components into a tree of elements, and React Native's renderer (Fabric) converts it into a tree of native views:
it builds a shadow tree in C++, calculates layout with Yoga, then creates or updates the corresponding iOS and Android views on the UI thread. Updates go through the same pipeline,
applying only the differences.

### What was the bridge and what were its problems? {mid}

In the legacy architecture, JS and native communicated only through an asynchronous bridge, sending batched messages serialized as JSON. Calls couldn't be synchronous, so
measuring and adjusting layout caused visible jumps; large data paid a serialization cost; all native modules were initialized at startup; and the design couldn't support React's
concurrent rendering. The New Architecture replaced it with JSI.

### What is JSI? {mid}

The JavaScript Interface is a lightweight C++ API between the JS engine and native code. It lets JavaScript hold references to C++ host objects and call their methods directly and
synchronously, with no JSON serialization, and lets native code call JS functions. Fabric, Turbo Native Modules and libraries like Reanimated or VisionCamera are built on it. It also
decouples RN from a specific JS engine.

### What is Fabric and what are the phases of its render pipeline? {senior}

Fabric is the New Architecture's renderer, implemented mostly in shared C++. Render: React produces the element tree in JS and the renderer creates an immutable shadow tree in C++.
Commit: the new tree becomes the next tree and Yoga computes layout. Mount: the renderer diffs the previous and next trees and applies a list of view mutations to host views on the UI
thread. Because trees are immutable, rendering can be interrupted and can run on different threads, which enables concurrent React features and synchronous updates.

### What are Turbo Native Modules and Codegen? {mid}

Turbo Native Modules are native modules exposed to JS through JSI: they load lazily on first use instead of all at startup, and calls can be synchronous. Codegen reads a typed
specification written in TypeScript or Flow and generates the C++ and platform glue at build time, so the JS interface and the native implementation are type-checked against each
other instead of relying on runtime conversions.

### What is Hermes and why is it the default engine? {mid}

Hermes is a JavaScript engine built by Meta for React Native. Its main advantage is ahead-of-time compilation: release builds ship precompiled bytecode (`.hbc`), so the app doesn't parse
and compile JavaScript at startup, which reduces launch time and memory use. It's the default since 0.70, Hermes V1 (with compiler and VM improvements) since 0.84, and it supports
debugging through React Native DevTools. `global.HermesInternal` shows whether it's active.

### Which threads matter in a React Native app? {mid}

The UI (main) thread, which is the only one that can create and update native views and handles native touch and scroll, and the JavaScript thread, which runs your React code, the
render phase and layout. High-priority events can run the pipeline synchronously on the UI thread. A long task on the JS thread (heavy computation, huge renders) makes JS-driven UI
freeze even though native scrolling may still work, which is why heavy work is moved off it or split up.

### What does the New Architecture change for app developers? {mid}

Synchronous layout reading, so `useLayoutEffect` can measure views and update before paint without visual jumps; support for concurrent React (transitions, Suspense, automatic
batching); faster startup through lazy native modules; DOM-like APIs on refs (`getBoundingClientRect`, `parentNode`); and new style features like `boxShadow` and `filter`.
Most app code doesn't change; the main migration work is making sure native dependencies support it.

### What happens with libraries that were written for the old architecture? {senior}

Since 0.82 the New Architecture is the only one: setting `newArchEnabled=false` or `RCT_NEW_ARCH_ENABLED=0` is ignored. Interop layers translate calls for many legacy native modules
and components, so a lot of older libraries keep working, and the RN team says they will stay for the foreseeable future. Libraries that rely on internals removed with the legacy
architecture must be updated, replaced, or reported to maintainers; checking compatibility (e.g. in React Native Directory) is part of every upgrade.

### What is Metro? {junior}

Metro is the JavaScript bundler for React Native. It resolves modules (including platform extensions like `.ios.tsx`), transforms code with Babel (TypeScript, JSX), produces the bundle
that the app loads, and in development serves it from a local server with Fast Refresh, so edits appear in the running app while preserving component state. In release builds the
bundle is embedded in the app and compiled to Hermes bytecode.
