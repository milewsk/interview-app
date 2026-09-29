# Arrays and their methods {junior}

Arrays are objects with numeric indexes and a `length` property. The key distinction is between **mutating** methods (they change
the array) and **non-mutating** ones (they return a new one). React and Redux code treats state as immutable, so it uses the latter.

| Mutating | Non-mutating counterparts |
| --- | --- |
| `push`, `pop`, `shift`, `unshift` | `[...arr, x]`, `arr.slice(0, -1)`, `arr.slice(1)`, `[x, ...arr]` |
| `splice` | `toSpliced` (ES2023), `slice`, `filter` |
| `sort` | `toSorted` (ES2023), `[...arr].sort()` |
| `reverse` | `toReversed` (ES2023) |
| `arr[i] = x`, `fill`, `copyWithin` | `with(i, x)` (ES2023), `map` |

## Transforming

```js
const users = [{ name: 'Alice', age: 30, active: true }, { name: 'Bob', age: 17, active: false }]

users.map((u) => u.name)                  // ['Alice', 'Bob']
users.filter((u) => u.active)             // only active users
users.reduce((sum, u) => sum + u.age, 0)  // 47, always pass an initial value
users.find((u) => u.age > 18)             // the first matching element or undefined
users.findIndex((u) => u.age > 18)        // the index or -1 (there's also findLast / findLastIndex)
users.some((u) => !u.active)              // does any element match
users.every((u) => u.age > 0)             // do all elements match
users.flatMap((u) => u.tags ?? [])        // map + flatten one level
Object.groupBy(users, (u) => (u.active ? 'active' : 'inactive'))  // ES2024
```

## Pitfalls

```js
[3, 1, 10, 2].sort()                 // [1, 10, 2, 3]: sorts as strings by default!
[3, 1, 10, 2].sort((a, b) => a - b)  // [1, 2, 3, 10]
['1', '2', '3'].map(parseInt)        // [1, NaN, NaN]: map passes (element, index), parseInt(x, radix)
[].reduce((a, b) => a + b)           // TypeError: empty array with no initial value
[NaN].indexOf(NaN)                   // -1, but [NaN].includes(NaN) → true
new Array(3).map(() => 1)            // [ <3 empty items> ]: map skips holes
new Array(2).fill([])                // both elements are THE SAME array
Array.from({ length: 2 }, () => [])  // two distinct arrays ✅
[].every(() => false)                // true (vacuous truth), [].some(...) → false
```

- `forEach` returns nothing and **can't be stopped** (`break`). Use `for...of`, `some` or `find` to stop early.
- `sort` is stable (since ES2019): elements equal according to the comparator keep their order.
- `slice(start, end)` doesn't mutate, while `splice(start, deleteCount, ...items)` mutates and returns the removed elements.
- `at(-1)` returns the last element (more readable than `arr[arr.length - 1]`).

## Creating and iterating

- `Array.from(iterable, mapFn)`, `Array.of(...)`, spread `[...set]`.
- `for...of` iterates over values, while `for...in` iterates over keys (including inherited ones), so it isn't used for arrays.
- Performance: `map`/`filter` create intermediate arrays. In very hot loops a plain loop is faster, but readability usually wins.

## Sources

- [Array (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
- [Array.prototype.toSorted (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted)
- [Array.prototype.reduce (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
- [Object.groupBy (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy)

## Questions

### Which array methods mutate the array, and which don't? {junior}

Mutating: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` and assignment by index. Non-mutating:
`map`, `filter`, `reduce`, `slice`, `concat`, `flat`, `flatMap` and the new `toSorted`, `toReversed`, `toSpliced` and `with` (ES2023).
Code built on immutable state (React, Redux) uses the latter.

### How does `map` differ from `forEach`? {junior}

`map` returns a new array of the callback's results, so it's for transforming data. `forEach` returns `undefined` and is only for side
effects. Neither can be stopped midway. When you need to exit early, use `for...of` with `break`, `some`, `every` or `find`.

### Why does `[10, 1, 3].sort()` return `[1, 10, 3]`? {junior}

By default `sort` converts elements to strings and compares them lexicographically, and `'10'` comes before `'3'`. Sort numbers with a
comparator: `sort((a, b) => a - b)` for ascending. `sort` mutates the array, so to sort without changing the original use `toSorted` or
`[...arr].sort(...)`.

### How does `reduce` work, and why pass an initial value? {mid}

`reduce((acc, item) => ..., initial)` walks the elements, passing the accumulator from the previous step, and returns the final result,
e.g. a sum, an object or a map. Without an initial value the first element becomes the first accumulator, which causes type bugs (e.g. when
summing object fields) and a `TypeError` for an empty array. Passing `initial` removes both problems.

### What does `['1', '2', '3'].map(parseInt)` return? {mid}

`[1, NaN, NaN]`. `map` passes the callback `(element, index, array)`, and `parseInt` takes `(string, radix)`, so the calls are
`parseInt('1', 0)` (radix 0 means default, so 1), `parseInt('2', 1)` (an invalid radix, so NaN) and `parseInt('3', 2)` (there's no digit 3
in binary, so NaN). Correct: `map(Number)` or `map((s) => parseInt(s, 10))`.

### How do `slice` and `splice` differ? {junior}

`slice(start, end)` returns a new array with a portion and doesn't change the original. `splice(start, deleteCount, ...items)` modifies the
array: it removes and inserts elements in place and returns the removed ones. The non-mutating counterpart of `splice` is `toSpliced`
(ES2023).

### How do `find`, `filter`, `some` and `includes` differ? {junior}

`find` returns the **first** matching element (or `undefined`). `filter` returns an **array** of all matches. `some` returns a **boolean**
saying whether any element matches, stopping at the first hit. `includes(value)` checks for a specific value using SameValueZero comparison
(it also detects `NaN`, unlike `indexOf`).

### Why is `new Array(3).fill([])` a trap? {mid}

`fill` puts the same value into every slot, and for an object that's the same reference, so all elements point to one array and changing
one changes "all of them". `Array.from({ length: 3 }, () => [])` creates independent elements, because it calls the factory for every position.

### What are the new `toSorted`, `toReversed`, `toSpliced` and `with` methods? {mid}

Non-mutating counterparts of `sort`, `reverse`, `splice` and assignment by index, added in ES2023. They return a new array and leave the
original untouched, which simplifies immutable state updates, e.g. `items.with(index, updated)` instead of
`items.map((x, i) => (i === index ? updated : x))`.

### Why don't you use `for...in` to iterate over an array? {junior}

`for...in` iterates over **keys** (as strings), including inherited properties and ones added to the array, and the order isn't guaranteed in
every case. For array values use `for...of`, array methods or a classic indexed loop. `for...in` is meant for object keys.
