# Error handling {mid}

## `try` / `catch` / `finally`

```js
try {
  const config = JSON.parse(text)
  apply(config)
} catch (error) {
  console.error('Failed to load configuration', error)
} finally {
  hideSpinner()       // always: after success, after an error, even after a return in try
}
```

- `finally` **always** runs, including after a `return` in `try`. A `return` in `finally` **overrides** the result from `try`, and an
  exception thrown there overrides the original one, which is why you don't return from `finally`.
- Since ES2019 `catch` can omit its parameter: `catch { ... }`.
- `try/catch` catches only **synchronous** errors in its block and rejections of **awaited** promises. It won't catch an error from a
  `setTimeout` callback or from a promise that isn't awaited.

## Error types

Built-in: `Error`, `TypeError` (e.g. `null.x`, calling a non-function), `ReferenceError` (an undeclared variable), `RangeError`
(`new Array(-1)`), `SyntaxError` (e.g. `JSON.parse`), `URIError`, `EvalError`, `AggregateError` (multiple errors, e.g. from
`Promise.any`).

Throw **`Error` objects**, not strings: only `Error` has a `stack` and works with `instanceof`.

## Custom errors and `cause`

```js
class ValidationError extends Error {
  constructor(field, message, options) {
    super(message, options)
    this.name = 'ValidationError'
    this.field = field
  }
}

try {
  config = JSON.parse(raw)
} catch (e) {
  throw new Error('Failed to load configuration', { cause: e })   // ES2022: keeps the cause
}
```

Custom classes let you tell errors apart (`instanceof ValidationError`) and attach data (a field, an HTTP code). `cause` builds a chain of
causes without losing the original error and its stack.

## Strategies

- **Catch where you can do something meaningful**: show a message, retry, use a fallback value. An empty `catch {}` hides errors.
- **Let the rest propagate** (`throw`), ideally wrapped with a `cause`.
- **Expected errors vs exceptions**: validation or "not found" is often better modeled as a return value (`{ ok: false, error }`) than an
  exception. Keep exceptions for unexpected situations.
- **Global safety nets** for logging, not for real handling: in the browser `window.addEventListener('error')` and `'unhandledrejection'`,
  in Node `process.on('uncaughtException')` and `'unhandledRejection'`. After an `uncaughtException` the process is in an uncertain state
  and should be restarted. In React: an Error Boundary.
- Send errors to a monitoring system (Sentry etc.) with context, but without sensitive data.

## Async errors

```js
async function load() { throw new Error('boom') }

try { load() } catch {}              // 🔴 won't catch: the promise rejects later
try { await load() } catch {}        // ✅
load().catch(handle)                 // ✅
```

An unhandled rejection in Node (since v15) terminates the process by default, and in the browser it goes to the console and
`unhandledrejection`.

## Sources

- [try...catch (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch)
- [Error (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- [Error: cause (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)
- [Control flow and error handling (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling)

## Questions

### When does a `finally` block run? {junior}

Always after `try` (and possibly `catch`) finishes: after success, after an exception, and even after a `return`, `break` or `continue` inside
`try`. It's for cleanup: closing resources, hiding a spinner, releasing locks. A `return` in `finally` overrides the value returned from `try`
and swallows exceptions, so it's avoided.

### Why throw `Error` objects rather than strings? {junior}

An `Error` has a `stack` (a stack trace, crucial for debugging), `message` and `name`, works with `instanceof` and is handled properly by
monitoring tools. A thrown string has no stack, so you can't tell where it came from. Catching code usually assumes `error.message`, which
gives `undefined` for a string.

### How do you create a custom error type? {mid}

Extend `Error`: `class NotFoundError extends Error { constructor(msg, options) { super(msg, options); this.name = 'NotFoundError' } }`,
optionally with extra fields (a code, a resource). Setting `name` improves messages and logs. Custom classes let you tell errors apart with
`instanceof` and handle them selectively, letting unknown ones propagate.

### What is `cause` in the `Error` constructor? {mid}

An ES2022 option: `new Error('Failed to save', { cause: originalError })`. It lets you wrap a low-level error in a more meaningful one without
losing the original and its stack. It creates a chain of causes that consoles and monitoring tools display. Previously the original often got
lost on rethrow.

### Will `try/catch` catch an error from an async function called without `await`? {mid}

No. An async function returns a promise, and the error rejects that promise only later, after the `try` has finished. Use `await` inside the
`try`, or `.catch()` on the promise. Likewise, a `try` around `setTimeout(() => { throw ... })` won't catch the callback's error, because it runs
in a different event loop task.

### Why doesn't `try/catch` around `setTimeout` catch an error thrown in its callback? {mid}

The `try` block only covers code that runs synchronously inside it. `setTimeout` just schedules the callback and returns, so the `try` finishes; when the callback throws
later, it runs on a fresh call stack with no surrounding `try`, and the error becomes uncaught (checked in Node: the `try` completed, then `uncaughtException` fired). The same
applies to event listeners and callbacks. Put the `try/catch` inside the callback, or use promises with `await`, where a rejection propagates to the awaiting `try`.

### When should you catch exceptions, and when let them propagate? {mid}

Catch them where you can do something meaningful: show a message, retry the operation, use a fallback value, or add context and rethrow (`cause`).
Let through the ones a given layer can't handle, so they reach a layer that can (an HTTP handler, an Error Boundary). An empty `catch` without
logging hides errors and makes diagnosis harder.

### Exceptions or error values (`Result`)? {senior}

Exceptions work well for unexpected situations (network failure, a programmer error), because they propagate automatically. For expected business
outcomes (a validation error, a missing resource), an explicit return type such as `{ ok: true, value } | { ok: false, error }` forces the caller to
handle the case (at the type level in TypeScript) and doesn't mix errors with control flow. Many teams combine both approaches.

### What is `AggregateError`? {mid}

An error grouping several other errors in its `errors` field. `Promise.any` throws it when every promise is rejected. You can also use it yourself,
e.g. when validating many fields or running many independent operations, when you want to report all failures at once rather than just the first.

### How does a `return` in a `finally` block affect the function's result? {senior}

It overrides the value returned by `try` or `catch`, and even **swallows** a thrown exception: the function returns the value from `finally` as if
there were no error. Likewise, an exception thrown in `finally` replaces the original one. That's why `finally` contains only cleanup code, without
`return` and `throw`, and linters (`no-unsafe-finally`) flag it.
