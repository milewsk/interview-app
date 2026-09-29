# Modules and declaration files {mid}

TypeScript needs types for everything it imports. Your own `.ts` files provide them directly; JavaScript libraries provide them through **declaration files** (`.d.ts`), either
bundled with the package or from **DefinitelyTyped** (`@types/...`). How the compiler finds those files depends on module resolution and on the package's `exports` map. Knowing
how to fix "Could not find a declaration file" and how libraries publish types is standard mid-level knowledge. Examples were checked with TypeScript 7.0 (`moduleResolution:
bundler`).

## Declaration files

A `.d.ts` file contains only types: `declare function`, interfaces, type aliases, `declare module`, no implementation. Verified: compiling

```ts
export interface Money { amount: number; currency: string }
export function format(m: Money): string { return `${m.amount} ${m.currency}`; }
const internalHelper = 1;
```

with `--declaration --emitDeclarationOnly` produced a `money.d.ts` with the interface and `export declare function format(m: Money): string;`, and without the non-exported helper. Libraries
written in TypeScript publish such files; `declarationMap` lets editors jump to the original source.

## Untyped libraries and ambient modules

Importing a JavaScript package without types failed under `strict` with **TS7016** ("Could not find a declaration file for module 'untyped-lib'"). Fixes, in order of preference: install
`@types/untyped-lib` if it exists; otherwise write a declaration:

```ts
// src/untyped-lib.d.ts
declare module "untyped-lib" {
  export function slugify(s: string): string;
}
declare module "*.css";      // non-code imports handled by the bundler
```

After adding these, the error disappeared. A shorthand `declare module "untyped-lib";` types everything as `any` (quick, but unsafe).

## Side-effect imports

`import "./setup.css"` and `import "./missing-side-effect"` both failed with **TS2882** ("Cannot find module or type declarations for side-effect import"), because
`noUncheckedSideEffectImports` is on by default since TypeScript 6.0: typos in side-effect imports are no longer silently ignored. The CSS import was fixed by the `declare module "*.css"`
declaration; the genuinely missing file stayed an error.

## Package `exports` and types

Modern packages declare entry points in `package.json` `exports`, with a `types` condition pointing to declarations:

```json
{ "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } } }
```

`import { add } from "typed-pkg"` resolved to `dist/index.d.ts`, while a deep import of a file that exists but isn't exported, `typed-pkg/dist/internal`, failed with **TS2307**: `exports`
defines the package's public API and blocks everything else (with `bundler`/`nodenext` resolution; the legacy `node10` resolution, removed in 7.0, ignored `exports`). The `types` condition
should come first.

## ESM and CommonJS

TypeScript supports both module systems; with `nodenext` it follows Node's rules per file (`"type": "module"`, `.mts`/`.cts`). Default imports from CommonJS modules rely on interop that's always
on since 6.0: `esModuleInterop: false` was reported as deprecated in 6.0 (TS5107) and as removed in 7.0 (TS5108). Libraries shipping both formats need separate declarations or careful `exports` conditions so each consumer gets matching types.

## Sources

- [Declaration files: introduction](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
- [Modules: reference (exports, resolution)](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [Publishing types (package.json exports)](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)
- [noUncheckedSideEffectImports](https://www.typescriptlang.org/tsconfig/#noUncheckedSideEffectImports)
- [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)

## Questions

### What is a `.d.ts` file? {junior}

A declaration file that contains only type information (function signatures, interfaces, type aliases, module declarations) and no executable code. It describes the shape of JavaScript code for the
compiler and editor: libraries written in TypeScript generate them with `declaration: true` (in a test, only the exported interface and function signature were emitted), and JavaScript libraries get
hand-written ones, often from DefinitelyTyped.

### How do you fix "Could not find a declaration file for module"? {junior}

That's TS7016, reported under `noImplicitAny` when a JavaScript package has no types. First check for types from the package itself or `@types/<name>` on DefinitelyTyped. If none exist, write a
declaration in your project, `declare module "untyped-lib" { export function slugify(s: string): string; }` (which removed the error in a test), or as a last resort `declare module "untyped-lib";`,
which types everything as `any`.

### What is DefinitelyTyped? {junior}

A community repository of type declarations for JavaScript packages that don't ship their own, published to npm under the `@types` scope (`@types/lodash`, `@types/node`). The compiler automatically
finds installed `@types` packages when resolving imports. Since TypeScript 6.0, `types` defaults to `[]`, so global `@types` packages (like `@types/node` globals) must be listed explicitly in
`compilerOptions.types`.

### How do you type non-code imports like CSS or images? {mid}

With wildcard ambient module declarations: `declare module "*.css";` (or with an exported type, e.g. for CSS modules `const classes: Record<string, string>; export default classes;`) and
`declare module "*.svg" { const src: string; export default src; }`. Bundlers like Vite ship such declarations (`vite/client`). In a test, a CSS import failed with TS2882 until a `*.css` declaration
was added.

### What does `noUncheckedSideEffectImports` do? {mid}

It makes the compiler check that side-effect imports (`import "./polyfills"`), which bring in no bindings, actually resolve to a module or declaration. Previously such imports were silently accepted
even with typos. It's on by default since TypeScript 6.0: in a test, both a CSS import without declarations and a missing file were reported with TS2882.

### What is the `exports` field in `package.json` and how does TypeScript use it? {senior}

It lists a package's public entry points and conditions (`import`, `require`, `types`, `default`) and blocks every other path. With `bundler` or `nodenext` resolution, TypeScript follows it and uses
the `types` condition to find declarations: in a test, the main entry resolved, but a deep import of an existing unexported file failed with TS2307. Library authors must include `types` (first) for
each entry, or consumers get "Cannot find module" even though the JavaScript exists.

### Where does TypeScript look for a package's types? {mid}

For an import like `"lib"`, it reads the package's `package.json`: the `types` condition in `exports` if there is an `exports` field, otherwise the top-level `types` (or `typings`) field, or a
`.d.ts` next to the JavaScript entry point. If the package has no types, it falls back to `node_modules/@types/lib`. In a test, a package with only a `types` field and a JavaScript-only package
with a matching `@types` package both resolved to their declarations, even with the TypeScript 6 default `types: []`, which limits only automatically included global types.

### How should a library publish its types? {senior}

Generate `.d.ts` files from the TypeScript source (`declaration`, optionally `declarationMap`), point to them with the `types` condition in each `exports` entry (listed first) and a top-level
`types` field for older tooling, and test them with the module settings consumers use (`bundler`, `nodenext`, ESM and CommonJS). Tools such as `publint` and "Are the types wrong?" check the package
for mismatches between JavaScript and declarations.

### Can TypeScript files import JavaScript files? {mid}

Yes, with `allowJs`: the compiler includes JavaScript files, infers their types, and can check them with `checkJs` using JSDoc annotations (`/** @param {string} s */`). This is the usual way to
migrate a project gradually. Without `allowJs`, importing a local `.js` file without a declaration is an error under `noImplicitAny` (TS7016 in a test; with `allowJs` it compiled).

### What is `import type` and why does it exist? {mid}

`import type { User } from "./user"` imports only a type and is always removed from the output, so it can't cause runtime side effects or circular dependency problems, and tools that compile one
file at a time know it's safe to erase. With `verbatimModuleSyntax` it's required for type-only imports. `export type` works the same for re-exports.
