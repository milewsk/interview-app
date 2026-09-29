# TypeScript 6 and 7 {mid}

TypeScript 6.0 (March 2026) was the last release built on the original JavaScript codebase and a bridge release: it changed defaults and deprecated old options. TypeScript 7.0 (July 2026) is a
**native port written in Go**: the same language and the same `tsc` command, but typically 8–12x faster full builds according to the TypeScript team, with the deprecated options removed. Knowing what
changed matters when upgrading projects and explains why "old" tsconfig files suddenly fail. Behaviour below was checked with TypeScript 6.0.3 and 7.0.2.

## TypeScript 6.0: new defaults

| Option | Before 6.0 | 6.0 |
|---|---|---|
| `strict` | `false` | `true` |
| `module` | `commonjs` | `esnext` |
| `target` | `es5` | latest standard (`es2025`) |
| `types` | every `@types` package in `node_modules` | `[]` |
| `rootDir` | inferred from input files | the tsconfig's directory |
| `noUncheckedSideEffectImports` | `false` | `true` |

With no configuration, an untyped parameter produced TS7006 (strict) in both 6.0 and 7.0. The `es2025` default made `RegExp.escape` compile without flags, while newer APIs typed in 6.0, such as
`Map.prototype.getOrInsert` and `Temporal`, needed `target`/`lib` `esnext` (TS2550 and TS2304 without it).

## Deprecated in 6.0, removed in 7.0

TypeScript 6.0 reports deprecated options as errors that `"ignoreDeprecations": "6.0"` silences; TypeScript 7.0 rejects them. Verified examples:

| Option | 6.0 | 7.0 |
|---|---|---|
| `baseUrl`, `outFile` | TS5101 "deprecated" | TS5102 "has been removed" |
| `target: es5`, `moduleResolution: node10`, `module: amd` | TS5107 "deprecated" | TS5108 "has been removed" |
| `esModuleInterop: false` | TS5107 | TS5108 |

The full list also includes `downlevelIteration`, `moduleResolution: classic`, `module: umd/systemjs/none`, `alwaysStrict: false` and `allowSyntheticDefaultImports: false`. The upgrade path: first
move to 6.0 and fix every deprecation without `ignoreDeprecations`, then switch to 7.0.

## TypeScript 7.0: the native compiler

- **Speed**: native code plus shared-memory multithreading. Type-checking this app took about 1.76 s with `tsc` 6.0 and 0.30 s with 7.0 (a small project, where startup time dominates; the team
  reports 8–12x on large builds). The number of checker threads is set with `--checkers` (default 4), and `--singleThreaded` disables parallelism.
- **Same language**: the type system is ported, not redesigned; code that compiles cleanly on 6.0 without deprecations is expected to behave the same. Type ordering in 7.0 is deterministic for
  parallel checking; `--stableTypeOrdering` in 6.0 imitates it to help find differences.
- **No programmatic API in 7.0**: tools built on the TypeScript compiler API (some linters, framework template checkers for Vue, Svelte, Astro or Angular) still need 6.0; a new, different API is
  planned for 7.1. The `@typescript/typescript6` package (`tsc6`) allows 6.0 and 7.0 to be installed side by side.
- **Editor**: a new language server based on the Language Server Protocol, with fewer failures and crashes than the 6.0 server according to the announcement.
- **JavaScript checking**: JSDoc support in `.js` files is stricter and drops some legacy patterns (for example `@enum` and Closure-style function types).

## Sources

- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [A 10x faster TypeScript (native port announcement)](https://devblogs.microsoft.com/typescript/typescript-native-port/)
- [TSConfig reference](https://www.typescriptlang.org/tsconfig/)

## Questions

### What is TypeScript 7 and how does it differ from earlier versions? {junior}

It's a port of the TypeScript compiler and language service from TypeScript/JavaScript to Go, compiled to native code and using multiple threads. The language, the `typescript` npm package and the
`tsc` command stay the same, but builds are much faster (8–12x on full builds according to the team; about 6x on this small app in a test). Options deprecated in 6.0 are removed.

### Why was the compiler rewritten in Go instead of optimizing the JavaScript version? {mid}

JavaScript limits a compiler in ways that optimization can't fix: single-threaded execution without shared memory, JIT warm-up and garbage-collection overhead for huge object graphs. Go gives native
code, shared-memory concurrency and control over memory layout, and its structure is close enough to the existing codebase to allow a file-by-file port instead of a redesign. That keeps the type
system's behaviour the same while making parallel checking possible.

### Which TypeScript 6.0 default changes are most likely to break an existing project? {mid}

`types: []` (global `@types`, like Node or Jest globals, are no longer included automatically, so names like `process` or `describe` stop resolving until they're listed in `types`), `strict: true`
(projects that relied on the non-strict default get many errors), `module: esnext` (code relying on CommonJS emit), `rootDir` set to the tsconfig's directory (output folder structure can change),
and `noUncheckedSideEffectImports` (CSS or polyfill imports without declarations fail with TS2882). Setting these options explicitly avoids surprises.

### What does `ignoreDeprecations: "6.0"` do, and why shouldn't you rely on it? {mid}

It silences the TypeScript 6.0 errors for deprecated options such as `baseUrl`, `target: es5` or `moduleResolution: node10`. It's a temporary escape hatch: in 7.0 the same options are errors that
can't be silenced ("has been removed", TS5102/TS5108 in a test). Projects should use it only briefly and fix the configuration before upgrading.

### How do you upgrade a project from TypeScript 5.x to 7? {mid}

Go through 6.0 first: upgrade, set the changed defaults explicitly (`types`, `rootDir`, `module`), fix new strictness errors, and remove every deprecated option without `ignoreDeprecations`
(`baseUrl` to `paths` or package.json imports, `node10` to `bundler`/`nodenext`, ES5 output to a modern target). When 6.0 builds cleanly, switch to 7.0 and compare results; check that tools
depending on the compiler API still work, or keep `@typescript/typescript6` for them.

### Which tools can't use TypeScript 7.0 yet, and why? {senior}

Tools that call the TypeScript compiler API directly, such as type-aware lint rules and template type-checkers for Vue, Svelte, Astro, MDX or Angular, because 7.0 ships without a programmatic API (a
new, different API is planned for 7.1). They keep using 6.0, which can be installed next to 7.0 as `@typescript/typescript6` with the `tsc6` command. Transpilers like esbuild, SWC or Babel are
unaffected, since they don't use the TypeScript compiler.

### Does TypeScript 7 change the type system? {mid}

No, the goal is the same behaviour: the checker is a port, so a project that builds on 6.0 without deprecations should report the same errors. One visible difference is deterministic type ordering,
needed for parallel checking, which can change the order of union members in messages or declaration output; `--stableTypeOrdering` in 6.0 imitates it (at a performance cost) to find such
differences before upgrading.

### How does TypeScript 7 use multiple threads? {senior}

It type-checks files in parallel with several checker workers sharing memory, 4 by default, configurable with `--checkers` (more can help large codebases at the cost of memory), builds independent
project references in parallel (`--builders`), and can be forced to one thread with `--singleThreaded`, for example to reduce memory in CI or to debug. In a test, `--checkers 8` was accepted by
7.0.

### Why does TypeScript 6.0 set `target` to the latest ECMAScript version by default? {mid}

Because all current browsers and Node versions support modern JavaScript, and down-levelling to old targets is now the job of bundlers or dedicated tools. With the `es2025` default, APIs such as
`RegExp.escape` type-check without configuration (verified). Features newer than the default, like `Map.prototype.getOrInsert` or `Temporal`, still need `lib`/`target` `esnext` (TS2550 and TS2304
without it in a test), and a project running on older runtimes should set `target` and `lib` explicitly.

### What should a CI pipeline look like after the move to TypeScript 7? {senior}

Run `tsc --noEmit` (7.0) as a separate type-check step, since bundlers don't check types, and keep a fixed TypeScript version in the lockfile. If tools still need the compiler API, run them with
`@typescript/typescript6` alongside. Faster checking makes it practical to type-check on every commit and in pre-commit hooks: the announcement reports that Slack cut CI type-checking from about
7.5 minutes to 1.25 minutes.
