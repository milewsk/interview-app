# Modules: ES Modules and CommonJS {mid}

A module is a file with its own scope: its variables don't leak into the global scope, and it exposes only what it **exports**. Two systems
coexist in the JS ecosystem.

## ES Modules (ESM): the language standard

```js
// math.js
export const PI = 3.14
export function add(a, b) { return a + b }
export default function multiply(a, b) { return a * b }

// app.js
import multiply, { add, PI as pi } from './math.js'
import * as math from './math.js'
const { heavy } = await import('./heavy.js')     // a dynamic import returns a promise
```

Characteristics:

- **Static structure**: `import`/`export` are at the top level and known before the code runs. That lets bundlers **tree-shake** (drop unused
  exports) and tools detect import errors.
- **Live bindings**: an import is a view of the exporting variable, not a copy of its value. A change inside the module is visible to the
  importer. You can't assign to an import (`TypeError`).
- Modules always run in **strict mode**, and top-level `this` is `undefined`.
- **Top-level await**: `await` at a module's top level. Importing modules wait for it to finish.
- Each module is evaluated **once**. Later imports get the same instance (a singleton), which is sometimes used for shared state.
- `import.meta` exposes module metadata (`import.meta.url`, in Vite `import.meta.env` and `import.meta.glob`, in Node `import.meta.dirname`).
- In the browser: `<script type="module">` (deferred by default, like `defer`) and dynamic `import()` for code splitting.

## CommonJS (CJS): Node's historical format

```js
// math.cjs
function add(a, b) { return a + b }
module.exports = { add }            // or exports.add = add

// app.cjs
const { add } = require('./math.cjs')
```

- `require` is **synchronous and dynamic** (it can be called conditionally, with a variable path), which hinders static analysis and
  tree-shaking.
- What's exported is **the value of the `module.exports` object** at the time it's read. A primitive copied into the object doesn't update after a
  later change in the module.
- `__dirname`, `__filename` and `module` are available, which don't exist in ESM.

## ESM and CJS in Node

- The format is determined by the extension (`.mjs` / `.cjs`) or by the `"type": "module"` field in `package.json` for `.js` files.
- ESM can import CJS (`module.exports` becomes the default export). Since Node 22.12 (and in 24), `require()` can load synchronous ES modules
  (without top-level await).
- Libraries often publish both formats and point to them with the `"exports"` field in `package.json` (`import` / `require` conditions).

## Circular dependencies

When A imports B and B imports A, one of the modules sees the other **incomplete**. In ESM, reading a not-yet-initialized `let`/`const` throws a
`ReferenceError` (TDZ), while in CJS you get a partial `module.exports` object. Fixes: extract shared code into a third module, read the import
inside functions called later rather than at the top level, invert the dependency.

## Named or default export

Named exports make refactoring easier (the IDE renames everywhere), enforce consistent names and work better with tree-shaking. A default export
can be imported under any name, which invites inconsistency. Many teams prefer named exports. `React.lazy`, though, requires a default export (or a
`then`).

## Sources

- [JavaScript modules (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [import (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)
- [Modules: ECMAScript modules (Node.js docs)](https://nodejs.org/api/esm.html)
- [Modules: CommonJS modules, loading ESM with require (Node.js docs)](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)

## Questions

### How do ES Modules differ from CommonJS? {mid}

ESM (`import`/`export`) is the language standard with a static structure known before execution, live bindings, strict mode, top-level await and
asynchronous loading, working in browsers and Node. CommonJS (`require`/`module.exports`) is Node's historical format: synchronous and dynamic, it
exports the value of the `module.exports` object and has `__dirname`. ESM's static nature enables tree-shaking.

### What is tree-shaking, and why does it need ESM? {mid}

A bundler removing unused code from the output bundle. It works because ESM imports and exports are static: the bundler knows before execution which
exports are used. In CommonJS, `require` can be called conditionally or with a dynamic path, and `module.exports` modified at runtime, so safely
removing code is hard. Side effects at import time also get in the way (`sideEffects` in `package.json`).

### What are "live bindings" in ESM? {senior}

An ESM import is a reference to the variable in the exporting module, not a copy of its value. If the module changes an exported `let count`, the
importer sees the new value. In CommonJS the `module.exports` object holds the value from the moment it was assigned, so a primitive doesn't update.
An import is read-only: assigning to it throws a `TypeError`.

### What is dynamic `import()` for? {mid}

It loads a module at runtime and returns a promise of its namespace. It enables **code splitting** (the bundler creates a separate chunk loaded on
demand, e.g. `React.lazy`), conditional loading (e.g. a polyfill only when needed) and importing a path known only at runtime. It also works in
non-module scripts and in CommonJS.

### Is a module executed on every import? {junior}

No. A module is executed once, on the first import, and the result is cached. Every later import (dynamic ones too) gets the same instance. That's
why a variable at a module's top level is effectively a singleton shared by the whole app (which sometimes needs resetting in tests).

### What is top-level await, and what are its consequences? {mid}

`await` used at the top level of an ES module, without wrapping it in an async function, e.g. to load configuration. Modules that import it wait for
it to finish before they run, so long operations delay the start of the whole app. It doesn't work in CommonJS, and a module with top-level await
can't be loaded with `require()`.

### What happens with a circular dependency between modules? {senior}

One module starts executing before the other has finished, so it sees it incomplete. In ESM, reading a not-yet-initialized `let` or `const` throws a
`ReferenceError`, while `function` declarations are available thanks to hoisting. In CJS you get a partial `module.exports`. Fixes: move the shared
part into a separate module, access the import inside functions called later, or redesign the dependencies.

### How does Node decide whether a file is ESM or CJS? {mid}

By extension: `.mjs` is always ESM, `.cjs` always CommonJS. For `.js`, the nearest `package.json` decides: `"type": "module"` means ESM, and no field
or `"commonjs"` means CJS. Libraries point to variants for both systems with the `"exports"` field and its `import` and `require` conditions.

### Named or default export? {junior}

A named export forces the same name on import (easier searching and refactoring), lets you export many things and works well with the IDE's
auto-imports. A default export can be imported under any name, which leads to inconsistency over time. Many teams use named exports only, except
where a default is required (e.g. `React.lazy`, framework routing files).

### Why is there no `__dirname` in an ES module, and what replaces it? {mid}

`__dirname`, `__filename`, `require` and `module` are variables injected by the CommonJS wrapper, which ESM doesn't use. ESM has `import.meta.url`
(the file's URL), and newer Node versions provide `import.meta.dirname` and `import.meta.filename`. In older ones you compute them with
`fileURLToPath(import.meta.url)`. You can create a `require` with `createRequire(import.meta.url)`.
