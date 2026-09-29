# OOP, inheritance and interfaces in C# {mid}

C# is an object-oriented language with single class inheritance and multiple interface implementation. Interview questions check the four pillars
and, above all, practical mechanisms: `virtual`/`override`, `new`, abstract classes vs interfaces, and modern interface features.

## Four pillars

- **Encapsulation**: hiding state behind a public API (`private` fields, properties, methods that preserve invariants).
- **Abstraction**: exposing *what* an object does, not *how* (interfaces, abstract classes).
- **Inheritance**: a derived class reuses and extends a base class. C# allows **one** base class.
- **Polymorphism**: a call through a base type runs the implementation of the actual type (`virtual`/`override`, interfaces).

## Access modifiers

`public`, `private` (the default for class members), `protected` (the class and derived classes), `internal` (the default for top-level types; the
same assembly), `protected internal` (derived **or** the same assembly), `private protected` (derived **and** the same assembly), `file` (C# 11; visible
only in one file, used by source generators).

## `virtual`, `override`, `new`, `sealed`

```csharp
Animal a = new Dog();
a.Speak();      // "woof": override, the actual type decides
a.Describe();   // "animal": new hides the method, the variable's type decides
((Dog)a).Describe();   // "dog"

class Animal
{
    public virtual string Speak() => "...";
    public string Describe() => "animal";
}

class Dog : Animal
{
    public override string Speak() => "woof";
    public new string Describe() => "dog";   // hiding, not overriding
}
```

- Methods are **non-virtual by default** (unlike Java). Polymorphism requires `virtual` (or `abstract`) in the base and `override` in the derived class.
- `new` **hides** a member: which version runs depends on the compile-time type of the variable. Without `new` the compiler warns (CS0108). It's
  usually a design smell.
- `sealed` on a class blocks inheritance (CS0509), and `sealed override` blocks further overriding. Sealing classes by default helps the JIT
  (devirtualization) and makes intent clear.
- `base.Method()` calls the base implementation.

**Pitfall:** calling a virtual method in a base constructor runs the **derived** override before the derived constructor body. The derived class's field
initializers have already run, but fields set in its constructor are still default values.

## Abstract class vs interface

```csharp
public abstract class Shape
{
    public abstract double Area();                     // must be implemented
    public override string ToString() => $"{GetType().Name}: {Area():F2}";   // shared code
}

public interface ILogger
{
    void Log(string message);
    void LogError(string message) => Log($"ERROR: {message}");   // default implementation (C# 8)
}
```

| | Abstract class | Interface |
|---|---|---|
| How many per type | one base class | any number |
| State (instance fields) | yes | no |
| Constructors | yes | no |
| Implementation | yes | default methods (C# 8+), static members |
| Access modifiers of members | any | public by default |
| Structs can use it | no | yes |

Rule of thumb: an **interface** describes a capability or contract ("can be logged", "can be compared") and is the basis for DI and testing with mocks.
An **abstract class** makes sense when related types share state and code (a template method).

## Modern interface features

- **Default interface methods** (C# 8): a method with a body. They're only available **through the interface**: `new ConsoleLogger().LogError("x")`
  doesn't compile (CS1061), and `((ILogger)logger).LogError("x")` does. They let you add members to a published interface without breaking
  implementations.
- **Static abstract members** (C# 11): an interface can require static members and operators, which enables generic math:

```csharp
static T Sum<T>(IEnumerable<T> items) where T : IAdditionOperators<T, T, T>, IAdditiveIdentity<T, T>
{
    var total = T.AdditiveIdentity;
    foreach (var item in items) total += item;
    return total;
}
```

- **Explicit implementation**: `string IStore.Save() => ...` is visible only through the interface. It resolves name conflicts between two interfaces
  and hides members that shouldn't be part of the class's public API.

## Composition over inheritance

Deep inheritance hierarchies are brittle: a change in the base affects every derived class (the fragile base class problem), and a derived class
depends on implementation details. The modern default: small interfaces, composition (an object **has** collaborators injected through the
constructor) and sealed classes. Inheritance is left for real "is-a" relationships and framework extension points.

## Sources

- [Object-oriented programming (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/tutorials/oop)
- [Polymorphism](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/object-oriented/polymorphism)
- [Interfaces (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/interface)
- [Explore static virtual members in interfaces](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/tutorials/static-virtual-interface-members)
- [Access modifiers](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/access-modifiers)

## Questions

### What are the four pillars of object-oriented programming? {junior}

Encapsulation (hiding state behind an API that preserves invariants), abstraction (exposing what an object does, not how), inheritance (reusing and
extending a base class) and polymorphism (a call through a base type or interface runs the implementation of the actual object). In C#, class inheritance
is single, and polymorphism is achieved through `virtual`/`override` and interfaces.

### How does `override` differ from `new` on a method? {mid}

`override` replaces a `virtual` method's implementation, so a call through a base-type reference runs the derived version (the object's runtime type
decides). `new` hides the member: a call through a base-type variable runs the base version and through a derived-type variable the new one, so the
compile-time type decides. `new` rarely makes sense and usually signals a design problem.

### Are methods in C# virtual by default? {junior}

No. Unlike Java, methods in C# are non-virtual by default, and polymorphic overriding requires marking the method `virtual` or `abstract` in the base
class and `override` in the derived class. This protects the base class from unintended overriding and helps the JIT (direct calls, inlining).

### When do you choose an abstract class, and when an interface? {mid}

An interface describes a contract or capability, can be implemented by many unrelated types (including structs) and is the basis for DI and mocking. An
abstract class makes sense when related types share state (fields), constructors and implementation, e.g. a template method. A type can implement many
interfaces but inherit only one class, so interfaces are the default choice.

### What are default interface methods, and what are they for? {mid}

Since C# 8, an interface member can have a body. The implementing class doesn't need to provide that member, and the method is available only through
an interface reference, not directly on the class. Their main purpose is evolving a published interface: adding a member without breaking existing
implementations. They're also the basis of traits-like APIs.

### What are static abstract members in interfaces used for? {senior}

Since C# 11, an interface can require static members, including operators and constants (`static abstract T Zero { get; }`). Combined with constraints,
this lets you write generic algorithms that call static members on `T`, e.g. `T.AdditiveIdentity` and `+`. That's the basis of generic math in .NET
(`INumber<T>`, `IAdditionOperators<...>`), which lets one `Sum<T>` method work for `int`, `double` and `decimal`.

### What happens when a base class constructor calls a virtual method? {senior}

The derived class's override runs, even though the derived constructor body hasn't run yet. The derived class's field initializers have already run
(they execute before the base constructor call), but fields set in its constructor still have default values. This leads to `NullReferenceException`s or
wrong state, so calling virtual members in constructors should be avoided.

### What is explicit interface implementation? {mid}

Implementing a member with the interface name (`string IStore.Save() => ...`) makes it available only through an interface reference, not on the class.
It's used to resolve conflicts when two interfaces have a member with the same signature, and to hide members that shouldn't be part of the class's public
API (e.g. the non-generic `IEnumerable.GetEnumerator`).

### What does `sealed` do, and why seal classes? {mid}

On a class it blocks inheritance, and on an `override` method it blocks further overriding in derived classes. Sealing makes intent clear (the class
isn't designed for extension), protects invariants and lets the JIT turn virtual calls into direct ones (devirtualization). Many teams seal classes by
default and unseal them only when they need to.

### Why is "composition over inheritance" recommended? {mid}

Inheritance couples a derived class tightly to the implementation details of its base: a change in the base can break every derived class, and deep
hierarchies are hard to understand and rigid (a class can have only one base). Composition builds behavior from small objects injected through
interfaces, which are easier to swap, test and combine. Inheritance is left for real "is-a" relationships.
