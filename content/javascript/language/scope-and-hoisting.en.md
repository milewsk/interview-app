# Scope, hoisting and `var` / `let` / `const` {junior}

**Scope** determines where in the code a variable is visible. JavaScript has **lexical** scope: visibility is decided by where
the code is written, not where it's called. Kinds of scope:

- **global**: outside functions and modules (in an ES module, the top level is module scope),
- **function**: every function creates its own,
- **block** (`{ }` in `if`, `for`, a standalone block): only for `let`, `const` and `class`.

A variable is looked up from the current scope upwards through the **scope chain**. An inner declaration with the same name
**shadows** the outer one.

## `var`, `let`, `const`

| | `var` | `let` | `const` |
| --- | --- | --- | --- |
| scope | function | block | block |
| hoisting | yes, initialized to `undefined` | yes, but in the TDZ | yes, but in the TDZ |
| redeclaration in the same scope | allowed | error | error |
| reassignment | yes | yes | no (`TypeError`) |
| a `window` property in a global script | yes | no | no |

`const` prevents **reassignment**, not mutation: `const obj = {}; obj.x = 1` is fine. To freeze an object, use `Object.freeze`
(shallowly).

Good practice: `const` by default, `let` when the value changes, and never `var`.

## Hoisting

Before running the code, the engine registers declarations in their scope, so they behave as if "hoisted" to the top:

```js
console.log(a)      // undefined: var is hoisted and initialized to undefined
var a = 1

console.log(b)      // ReferenceError: Cannot access 'b' before initialization
let b = 2

greet()             // works: a function declaration is hoisted entirely
function greet() {}

fn()                // TypeError: fn is not a function (var fn = undefined at this point)
var fn = function () {}
```

## Temporal Dead Zone (TDZ)

`let`, `const` and `class` are hoisted too, but until the declaration runs they're in the **TDZ**: any access throws a
`ReferenceError`. This also applies to shadowing:

```js
let x = 'outer'
function f() {
  console.log(x)    // ReferenceError: this is already the inner x, still in the TDZ
  let x = 'inner'
}
```

The TDZ catches using a variable before initialization, which with `var` silently gave `undefined`.

## Global variables and strict mode

- Assigning to an undeclared variable in **sloppy** mode creates a global variable, while in **strict** mode (ES modules,
  classes, `'use strict'`) it throws a `ReferenceError`.
- `var` at the top level of a classic script creates a `window` property, while `let`/`const` don't. In ES modules, variables
  are local to the module.
- An IIFE (`(function () { ... })()`) was the way to get a private scope before modules and `let`.

## Sources

- [Scope (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Scope)
- [Hoisting (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Hoisting)
- [let: temporal dead zone (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#temporal_dead_zone_tdz)
- [const (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const)

## Questions

### How do `var`, `let` and `const` differ? {junior}

`var` is function-scoped, hoisted and initialized to `undefined`, and it can be redeclared. `let` and `const` are block-scoped,
in the TDZ until their declaration, and can't be redeclared in the same scope. `const` additionally forbids reassignment,
although the object it points to can still be modified.

### What is hoisting? {junior}

The behavior where declarations are registered in their scope before the code runs, as if "hoisted" to the top. Function
declarations are fully available (you can call them before where they're written). `var` is available but holds `undefined`.
`let`, `const` and `class` are hoisted too, but are in the TDZ until their declaration.

### What is the Temporal Dead Zone? {mid}

The period from the start of the scope until a `let`, `const` or `class` declaration runs, during which the variable already
exists but accessing it throws a `ReferenceError`. So using it before initialization is caught as an error, instead of silently
giving `undefined` as with `var`. The TDZ also applies when an inner variable shadows an outer one with the same name.

### What does `console.log(a); var a = 1` print, and what about with `let`? {junior}

With `var` it prints `undefined`, because the declaration is hoisted and initialized to `undefined`, and the assignment of `1`
happens later. With `let` it throws `ReferenceError: Cannot access 'a' before initialization`, because the variable is in the TDZ.

### Is an object declared with `const` immutable? {junior}

No. `const` only prevents reassigning the variable (`obj = {}` throws `TypeError`); the object's or array's contents can change
(`obj.x = 1`, `arr.push(2)`). Immutability comes from `Object.freeze` (shallowly, not nested objects) or a convention of immutable
updates.

### How do a function declaration and a function expression differ with respect to hoisting? {mid}

A declaration `function f() {}` is hoisted entirely, so it can be called before where it's written. An expression
`var f = function () {}` hoists only the variable (`undefined`), so an earlier call throws `TypeError: f is not a function`. With
`const f = () => {}`, an earlier call throws `ReferenceError`, because the variable is in the TDZ.

### What are lexical scope and the scope chain? {mid}

Lexical scope means variable visibility follows from where the code is written. A function sees the variables of the scopes it was
defined in. When a variable isn't in the current scope, the engine looks in the enclosing scope and further up to the global one
(the scope chain). Closures are built on this.

### What happens when you assign a value to an undeclared variable? {junior}

In sloppy mode a global variable is created (a property of the global object), a common source of bugs and collisions. In strict
mode, the default in ES modules and classes, a `ReferenceError` is thrown. That's one reason to write code in modules or with
`'use strict'`.

### Why does `var` in a loop with callbacks give unexpected results? {mid}

`var` is function-scoped, so there's one variable for the whole loop, and all callbacks (e.g. `setTimeout`) see its final value.
`let` in a `for` header creates a new binding per iteration, so each callback gets its own value. It's a classic interview task
combining scope and closures.

### What is variable shadowing? {junior}

Declaring a variable with the same name in an inner scope hides the outer one: inside the block or function, references go to the
inner variable, and the outer one stays unchanged. It's allowed but easy to get wrong, which is why linters may flag it
(`no-shadow`).
