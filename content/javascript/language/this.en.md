# `this` and binding rules {mid}

In JavaScript, `this` **doesn't depend on where a function is defined** (except for arrow
functions) but on **how it's called**. The same `function` can get a different `this` on every call.

```js
'use strict'
const user = {
  name: 'Alice',
  hi() { return this?.name },
}

user.hi()                   // 'Alice': called as a method
const hi = user.hi
hi()                        // undefined: "lost" this
hi.call({ name: 'Bob' })    // 'Bob'
```

## Four rules (highest priority first)

1. **`new`**: `this` is the newly created object.
2. **Explicit binding**: `fn.call(obj, a, b)`, `fn.apply(obj, [a, b])`, or `fn.bind(obj)`, which returns
   a new function with `this` fixed permanently.
3. **Implicit binding**: calling `obj.fn()` makes `this === obj`. What counts is the object **right
   before the dot** at call time.
4. **Default**: a plain call `fn()` gives `undefined` in strict mode (ES modules and classes are always
   strict), and the global object (`globalThis`) in sloppy mode.

Priority details:

- `bind` is **permanent**: further `bind`, `call` or `apply` on a bound function won't change `this`,
- **`new` beats `bind`**: `new (Person.bind(obj))('X')` creates a new object and ignores `obj`.

## Arrow functions

An arrow function **has no `this` of its own**. It takes `this` lexically from the enclosing scope, like
any other variable. Therefore:

- `call`, `apply` and `bind` won't change its `this`,
- it can't be a constructor (`new` throws `TypeError`),
- it's **unsuitable as a method in an object literal**, because its `this` is the scope where the object
  was created (in an ES module, `undefined`), not the object itself,
- it's ideal as a **callback inside a method**:

```js
const timer = {
  name: 'T',
  start() {
    setTimeout(function () { console.log(this.name) })  // 🔴 this ≠ timer
    setTimeout(() => console.log(this.name))             // ✅ 'T'
  },
}
```

In a browser, `this` in a plain `setTimeout` callback is `window`, and in Node it's a `Timeout` object.
It's never the object where the method was defined.

## Classes: lost `this` in callbacks

Class methods are in strict mode, so a "detached" method has `this === undefined`, and accessing a field
throws `TypeError`. The classic case is passing a method as a handler:

```js
class Counter {
  count = 0
  inc() { this.count++ }              // method on the prototype
  incArrow = () => { this.count++ }   // field: a separate function in every instance
}

const c = new Counter()
button.addEventListener('click', c.inc)             // 🔴 TypeError on click
button.addEventListener('click', c.inc.bind(c))     // ✅
button.addEventListener('click', () => c.inc())     // ✅
button.addEventListener('click', c.incArrow)        // ✅
```

An arrow field is convenient, but each instance gets **its own copy of the function**, it doesn't live on
the prototype, and a subclass can't override it and call `super.method()`.

## `this` in DOM event handlers

In `addEventListener` with a regular function, `this` is the element the listener was registered on (the
same as `event.currentTarget`). In an arrow function `this` comes from the surroundings, so you reach the
element via `event.currentTarget`.

## Top-level `this`

- ES module: `undefined`,
- browser script: `window`,
- CommonJS module in Node: `module.exports`.

Regardless of the environment, the global object is available as `globalThis`.

## Sources

- [this (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)
- [Function.prototype.bind (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind)
- [Arrow function expressions (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)
- [Public class fields (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields)

## Questions

### What determines the value of `this` in a regular function? {junior}

How it's called, not where it's defined. `new Fn()` gives a new object, `call`/`apply`/`bind` the given
object, `obj.fn()` the object before the dot, and a plain `fn()` gives `undefined` in strict mode (or
`globalThis` in sloppy mode). The exception is arrow functions, which take `this` lexically from their
surroundings.

### What's the difference between `call`, `apply` and `bind`? {junior}

`call` and `apply` **invoke** the function immediately with the given `this`. `call` takes arguments one by
one (`fn.call(obj, a, b)`), and `apply` takes them as an array (`fn.apply(obj, [a, b])`). `bind` **doesn't
invoke** the function. It returns a new one with `this` permanently set (and optionally preset arguments),
which is useful when passing methods as callbacks.

### What does `const hi = user.hi; hi()` print, and why? {junior}

In strict mode `this` is `undefined`, so `this.name` throws `TypeError` (and `this?.name` returns
`undefined`). In sloppy mode `this` is the global object. Assigning a method to a variable breaks its tie
to the object, because when `hi()` is called there's no object before the dot.

### Why is an arrow function unsuitable as a method in an object literal? {mid}

It has no `this` of its own. It takes it from the scope where the literal was created, e.g. the module
(`undefined`) or an enclosing function, not from the object it's called on. So `obj.arrow()` won't set
`this` to `obj`. Define methods with the shorthand syntax `method() {}`.

### Can you change a function's `this` after `bind`? {mid}

No. A function returned by `bind` has `this` fixed permanently: further `bind`, `call` and `apply` won't
change it. The only exception is `new`. Calling a bound function as a constructor creates a new object and
ignores the bound `this`.

### Why does passing a class method as a handler (`onClick={this.handle}`, `addEventListener('click', obj.handle)`) break `this`? {mid}

You pass the bare function, without the object. The browser or React later calls it without an `obj.`
context, and class code is in strict mode, so `this` is `undefined` (with `addEventListener` it's the DOM
element). Fixes: `bind` in the constructor, an arrow class field, or wrapping it in an arrow
`() => obj.handle()`.

### What are the downsides of arrow class fields (`handle = () => {}`) compared with methods? {senior}

Each instance gets its own copy of the function, which uses more memory with many instances. The function
isn't on the prototype, so a subclass can't override it with a method or call it via `super.handle()`.
It's also harder to mock via the prototype in tests. In exchange, `this` is always bound to the instance.

### What is `this` in a `setTimeout` callback inside an object's method? {mid}

For a regular function it's not the object with the method: in a browser it's `window`, and in Node a
`Timeout` object. The callback is invoked by the environment, not by our object. For an arrow function
`this` comes from the method, so it's the object. That's why callbacks inside methods are usually written
as arrows.

### What is the precedence of the `this` binding rules? {mid}

From highest: `new` (a new object), explicit binding (`bind`/`call`/`apply`), implicit binding
(`obj.fn()`), default binding (`undefined` or `globalThis`). Arrow functions sit outside this system,
because their `this` is always lexical.

### What is `this` at the top level of an ES module, a script, and a CommonJS module? {mid}

In an ES module it's `undefined`, because modules are in strict mode. In a classic browser script it's
`window`, and in a CommonJS module in Node it's `module.exports`. Use `globalThis` to reach the global
object in any environment.
