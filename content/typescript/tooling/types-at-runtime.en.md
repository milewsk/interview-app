# Types at runtime and data validation {mid}

TypeScript types are erased during compilation, so they guarantee nothing about data that arrives at runtime: API responses, request bodies, `localStorage`, environment variables, messages
from queues. The compiler trusts whatever type you give such data. Real safety needs **runtime validation at the boundaries**, ideally with a schema from which the static type is derived, so the
two can't drift apart. Examples were checked with TypeScript 7.0, Zod 4.6 and Node 24.

## Where the compiler trusts you

`JSON.parse` returns `any` in the standard library, and so does `Response.json()` (`Promise<any>`). Verified:

```ts
interface User { id: number; name: string }
const u = JSON.parse('{"id":"1","name":"Ann"}') as User;  // compiles
u.id.toFixed();   // TypeError: u.id.toFixed is not a function (id is a string)
```

Annotating (`const u: User = JSON.parse(s)`) is no safer, since `any` is assignable to everything. Typing the result as `unknown` makes the compiler force a check: `c.id` on an `unknown`
value failed with TS18046. And types can't be inspected at runtime: `c instanceof User` for an interface failed with TS2693 ("only refers to a type, but is being used as a value").

Code with type errors can still run: `tsc` emitted JavaScript for a file with TS2322 (exit code 2) unless `noEmitOnError` was set, and Node's type stripping ran such a file without checking
anything (`typeof oops` printed `string` for a variable declared as `number`). Type-checking has to be a separate CI step (`tsc --noEmit`).

## Schema validation with Zod

A schema describes data at runtime, and `z.infer` derives the static type from it, so there is one source of truth:

```ts
import { z } from "zod";
const User = z.object({ id: z.number().int().positive(), name: z.string().min(1), email: z.email() });
type User = z.infer<typeof User>;          // { id: number; name: string; email: string }

const user = User.parse(await res.json()); // throws ZodError on invalid data
const r = User.safeParse(input);           // { success: true, data } | { success: false, error }
if (!r.success) console.log(r.error.issues);
```

Verified behaviour:

- `parse` returned typed data and **stripped unknown keys** (an `extra` property was removed); `User.strict()` rejected it instead. `parse({})` threw `ZodError`.
- `safeParse({ id: "1", name: "", email: "nope" })` reported all three problems: `id: invalid_type; name: too_small; email: invalid_format`.
- Accessing `r.data.name` before checking `r.success` failed with TS18048 (possibly undefined): the result is a discriminated union.
- `z.coerce.number()` turned the query-string value `"3"` into `3`.
- `z.email().brand<"Email">()` produced a branded type: passing a raw string failed (TS2345), while at runtime the value was still a plain string.

## Validating configuration

Environment variables are strings or `undefined`, so validating them at startup fails fast with a clear message:

```ts
const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]),
});
export const env = Env.parse(process.env);
```

In a test, valid input produced `PORT: 3000` from the default, and invalid input reported all three variables at once (`z.prettifyError`: "Invalid URL", "expected number, received NaN",
"Invalid option").

## Sources

- [Zod documentation](https://zod.dev/)
- [Zod: basic usage (parse, safeParse)](https://zod.dev/basics)
- [TypeScript handbook: narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [noEmitOnError](https://www.typescriptlang.org/tsconfig/#noEmitOnError)
- [Parse, don't validate (Alexis King)](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

## Questions

### What type does `JSON.parse` return, and why is that a problem? {junior}

`any`, and `Response.json()` returns `Promise<any>`. So `JSON.parse(s) as User` or `const u: User = JSON.parse(s)` compile without any check, and a wrong shape shows up later as a runtime error: in a
test, an `id` that arrived as a string crashed on `u.id.toFixed()` with a `TypeError`. Treating the result as `unknown` and validating it (a type guard or a schema) is the safe approach.

### Why can code with type errors still run? {junior}

Because type-checking and producing JavaScript are separate. `tsc` emits output even when there are errors (in a test, with exit code 2) unless `noEmitOnError` is set, and tools such as esbuild,
SWC, Vite and Node's type stripping only remove types without checking them. A file assigning a string to a `number` variable ran in Node without complaint. That's why CI runs `tsc --noEmit`
separately.

### Where should an application validate data at runtime? {mid}

At the trust boundaries, where data enters from outside the compiler's control: HTTP request bodies and query strings, responses from external APIs, environment variables and configuration files,
`localStorage`, messages from queues, and file or database content with a loose schema. Inside the application, once data is validated and typed, re-checking it isn't needed. Validation at the edge
turns a type into a guarantee instead of an assumption.

### How does a schema library like Zod avoid duplicating types? {mid}

You define the schema once as a runtime value, and derive the static type with `z.infer<typeof Schema>`. The type always matches what the validator checks, so there's no hand-written interface that
can drift from the validation. In a test, a `User` built from `z.infer` rejected an object literal missing `name` (TS2741), and `parse` returned data of exactly that type.

### What is the difference between `parse` and `safeParse` in Zod? {junior}

`parse` returns the typed data or throws a `ZodError`. `safeParse` never throws and returns a discriminated union: `{ success: true, data }` or `{ success: false, error }`. The compiler forces you
to check `success` first: accessing `r.data.name` without it failed with TS18048. `safeParse` suits request handlers that return validation errors to the client; `parse` suits places where invalid
data should stop execution, such as startup configuration.

### What happens to unknown properties when Zod parses an object? {mid}

By default they're removed: in a test, parsing an object with an extra property returned data without it. This protects code from carrying unexpected fields further, such as a `role` sent by a
client. `.strict()` (or `z.strictObject`) rejects unknown keys with an error instead (`success: false` in the same test), and `.loose()` keeps them. Choose based on whether extra data should be
ignored or reported.

### How do you validate numbers coming from query strings or forms? {mid}

Query-string, form and environment values are always strings, so a plain `z.number()` rejects `"3"`. Coercion converts first and then validates: `z.coerce.number().int().min(1)` turned `"3"` into
`3` in a test, and `"abc"` became `NaN` and was reported as an invalid number. Constraints after coercion still matter, since coercion alone accepts anything that converts.

### How do you validate environment variables? {mid}

Describe them with a schema (`z.url()` for connection strings, `z.coerce.number()` with `.default()` for ports, `z.enum` for modes), parse `process.env` once at startup and export the typed result.
The app fails fast with a message listing every problem: in a test, three invalid variables were all reported in one error. The rest of the code then uses `env.PORT` as a `number` instead of
reading `process.env` strings.

### What does "parse, don't validate" mean? {senior}

Instead of checking data and then continuing to use the original loosely typed value, a parser checks it and returns a more precise type that carries the result of the check: `unknown` becomes
`User`, a `string` becomes a branded `Email`, a list becomes a non-empty list. Later code accepts only the precise type, so it can't receive unchecked data, and the check isn't repeated. Zod's
`parse` and branded types (`z.email().brand<"Email">()`, where a raw string was rejected with TS2345) apply this idea.

### How do you keep types in sync between a front end and a back end? {senior}

Generate or share them from one source: shared schema packages in a monorepo (Zod schemas used by both sides), code generation from an OpenAPI or GraphQL schema, or end-to-end typed RPC such as
tRPC. Compile-time sharing only proves that both sides were built from the same definition, not that the deployed server returns what the client expects (versions can differ during a
deployment), so the server still validates input, and clients validate responses from services they don't control.
