# tsconfig and strictness {mid}

`tsconfig.json` decides how strictly TypeScript checks code and how it resolves and emits modules. Most real-world TypeScript problems ("works in the editor, fails in CI",
"can't find module", `undefined` crashes) trace back to these settings. TypeScript 6.0 changed several defaults, and TypeScript 7.0 removed deprecated options, so older
configurations need attention. Behaviour below was checked with TypeScript 6.0.3 and 7.0.2.

## `strict` and extra checks

`strict: true` enables a family of checks: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`,
`useUnknownInCatchVariables`, `alwaysStrict`, `strictBuiltinIteratorReturn`. **Since TypeScript 6.0 `strict` is on by default**: compiling `function f(x) { ... }` with no flags and no
tsconfig reported `TS7006: Parameter 'x' implicitly has an 'any' type` in both 6.0 and 7.0.

Checks **not** included in `strict` that are worth enabling:

- **`noUncheckedIndexedAccess`**: index signature and array reads include `undefined`. For `dict["missing"].toFixed()` on a `Record<string, number>`, the default compiled cleanly; with the
  flag it reported `TS2532: Object is possibly 'undefined'`.
- **`exactOptionalPropertyTypes`**: `retries?: number` no longer accepts an explicit `undefined` (`TS2375`; 0 errors without the flag), distinguishing "missing" from "set to undefined".
- `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`/`noUnusedParameters`.

## Modules and resolution

- **`module`/`moduleResolution: "bundler"`** for code built by Vite, webpack or esbuild: extensionless relative imports are fine.
- **`nodenext`** for code run directly by Node: it follows Node's rules, so in ESM files (`"type": "module"`) relative imports need the **runtime extension**: `import { x } from "./lib"` failed
  with TS2835 ("Relative import paths need explicit file extensions..."), while `"./lib.js"` (pointing to `lib.ts`) passed. In CommonJS files the same import without an extension was accepted.
- **`verbatimModuleSyntax`**: imports and exports are kept or removed exactly as written, so type-only imports must say so: importing an interface as a value failed with TS1484 ("'Opts' is a type and
  must be imported using a type-only import"). This makes per-file transpilers (esbuild, SWC, Node type stripping) safe; it supersedes `importsNotUsedAsValues` and
  `preserveValueImports`.
- `skipLibCheck: true` skips checking `.d.ts` files of dependencies, speeding up builds.

## Deprecated and removed options

TypeScript 6.0 reports deprecated options as errors (silenceable with `"ignoreDeprecations": "6.0"`), and 7.0 removes them. Verified:

| Option | TypeScript 6.0 | TypeScript 7.0 |
|---|---|---|
| `baseUrl` | TS5101 "deprecated and will stop functioning" | TS5102 "has been removed" |
| `moduleResolution: node10` | TS5107 deprecated | TS5108 removed |
| `target: es5` | TS5107 deprecated | TS5108 removed |

Replace `baseUrl`-based path aliases with `paths` (relative to the tsconfig) or package.json `imports` (`#/...`), `node10` with `bundler` or `nodenext`, and ES5 output with a modern target
(downleveling, if still needed, belongs to a separate tool).

## Sources

- [TSConfig reference](https://www.typescriptlang.org/tsconfig/)
- [strict](https://www.typescriptlang.org/tsconfig/#strict)
- [noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
- [Modules: choosing compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
- [verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax)
- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)

## Questions

### What does `strict` enable, and is it on by default? {junior}

A group of checks including `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables` and `alwaysStrict`. Since
TypeScript 6.0 it's on by default: with no configuration, an untyped parameter produced TS7006 in both 6.0 and 7.0. New projects should keep it on; older ones turn the checks on gradually.

### What does `noUncheckedIndexedAccess` do and why isn't it part of `strict`? {mid}

It adds `undefined` to the type of reads through index signatures and array indexes, so `dict["missing"].toFixed()` is reported as possibly undefined (verified) instead of compiling and crashing.
It isn't part of `strict` because it's noisy for code that indexes arrays in loops or has already checked keys, requiring extra checks or `!`. It catches a real class of bugs, so many teams enable it.

### What is `exactOptionalPropertyTypes`? {senior}

With it, an optional property `retries?: number` means "may be absent", but not "may be `undefined`": assigning `{ retries: undefined }` fails with TS2375 (it compiled without the flag). This matters
where "missing" and "explicitly undefined" behave differently, e.g. `Object.keys`, spreading defaults (`{ ...defaults, ...opts }` overwriting with `undefined`), or PATCH payloads. To allow both,
declare `retries?: number | undefined`.

### What's the difference between `moduleResolution: bundler` and `nodenext`? {mid}

`bundler` models tools like Vite and webpack: extensionless relative imports and `package.json` `exports` are supported, and the bundler decides the final output. `nodenext` models Node exactly: it
distinguishes ESM and CommonJS files by `package.json` `type` and file extension, and in ESM requires relative imports with the runtime extension (a missing extension gave TS2835 in a test,
`./lib.js` worked). Use `bundler` for front-end apps and `nodenext` for code executed by Node or published libraries.

### Why do relative imports in Node ESM projects end with `.js` even though the file is `.ts`? {mid}

Because TypeScript doesn't rewrite import paths: the emitted JavaScript keeps the specifier as written, and Node's ESM loader requires the real file name of the output, which is `lib.js`. TypeScript
resolves `./lib.js` to `lib.ts` at compile time (verified). Newer options (`rewriteRelativeImportExtensions`, `allowImportingTsExtensions`) support writing `.ts` in specifiers for tools that run
TypeScript directly.

### What does `verbatimModuleSyntax` do? {senior}

It makes TypeScript keep or drop imports and exports exactly as written: anything imported without `type` is kept in the output, and anything with `type` is removed. So a type imported as a value
is an error (TS1484 in a test), and you write `import type { Opts }` or `import { type Opts }`. This guarantees that tools transpiling one file at a time (esbuild, SWC, Babel, Node type stripping),
which can't know whether a name is a type, produce correct output.

### What does `paths` do, and does it change the emitted imports? {mid}

`paths` maps import specifiers to files for type-checking, e.g. `"@lib/*": ["./src/lib/*"]`, so `import { x } from "@lib/util"` resolves to `src/lib/util.ts`. It doesn't rewrite anything: in a
test, the emitted `main.js` still contained `from "@lib/util"`. The bundler (Vite aliases, a tsconfig-paths plugin) or runtime (package.json `imports` with `#/...`) must resolve the same alias,
otherwise the code type-checks but fails at runtime. Since `baseUrl` is removed in 7.0, `paths` entries are written relative to the tsconfig.

### What are project references? {senior}

A way to split a large codebase into smaller TypeScript projects: a project lists its dependencies in `references`, and each referenced project sets `composite: true` (which requires declaration
emit; disabling it gave TS6304 in a test). `tsc -b` then builds projects in dependency order and skips the ones that are up to date: in a test, the first run built `core` and then `app`, and the
second reported both as up to date. This speeds up builds and editors in monorepos and enforces boundaries between packages.

### What is `skipLibCheck` and is it safe to enable? {mid}

It skips type-checking declaration files (`.d.ts`), mainly those from `node_modules`, which speeds up compilation and avoids errors caused by conflicting or broken third-party typings. Your own code
is still fully checked against those declarations. It's commonly enabled; the risk is missing genuine inconsistencies between library types, which rarely affects applications.

### How do you migrate a JavaScript project to TypeScript gradually? {senior}

Enable `allowJs` (and optionally `checkJs` with JSDoc types) so JS and TS coexist, start with loose settings, rename files to `.ts` one module at a time starting from leaves or core types, then turn on
`strict` checks progressively (e.g. `noImplicitAny`, then `strictNullChecks`), using `// @ts-expect-error` sparingly for known issues. Add type-checking to CI (`tsc --noEmit`) early, so the gains
aren't lost as the migration continues.
