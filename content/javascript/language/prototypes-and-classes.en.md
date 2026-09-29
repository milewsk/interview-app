# Prototypes and classes {mid}

JavaScript has **prototypal inheritance**: every object has a hidden `[[Prototype]]` link to another object (or `null`). When a
property isn't on the object, the engine looks in its prototype, then the prototype's prototype, and so on. That's the
**prototype chain**. `class` syntax is a more readable way to write the same mechanism.

```js
const animal = { speak() { return `${this.name} makes a sound` } }
const dog = Object.create(animal)       // [[Prototype]] dog → animal
dog.name = 'Rex'

dog.speak()                              // 'Rex makes a sound' (method from the prototype, this = dog)
Object.getPrototypeOf(dog) === animal    // true
dog.hasOwnProperty('speak')              // false: not an own property
'speak' in dog                           // true: in checks the whole chain
```

A plain object's chain ends at `Object.prototype` (where `toString` and `hasOwnProperty` come from), whose prototype is `null`.
`Object.create(null)` creates an object **without a prototype**, e.g. as a safe dictionary.

## Constructor functions (before ES2015)

```js
function Person(name) { this.name = name }
Person.prototype.greet = function () { return 'Hi, ' + this.name }

const p = new Person('Alice')
Object.getPrototypeOf(p) === Person.prototype   // true
```

`new` creates an empty object whose `[[Prototype]]` is `Person.prototype`, calls the function with `this` pointing to that
object, and returns it. Methods live on the prototype, so they're **shared** by all instances rather than copied.

## Classes (ES2015+)

```js
class Animal {
  #secret = 42                     // a private field (ES2022), inaccessible outside the class
  static count = 0                 // a static field (on the class itself)
  name                             // a public field: separate in every instance

  constructor(name) {
    this.name = name
    Animal.count++
  }

  speak() { return `${this.name} speaks` }    // a method on Animal.prototype
  get secret() { return this.#secret }        // a getter
  static create(name) { return new this(name) }
}

class Dog extends Animal {
  speak() { return super.speak() + ' (woof)' } // calling the parent's method
}
```

- A class is effectively a constructor function (`typeof Animal === 'function'`), and methods go onto the prototype.
- Classes **aren't usefully hoisted** (they're in the TDZ) and run in **strict mode**. Calling one without `new` throws `TypeError`.
- In a subclass with a constructor you must call `super(...)` **before** using `this` (otherwise `ReferenceError`).
- `extends` sets up two chains: `Dog.prototype → Animal.prototype` (instance methods) and `Dog → Animal` (static methods and fields
  are inherited).
- **Private fields `#x`** are enforced by the language: accessing one outside the class is a syntax error at parse time.
  `#x in obj` checks whether an object has the field.
- Class fields (`name`, `handler = () => {}`) are created on **every instance**, while methods exist once on the prototype.

## `instanceof` and type checks

`obj instanceof C` checks whether `C.prototype` appears in `obj`'s prototype chain. It fails across realms (e.g. an object from an
iframe) and when the prototype is changed, which is why arrays are checked with `Array.isArray`.

## Composition over deep inheritance

Long class hierarchies are fragile (the "gorilla-banana problem"). **Composition** is often better: an object is built from smaller
objects or functions, and behavior is passed in as a dependency. Extending the prototypes of built-in types
(`Array.prototype.last = ...`, so-called monkey patching) risks conflicts with future language versions and libraries.

## Sources

- [Inheritance and the prototype chain (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)
- [Classes (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)
- [Private properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_properties)
- [Object.create (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create)

## Questions

### What is the prototype chain? {junior}

Every object has a hidden `[[Prototype]]` link to another object. When reading a property the object doesn't have, the engine looks in
its prototype, then that prototype's prototype, and so on until `null`. That's how objects "inherit" methods, e.g. every array has
`map` from `Array.prototype`, and every object has `toString` from `Object.prototype`.

### Are JavaScript classes "real" classes like in Java or C#? {mid}

No. `class` is syntax over prototypes: a class is a constructor function, methods go onto its `prototype`, and inheritance links
prototypes. Classes do bring real differences from constructor functions, though: strict mode, mandatory `new`, the TDZ, `super`, and
public, static and private (`#`) fields that plain functions can't emulate.

### What does the `new` operator do? {mid}

It creates a new object, sets its `[[Prototype]]` to `Constructor.prototype`, calls the constructor with `this` pointing to that object,
and returns it (unless the constructor explicitly returns another object). That's how prototype methods are shared by all instances.

### Why are methods defined on the prototype rather than in the constructor? {mid}

A method on the prototype exists in memory once and is shared by all instances. A function assigned in the constructor
(`this.greet = function () {}`, and likewise an arrow class field) creates a separate copy in every instance, which uses more memory
with many objects. A prototype method can also be overridden in a subclass and called via `super`.

### How does `hasOwnProperty` differ from the `in` operator? {junior}

`obj.hasOwnProperty('x')` (better: `Object.hasOwn(obj, 'x')`) checks only the object's **own** properties. `'x' in obj` checks the
whole prototype chain, so it's also `true` for inherited methods, e.g. `'toString' in {}`. A `for...in` loop also walks inherited
enumerable properties, while `Object.keys` covers only own ones.

### Why must a subclass constructor call `super()` before using `this`? {mid}

In derived classes the object is created by the base class constructor. Until `super()` creates it, `this` isn't initialized, and
accessing it throws a `ReferenceError`. If the subclass doesn't define a constructor, the default one calls `super(...args)`
automatically.

### What are `#` private fields, and how do they differ from the `_name` convention? {mid}

`#field` is true privacy enforced by the language: accessing it outside the class body is a syntax error, and the field doesn't appear in
`Object.keys`, JSON or reflection. The `_name` convention is just a signal to developers, and the field stays fully accessible.
`#x in obj` lets you safely check whether an object has a given class's private field.

### How does `instanceof` work, and when does it fail? {mid}

It checks whether `Constructor.prototype` appears anywhere in the object's prototype chain. It fails for objects from another realm
(iframe, worker, `vm` in Node), since they have their own `Array` or `Object`, after manually changing the prototype, and for
primitives. That's why arrays are checked with `Array.isArray`, and custom types sometimes with shape checks (duck typing).

### What is `Object.create(null)` for? {mid}

It creates an object with no prototype, so without inherited properties like `toString`, `constructor` or `__proto__`. It's useful as a
dictionary with user-provided keys, because there's no risk of collisions with `Object.prototype` names or prototype pollution attacks.
Today `Map` is more often used for dictionaries.

### Why don't you extend the prototypes of built-in objects? {senior}

Adding e.g. `Array.prototype.last` affects all the code in the app and its libraries. It risks conflicts with another library doing the
same thing differently, and with future language versions: that's what happened with `Array.prototype.flatten`, renamed to `flat`
because a popular library would have broken websites ("smooshgate"). Write helper functions or use spec-compliant polyfills instead.
