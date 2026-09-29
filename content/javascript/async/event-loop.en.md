# Event loop {mid}

JavaScript runs your code on **a single thread**: at any moment at most one piece of JS is executing,
and a function always runs **to completion** before anything else happens. The **event loop** is the
mechanism that decides what runs next once the call stack is empty.

## The pieces

- **Call stack**: the functions currently executing.
- **Host APIs** (the browser or Node.js): timers, network, DOM events. They do their work outside the
  JS thread and, when done, queue a callback.
- **Task queues** (macrotasks): `setTimeout`/`setInterval` callbacks, UI events (click, input),
  network callbacks, `MessageChannel` messages.
- **Microtask queue**: promise reactions (`then`/`catch`/`finally`, the continuation after `await`),
  `queueMicrotask`, `MutationObserver`.
- **Rendering**: style recalculation, layout and paint, preceded by `requestAnimationFrame` callbacks.

## One iteration of the loop (browser)

1. Take **one** task from a task queue and run it to completion.
2. **Microtask checkpoint**: run **all** microtasks, including ones queued by other microtasks,
   until the queue is empty.
3. If it's time to render (typically once per display frame, ~16.7 ms at 60 Hz): run
   `requestAnimationFrame` callbacks, then style, layout and paint.
4. Repeat. When idle, the browser may run `requestIdleCallback` callbacks.

The key consequence: **all microtasks run before the next task and before rendering.**

```js
console.log('1')
setTimeout(() => console.log('2'))
Promise.resolve().then(() => console.log('3'))
console.log('4')
// 1, 4, 3, 2
```

## async/await under the hood

- An `async` function runs **synchronously** until its first `await`.
- `await` suspends the function. The rest of it (the continuation) is queued as a **microtask**
  once the awaited value settles, even if it's already resolved or not a promise at all.
- The caller immediately receives a pending promise and continues its own synchronous code.

```js
async function a() {
  console.log('a1')
  await b()
  console.log('a2')
}
async function b() {
  console.log('b')
}

console.log('start')
setTimeout(() => console.log('timeout'))
a()
Promise.resolve().then(() => console.log('then'))
console.log('end')
// start, a1, b, end, a2, then, timeout
```

## Long tasks and a frozen UI

While a task runs, the browser can't handle clicks or render. A task longer than ~50 ms counts as a
**long task** and is felt as lag. Ways to deal with it:

- split the work into chunks and **yield** to the event loop between them (`setTimeout`, or
  `scheduler.yield()` in browsers that support it),
- move CPU-heavy computation to a **Web Worker** (a separate thread),
- for UI updates in React, use `startTransition` / `useDeferredValue` so urgent updates win.

An endless chain of microtasks (a promise that keeps queuing another) freezes the page just like an
infinite `while` loop. Rendering never gets its turn.

## Timers aren't precise

`setTimeout(fn, 0)` means "no earlier than 0 ms, as a separate task", not "right now". The callback
waits for the current task and all microtasks, and possibly for rendering. Browsers clamp deeply
nested timers (after a few nesting levels) to at least 4 ms and heavily throttle timers in background
tabs.

## Node.js differences

Node has its own event loop (libuv) with phases (timers → pending callbacks → poll → check → close)
and two extra mechanisms:

- `process.nextTick` callbacks run **before** promise microtasks,
- `setImmediate` runs in the check phase after I/O polling.

```js
setTimeout(() => console.log('timeout'))
setImmediate(() => console.log('immediate'))
Promise.resolve().then(() => console.log('promise'))
process.nextTick(() => console.log('nextTick'))
console.log('sync')
// sync, nextTick, promise, then timeout/immediate
```

The order of `timeout` and `immediate` in the main module isn't deterministic (it depends on
process timing). Inside an I/O callback, `setImmediate` always runs first.

## Sources

- [JavaScript execution model (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [Using microtasks (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)
- [Event loops (HTML spec)](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [The Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

## Questions

### Why does a promise callback run before a `setTimeout(…, 0)` callback? {junior}

Promise callbacks are microtasks. After the current task (e.g. the running script) finishes, the event
loop drains the **entire** microtask queue before taking the next task from the task queue, where the
timer callback waits.

### What does this code print? {mid}

```js
async function a() {
  console.log('a1')
  await b()
  console.log('a2')
}
async function b() {
  console.log('b')
}

console.log('start')
setTimeout(() => console.log('timeout'))
a()
Promise.resolve().then(() => console.log('then'))
console.log('end')
```

`start, a1, b, end, a2, then, timeout`. `a()` runs synchronously up to `await`, including the body
of `b()`. The continuation (`a2`) is queued as a microtask before `then`, because `a()` is called
first. `timeout` is a task, so it runs after all microtasks.

### What does this code print? {mid}

```js
console.log(1)
setTimeout(() => console.log(2))
Promise.resolve().then(() => {
  console.log(3)
  setTimeout(() => console.log(4))
  Promise.resolve().then(() => console.log(5))
})
console.log(6)
```

`1, 6, 3, 5, 2, 4`. The synchronous code prints 1 and 6. In the microtask checkpoint, 3 runs and
queues another microtask (5), which runs in **the same** checkpoint. Only then come the tasks, in the
order they were scheduled: 2, then 4.

### Can microtasks block rendering? {mid}

Yes. The microtask queue is drained completely before the browser can render, and microtasks queued
by microtasks run in the same checkpoint. An endless chain of microtasks freezes the page just like a
synchronous infinite loop.

### What happens to the code after `await`? {mid}

It's queued as a microtask once the awaited value settles, even if it was already resolved. The `async`
function immediately returns a pending promise to its caller, so the caller's synchronous code after
the call runs first.

### Does `setTimeout(fn, 0)` run the callback immediately? {junior}

No. It schedules a **task**, which runs after the current task finishes, after all microtasks, and
possibly after rendering. The delay is a minimum, not a guarantee. Nested timers are clamped to 4 ms,
and timers in background tabs are throttled.

### How do you keep a heavy computation from freezing the UI? {mid}

Split it into chunks and yield to the event loop between them (`setTimeout`, `scheduler.yield()`), so
the browser can handle input and render. Move truly CPU-bound work to a Web Worker. In React,
additionally mark non-urgent updates with `startTransition` or `useDeferredValue`.

### When does `requestAnimationFrame` run, and why use it for animations? {mid}

Right before the browser's next repaint, after tasks and microtasks, once per frame. Changes made in it
land in the same frame, at a rate matched to the display. Browsers pause it in background tabs, which
saves resources. A `setTimeout`-based animation can fire mid-frame and cause jank.

### How do `process.nextTick`, promises and `setImmediate` differ in Node.js? {senior}

`process.nextTick` callbacks run first, right after the current operation and before promise
microtasks. Promise callbacks run next, as microtasks. `setImmediate` is a task in the **check** phase
of the event loop, after I/O polling. Relative to `setTimeout(…, 0)` its order in the main module is
nondeterministic, but inside an I/O callback `setImmediate` always wins.

### What is `queueMicrotask` for, and how does it differ from `setTimeout(fn, 0)`? {mid}

`queueMicrotask(fn)` adds a function to the **microtask** queue, so it runs right after the current
synchronous code, before any task and before rendering. `setTimeout(fn, 0)` schedules a separate **task**
that waits at least until the next loop iteration. For `console.log('a'); queueMicrotask(m);
setTimeout(t); Promise.resolve().then(p); console.log('b')` the order is `a, b, m, p, t`. A microtask is
useful to defer work "to the end of the current task" (e.g. batching several changes) without a delay and
without creating a promise.
