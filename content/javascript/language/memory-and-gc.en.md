# Memory and the garbage collector in JavaScript {senior}

JavaScript manages memory automatically: objects are allocated when created, and the **garbage collector (GC)** frees those that have
become **unreachable**. You don't free memory manually, but you can accidentally keep it alive by holding unnecessary references.

## Reachability and mark-and-sweep

- **Roots**: the global object, the current call stack (local variables, arguments), active closures, registered callbacks (timers,
  listeners) and environment handles.
- The GC **marks** everything reachable from the roots by following references, and **sweeps** the rest.
- **Reference cycles aren't a problem**: objects that point only at each other but are unreachable from the roots are collected (unlike with
  simple reference counting).

V8 (Chrome, Node) uses a **generational GC**: new objects go into the "young generation", cleaned often and cheaply (the scavenger), and those
that survive a few cycles move to the "old generation", cleaned less often (mark-sweep-compact). Much of the work happens incrementally and
concurrently to limit pauses.

## Typical memory leaks

```js
// 1. Global collections and caches without limits
const cache = new Map()
function getUser(id) { if (!cache.has(id)) cache.set(id, fetchUser(id)); return cache.get(id) }

// 2. Forgotten timers and listeners
const id = setInterval(() => poll(bigState), 1000)       // without clearInterval it keeps bigState
window.addEventListener('resize', onResize)               // without removeEventListener

// 3. Detached DOM nodes held in variables
let detached = document.querySelector('#modal'); detached.remove()   // still in memory via the variable

// 4. Closures holding large objects longer than needed
function setup() { const huge = loadHuge(); return () => huge.length }
```

In React: an effect without cleanup (a subscription, an interval, a listener) and setting state in an unmounted component. In an SPA leaks
accumulate, because the page isn't reloaded.

## Weak references

- **`WeakMap` / `WeakSet`**: keys must be objects and are held **weakly**, i.e. they don't prevent the object from being freed. When a key is no
  longer reachable, the entry disappears. They aren't iterable and have no `size`. Uses: metadata and caches attached to objects that shouldn't
  extend their lifetime, private data (before `#` fields).
- **`WeakRef`**: a weak reference to an object, and `deref()` returns the object or `undefined` if it's been collected.
- **`FinalizationRegistry`**: a callback called (at some point, **with no guarantee**) after an object is collected. The spec advises avoiding
  both where not necessary, because GC behavior is non-deterministic.

## Diagnosis

- **Chrome DevTools, Memory tab**: a *Heap snapshot* (what takes memory and who holds it, the retainers), comparing two snapshots after repeating an
  action, the *Allocation timeline*, searching for "Detached" DOM elements.
- **Performance monitor**: a heap size chart. Steady growth after repeating the same action (a sawtooth that doesn't return to baseline) suggests a
  leak.
- **Node**: `process.memoryUsage()`, `--inspect` + DevTools, `--heapsnapshot-signal`, `node --expose-gc` in tests.

## Sources

- [Memory management (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management)
- [WeakMap (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
- [WeakRef and FinalizationRegistry (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
- [Fix memory problems (Chrome DevTools)](https://developer.chrome.com/docs/devtools/memory-problems)
- [Trash talk: the Orinoco garbage collector (V8 blog)](https://v8.dev/blog/trash-talk)

## Questions

### How does the garbage collector work in JavaScript? {mid}

It frees objects unreachable from the roots: the global object, the call stack, active closures and registered callbacks. The mark-and-sweep
algorithm marks everything reachable through references and removes the rest. Engines like V8 split the heap into generations: young objects are
cleaned often and cheaply, long-lived ones less often, with much of the work done incrementally and concurrently.

### Do circular references cause memory leaks? {mid}

Not in modern engines. Mark-and-sweep checks reachability from the roots, so objects pointing at each other but unreachable from outside are collected.
The cycle problem belonged to simple reference counting (e.g. old IE engines with DOM–JS links). Leaks in JS are objects that are still reachable
through an unneeded reference.

### What are the most common causes of memory leaks in a frontend app? {mid}

Listeners and subscriptions that are never released (`addEventListener` without `remove`, WebSocket, a store), uncleared `setInterval`s, global
collections and caches that grow without limit, detached DOM nodes held in variables, closures capturing large objects, and in React effects without
cleanup. They pile up in an SPA, because the page isn't reloaded.

### How does `WeakMap` differ from `Map`? {mid}

`WeakMap` holds keys weakly: it doesn't prevent the GC from collecting the key object, and once it's collected the entry disappears. Keys must be
objects (or non-registered symbols), and a `WeakMap` isn't iterable and has no `size`, because its contents depend on non-deterministic GC. `Map` holds
keys strongly, so the key object lives as long as the entry. `WeakMap` is for metadata and caches attached to objects.

### When should you use `WeakRef` and `FinalizationRegistry`? {senior}

Rarely: e.g. for a cache of large objects that shouldn't keep them alive (`WeakRef` plus checking `deref()`), or to clean up external resources after an
object is collected (`FinalizationRegistry`). When collection and the callback happen is non-deterministic (it may never happen), so correctness logic
can't rely on them. The spec explicitly advises avoiding them when not necessary.

### How do you find a memory leak in the browser? {mid}

In Chrome DevTools' Memory tab, take a heap snapshot, repeat the suspect action a few times (e.g. opening and closing a modal), take a second snapshot and
compare: objects whose count keeps growing indicate a leak, and the "Retainers" panel shows what holds them. The *Allocation timeline*, the "Detached"
filter for DOM nodes and the performance monitor (does the heap return to baseline after GC?) also help.

### What is a "detached DOM node", and why does it cause a leak? {mid}

An element removed from the document but still reachable from JavaScript: through a variable, a cache, a listener or a closure. It isn't visible but
can't be collected, and it keeps its whole subtree and related data alive. It usually happens when code stores a reference to an element (e.g. in a
controller object) and then removes the element from the DOM without clearing the reference.

### How can closures keep memory alive? {mid}

As long as a function is reachable (e.g. registered as a listener or a timer callback), its environment with all captured variables stays in memory. In V8,
functions created in one scope share a context object, so a small, long-lived function can keep alive a large object used only by another function from
that scope. Releasing callbacks and not capturing unnecessary data helps.

### Why can't (and needn't) you trigger GC manually in the browser? {mid}

The spec exposes no API for controlling GC, because engines use different, well-tuned strategies (generations, incremental work, background threads),
and forcing it manually would usually hurt performance. In Node, the `--expose-gc` flag exposes `global.gc()`, but only for tests and diagnostics. You
influence the GC indirectly: by dropping references you no longer need.

### How do you prevent leaks in React components? {mid}

Every effect that registers something (a listener, an interval, a subscription, a connection, an observer) must return a cleanup that unregisters it.
Async operations are cancelled (`AbortController`) or their results ignored after unmounting. Don't hold references to components or DOM nodes in modules
or global caches. `StrictMode` in development helps detect missing cleanup, because it mounts effects twice.
