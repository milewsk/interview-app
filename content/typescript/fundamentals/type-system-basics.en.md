# Type system basics {junior}

TypeScript adds a **static type system** to JavaScript: types are checked at compile time and **erased** from the emitted code, so they have no runtime cost and no runtime
effect. The type system is **structural** (compatibility depends on shape, not names), relies heavily on **inference**, and has a few special types (`any`, `unknown`, `never`)
that every interview touches. Examples here were type-checked with TypeScript 7.0 (`tsc --strict`).

## Structural typing

```ts
interface Point { x: number; y: number }
const p3 = { x: 1, y: 2, z: 3 };
const a: Point = p3;                        // OK: p3 has at least x and y
const b: Point = { x: 1, y: 2, z: 3 };      // error TS2353: 'z' does not exist in type 'Point'
class Meters { constructor(public value: number) {} }
class Seconds { constructor(public value: number) {} }
const m: Meters = new Seconds(5);           // OK: same shape
```

Types are compatible when the shapes match: `Seconds` was accepted where `Meters` was expected. The **excess property check** only applies to **fresh object literals** (`b`), catching
typos; the same extra property through a variable (`a`) is allowed. To make nominally distinct types, use branded types (see type-safe patterns).

## Inference and literal types

- `let s = "hello"` infers `string` (widened, since it can change); `const c = "hello"` infers the literal type `"hello"`.
- Object properties widen: `{ kind: "circle" }` has `kind: string`; with **`as const`** it's `readonly kind: "circle"` (assigning `"square"` failed with TS2322).
- `[1, "a"]` infers `(string | number)[]`: `push(true)` failed; a **tuple** type `[string, number]` fixes positions (assigning `[1, "a"]` failed).

## `any`, `unknown`, `never`, `null`

- **`any`** switches checking off: `an.foo.bar.baz()` compiled. It spreads through code and hides bugs; avoid it (lint rules, `noImplicitAny` in `strict`).
- **`unknown`** is the safe "could be anything": `u.toFixed()` failed with TS18046 ("'u' is of type 'unknown'") until narrowed with `typeof u === "number"`. Use it for untrusted input
  (`JSON.parse`, `catch` variables).
- **`never`** is the empty type: the return type of functions that always throw, and the type left after all cases are handled (exhaustiveness checks).
- With **`strictNullChecks`** (part of `strict`), `null` and `undefined` are separate types: `n.length` on `string | null` failed with TS18047 ("possibly 'null'").

## Type assertions

`value as Type` tells the compiler to trust you; nothing is checked at runtime. `document.getElementById("x") as HTMLInputElement` compiles even if the element is a `div` or missing, and
`"text" as unknown as number` compiled too. Prefer narrowing (type guards) over assertions; `!` (non-null assertion) is the same kind of promise.

## Sources

- [TypeScript Handbook: everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Type compatibility (structural typing)](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)
- [Type inference](https://www.typescriptlang.org/docs/handbook/type-inference.html)
- [TypeScript 3.0: the unknown type](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type)
- [Object types and excess property checks](https://www.typescriptlang.org/docs/handbook/2/objects.html)

## Questions

### What does TypeScript add to JavaScript, and what happens to types at runtime? {junior}

A static type system checked by the compiler and editor: type annotations, inference, interfaces, generics and more, catching errors before the code runs and powering autocompletion and
refactoring. Types are erased when compiling (or stripped by tools like Node's type stripping), so at runtime it's plain JavaScript: no type checks happen, and values from outside (API responses,
user input) aren't validated automatically.

### What is structural typing? {junior}

Compatibility is decided by the shape of types, not by their names or declarations: any object with the required properties of compatible types is assignable. In a test, a `Seconds` instance was
accepted where `Meters` was expected because both have `value: number`. This differs from nominal typing in C# or Java, and it's why "branded types" are used when two identically shaped types must
not be mixed.

### Why does TypeScript sometimes reject extra properties and sometimes not? {mid}

Excess property checking applies only to fresh object literals assigned directly to a typed target: `const b: Point = { x: 1, y: 2, z: 3 }` fails with TS2353, catching typos like misspelled
optional properties. If the object is first stored in a variable, it's checked structurally and the extra `z` is allowed. The check is a pragmatic heuristic, not a guarantee that objects have no
extra properties at runtime.

### What is the difference between `any` and `unknown`? {junior}

Both accept any value, but `any` also disables checking for everything you do with it (`an.foo.bar.baz()` compiled), and it silently spreads to other variables. `unknown` forbids operations until
you narrow it (`u.toFixed()` failed with TS18046, then worked after `typeof u === "number"`). Use `unknown` for untrusted data and in generic code, and treat `any` as an escape hatch.

### What is the `never` type used for? {mid}

It represents values that can't exist: the return type of functions that never return (they throw or loop forever) and the type of a variable after every possible case has been ruled out. Assigning
the remaining value to `never` in a `switch` default makes the compiler report any unhandled union member, which turns forgotten cases into compile errors.

### How does TypeScript infer types for `let`, `const` and object literals? {mid}

A `let` initialized with a literal is widened to the general type (`string`), because it can be reassigned; a `const` keeps the literal type (`"hello"`). Object and array properties are widened
too, since they're mutable: `{ kind: "circle" }` has `kind: string`, and `[1, "a"]` becomes `(string | number)[]`. `as const` keeps literal types and makes properties readonly, which is how you
get precise types for configuration objects and tuples.

### What does `strictNullChecks` change? {junior}

It makes `null` and `undefined` separate types that aren't assignable to other types unless included explicitly (`string | null`), so the compiler reports possible null dereferences: `n.length` on
`string | null` failed with "'n' is possibly 'null'". Without it, every type silently includes null, as in older TypeScript. It's part of `strict`, which is the default since TypeScript 6.0.

### What is a type assertion and why is it risky? {mid}

`value as SomeType` (or `<SomeType>value`) overrides the compiler's type for an expression without any runtime check. It compiles when the types are related, and a double assertion through
`unknown` compiles for anything (`"text" as unknown as number` compiled in a test). If the assumption is wrong, the error appears later at runtime. Prefer type guards, validation, or better typing
of the source.

### What is the difference between a tuple and an array type? {junior}

An array type like `number[]` or `(string | number)[]` has any length and every element has the element type. A tuple like `[string, number]` has a fixed length and a type per position, so `[1, "a"]`
is rejected (verified). Tuples are common for fixed pairs, such as the return value of `useState` or `Object.entries` items, and can have optional, rest and named elements.

### How does TypeScript relate to JavaScript types at runtime (`typeof`)? {mid}

TypeScript's `typeof` in a type position (`type T = typeof obj`) extracts the static type of a value. JavaScript's runtime `typeof` returns strings like `"string"` or `"object"`, and TypeScript
uses such checks to narrow types in the branches that follow. Interfaces and type aliases don't exist at runtime, so you can't check `instanceof` against an interface; you check properties,
use discriminants, or validate with a schema.
