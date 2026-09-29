# Closures {mid}

A closure is a function **together with the lexical environment** it was created in. This lets the
function access variables from its outer scope even after that scope has finished executing. In
JavaScript **every** function is a closure. The term matters in practice once a function *outlives*
the scope that created it.

```js
function makeCounter() {
  let count = 0
  return () => ++count
}

const next = makeCounter()
next() // 1
next() // 2
```

## Lexical (static) scope

Which variables a function can see is decided by **where it is defined** in the code, not where it
is called:

```js
const x = 'global'

function outer() {
  const x = 'outer'
  return function inner() {
    return x
  }
}

function call(fn) {
  const x = 'call site'
  return fn()
}

call(outer()) // 'outer'
```

When a variable is referenced, the engine walks the **scope chain**: first the current function,
then the enclosing function, and so on up to the global scope.

## How it works in the engine

- Every function **call** creates a new environment (environment record) holding its variables.
- A function created inside it keeps a hidden reference (`[[Environment]]`) to that environment.
- The environment lives as long as a reachable function needs it. After that the garbage
  collector reclaims it.

Two important properties follow.

**Each call has its own state.** Counters from two `makeCounter()` calls are independent:

```js
const a = makeCounter()
const b = makeCounter()
a() // 1
a() // 2
b() // 1
```

**A closure captures the variable (the binding), not its value at creation time:**

```js
let n = 1
const read = () => n
n = 2
read() // 2
```

## Loops: `var` vs `let`

`var` is function-scoped: there is **one** variable for the whole loop. `let` in a `for` header
creates a **fresh binding per iteration**, so each closure gets its own copy.

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i)) // 3 3 3
for (let j = 0; j < 3; j++) setTimeout(() => console.log(j)) // 0 1 2
```

## Common patterns

**Private state and modules.** Before classes and ES modules, the IIFE module pattern was common:

```js
const wallet = (() => {
  let balance = 0 // not accessible from outside
  return {
    deposit: (amount) => (balance += amount),
    getBalance: () => balance,
  }
})()
```

**Function factories and partial application:**

```js
const multiply = (a) => (b) => a * b
const double = multiply(2)
double(5) // 10
```

**`once`: a function that runs only once:**

```js
function once(fn) {
  let called = false
  let result
  return function (...args) {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}
```

**Memoization:**

```js
function memoize(fn) {
  const cache = new Map()
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg))
    return cache.get(arg)
  }
}
```

**Debounce**, which calls the function only after a burst of events stops (e.g. typing):

```js
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}
```

## Closures in React: stale closures

Every render is a new function call, so handlers and effects close over props and state **from a
specific render**. A callback that outlives its render sees outdated values:

```tsx
function Timer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds(seconds + 1), 1000) // 🔴 seconds is always 0
    return () => clearInterval(id)
  }, [])
  return <p>{seconds}</p> // gets stuck at 1
}
```

Fix: `setSeconds((s) => s + 1)` (the updater doesn't need the captured value) or correct effect
dependencies.

## Closures and memory

As long as a function is reachable (e.g. registered as a listener), its environment with the captured
variables can't be freed. Engines optimize this and only retain variables actually used by inner
functions. In V8, however, all functions created in the same scope share **one context object**. A
small long-lived function can therefore keep alive a large object used by another function from the
same scope.

## Sources

- [Closures (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)
- [let (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let)
- [State as a snapshot (react.dev)](https://react.dev/learn/state-as-a-snapshot)

## Questions

### Explain in your own words what a closure is. {junior}

It's a function that remembers the environment (variables) it was created in and can access it even
after the outer function has returned. This follows from lexical scope: variable visibility is
determined by where the function is defined, and the environment lives as long as a reachable
function references it.

### What does this code print, and how do you fix it without `let`? {junior}

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i))
}
```

It prints `3, 3, 3`. `var` is function-scoped, so all callbacks close over **the same** `i`, which
equals `3` once the loop ends. Without `let`, create a new scope per iteration with an IIFE or pass
the value as an argument:

```js
for (var i = 0; i < 3; i++) {
  ;((j) => setTimeout(() => console.log(j)))(i)
}
// or: setTimeout((j) => console.log(j), 0, i)
```

### What do `a()`, `a()`, `b()` return if `a` and `b` come from two `makeCounter()` calls? {junior}

`1`, `2`, `1`. Each `makeCounter()` call creates a **new** environment with its own `count`, so the
counters are independent.

### Implement `once(fn)`. {mid}

The closure stores a flag and the result of the first call:

```js
function once(fn) {
  let called = false
  let result
  return function (...args) {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}
```

`fn.apply(this, args)` preserves `this` and the arguments, so `once` also works for object methods.

### Implement `debounce`. How is it different from `throttle`? {mid}

```js
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}
```

**Debounce** calls the function only after `delay` ms pass without another event. It suits search
while typing. **Throttle** calls it at most once every `delay` ms, even during a continuous stream of
events. It suits scroll and resize handling.

### What is a "stale closure" in React and how do you avoid it? {mid}

A callback created in one render closes over the props and state **of that render**. If it lives
longer (an interval, a subscription, an effect with incomplete dependencies), it sees outdated values.
Fixes: complete effect dependencies, an updater `setX(x => x + 1)` instead of reading the captured
value, `useEffectEvent` to read the latest values, or `useRef`.

### Can closures cause memory leaks? {senior}

Yes. As long as a function is reachable, its environment with the captured variables stays in memory.
A typical example is a listener or interval that is never removed and closes over a large object or
a DOM node. In V8, functions from the same scope share a context, so a living function can retain
variables used only by another one. Fix: clean up (`removeEventListener`, `clearInterval`, effect
cleanup) and avoid capturing needlessly large objects.

### How do you get private data in JavaScript? {junior}

Classically with closures: variables in a function's scope aren't accessible from outside, and only
the returned functions are exposed (the module pattern). Nowadays classes also have private `#field`s,
enforced by the language. ES modules likewise hide everything that isn't exported.

### What does `call(outer())` return if `outer` defines `x = 'outer'` and returns a function reading `x`, while `call` has its own `x = 'call site'`? {junior}

`'outer'`. JavaScript has **lexical scope**: a function sees variables from where it was **defined**, not
from where it's called. The `x` inside `call` isn't visible to the returned function. JavaScript has no
dynamic scope (dependent on the caller), although `this` in regular functions behaves similarly.

### Implement `memoize`. What are its limitations? {mid}

```js
function memoize(fn) {
  const cache = new Map()
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg))
    return cache.get(arg)
  }
}
```

The closure holds a `Map` of results. Limitations: object keys are compared by reference (two identical
literals are two entries), only the first argument is handled (the rest are ignored, giving wrong
results), the cache grows without bound (a memory leak, fixed with an LRU limit or a `WeakMap` for
object keys), and the function must be pure.
