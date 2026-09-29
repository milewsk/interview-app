# Objects, references and copying {mid}

A variable holding an object (including an array, function or date) stores a **reference**. Assigning it or passing it to a
function copies the reference, not the object, so a change through one variable is visible through the other.

```js
const a = { count: 1 }
const b = a
b.count = 2          // a.count === 2: the same object

function mutate(obj) { obj.x = 1 }          // changes the caller's object
function reassign(obj) { obj = { x: 2 } }   // changes only the local copy of the reference
```

JavaScript always passes arguments **by value**, but for objects that value is a reference.

## Shallow and deep copies

A **shallow** copy creates a new top-level object, but nested objects are **shared**:

```js
const orig = { a: 1, nested: { b: 2 } }
const copy = { ...orig }            // or Object.assign({}, orig), [...arr], arr.slice()
copy.a = 9                          // orig.a is still 1
copy.nested.b = 99                  // orig.nested.b === 99 ⚠️
```

A **deep** copy copies every level:

| Method | Pros | Limitations |
| --- | --- | --- |
| `structuredClone(obj)` | built in, handles `Date`, `Map`, `Set`, typed arrays, **cycles** | doesn't copy functions (throws `DataCloneError`), loses class prototypes and getters |
| `JSON.parse(JSON.stringify(obj))` | simple, fast for plain data | `Date` becomes a string, drops `undefined`, functions and `Symbol`, turns `NaN`/`Infinity` into `null`, **throws on cycles** |
| libraries (`lodash.cloneDeep`) | flexible | an extra dependency |

In practice deep copies are rarely needed. With **immutable updates** (React, Redux) you copy only the path to the changed value:

```js
const next = { ...state, user: { ...state.user, address: { ...state.user.address, city: 'Krakow' } } }
```

For deep structures Immer helps: it lets you write "mutations" on a draft and produces a new version that keeps the original
references wherever nothing changed (structural sharing).

## Immutability at the language level

- `Object.freeze(obj)`: you can't add, delete or change properties. It works **shallowly** (nested objects stay mutable). In sloppy
  mode a write is silently ignored, and in strict mode (ES modules) it throws `TypeError`.
- `Object.seal(obj)`: existing properties can change, but you can't add or delete any.
- `Object.preventExtensions(obj)`: only forbids adding.

## Comparing objects

`===` compares references: `{ a: 1 } === { a: 1 }` is `false`. Comparing contents requires your own function (shallow or deep) or a
library. Using `JSON.stringify` for comparison fails when the key order differs.

## Keys and dictionaries

- A plain object's keys are strings (or symbols). An object used as a key turns into `'[object Object]'`.
- Key order: integer-like keys first in ascending order, then strings in insertion order.
- **`Map`** accepts keys of any type (including objects), keeps insertion order, has `size`, has no collisions with
  `Object.prototype`, and performs better with frequent additions and deletions.
- `Object.keys/values/entries` and `Object.fromEntries` let you transform objects like arrays.

## Sources

- [structuredClone (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)
- [Object.freeze (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)
- [Shallow copy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Shallow_copy)
- [Deep copy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Deep_copy)
- [Map (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)

## Questions

### Does JavaScript pass objects by reference? {junior}

Formally everything is passed by value, but for objects that value is a reference. A function can therefore change the contents of
the passed object (the caller sees it), but assigning a new object to the parameter (`obj = {}`) changes only the local copy of the
reference and doesn't affect the caller.

### What's the difference between a shallow and a deep copy? {junior}

A shallow copy (`{...obj}`, `Object.assign`, `[...arr]`, `slice`) creates a new top-level object, but nested objects are shared with the
original, so changing them shows in both. A deep copy recursively copies every level, making the copy completely independent.

### How do you deep-copy an object, and what are the pitfalls? {mid}

Best with `structuredClone`: it handles `Date`, `Map`, `Set` and cycles, but doesn't copy functions and loses class prototypes.
`JSON.parse(JSON.stringify(x))` turns dates into strings, drops `undefined`, functions and symbols, turns `NaN` into `null`, and throws on
cycles. Often, though, a deep copy is unnecessary, because an immutable update copying only the changed path is enough.

### Does `Object.freeze` freeze an object completely? {mid}

No, it works shallowly: it blocks adding, deleting and changing top-level properties, but nested objects stay mutable. Full freezing
requires recursion (deep freeze). In sloppy mode a write attempt is silently ignored, while in strict mode (modules, classes) it throws
`TypeError`.

### Why does `{ a: 1 } === { a: 1 }` return `false`? {junior}

For objects, `===` compares references, not contents. Each literal creates a new object in memory, so they're two different objects.
Comparing contents requires a function that compares properties (shallowly or recursively) or a library, e.g. `lodash.isEqual`.

### How does `Map` differ from a plain object used as a dictionary? {mid}

`Map` accepts keys of any type (objects, functions), while an object accepts only strings and symbols. `Map` keeps insertion order, has
`size`, is iterable, has no inherited keys from `Object.prototype` (no collisions, e.g. with `constructor`), and is optimized for frequent
additions and deletions. An object is more convenient for fixed structures and JSON serialization.

### What does an immutable update of a nested object involve? {mid}

You create new objects along the whole path from the root to the changed value, and pass the other branches by reference, e.g.
`{ ...state, user: { ...state.user, name } }`. Changed objects get new references, which makes change detection fast (React, `memo`,
selectors), while unchanged ones are shared. Immer simplifies this for deep structures.

### What happens if you use an object as a key in a plain object? {mid}

The key is converted to a string, i.e. `'[object Object]'`. All object keys therefore land under the same key and overwrite each other. Use
`Map` for object keys, or `WeakMap` when the key shouldn't prevent the GC from freeing the object.

### In what order does `Object.keys` return keys? {mid}

First the integer-index keys (e.g. `'1'`, `'2'`) in ascending order, then the remaining string keys in insertion order. Symbols are skipped
(`Object.getOwnPropertySymbols` returns those). If insertion order matters for arbitrary keys, use a `Map`.

### How do `Object.freeze`, `Object.seal` and `Object.preventExtensions` differ? {senior}

`preventExtensions` only blocks adding new properties. `seal` also blocks deleting and reconfiguring, but allows changing the values of
existing properties. `freeze` also blocks changing values, so the object is read-only. All of them are shallow, and you can check them with
`Object.isExtensible`, `isSealed` and `isFrozen`.
