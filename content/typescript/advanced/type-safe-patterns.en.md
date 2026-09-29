# Type-safe patterns: branded types, enums and immutability {mid}

Beyond basic annotations, a few patterns make whole classes of bugs impossible: **branded types** to stop mixing values of the same primitive type, **literal unions or `as const`
objects** instead of enums, **readonly** data, and exhaustive handling of unions. They're common interview topics because they show whether someone uses the type system to model
the domain or just to annotate it. Examples were checked with TypeScript 7.0 and run in Node 24.

## Branded (nominal) types

TypeScript is structural, so a `UserId` and an `OrderId` that are both `string` are interchangeable. A **brand** adds a phantom property that exists only in the type:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
const asUserId = (s: string) => s as UserId;     // the only place allowed to create one (after validation)
function loadUser(id: UserId) { ... }
loadUser(asUserId("u1"));   // OK
loadUser(orderId);          // error: '"OrderId"' is not assignable to '"UserId"'
loadUser("raw");            // error: string is not assignable to UserId
```

Both misuses were rejected. At runtime the value is a plain string. Brands also mark validated values (`Email`, `PositiveNumber`) created by a parsing function.

## Enums vs literal unions

```ts
enum Color { Red, Green }            // numeric enum
enum Dir { Up = "UP", Down = "DOWN" } // string enum
const ROLE = { Admin: "admin", User: "user" } as const;
type Role = (typeof ROLE)[keyof typeof ROLE];   // "admin" | "user"
```

Verified behaviour:

- Enums are **not erased**: the compiled code contained an IIFE building an object, and a numeric enum has a **reverse mapping**: `JSON.stringify(Color)` was
  `{"0":"Red","1":"Green","Red":0,"Green":1}` and `Color[0]` was `"Red"`; the string enum had no reverse mapping.
- `const c2: Color = 5` was an error (numeric enums reject out-of-range literals in modern TypeScript), and the string enum rejected the literal `"UP"`: callers must write `Dir.Up`.
- Under **`erasableSyntaxOnly`** (TypeScript 5.8) enums are errors (TS1294), and **Node's built-in type stripping** refused them: `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not
  supported in strip-only mode`, while a file with only types and interfaces ran directly with `node file.ts`.

That's why many codebases prefer **literal unions** and **`as const` objects**: zero runtime code beyond a plain object, values are plain strings (friendly to JSON and APIs), and `"guest"` is
still rejected as a `Role`.

## Readonly data

`readonly string[]` has no `push` (TS2339), and `[1, 2] as const` is a readonly tuple whose elements can't be assigned (TS2540). Use readonly parameters for functions that shouldn't mutate their
inputs, and remember these checks disappear at runtime (`Object.freeze` for real immutability).

## Sources

- [Enums (handbook)](https://www.typescriptlang.org/docs/handbook/enums.html)
- [Objects vs enums](https://www.typescriptlang.org/docs/handbook/enums.html#objects-vs-enums)
- [erasableSyntaxOnly (TypeScript 5.8)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html#the---erasablesyntaxonly-option)
- [Node.js: running TypeScript natively](https://nodejs.org/api/typescript.html)
- [ReadonlyArray and readonly tuples](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-readonlyarray-type)

## Questions

### What is a branded type and why use it? {mid}

A primitive type intersected with a phantom property that exists only in the type system, e.g. `type UserId = string & { readonly __brand: "UserId" }`. Because TypeScript is structural, plain
`string` IDs of different entities are interchangeable; with brands, passing an `OrderId` or a raw string where a `UserId` is expected is a compile error (verified). Values are created by a function
that validates and casts, so the brand also documents that validation happened.

### How are enums compiled, and what is a reverse mapping? {mid}

Regular enums compile to real JavaScript objects built by an IIFE. Numeric enums also map values back to names: `Color[0]` returned `"Red"`, and the object serialized as
`{"0":"Red","1":"Green","Red":0,"Green":1}` in a test. String enums have only name-to-value mappings. `const enum` members are inlined and emit no object, but they don't work with
`isolatedModules`-style per-file compilers.

### Why do many teams avoid enums? {mid}

They're one of the few TypeScript features that generate runtime code, so they don't work with erase-only tooling: Node's type stripping rejected an enum with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`,
and `erasableSyntaxOnly` reports them as errors. String enums are nominal (a plain `"UP"` isn't accepted as `Dir`), which is awkward with JSON and APIs, and numeric enums have confusing reverse
mappings. Literal unions or `as const` objects give the same safety with plain values.

### How do you create an enum-like object without `enum`? {junior}

Use an object with `as const` and derive the type from its values: `const ROLE = { Admin: "admin", User: "user" } as const; type Role = (typeof ROLE)[keyof typeof ROLE];`. Code can use
`ROLE.Admin` like an enum member or the plain string `"admin"`, invalid values such as `"guest"` are rejected (verified), and the object can be iterated at runtime, e.g. to build a select list.

### What does `erasableSyntaxOnly` do? {senior}

A compiler option (TypeScript 5.8) that reports errors for TypeScript syntax that can't simply be erased: enums, namespaces with runtime code, parameter properties in constructors, and
`import =`/`export =`. Such code can then be run by tools that only strip types, such as Node's built-in TypeScript support, without a separate compile step. In a test, both enums were reported
with TS1294.

### Can Node.js run TypeScript files directly? {mid}

Yes, recent Node versions (verified with Node 24) run `.ts` files with type stripping: types, interfaces and annotations are removed and the rest runs as JavaScript, so a file with a type alias and an
interface ran with `node file.ts`. It doesn't type-check (you still run `tsc --noEmit` in CI) and doesn't support syntax that needs transformation, such as enums, unless you use the experimental
`--experimental-transform-types` flag.

### How do you make function parameters immutable? {junior}

Type them as readonly: `readonly string[]` (or `ReadonlyArray<string>`) removes mutating methods, so `xs.push()` failed with "Property 'push' does not exist on type 'readonly string[]'", and
`Readonly<T>` marks object properties read-only. This documents and enforces that the function doesn't modify its inputs, which prevents bugs when callers reuse the array. It doesn't freeze anything
at runtime.

### What does `as const` do to arrays and objects? {junior}

It infers the narrowest types (literals instead of `string`/`number`), makes object properties `readonly`, and turns arrays into readonly tuples: `[1, 2] as const` has type `readonly [1, 2]`, and
assigning `point[0] = 5` failed (TS2540). It's used for configuration, lookup tables and deriving union types from values.

### How do you validate that a string is an email and keep that information in the type? {mid}

Parse it once at the boundary with a function that checks the format and returns a branded type: `function parseEmail(s: string): Email | null`, where `type Email = Brand<string, "Email">`. Functions
that need an email take `Email`, so they can't receive an unvalidated string, and validation isn't repeated. Schema libraries like Zod support branded outputs (`z.string().email().brand<"Email">()`).

### What does the non-null assertion `!` do, and when is it acceptable? {junior}

`value!` removes `null` and `undefined` from the type without any runtime check, e.g. `document.getElementById("app")!` is typed as `HTMLElement`. If the value is actually `null`, the code
crashes later: in a test, `n!.length` compiled and threw `TypeError: Cannot read properties of null`. It's acceptable only where an invariant guarantees the value (an element in static HTML, a
value just set); otherwise a check, optional chaining (`?.`) or an explicit error is safer.
