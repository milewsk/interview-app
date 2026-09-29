# async/await in JavaScript {mid}

`async`/`await` is syntax over promises that lets you write asynchronous code linearly. It doesn't change the execution model:
promises and microtasks still do the work underneath.

```js
async function loadUser(id) {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()               // the returned value becomes the promise's value
}
```

## Semantics

- An `async` function **always returns a promise**: a returned value fulfills it, and a thrown exception rejects it.
- Code runs **synchronously until the first `await`**. Then the function suspends, and the caller immediately continues its own code.
  The rest of the function is queued as a microtask once the awaited value settles.
- `await` also accepts non-promise values (`await 42`) and thenables. It always yields control for at least one microtask, though.
- Errors are caught with an ordinary `try/catch` around `await`.

## Sequential or concurrent

```js
// 🔴 sequential: time = the sum
const user = await getUser(id)
const orders = await getOrders(id)

// ✅ concurrent: time = the longest
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])

// ✅ also concurrent: start first, then wait
const userP = getUser(id)
const ordersP = getOrders(id)
const user2 = await userP, orders2 = await ordersP
```

With the "start, then wait one by one" variant, watch out for errors: if `ordersP` rejects before you start waiting for it, some environments
report an unhandled rejection. `Promise.all` is safer. Operations that depend on each other must stay sequential.

## Pitfall: `return` vs `return await` in `try`

```js
async function load() {
  try {
    return fetchData()          // 🔴 a rejection does NOT reach the catch below
  } catch {
    return fallback
  }
}

async function loadSafe() {
  try {
    return await fetchData()    // ✅ a rejection reaches the catch
  } catch {
    return fallback
  }
}
```

Without `await`, the function leaves the `try` block before the promise settles. Outside `try/catch`, `return await` is unnecessary (apart from a
better stack trace).

## Loops

- `for...of` with `await` processes items **one after another**, which is right when order matters or load must be limited.
- `forEach(async ...)` **doesn't wait** for the callbacks. For concurrency use `Promise.all(items.map(async ...))`, and for limited concurrency a pool
  (e.g. `p-limit`).
- `for await...of` iterates over async iterators (streams, paging).

## Cancellation and timeouts

Promises have no built-in cancellation. The standard is **`AbortController` / `AbortSignal`**:

```js
const controller = new AbortController()
const res = await fetch(url, { signal: controller.signal })   // controller.abort() aborts the request

await fetch(url, { signal: AbortSignal.timeout(5000) })           // TimeoutError after 5 s
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])   // whichever comes first
```

Your own async functions should accept a `signal` and pass it on (e.g. to `fetch`), or check `signal.aborted` / `signal.throwIfAborted()`.

## Sources

- [async function (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [await (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
- [AbortController (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [AbortSignal.timeout (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- [AbortSignal.any (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)

## Questions

### What does an `async` function return? {junior}

Always a promise. A value returned with `return` fulfills it, and a thrown exception rejects it. Even `async () => 1` returns `Promise<1>`, so you read
the result with `await` or `.then()`.

### Does an `async` function's code run asynchronously from the start? {mid}

No. The body runs synchronously up to the first `await`. Only there does the function suspend and return a pending promise to the caller, which continues
its own code. The rest of the function runs as a microtask. An `async` function without `await` therefore runs entirely synchronously, although its
result is still wrapped in a promise.

### How do you run several independent operations concurrently? {junior}

Start them all before waiting and wait for them together: `const [a, b] = await Promise.all([getA(), getB()])`. The time is then that of the longest
operation, not the sum. Awaiting each in turn (`await getA(); await getB()`) runs them sequentially. When results must be collected despite errors, use
`Promise.allSettled`.

### Why does `return promise` in a `try` block not catch an error, while `return await promise` does? {mid}

`return promise` finishes the `try` block immediately, returning a pending promise. When it later rejects, the `try` block no longer exists, so the error
goes to the caller. `return await` waits for the settlement inside the `try`, so a rejection becomes an exception caught by `catch`. Outside `try/catch`,
`await` on `return` isn't needed.

### How do you cancel an async operation? {mid}

With an `AbortController`: pass `controller.signal` to the operation (`fetch`, streams, your own functions), and `controller.abort()` aborts it, so the
promise rejects with an `AbortError`. `AbortSignal.timeout(ms)` creates a signal that aborts after a time (`TimeoutError`), and `AbortSignal.any([...])`
combines several signals. Your own functions should accept a `signal` and pass it on.

### Does `await` block the thread? {junior}

No. `await` suspends only the current `async` function and yields to the event loop, so other code runs meanwhile: click handling, rendering, other
requests. Only a long synchronous computation blocks the thread, whether or not it's in an `async` function.

### How do you handle errors with several concurrent requests? {mid}

`Promise.all` rejects on the first error (the other operations keep running, but their results are ignored), so it suits cases where you need every result.
`Promise.allSettled` collects each operation's outcome (`fulfilled`/`rejected`), which lets you handle partial success. You can also cancel the rest on
the first error with a shared `AbortController`.

### Why is `array.forEach(async (x) => await save(x))` a bug? {mid}

`forEach` ignores the promises returned by the callback, so it doesn't wait for the saves. Code after `forEach` runs immediately, and save errors don't
reach the surrounding `try/catch` (they become unhandled rejections). Correct: `for (const x of array) await save(x)` (sequential) or
`await Promise.all(array.map(save))` (concurrent).

### How does `async/await` differ from `.then()`? {junior}

They run on the same promise mechanism. `async/await` lets you write code linearly, with natural `try/catch`, loops and conditions, which reads better
across many steps. `.then()` can be more concise for simple transformations and doesn't need an `async` function. You can mix them freely, since `await`
works on any promise.

### How do you add a timeout to a `fetch` request? {mid}

Pass `signal: AbortSignal.timeout(5000)`. After 5 seconds the request is aborted and the promise rejects with a `TimeoutError`. If you also need manual
cancellation, combine the signals: `AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])`. The older approach was `Promise.race` with a promise
rejected by `setTimeout`, which doesn't actually abort the request.
