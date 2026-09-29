# Builder and prototype {mid}

**Builder** constructs a complex object step by step, separating the construction process from the final representation. **Prototype** creates new objects by
**copying** an existing one. Both are creational patterns that appear constantly in .NET: `StringBuilder`, `WebApplication.CreateBuilder()`, test data builders,
records with `with`, `MemberwiseClone`.

## Builder

```csharp
var email = new EmailBuilder()
    .To("ada@x.io")
    .Cc("bob@x.io")
    .Subject("Hi")
    .Body("Hello")
    .Build();          // validates and creates an immutable Email

public sealed class EmailBuilder
{
    private string? _to; private string _subject = ""; private string _body = ""; private readonly List<string> _cc = [];
    public EmailBuilder To(string to) { _to = to; return this; }        // each step returns the builder (fluent interface)
    public EmailBuilder Cc(string cc) { _cc.Add(cc); return this; }
    ...
    public Email Build() => _to is null
        ? throw new InvalidOperationException("Recipient is required")
        : new Email(_to, _cc.ToList(), _subject, _body);
}
```

- Useful when an object has **many optional parameters** (instead of a "telescoping constructor" with ten overloads), is built in **several steps**, or must be
  **validated as a whole** before it exists (in the test, `Build()` without a recipient threw "Recipient is required").
- The product can be **immutable**: the builder holds mutable state, and `Build()` produces the final object.
- **Test data builders**: `new OrderBuilder().WithCustomer("Ada").WithLine("PEN", 2).Build()` gives valid defaults for everything the test doesn't care about, which keeps
  tests short and resilient to model changes.
- In .NET: `StringBuilder`, `WebApplication.CreateBuilder(args)` (configure services, then `Build()`), `ConfigurationBuilder`, `HostApplicationBuilder`,
  `DbContextOptionsBuilder`, `UriBuilder`.
- In modern C#, object initializers with `required`/`init` properties cover many simple cases without a builder; a builder pays off with complex construction or
  validation.

## Prototype

Create new objects by cloning a configured instance instead of building from scratch, which is useful when construction is expensive or the object's configuration is
the point (templates, preset documents, default settings).

```csharp
var copy = (Document)original.MemberwiseClone();    // shallow copy
var modified = config with { Env = "test" };         // records: shallow copy with changes
```

The crucial detail is **shallow vs deep copy**:

- **Shallow**: fields are copied as they are, so reference-type fields (lists, nested objects) point to the **same** objects. In a test, adding a tag to the copy made by
  `MemberwiseClone` also changed the original's list, and so did adding to a list in a record copied with `with`.
- **Deep**: nested objects are copied too, so the copy is fully independent. Options: hand-written copy methods or copy constructors (explicit and fast), serialization
  round trip (e.g. JSON: simple but slower and limited to serializable data; verified that it separated the lists), or immutable data, where sharing is safe and copying
  becomes unnecessary.
- `ICloneable` is discouraged: its contract doesn't say whether `Clone()` is shallow or deep, and it returns `object`.

## Sources

- [Builder (refactoring.guru)](https://refactoring.guru/design-patterns/builder)
- [Prototype (refactoring.guru)](https://refactoring.guru/design-patterns/prototype)
- [Object.MemberwiseClone](https://learn.microsoft.com/en-us/dotnet/api/system.object.memberwiseclone)
- [Records: nondestructive mutation](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)

## Questions

### What problem does the builder pattern solve? {junior}

Constructing complex objects with many optional parts, or in several steps, without huge constructors with many overloads (the telescoping constructor problem) and
without half-initialized objects. The builder collects the configuration step by step, usually through a fluent interface, and `Build()` validates it and creates the final,
often immutable, object. It makes construction readable and keeps validation in one place.

### Where do you see the builder pattern in .NET? {junior}

`StringBuilder` (building a string in steps), `WebApplication.CreateBuilder(args)` and `HostApplicationBuilder` (configure services and configuration, then `Build()` the
app), `ConfigurationBuilder`, `DbContextOptionsBuilder`, `UriBuilder`, and many fluent APIs in libraries. In tests, test data builders are a common application.

### What is a test data builder? {mid}

A builder used in tests to create objects with sensible defaults, overriding only what the test is about: `new OrderBuilder().WithCustomer("Ada").Build()`. Tests become
shorter and focused on the relevant data, and when the model gains a new required property, only the builder's default changes instead of every test. It's often combined
with random or anonymous data generators.

### When is a builder better than object initializers with `required` properties? {mid}

Object initializers are enough for simple objects whose properties are independent. A builder is better when construction has rules spanning several values (validation of
the whole object), optional parts that are added step by step (collections, conditional parts), when the product should be immutable and created only when valid, or when
construction is a process worth naming (configuring an application host).

### What is the prototype pattern? {junior}

Creating new objects by copying an existing instance (the prototype) instead of constructing them from scratch. It's useful when creating an object is expensive, or when the
object's pre-configured state is what you want to reuse (templates, default configurations). In .NET it's implemented with `MemberwiseClone`, copy constructors, records with
`with`, or custom `Clone`/`Copy` methods.

### How does a shallow copy differ from a deep copy? {mid}

A shallow copy copies the object's fields as they are: value types are duplicated, but reference-type fields still point to the same nested objects, so changing a list in the
copy changes it in the original too (verified with `MemberwiseClone` and with a record's `with`). A deep copy also copies the referenced objects recursively, making the copy
fully independent. Choose based on whether nested objects are meant to be shared.

### Does `with` on a record create a deep copy? {mid}

No. `with` calls the record's copy constructor, which copies each field shallowly and then applies the changes you listed. Reference-type properties such as `List<string>`
are shared between the original and the copy, so mutating the list through one is visible in the other. For full independence, use immutable collections in records or copy
the nested objects explicitly in the `with` expression.

### Why is `ICloneable` discouraged? {senior}

Its contract doesn't specify whether `Clone()` performs a shallow or a deep copy, so callers can't rely on either behavior, and it returns `object`, requiring a cast. Framework
design guidelines recommend not implementing it in public APIs; instead, provide explicitly named methods (`ShallowCopy`, `DeepCopy`), copy constructors, or use immutable types
and records.

### How can you implement a deep copy in C#? {mid}

Options: explicit copy methods or copy constructors that copy nested objects (fast, type-safe, but must be maintained when fields change); a serialization round trip (e.g.
serialize to JSON and back, which is simple but slower and works only for serializable data and loses non-serialized state); or source-generated/mapping-library cloning.
Often the better answer is to make nested data immutable so that sharing it is safe and deep copying isn't needed.

### How does the builder differ from the abstract factory? {senior}

The abstract factory creates families of related objects, usually each in one call, and hides which concrete classes are used. The builder focuses on constructing one complex
object step by step, letting the client control the construction process and producing the result at the end. A builder may use factories internally, and one builder API can
build different representations (the original GoF builder had a director and interchangeable concrete builders).
