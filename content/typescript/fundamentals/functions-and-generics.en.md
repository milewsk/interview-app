# Functions and generics {mid}

Functions are where most type errors are caught: parameter and return types, overloads, `this`, and callback compatibility. **Generics** let a function or type work with many
types while keeping the relationship between inputs and outputs (`first<T>(xs: T[]): T`), instead of falling back to `any`. Examples were checked with TypeScript 7.0.

## Function types and parameters

```ts
type Formatter = (value: number) => string;
function greet(name: string, greeting = "Hi", ...rest: string[]) { ... }   // default and rest parameters
function withThis(this: HTMLElement) { return this.tagName; }             // typed this
withThis();                  // error TS2684: 'this' context of type 'void' is not assignable to 'HTMLElement'
```

- **`void` return in a function type** means "the return value is ignored", so `const cb: () => void = () => 42` compiles (that's why `forEach(x => arr.push(x))` is fine).
- **Parameter variance**: under `strictFunctionTypes` (part of `strict`), a function-typed property only accepts functions whose parameters are the same or **wider**: a handler taking `Event`
  was accepted where `(e: MouseEvent) => void` was expected, but a handler taking `MouseEvent` was rejected for `(e: Event) => void` (TS2322). **Methods** declared with method syntax are
  checked bivariantly: `{ handle(e: MouseEvent) {} }` was accepted for `handle(e: Event): void`.

## Overloads

```ts
function parse(v: string): number;
function parse(v: number): string;
function parse(v: string | number): string | number { ... }     // implementation signature, not callable
parse("1");      // number
parse(2);        // string
parse(Math.random() > 0.5 ? "1" : 2);   // error TS2769: No overload matches this call
```

Overloads give precise return types per input, but a caller with a union argument matches none of them. A single signature with a union, or a generic/conditional return type, is often simpler.

## Generics

```ts
function first<T>(xs: T[]): T | undefined { return xs[0]; }              // T inferred: first([1, 2]) -> number | undefined
function longest<T extends { length: number }>(a: T, b: T): T { ... }    // constraint
function getProp<T, K extends keyof T>(o: T, k: K): T[K] { return o[k]; } // key and indexed access
function tupleConst<const T>(x: T) { return x; }                          // const type parameter (TS 5.0)
```

Verified: `longest(1, 2)` failed (number has no `length`); `getProp({ name: "Ann", age: 3 }, "age")` returned `number` and `"email"` failed because it isn't a key; `tupleConst(["a", "b"])`
inferred `readonly ["a", "b"]` instead of `string[]`. Generic type parameters can have **defaults** (`<T = string>`), and generics work for types, interfaces and classes (`Box<T>`,
`Repository<TEntity>`).

## Sources

- [More on functions (handbook)](https://www.typescriptlang.org/docs/handbook/2/functions.html)
- [Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [strictFunctionTypes](https://www.typescriptlang.org/tsconfig/#strictFunctionTypes)
- [const type parameters (TypeScript 5.0)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#const-type-parameters)
- [Why functions returning non-void are assignable to void functions (FAQ)](https://github.com/microsoft/TypeScript/wiki/FAQ#why-are-functions-returning-non-void-assignable-to-function-returning-void)

## Questions

### Why use generics instead of `any`? {junior}

Generics preserve the relationship between types: `function first<T>(xs: T[]): T | undefined` returns `number | undefined` for a `number[]` and `string | undefined` for a `string[]`, while a version
using `any` would lose that information and accept any misuse. The caller usually doesn't write the type argument; it's inferred from the arguments.

### What are generic constraints? {mid}

`T extends Something` restricts which types can be used for a type parameter, so the function can rely on their members: `longest<T extends { length: number }>` works with strings and arrays and
rejects numbers (verified). `K extends keyof T` restricts a parameter to the keys of another type, which gives type-safe property access returning `T[K]`.

### How does `keyof` with indexed access types work in a generic function? {mid}

In `function getProp<T, K extends keyof T>(o: T, k: K): T[K]`, `keyof T` is the union of `T`'s property names and `T[K]` is the type of the property named by `K`. So `getProp(user, "age")` returns
`number`, `getProp(user, "name")` returns `string`, and a key that doesn't exist, like `"email"`, is a compile error (verified). This pattern underlies typed `pick`, `groupBy`, form helpers and ORMs.

### What are function overloads and what's their main limitation? {mid}

Several call signatures followed by one implementation, letting the return type depend on which signature matches (`parse(string): number`, `parse(number): string`). The implementation signature isn't
visible to callers. The limitation: a call must match one overload, so an argument of type `string | number` fails with "No overload matches this call" (verified). Unions or conditional types can
replace overloads when the logic allows it.

### Why is a function returning a value assignable to `() => void`? {mid}

In a function type, a `void` return means the caller will ignore the result, not that the function must return nothing, so functions returning values are allowed: `const cb: () => void = () => 42`
compiled. This makes callbacks like `arr.forEach(x => other.push(x))` work even though `push` returns a number. A function declaration with an explicit `: void` return type, however, can't return a
value.

### What does `strictFunctionTypes` check? {senior}

It checks function parameters contravariantly: a function assigned to a function type must accept at least the parameter types the type promises. A handler for any `Event` can be used where a
`MouseEvent` handler is expected, but a `MouseEvent` handler can't be used where any `Event` may be passed (TS2322 in a test). For historical reasons, parameters of methods declared with method syntax
remain bivariant, so a method taking `MouseEvent` was accepted for `handle(e: Event)`.

### How do you type `this` in a function? {mid}

Declare a fake first parameter named `this`: `function withThis(this: HTMLElement) { ... }`. It's erased from the output and makes the compiler check calls: calling it without the right context
failed with TS2684 in a test. It's useful for event handlers and functions meant to be attached as methods; with `noImplicitThis` (part of `strict`), untyped `this` usage is an error.

### What are `const` type parameters? {senior}

A modifier on a type parameter (`function f<const T>(x: T)`, TypeScript 5.0) that makes inference behave as if the argument were written with `as const`: `f(["a", "b"])` infers
`readonly ["a", "b"]` instead of `string[]` (verified). Libraries use it for route definitions, event names and configuration so callers get literal types without writing `as const` themselves.

### What are default type parameters? {mid}

Type parameters can have defaults used when no argument is given and none can be inferred: `interface Response<T = unknown> { data: T }` or `class Cache<TValue = string>`. They're common in library
types, such as React's `useState<S = undefined>()` variants or `EventEmitter<Events = {}>`, so simple usages don't need explicit type arguments.

### What is the difference between optional parameters and parameters with default values? {junior}

`name?: string` makes the parameter optional and its type `string | undefined` inside the function. `greeting = "Hi"` also makes it optional for callers, but inside the function its type is `string`,
because `undefined` is replaced by the default. Passing `undefined` explicitly uses the default in both cases. Optional and default parameters must come after required ones (unless defaults are used
with explicit `undefined`), and rest parameters (`...rest: string[]`) come last.
