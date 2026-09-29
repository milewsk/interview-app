# Unions and narrowing {mid}

A **union type** (`A | B`) says a value is one of several types. Before using members specific to one of them, the code must **narrow** the union with checks the compiler
understands: `typeof`, `instanceof`, `in`, equality, truthiness, **discriminant properties**, and user-defined **type guards**. Discriminated unions with an **exhaustiveness
check** are one of TypeScript's most valuable patterns. Examples were checked with TypeScript 7.0.

## Discriminated unions and exhaustiveness

```ts
type Shape =
  | { kind: "circle"; r: number }
  | { kind: "square"; side: number }
  | { kind: "rect"; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;       // s is the circle variant here
    case "square": return s.side ** 2;
    default: {
      const _exhaustive: never = s;                  // error: rect isn't handled
      return _exhaustive;
    }
  }
}
```

Each variant has a literal `kind`; checking it narrows `s` to that variant. Because `rect` wasn't handled, the compiler reported "Type '{ kind: "rect"; ... }' is not assignable to type
'never'": adding a new variant turns every incomplete `switch` into a compile error. The same shape models results: `{ ok: true; value } | { ok: false; error }`.

## Narrowing techniques (all compiled as expected)

- `typeof x === "string"`, `x === null`, `Array.isArray(x)`: primitives, null, arrays.
- `"swim" in a`: property checks for object unions.
- `x instanceof Date`: classes (not interfaces, which don't exist at runtime).
- A condition that's impossible leaves `never`: inside `if (typeof x === "boolean")` for `string | number`, `x` is `never`.
- **Truthiness** narrows out `null`/`undefined` but also `0` and `""`: `n ? n.toFixed() : "none"` returned `"none"` for `0` at runtime, a classic bug; compare with `!== undefined`.

## Type guards and assertion functions

```ts
function isDate(v: unknown): v is Date { return v instanceof Date; }        // type predicate
function assertNum(v: unknown): asserts v is number {                         // assertion function
  if (typeof v !== "number") throw new Error("not a number");
}
```

A type predicate narrows in the calling branch, an assertion function narrows the rest of the scope. The compiler **trusts** them: a guard `lie(v): v is string` that always returns `true`
compiled, and calling `val.toUpperCase()` on the number 42 threw `TypeError: val.toUpperCase is not a function` at runtime. Keep guards simple and tested.

## `satisfies`

`const colors = { red: "#f00", green: "#0f0" } satisfies Record<string, string>` checks the object against the type but keeps its **inferred** type: `colors.blue` was an error (TS2339), because
the keys are exactly `red` and `green`. With a type annotation `const colors2: Record<string, string>` the object becomes an open dictionary, and `colors2.blue.toUpperCase()` compiled without
any error (and would crash at runtime), unless `noUncheckedIndexedAccess` is enabled.

## Sources

- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Using type predicates](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
- [Assertion functions (TypeScript 3.7)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions)
- [The satisfies operator (TypeScript 4.9)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)

## Questions

### What is a union type? {junior}

A type that allows a value to be one of several types, written `A | B`, e.g. `string | null` or `"light" | "dark"`. You can only use members common to all variants until you narrow the union to a
specific variant with a check the compiler understands. Unions of literal types are TypeScript's lightweight alternative to enums.

### What is narrowing? {junior}

The compiler's control-flow analysis that refines a variable's type inside a branch based on checks: after `typeof x === "string"` the variable is a `string` in that branch; after `x === null` it's
`null`; after `"swim" in a` it's the variant with `swim`. It also works with `instanceof`, `Array.isArray`, equality with literals, truthiness, and early returns.

### What is a discriminated union? {mid}

A union of object types that share a property with a different literal type in each variant (the discriminant), such as `kind: "circle" | "square"` or `ok: true | false`. Checking the discriminant
narrows to one variant, so its specific properties are available. It's the standard way to model states, events, API results and reducer actions.

### How do you make the compiler ensure every case of a union is handled? {mid}

Switch on the discriminant and in the `default` branch assign the value to a variable of type `never` (or pass it to a function taking `never`). If all variants are handled, the value is `never`
there; if one is missing, it's that variant and the assignment fails: in a test, the unhandled `rect` produced "is not assignable to type 'never'". Adding a new variant then flags every incomplete
switch.

### What is a user-defined type guard? {mid}

A function returning a type predicate, `function isDate(v: unknown): v is Date`, which narrows its argument in the branch where it returns true. It's used for checks the compiler can't infer, such as
validating unknown data. The compiler trusts the predicate completely: in a test, a guard that always returned true let a number be treated as a string, which crashed at runtime.

### What is the difference between a type predicate and an assertion function? {senior}

A type predicate (`v is T`) returns a boolean and narrows only inside the `if` that uses it. An assertion function (`asserts v is T`, or `asserts condition`) returns nothing and throws when the
check fails; after the call, the value is narrowed for the rest of the scope, as with `assertNum(v); return v * 2`. Assertion functions suit preconditions and validation at function entry.

### Why is narrowing by truthiness risky? {junior}

`if (x)` removes `null` and `undefined` but also valid falsy values: `0`, `""`, `false`, `NaN`. In a test, `n ? n.toFixed() : "none"` returned "none" for `0`. For optional numbers and strings,
compare explicitly (`x !== undefined`, `x != null`) or use `??` instead of `||` for defaults.

### What does the `satisfies` operator do? {mid}

It checks that an expression is compatible with a type without changing the expression's inferred type. `{ red: "#f00" } satisfies Record<string, string>` validates the values but keeps the exact
keys, so accessing a missing key is an error (verified); an annotation `: Record<string, string>` would widen it to an open dictionary where any key compiles. It's ideal for configuration objects
and lookup tables.

### How does `in` narrowing work? {mid}

`"prop" in obj` narrows a union to the variants that have (or may have) that property, e.g. `if ("swim" in a) a.swim(); else a.fly()`. It works on object unions without a shared discriminant. It
checks for the property at runtime, including inherited ones, so it's reliable for shapes but not for distinguishing types that share property names.

### How do you model the result of an operation that can fail without exceptions? {mid}

With a discriminated union such as `type Result<T> = { ok: true; value: T } | { ok: false; error: string }`. Callers must check `ok` before accessing `value` or `error`, so the compiler forces error
handling, unlike exceptions, which aren't part of function signatures in TypeScript. It's useful for expected failures (validation, parsing); unexpected errors are still thrown.
