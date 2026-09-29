# Modern syntax (ES2015+) {junior}

Language features that come up in interviews as "what does this code return" and that appear in every modern project.

## Destructuring

```js
const user = { id: 1, name: 'Alice', address: { city: 'Krakow' }, role: undefined }

const { name, address: { city }, role = 'user', ...rest } = user
// name 'Alice', city 'Krakow', role 'user' (the default applies to undefined, not null), rest { id: 1 }

const [first, , third = 't', ...others] = [1, 2, undefined, 4, 5]
// first 1, third 't', others [4, 5]

let a = 1, b = 2
;[a, b] = [b, a]        // swapping values

function draw({ width = 100, height = 50 } = {}) {}   // parameters as an object with defaults
```

## Spread and rest

- **Spread** (`...`) expands an iterable or an object: `[...arr, x]`, `{ ...obj, x: 1 }`, `fn(...args)`. With objects, later keys
  override earlier ones. The copy is **shallow**.
- **Rest** collects the remaining items: `function sum(...nums) {}`, `const { a, ...others } = obj`. It must come last. It replaces the
  outdated `arguments` object.

## Optional chaining and nullish coalescing

```js
user?.address?.city          // undefined instead of a TypeError when address is null/undefined
user.getName?.()             // call it if the method exists
list?.[0]

const port = config.port ?? 3000    // a default only for null/undefined
const port2 = config.port || 3000   // a default also for 0, '', false ⚠️
```

`??` makes sense when `0`, `''` or `false` are valid values (e.g. port 0, an empty name). `?.` short-circuits the whole expression, so
`a?.b.c` doesn't throw when `a` is `null`. It does throw, though, when `a.b` is `undefined`.

**Logical assignment** (ES2021): `x ??= d` (assign if `null`/`undefined`), `x ||= d` (if falsy), `x &&= v` (if truthy).

## Template literals

```js
const msg = `Hello ${name}, you have ${count} ${count === 1 ? 'message' : 'messages'}`
const multi = `line 1
line 2`
```

**Tagged templates** pass the string parts and values to a function: `` sql`SELECT * FROM users WHERE id = ${id}` ``. This enables e.g.
safely parameterized queries, styling (styled-components) or translation.

## Other useful features

- Shorthand properties and methods, and computed keys: `{ name, [key]: value, greet() {} }`.
- Default parameters: `function f(a, b = a * 2) {}`. The default is evaluated on every call and only for `undefined`.
- Numeric separators: `1_000_000`.
- `Array.prototype.at(-1)`, `Object.groupBy`, `structuredClone`, `Array.prototype.findLast`.
- The `**` operator instead of `Math.pow`.
- `Symbol` for unique keys, `Map`/`Set`/`WeakMap`, iterators and generators, `class`, ES modules.

## Sources

- [Destructuring (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring)
- [Spread syntax (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Optional chaining (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)
- [Nullish coalescing operator (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Template literals (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

## Questions

### How does `??` differ from `||`? {junior}

`a || b` returns `b` when `a` is **falsy** (`0`, `''`, `false`, `null`, `undefined`, `NaN`). `a ?? b` returns `b` only for `null` and
`undefined`. `??` is right when `0`, an empty string or `false` are valid values, e.g. `volume ?? 50` won't override mute (`0`), while
`volume || 50` will.

### How does optional chaining (`?.`) work? {junior}

If the value on the left is `null` or `undefined`, the whole expression returns `undefined` instead of throwing a `TypeError`, and the rest
of the chain doesn't run. It works for properties (`a?.b`), indexes (`a?.[0]`) and calls (`a.fn?.()`). Overused, it hides data bugs, so use
it where a missing value is expected.

### How does spread differ from rest? {junior}

It's the same `...` syntax in different roles. Spread **expands** an array or object into elements (`[...a, ...b]`, `fn(...args)`,
`{ ...obj }`). Rest **collects** the remaining elements into an array or object (`function f(...args)`, `const { a, ...rest } = obj`) and must
come last.

### When does a default value in destructuring or a parameter apply? {mid}

Only when the value is `undefined` (a missing property or argument). For `null`, `0` or `''` the default is **not** used, so
`const { role = 'user' } = { role: null }` gives `null`. The default is evaluated each time it's used and can refer to earlier parameters
(`b = a * 2`).

### How do you swap two variables without a temporary variable? {junior}

With array destructuring: `[a, b] = [b, a]`. The right side creates an array with the current values, and the left side assigns them in
reverse order. If the previous line doesn't end with a semicolon and this line starts with `[`, you need a semicolon before it, or JS will
join the expressions.

### Does spread create a deep copy of an object? {junior}

No, a shallow one. `{ ...obj }` and `[...arr]` copy only the first level, and nested objects and arrays are shared by reference. Changing
`copy.nested.x` also changes the original. Use `structuredClone` for a deep copy.

### What are tagged templates, and what are they good for? {mid}

A function call with a template: `` tag`text ${a} and ${b}` `` passes `tag` an array of the fixed parts and the values separately. The function
can process them however it likes, e.g. protect values against SQL injection (parameterization), build styles (styled-components), GraphQL
queries (`gql`) or translations. `String.raw` is a built-in tag returning the raw text.

### What does `a?.b.c` return when `a` is `null`, and when `a.b` is `undefined`? {mid}

When `a` is `null`, the whole expression returns `undefined`, because `?.` short-circuits the entire chain. When `a` exists but `a.b` is
`undefined`, reading `.c` throws a `TypeError`, since there's no `?.` after `b`. Guarding both levels requires `a?.b?.c`.

### What are the logical assignment operators (`??=`, `||=`, `&&=`)? {mid}

Shorthands combining a logical operator with assignment (ES2021): `x ??= d` assigns `d` when `x` is `null`/`undefined`; `x ||= d` when `x` is
falsy; `x &&= v` when `x` is truthy. The assignment happens only conditionally, so e.g. a setter isn't called needlessly. They're handy for lazy
initialization: `cache[key] ??= compute(key)`.

### Why use a rest parameter instead of `arguments`? {junior}

`arguments` is an array-like object, not an array, so it has no `map` or `filter`. It doesn't exist in arrow functions, and in sloppy mode it's
linked to the parameters, which causes surprising effects. `...args` is a real array, works everywhere and shows explicitly in the signature
that the function takes a variable number of arguments.
