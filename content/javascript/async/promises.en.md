# Promises in practice {mid}

A `Promise` represents the result of an asynchronous operation that will be available later. It has three
states: **pending**, **fulfilled** (with a value) and **rejected** (with a reason). The state changes **only
once** (the promise is then *settled*), and later `resolve`/`reject` calls are ignored.

```js
const p = new Promise((resolve, reject) => {
  console.log('the executor runs synchronously')
  resolve(1)
  resolve(2) // ignored
})
```

## `then` chains

Every `then`, `catch` and `finally` **returns a new promise**, which is what makes chaining possible. What
the callback returns determines the state of the next link:

- a plain value is returned: the next promise fulfills with that value,
- a promise (or any *thenable*) is returned: the next link **waits for it and adopts its result**
  (flattening),
- an exception is thrown: the next promise is rejected.

```js
await Promise.resolve(1)
  .then((x) => x + 1)                   // 2
  .then((x) => Promise.resolve(x * 10)) // 20, not Promise<20>
```

The most common mistake is a **forgotten `return`**: the chain doesn't wait for the inner operation, it
receives `undefined`, and the inner error goes nowhere.

```js
.then(() => { saveAsync(data) })        // 🔴 doesn't wait, won't propagate the error
.then(() => saveAsync(data))            // ✅
```

## Error handling

- A rejection "skips" the following `then`s until the nearest `catch` (or `then(_, onRejected)`).
- `catch` **handles the error**: if it doesn't throw, the chain continues as fulfilled.
- `then(onOk, onFail)` **won't catch** an error thrown in `onOk`, while `.then(onOk).catch(onFail)` will.
- `finally` receives no arguments and passes the original value or error through. An exception thrown in
  `finally`, however, overrides the result.
- **Unhandled rejection**: browsers fire an `unhandledrejection` event, and Node (since v15) **terminates
  the process** by default.

## Combinators

| Method | Settles when | Result |
| --- | --- | --- |
| `Promise.all` | all fulfilled **or the first rejection** | an array of values in input order |
| `Promise.allSettled` | all settled | `[{ status, value }` or `{ status, reason }]` |
| `Promise.race` | the first one settles (fulfilled or rejected) | its outcome |
| `Promise.any` | the first **fulfilled** | its value; if all reject, an `AggregateError` |

```js
const [user, orders] = await Promise.all([getUser(id), getOrders(id)]) // concurrently

const results = await Promise.allSettled(urls.map((u) => fetch(u)))
const failed = results.filter((r) => r.status === 'rejected')

const data = await Promise.race([fetch(url), timeout(5000)]) // a simple timeout
```

On the first error, `Promise.all` **doesn't cancel** the other operations, because promises have no built-in
cancellation. That's what an `AbortController` passed to e.g. `fetch` is for.

## async/await and promises

An `async function` always returns a promise, and `await` waits for a promise and unwraps the value (or
throws the error, which you catch with `try/catch`). Pitfalls:

```js
// 🔴 sequential: 3 × the time
for (const id of ids) results.push(await fetchItem(id))

// ✅ concurrent
const results = await Promise.all(ids.map((id) => fetchItem(id)))

// 🔴 forEach doesn't wait for async callbacks
ids.forEach(async (id) => { await save(id) })
console.log('this prints before the saves')

// ✅ for...of with await (sequential) or Promise.all (concurrent)
```

With many tasks, `Promise.all` starts them all at once. To limit concurrency, use a package (e.g.
`p-limit`) or process in batches.

## Newer APIs

- `Promise.withResolvers()` (ES2024) returns `{ promise, resolve, reject }`, handy when `resolve` must be
  called outside the executor (e.g. in an event handler).
- `Promise.try(fn)` (ES2025) wraps a sync or async function so that a synchronous exception also becomes
  a rejection.

## Promisifying callbacks

```js
const readFileAsync = (path) =>
  new Promise((resolve, reject) =>
    fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data))),
  )
// in Node: util.promisify(fs.readFile) or the ready-made fs/promises
```

Anti-pattern: wrapping something that **already returns a promise** in `new Promise` (the explicit
construction anti-pattern). It's easy to lose a rejection that way.

## Sources

- [Using promises (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)
- [Promise (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [Promise.allSettled (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [Promise.withResolvers (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers)
- [Promise.try (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try)

## Questions

### What states can a promise have, and can the state change twice? {junior}

`pending`, `fulfilled` and `rejected`. Once fulfilled or rejected the promise is *settled* and its state no
longer changes: further `resolve`/`reject` calls are ignored. The executor passed to `new Promise` runs
synchronously, right inside the constructor.

### What does `then` return, and what happens when the callback returns a promise? {mid}

`then` always returns a new promise. If the callback returns a value, the new promise fulfills with it. If
it throws, the new promise rejects. If it returns a promise (or thenable), the new promise adopts its state
and result, so you never get a `Promise<Promise<T>>`. That's why inner async operations must be
`return`ed in a chain.

### How is `.then(onOk, onFail)` different from `.then(onOk).catch(onFail)`? {mid}

In the first form `onFail` only handles a rejection of the **previous** promise, and an error thrown inside
`onOk` isn't caught. In the second, `catch` is a separate link, so it catches both a rejection of the
earlier promise and an exception from `onOk`. The second form is usually what you want.

### What happens to the chain after `catch`? {junior}

`catch` handles the error and returns a new promise. If the handler doesn't throw, the chain continues as
**fulfilled** with the value returned from `catch` (or `undefined`), so the following `then`s run. To keep
propagating the error, rethrow it in `catch`.

### How do `Promise.all`, `allSettled`, `race` and `any` differ? {mid}

`all` waits for all of them and returns an array of results, but rejects on the **first** error.
`allSettled` waits for all and returns `{status, value|reason}` descriptors, so it never rejects. `race`
settles like the first promise to settle, even a rejected one. `any` waits for the first **fulfilled** one,
and if all reject it throws an `AggregateError` with the list of errors.

### Does `Promise.all` stop the other operations when one fails? {mid}

No. The returned promise rejects immediately, but the other operations keep running and their results are
ignored. Promises have no built-in cancellation. To abort e.g. `fetch` requests, use an `AbortController`:
pass its `signal` and call `abort()` in `catch`.

### How do you convert a callback-based API to a promise? {mid}

Wrap it in `new Promise((resolve, reject) => legacy(arg, (err, value) => err ? reject(err) : resolve(value)))`, or in Node use `util.promisify`, which does the same for
functions following the `(err, value)` callback convention (checked: the promisified function resolved with the result and rejected with the callback's error). A promise
settles only once, so later callback calls are ignored. Don't wrap code that already returns a promise in `new Promise`: that "explicit construction" antipattern only adds
places where errors get lost.

### How do you run many requests concurrently but no more than N at a time? {senior}

`Promise.all` starts them all at once. To limit concurrency, process the data in batches (a `for` over array
chunks with `await Promise.all(chunk.map(...))`) or use a pool: N "workers", each pulling the next task from
a shared queue in a loop. Ready-made solutions include `p-limit`. A pool is more efficient than batches,
because it doesn't wait for the slowest task in each batch.

### What happens to an unhandled promise rejection? {mid}

Browsers fire an `unhandledrejection` event and log the error to the console. Since v15, Node treats it like
an uncaught exception by default and **terminates the process**. That's why every chain should end with
error handling, and fire-and-forget promises need at least a `catch` that logs.

### What are `Promise.withResolvers()` and `Promise.try()` for? {senior}

`withResolvers()` (ES2024) returns `{ promise, resolve, reject }` without writing an executor. It's useful
when a promise is settled from outside, e.g. in an event callback or a queue. `Promise.try(fn)` (ES2025)
calls `fn` and always returns a promise, turning a synchronous exception from `fn` into a rejection. It
simplifies handling functions that may be sync or async.
