# Interfaces and type aliases {junior}

TypeScript has two ways to name a type: **`interface`** and **`type`** aliases. For plain object shapes they're almost interchangeable, which is why "interface or type?" is a
classic interview question. The differences are in **declaration merging**, how **extension** handles conflicts, and what they can express: only `type` can name unions, tuples,
mapped and conditional types. Examples were checked with TypeScript 7.0.

## Differences (verified)

```ts
interface User { id: number }
interface User { name: string }             // merged: User has id and name
type Account = { id: number };
type Account = { name: string };             // error TS2300: Duplicate identifier 'Account'
```

| | `interface` | `type` |
|---|---|---|
| Object shapes, `implements`, `extends` | yes | yes (object types; classes can `implements` them) |
| Unions, tuples, primitives, mapped/conditional types | no | **yes** (`type Status = "active" \| "blocked"`) |
| Declaration merging | **yes**: repeated declarations merge | no: duplicate identifier error |
| Extending with a conflicting property | **error at declaration** (TS2430: `Derived` incorrectly extends `Base`) | intersection silently makes the property **`never`** |

The last row matters in practice: `interface Derived extends Base { id: string }` failed immediately, while `type Both = { id: number } & { id: string }` was accepted and only failed later
when creating a value (`Type 'number' is not assignable to type 'never'`). Interfaces also give clearer error messages and cache better in large codebases.

## Declaration merging and augmentation

Merging lets you add members to existing interfaces, including global and library types: `declare global { interface Window { appVersion: string } }` made `window.appVersion` typed. Libraries
use the same mechanism for **module augmentation** (adding fields to Express's `Request`, theme types in styled-components). The flip side: an accidental second declaration with the same name
merges silently.

## Other object type features

- `readonly` properties: assigning `pet.tag` failed with TS2540 (compile-time only; the object isn't frozen).
- Optional properties (`age?: number`) and index signatures (`[key: string]: number`).
- A **common convention**: `interface` for object shapes that others may extend (public API, React props), `type` for unions, tuples and computed types. Consistency within a project matters
  more than the choice.

## Sources

- [Differences between type aliases and interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces)
- [Object types](https://www.typescriptlang.org/docs/handbook/2/objects.html)
- [Declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html)
- [Intersection types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types)

## Questions

### What is the difference between `interface` and `type`? {junior}

Both can describe object shapes and be extended or implemented. Interfaces can be declared multiple times and merge (declaration merging), and conflicts in `extends` are reported at the
declaration. Type aliases can't be reopened (a second declaration is a "Duplicate identifier" error), but they can name any type: unions, tuples, primitives, function types, mapped and conditional
types. For plain objects, either works; many teams use interfaces for object contracts and types for everything else.

### What is declaration merging? {mid}

When several `interface` declarations (or namespaces, or a class and an interface) with the same name exist in the same scope, TypeScript merges them into one type with all members: two `User`
interfaces with `id` and `name` became one. It's used to extend global types (`Window`) and library types via module augmentation, but can also merge unrelated declarations by accident.

### How do `extends` and intersections (`&`) differ? {mid}

`interface B extends A` checks compatibility at the declaration: redefining a property with an incompatible type is an error (TS2430 in a test). An intersection `A & B` combines the types without
that check, so conflicting properties become `never` (`{ id: number } & { id: string }` gives `id: never`), and the error only appears when you try to create a value. Intersections are still useful
for combining independent types and in generics.

### Can a class implement a type alias? {junior}

Yes, if the alias describes an object type (or an intersection of object types): `class Dog implements Pet`. It can't implement a union type alias, because a class must have one statically known
shape. `implements` only checks the class against the type; it doesn't add members or change the class's type.

### How do you add a property to the global `Window` type or a library's type? {mid}

With declaration merging inside a global or module augmentation block: `declare global { interface Window { appVersion: string } }` in a module file (which must have an import or export), or
`declare module "express-serve-static-core" { interface Request { user?: User } }` for a library. The added members then type-check everywhere, as `window.appVersion` did in a test.

### Does `readonly` make an object immutable? {junior}

Only at compile time: the compiler rejects assignments to `readonly` properties (TS2540 "Cannot assign to 'tag' because it is a read-only property" in a test) and `ReadonlyArray` hides mutating
methods, but the emitted JavaScript object can still be modified, for example through a non-readonly alias or `any`. For runtime immutability use `Object.freeze`.

### When must you use a type alias instead of an interface? {junior}

When the type isn't a single object shape: unions (`"light" | "dark"`, `Result<T>`), tuples (`[number, number]`), primitives and literal types, function types written as `(x: T) => U` (interfaces can
also describe call signatures, but less readably), and computed types such as mapped (`{ [K in keyof T]: ... }`), conditional (`T extends U ? X : Y`) and template literal types.

### What are index signatures and when are they risky? {mid}

`{ [key: string]: number }` describes objects used as dictionaries with arbitrary keys. Reading any key returns `number` according to the types, even for keys that don't exist, so
`dict.missing.toFixed()` compiles and crashes. Enabling `noUncheckedIndexedAccess` makes such reads `number | undefined`. For known keys, prefer explicit properties or `Record<"a" | "b", number>`;
for dynamic keys, `Map` is often clearer.

### Why might an interface be preferred for performance or error messages? {senior}

Interfaces are named and cached by the compiler, so relationships between them are checked once and error messages refer to their names. Intersections of object types are recomputed and can produce
long, expanded error messages, and very large intersections slow type checking. The TypeScript team's performance guidance recommends interfaces with `extends` over intersections for object
composition in large codebases.

### How do you describe a function type with an interface? {mid}

With a call signature: `interface Formatter { (value: number): string; locale: string }`, which also allows properties on the function object, or a construct signature for constructors. A type
alias is simpler for plain function types: `type Formatter = (value: number) => string`. Method signatures inside interfaces (`format(v: number): string`) are checked bivariantly, while
function-typed properties (`format: (v: number) => string`) are checked strictly under `strictFunctionTypes`.
