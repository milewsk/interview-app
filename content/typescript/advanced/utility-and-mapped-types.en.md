# Utility types and mapped types {mid}

TypeScript can compute new types from existing ones. **Utility types** such as `Partial`, `Pick`, `Omit` and `Record` cover everyday transformations, and they're built from
a few primitives you can use yourself: **`keyof`**, **indexed access** (`T[K]`), **mapped types** (`{ [K in keyof T]: ... }`) with **key remapping** (`as`), and modifiers
(`readonly`, `?`, `-readonly`, `-?`). Every type relationship below was checked with a compile-time assertion (`Assert<Eq<A, B>>`) in TypeScript 7.0.

## Built-in utility types (verified)

```ts
interface User { id: number; name: string; email?: string; readonly createdAt: Date }
```

| Utility | Result |
|---|---|
| `Partial<User>` | every property optional: `Partial<User>["id"]` is `number \| undefined` |
| `Required<User>` | every property required: `email` is `string` |
| `Readonly<User>` | every property `readonly` |
| `Pick<User, "id" \| "name">` | only `id` and `name` |
| `Omit<User, "email" \| "createdAt">` | `id` and `name` |
| `Record<"a" \| "b", number>` | `{ a: number; b: number }` |
| `Exclude<"a" \| "b" \| "c", "a">` / `Extract` | `"b" \| "c"` |
| `NonNullable<string \| null \| undefined>` | `string` |
| `ReturnType<F>`, `Parameters<F>` | return type; parameters as a tuple (`[a: string, b: number]`) |
| `Awaited<Promise<Promise<number>>>` | `number` (recursively unwraps) |

**`Omit` doesn't check its keys**: `Omit<User, "emial">` (a typo) compiled without error and simply removed nothing. `Pick` does check (`K extends keyof T`). Some teams define a
stricter `StrictOmit<T, K extends keyof T>`.

## Mapped types

```ts
type Mutable<T> = { -readonly [K in keyof T]: T[K] };                              // remove readonly
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] }; // rename keys
type OnlyStrings<T> = { [K in keyof T as T[K] extends string ? K : never]: T[K] };  // filter keys
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };
```

Verified: `Getters<{ id: number; name: string }>` had keys `getId` and `getName`; `OnlyStrings<User>` kept only `name` (the optional `email` is `string | undefined`, which doesn't extend
`string`); assigning `cfg.db.host` on a `DeepReadonly` object failed, while the built-in `Readonly` is shallow. Mapping over a key to `never` removes it, which is how filtering works.

## `keyof`, `typeof` and indexed access

- `keyof T` is the union of property names; `T[K]` the type of a property; `T[number]` the element type of an array or tuple.
- `typeof value` in a type position turns a value into a type: `type Config = typeof defaultConfig`, and `(typeof ROLES)[number]` gives a union from a `const` array.

## Sources

- [Utility types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [Mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Keyof type operator](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html)
- [Indexed access types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html)
- [Typeof type operator](https://www.typescriptlang.org/docs/handbook/2/typeof-types.html)

## Questions

### What do `Partial`, `Required` and `Readonly` do? {junior}

They create a new type from `T` with every property made optional (`Partial`), required (`Required`), or read-only (`Readonly`). `Partial` is typical for update/patch objects and options with
defaults, `Readonly` for values that shouldn't be modified. They're shallow: nested objects keep their original modifiers, so deep variants need a recursive mapped type.

### What is the difference between `Pick` and `Omit`? {junior}

`Pick<T, K>` keeps only the listed properties, `Omit<T, K>` keeps all except the listed ones; both are useful for DTOs and view models derived from entities (`Omit<User, "passwordHash">`). `Pick`
requires the keys to exist in `T`, but `Omit` accepts any string: in a test, `Omit<User, "emial">` compiled and silently removed nothing, so a typo or a renamed property isn't caught.

### What is `Record<K, V>` used for? {junior}

It builds an object type with keys `K` and values `V`: `Record<"a" | "b", number>` is exactly `{ a: number; b: number }` (verified), so every listed key is required, which is great for lookup
tables over a union. `Record<string, V>` is an open dictionary where any key is allowed and reads aren't checked for existence, which is a common source of runtime errors.

### What is a mapped type? {mid}

A type that iterates over a union of keys and produces a property for each: `{ [K in keyof T]: T[K] }` copies `T`, and modifiers change properties (`readonly`, `?`, or `-readonly`/`-?` to remove
them). Utility types like `Partial` and `Readonly` are implemented this way. Mapped types let you derive types (forms, validation errors, getters) that stay in sync with the source type.

### What is key remapping with `as` in mapped types? {senior}

Since TypeScript 4.1, a mapped type can compute new key names with `as`: ``{ [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] }`` turned `id` and `name` into `getId` and `getName` in a
test. Mapping a key to `never` removes it, so `as T[K] extends string ? K : never` keeps only string properties. It's used to derive event handler maps, API client methods and filtered views of types.

### What does `NoInfer<T>` do? {senior}

It marks a position where a type parameter must not be inferred from, so inference uses only the other arguments. In `function pick<T extends string>(options: T[], fallback: T)`, calling
`pick(["a", "b"], "c")` compiled, because `T` was inferred as `"a" | "b" | "c"`. With `fallback: NoInfer<T>`, `T` came only from `options` and `"c"` was rejected (TS2345). It's useful for
defaults and fallbacks that must be one of the values given elsewhere. Available since TypeScript 5.4.

### How do you turn a constant array into a union type? {mid}

Declare it `as const` so its elements keep literal types and it becomes a readonly tuple, then take its element type: `const ROLES = ["admin", "user"] as const; type Role = (typeof ROLES)[number];`
gives `"admin" | "user"`. The array can be used at runtime (to render a select or validate input) while the type stays in sync automatically.

### Why is `Readonly<T>` not enough for deeply immutable data? {mid}

`Readonly` only marks the top-level properties as read-only; nested objects and arrays can still be modified through them. A recursive mapped type such as `DeepReadonly<T>` applies `readonly`
at every level (in a test, assigning a nested property failed), and `ReadonlyArray`/`readonly T[]` protects arrays. It's still only compile-time protection; `Object.freeze` is needed for
runtime immutability.

### What do `ReturnType`, `Parameters` and `Awaited` give you? {mid}

`ReturnType<F>` extracts a function type's return type, `Parameters<F>` its parameters as a tuple (with labels, e.g. `[a: string, b: number]`), and `Awaited<T>` recursively unwraps promises
(`Awaited<Promise<Promise<number>>>` is `number`). They let you type wrappers, mocks and caches from existing functions without repeating their signatures, such as
`type User = Awaited<ReturnType<typeof fetchUser>>`.

### How would you make `Omit` safer? {senior}

Define a variant that constrains the keys to existing ones: `type StrictOmit<T, K extends keyof T> = Omit<T, K>`. Then a typo or a property removed during a refactor becomes a compile error, unlike
the built-in `Omit`, which accepts any `string | number | symbol` key (it compiled with the misspelled `"emial"` in a test). The built-in version is loose on purpose, to work with union and
generic types.
