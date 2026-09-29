# Types and coercion {junior}

JavaScript has **8 types**: 7 primitives (`undefined`, `null`, `boolean`, `number`, `bigint`, `string`, `symbol`) and
`object`, which also covers arrays, functions, dates and maps. Typing is **dynamic** (values have types, variables don't)
and **weak**: when operating on different types, the engine **implicitly converts** values (coercion).

## `typeof` and its pitfalls

```js
typeof undefined     // 'undefined'
typeof null          // 'object'   ← a historical bug in the language
typeof NaN           // 'number'
typeof []            // 'object'   → use Array.isArray([]) for arrays
typeof function(){}  // 'function' (although it's an object)
typeof 10n           // 'bigint'
typeof undeclaredVar // 'undefined' (no ReferenceError)
```

Primitives are **immutable** and compared by value, while objects are compared by **reference** (`{} === {}` is `false`).

## Coercion

**To string**: the `+` operator when either operand is a string:

```js
1 + '2'          // '12'
[] + []          // ''  (both arrays → '')
[] + {}          // '[object Object]'
```

**To number**: the other arithmetic operators, the `<` `>` comparisons, unary `+`:

```js
'5' - 2          // 3
'3' * '4'        // 12
true + 1         // 2
+''              // 0
Number(' 12 ')   // 12
Number('12px')   // NaN, but parseInt('12px') → 12
Number(null)     // 0,   Number(undefined) → NaN
```

**To boolean**: in conditions and with `!`, `&&`, `||`. The only **falsy** values are: `false`, `0`, `-0`, `0n`, `''`,
`null`, `undefined`, `NaN`. Everything else is truthy, including `'0'`, `'false'`, `[]` and `{}`.

## `==` vs `===`

- `===` (strict) doesn't convert types. Use it by default.
- `==` (loose) converts first, following complex rules:

```js
null == undefined   // true (and only with each other)
null == 0           // false, but null >= 0 → true (the comparison converts null to 0)
0 == ''             // true
'0' == false        // true
[] == false         // true
[] == ![]           // true
NaN == NaN          // false
```

The one widely accepted exception is `x == null`, which checks for both `null` and `undefined`.

`Object.is` works like `===` with two differences: `Object.is(NaN, NaN)` returns `true`, and `Object.is(0, -0)` returns
`false`. React uses this comparison.

## Numbers

- `number` is a 64-bit floating point number (IEEE 754), so `0.1 + 0.2 === 0.30000000000000004`. Money is calculated in
  cents (integers) or with decimal libraries.
- Integers are exact only up to `Number.MAX_SAFE_INTEGER` (2^53 − 1); above it `2 ** 53 === 2 ** 53 + 1`. Use `BigInt`
  (`10n`) for larger values.
- `Number.isNaN(x)` checks whether a value **is** `NaN`. The global `isNaN('a')` converts first (giving `true`).

## `null` vs `undefined`

`undefined` means "no value, because nothing was assigned" (an uninitialized variable, a missing property, a missing
argument, a function without `return`). `null` is a deliberately assigned "no value". `??` and `?.` treat both the same.

## Sources

- [JavaScript data types and data structures (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures)
- [Equality comparisons and sameness (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness)
- [Type coercion (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Type_coercion)
- [Falsy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)

## Questions

### What data types does JavaScript have? {junior}

Seven primitives (`undefined`, `null`, `boolean`, `number`, `bigint`, `string`, `symbol`) and `object`, which also covers arrays,
functions, dates, maps and sets. Primitives are immutable and compared by value, objects by reference.

### Why does `typeof null` return `'object'`? {junior}

It's a bug from the language's first implementation: values were stored with a type tag, and `null` had the object tag. Fixing
it would break existing sites, so the behavior stayed. Check for `null` with `x === null`, and for arrays with `Array.isArray`,
not `typeof`.

### What's the difference between `==` and `===`? {junior}

`===` compares without type conversion: values of different types are always different. `==` first converts the operands by
complex rules, giving surprising results (`'0' == false`, `[] == ![]`). Use `===` by default, with the common exception of
`x == null`, which checks for both `null` and `undefined`.

### Which values are falsy? {junior}

`false`, `0`, `-0`, `0n`, the empty string `''`, `null`, `undefined` and `NaN`. Everything else is truthy, including `'0'`,
`'false'`, an empty array `[]` and an empty object `{}`. That's why `if (arr)` doesn't check whether an array is empty; use
`arr.length > 0` for that.

### What do `1 + '2'` and `'5' - 2` return? {junior}

`'12'` and `3`. The `+` operator with any string concatenates, so the number is converted to a string. The other arithmetic
operators (`-`, `*`, `/`) always convert operands to numbers. It's the classic example of why form data (strings) must be
explicitly converted to numbers (`Number()`) before calculations.

### Why is `0.1 + 0.2 !== 0.3`? {mid}

JS numbers are 64-bit IEEE 754 floating point values, and fractions like 0.1 have no exact binary representation, so the sum is
`0.30000000000000004`. Compare with a tolerance (`Math.abs(a - b) < Number.EPSILON`), and calculate money in the smallest unit
(cents as integers) or with decimal libraries.

### How does `Number.isNaN` differ from the global `isNaN`? {mid}

The global `isNaN` first converts its argument to a number, so `isNaN('abc')` returns `true` even though it's a string.
`Number.isNaN` returns `true` only for a value that **is** `NaN`. `NaN` is the only value not equal to itself (`NaN !== NaN`),
which is why `===` can't detect it. `Object.is(x, NaN)` works too.

### What's the difference between `null` and `undefined`? {junior}

`undefined` means no value was assigned: an uninitialized variable, a missing property, a missing argument, or the result of a
function without `return`. `null` is assigned deliberately to say "nothing here". `null == undefined` is `true`, but `===` tells
them apart. The `??` and `?.` operators treat both the same.

### What is `Object.is`, and how does it differ from `===`? {mid}

It compares "same value" like `===`, with two differences: `Object.is(NaN, NaN)` returns `true`, and `Object.is(0, -0)` returns
`false`. React, among others, uses it to compare state and hook dependencies. For objects it behaves the same as `===`,
comparing references.

### When do you need `BigInt`? {mid}

When integers exceed `Number.MAX_SAFE_INTEGER` (2^53 − 1). Above that limit `number` loses precision, e.g.
`2 ** 53 === 2 ** 53 + 1`. Typical cases are 64-bit database IDs, cryptography and large counters. `BigInt` (`123n`) can't be
mixed with `number` in arithmetic without explicit conversion and isn't serialized by `JSON.stringify`, which is why such IDs are
often sent as strings.
