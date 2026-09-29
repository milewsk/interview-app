# Conditional and template literal types {senior}

**Conditional types** (`T extends U ? X : Y`) choose a type based on another type, and with **`infer`** they can extract parts of types. **Template literal types** build string
types from other types (`` `on${Capitalize<T>}` ``). Together they let libraries type things like route parameters, event names and deeply nested paths. They're powerful but
easy to overuse; interviews usually ask how they work and when they're worth it. Every relationship below was checked with compile-time assertions in TypeScript 7.0.

## Conditional types and `infer`

```ts
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type A = ElementOf<string[]>;                         // string
```

`infer E` declares a type variable that the compiler fills in when matching, which is how `ReturnType`, `Parameters` and `Awaited` are implemented.

## Distribution over unions

A conditional type whose checked type is a **naked type parameter** is applied to each union member separately:

```ts
type ToArray<T> = T extends unknown ? T[] : never;
type B = ToArray<string | number>;                    // string[] | number[]   (distributive)
type ToArrayND<T> = [T] extends [unknown] ? T[] : never;
type C = ToArrayND<string | number>;                  // (string | number)[]   (wrapped: not distributive)
```

Both results were verified. Distribution is what makes `Exclude<T, U>` (`T extends U ? never : T`) remove members from a union; wrapping in `[T]` turns it off. A related detail: `never` is the
empty union, so a distributive conditional over `never` returns `never`.

## Template literal types

```ts
type EventName<T extends string> = `on${Capitalize<T>}`;
type D = EventName<"click" | "focus">;                // "onClick" | "onFocus"
type Route = `/users/${number}`;
const r1: Route = "/users/42";                         // OK
const r2: Route = "/users/abc";                        // error
type Params<S extends string> =
  S extends `${string}:${infer P}/${infer Rest}` ? P | Params<`/${Rest}`> :
  S extends `${string}:${infer P}` ? P : never;
type E = Params<"/orders/:orderId/items/:itemId">;    // "orderId" | "itemId"
```

Template literals distribute over unions too (`"click" | "focus"` produced two event names), accept `${number}` and other primitives as patterns, and combine with `infer` and recursion to parse
strings at the type level, which is how routers such as React Router or tRPC-style APIs type path parameters. Intrinsic helpers: `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize`.

## When to use them

Use them in library and infrastructure code where one precise generic type saves many hand-written ones. In application code, deep type-level programming makes errors hard to read and slows
the compiler (recursion has depth limits), so prefer simpler, explicit types.

## Sources

- [Conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- [Distributive conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types)
- [Template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)
- [Intrinsic string manipulation types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html#intrinsic-string-manipulation-types)
- [TypeScript performance (wiki)](https://github.com/microsoft/TypeScript/wiki/Performance)

## Questions

### What is a conditional type? {mid}

A type of the form `T extends U ? X : Y` that resolves to `X` if `T` is assignable to `U` and to `Y` otherwise. It lets generic types branch on their input, e.g. `NonNullable<T>` is
`T extends null | undefined ? never : T`. When `T` is still generic, the conditional stays deferred until it's instantiated with a concrete type.

### What does `infer` do? {senior}

Inside the `extends` clause of a conditional type, `infer X` introduces a type variable that the compiler infers from the matched type, and it can be used in the true branch:
`T extends (infer E)[] ? E : never` extracts an array's element type (`string` for `string[]` in a test), `T extends (...args: any) => infer R ? R : never` is `ReturnType`. It's how types are
"taken apart" without writing them out.

### What is a distributive conditional type? {senior}

When the checked type is a naked type parameter, the conditional is applied to each member of a union separately and the results are united: `ToArray<string | number>` became
`string[] | number[]` in a test. Wrapping both sides in a tuple (`[T] extends [unknown]`) disables distribution, giving `(string | number)[]`. Distribution is the mechanism behind `Exclude`,
`Extract` and `NonNullable`.

### How do `Exclude` and `Extract` work? {mid}

Both are distributive conditional types over a union: `Exclude<T, U> = T extends U ? never : T` drops members assignable to `U`, and `Extract<T, U> = T extends U ? T : never` keeps only them. In a
test, `Exclude<"a" | "b" | "c", "a">` was `"b" | "c"`. Returning `never` for a member removes it, because `never` disappears from unions.

### What are template literal types? {mid}

String literal types built with template syntax from other types: `` `on${Capitalize<T>}` `` turns `"click" | "focus"` into `"onClick" | "onFocus"` (verified, because they distribute over
unions), and `` `/users/${number}` `` accepts `"/users/42"` but rejects `"/users/abc"`. They're used for event names, CSS values, keys derived from other keys, and route patterns.

### How can TypeScript extract parameters from a route string? {senior}

With a recursive conditional type that matches template literal patterns and uses `infer`: match `` `${string}:${infer P}/${infer Rest}` ``, collect `P`, and recurse on the rest; in a test,
`Params<"/orders/:orderId/items/:itemId">` produced `"orderId" | "itemId"`. Routers use this so that `useParams()` or a route handler gets exactly the parameters declared in the path.

### What are the intrinsic string types? {junior}

Built-in type-level string transformations: `Uppercase<S>`, `Lowercase<S>`, `Capitalize<S>` and `Uncapitalize<S>`. They're implemented by the compiler, not in TypeScript itself, and are used with
template literal types and key remapping, e.g. to build `getName` from `name` or `ON_CLICK` constants from event names.

### What happens when a conditional type is applied to `never`? {senior}

A distributive conditional type over `never` returns `never`, because `never` is the empty union and there are no members to map. This can surprise: `IsString<never>` using
`T extends string ? true : false` gives `never`, not `true` or `false`. Wrapping (`[T] extends [string]`) makes it behave like a normal check, and `[T] extends [never]` is the
standard way to test whether a type is `never`.

### Why should advanced type-level programming be used sparingly? {mid}

Complex conditional, recursive and template literal types produce hard-to-read error messages, make code harder to maintain for the team, slow down type checking and the editor, and can hit
recursion depth limits. They pay off in libraries and shared infrastructure (routers, ORMs, form libraries) where they replace many hand-written types; in application code, explicit simple types
and a few utility types are usually enough.

### How do you test complex types? {senior}

With compile-time assertions: a helper such as `type Assert<T extends true> = T` combined with an exact equality check (`Eq<A, B>`), placed in a type-check-only file, fails the build if a type
changes unexpectedly (all examples here were checked this way, including a deliberately wrong assertion that failed as expected). Tools like `expect-type`, `tsd` or Vitest's `expectTypeOf` provide
the same with nicer messages, and `// @ts-expect-error` asserts that invalid usages stay invalid.
