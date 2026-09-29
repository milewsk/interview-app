# Iterators and generators {mid}

The **iteration protocol** is the contract behind `for...of`, spread (`[...x]`), array destructuring, `Array.from`, `Promise.all` and
`new Map(iterable)`:

- **iterable**: an object with a `[Symbol.iterator]()` method that returns an iterator,
- **iterator**: an object with a `next()` method that returns `{ value, done }`.

Built-in iterables include `Array`, `String` (iterates over Unicode characters, so an emoji is one element), `Map`, `Set`, `arguments`,
`NodeList` and typed arrays. A plain object is **not** iterable, so `for...of` over `{}` throws a `TypeError` (use `Object.entries` for
objects).

```js
const range = {
  from: 1,
  to: 3,
  [Symbol.iterator]() {
    let current = this.from
    const last = this.to
    return { next: () => (current <= last ? { value: current++, done: false } : { value: undefined, done: true }) }
  },
}
[...range]   // [1, 2, 3]
```

## Generators

A `function*` returns a **generator**, which is both an iterator and an iterable. Its code runs **lazily**: up to the next `yield`, where
it pauses, resuming on the next `next()`.

```js
function* idGenerator() {
  let id = 1
  while (true) yield id++        // an infinite sequence is safe, because values are computed on demand
}

const ids = idGenerator()
ids.next().value   // 1
ids.next().value   // 2
```

- `next(x)` passes a value **into** the generator: it becomes the result of the `yield` expression.
- `return value` finishes the generator (`{ value, done: true }`), but `for...of` and spread **ignore** that value.
- `yield* other` delegates to another iterable, useful for recursion, e.g. walking a tree.
- `gen.return()` and exiting a `for...of` (`break`) close the generator and run its `finally` blocks, so you can release resources there.

```js
class Tree {
  constructor(value, children = []) { this.value = value; this.children = children }
  *[Symbol.iterator]() {
    yield this.value
    for (const child of this.children) yield* child
  }
}
```

## Iterator helpers (ES2025)

Iterators have lazy methods similar to array methods: `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray`, `some`, `every`,
`find`. Unlike arrays, they create no intermediate arrays and work on infinite sequences:

```js
idGenerator().filter((n) => n % 2).map((n) => n * 10).take(3).toArray()   // [10, 30, 50]
```

## Async iterators

`async function*` combines `await` and `yield`, and is consumed with `for await...of`. It's useful for paging through APIs, streams
(`ReadableStream` is async iterable) and processing data chunk by chunk.

```js
async function* fetchAllPages(url) {
  while (url) {
    const res = await fetch(url).then((r) => r.json())
    yield* res.items
    url = res.next
  }
}
for await (const item of fetchAllPages('/api/items')) process(item)
```

## Sources

- [Iteration protocols (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)
- [function* (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*)
- [Iterator helpers (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator)
- [for await...of (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)

## Questions

### What is the iteration protocol? {mid}

A two-part contract: an **iterable** object has a `[Symbol.iterator]()` method returning an **iterator**, and the iterator has a `next()` method
returning `{ value, done }`. `for...of`, spread, array destructuring, `Array.from`, `Map`/`Set` from an iterable and `Promise.all` are built on
it. Any object implementing the protocol works with all of them automatically.

### Why does `for...of` over a plain object throw an error? {junior}

Plain objects don't implement `[Symbol.iterator]`, so they aren't iterable. Iterate over keys and values with `Object.keys`, `Object.values` or
`Object.entries(obj)` in a `for...of`, while `for...in` gives keys (including inherited ones). You can also give the object its own
`[Symbol.iterator]`.

### What is a generator, and how does it differ from a regular function? {mid}

A `function*` that, when called, doesn't run its body but returns a generator object. The code runs in pieces: up to each `yield`, where it pauses
and hands out a value, resuming on the next `next()`. A regular function runs from start to finish in one go. A generator keeps its state (local
variables) between `next()` calls.

### How do you pass a value into a generator? {mid}

With `gen.next(value)`: the value becomes the result of the `yield` expression the generator was paused at. The first `next()` only runs the
generator to its first `yield`, so a value passed there is lost. That's how two-way generators work, e.g. in redux-saga.

### What are generators useful for in practice? {mid}

Lazy and infinite sequences (IDs, numbers, paging), implementing iterators for custom structures (trees, graphs) via `yield*`, processing large
collections without intermediate arrays, paging APIs with `async function*`, and as a mechanism for state machines and control flow (e.g.
redux-saga, and historically `co` before async/await).

### What is `yield*`? {mid}

It delegates iteration to another iterable or generator: all its values pass through the current generator, and the result of `yield*` is the
value returned (`return`) by the delegated generator. It simplifies recursion, e.g. walking a tree (`for (const child of children) yield* child`),
and concatenating sequences.

### What happens to a generator after a `break` in a `for...of` loop? {senior}

The loop calls `return()` on the iterator, so the generator is closed and its `finally` blocks run. This lets you release resources (close a file,
a connection or a subscription) even when the consumer doesn't read every value. After closing, further `next()` calls return `{ done: true }`.

### What are iterator helpers, and how do they differ from array methods? {senior}

Methods (ES2025) on iterators: `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray` and others. They're lazy: they process element by
element only when consumed, with no intermediate arrays, so they suit large and infinite sequences, e.g. `gen().filter(f).map(g).take(10).toArray()`.
Array methods always compute every element right away.

### How do you iterate over data that arrives asynchronously? {mid}

With async iterators: an `async function*` can `await` and `yield`, and the consumer uses `for await...of`. That's how you iterate over API pages,
streams (`ReadableStream`, Node streams) or events. `for await` waits for each element in turn, which gives natural flow control (backpressure).

### Why is `[...'a😀'].length` 2, while `'a😀'.length` is 3? {mid}

`length` counts UTF-16 code units, and an emoji outside the basic plane takes two (a surrogate pair). The string iterator walks Unicode **code
points**, so the emoji is one element. That's why counting and splitting text with emoji uses spread or `Array.from`, and complex graphemes (e.g.
flags, emoji with skin tone modifiers) need `Intl.Segmenter`.
