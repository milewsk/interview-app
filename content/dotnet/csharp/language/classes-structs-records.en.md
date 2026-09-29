# Classes, structs and records {mid}

C# has four "shapes" of user-defined types: `class`, `struct`, `record` (a record class) and `record struct`. The choice decides the **copy
semantics** (reference or value) and the **equality semantics** (identity or data).

| | `class` | `struct` | `record` / `record class` | `record struct` |
|---|---|---|---|---|
| Kind | reference | value | reference | value |
| `==` by default | identity (the same object) | not defined (you must overload it) | compares data | compares data |
| `Equals` | identity | field by field (reflection, slow) | generated, by data | generated, by data |
| Inheritance | yes | no | only from records | no |
| `with` | no | yes (C# 10+) | yes | yes |
| Generated `ToString` | no | no | `Type { A = 1, B = 2 }` | `Type { A = 1, B = 2 }` |

## Records

```csharp
public record Person(string Name, int Age);          // positional record: init-only properties

var a = new Person("Ada", 36);
var b = new Person("Ada", 36);
Console.WriteLine(a == b);                    // True: equality by data
Console.WriteLine(ReferenceEquals(a, b));     // False: two objects
Console.WriteLine(a);                         // Person { Name = Ada, Age = 36 }

var older = a with { Age = 37 };              // non-destructive mutation: a copy with a change
var (name, age) = a;                          // generated Deconstruct
```

- A positional record generates a constructor, **init-only** properties, `Deconstruct`, `Equals`/`GetHashCode`, `==`/`!=`, `ToString` and a copy
  constructor used by `with`.
- Equality compares **the values of the fields**, but for reference-type fields it uses their own `Equals`. A `List<string>` inside a record is compared
  **by reference**, so two records with identical lists aren't equal.
- `with` makes a **shallow copy**: a list inside is shared between the original and the copy.
- Equality also takes the **runtime type** into account (`EqualityContract`): an `Employee : Person` record is never equal to a `Person` with the same
  `Name` and `Age`.
- Records are ideal for DTOs, messages, value objects in DDD and query results. For EF Core entities, which have identity and change state, a regular
  class is better.

## Structs

```csharp
public readonly struct Money(decimal amount, string currency)
{
    public decimal Amount { get; } = amount;
    public string Currency { get; } = currency;
}
```

- The value is **copied** on assignment, when passed to a method and when returned. Copying a large struct costs more than copying a reference.
- A struct has no object header and doesn't need a separate heap allocation (if it isn't boxed), which reduces pressure on the GC.
- `default(T)` is always available and sets all fields to zero, so a struct must make sense in its "zero" state.
- Guidelines: small (Microsoft recommends under 16 bytes), **immutable** (`readonly struct`), representing a single value (a point, money, a range).
- A mutable struct is a trap: `list[0].X = 3` doesn't compile (CS1612), because the indexer returns a **copy**, while `array[0].X = 3` works, because an
  array element is a variable.
- The default `Equals` of a struct compares fields through reflection, so it's slow. Implement `IEquatable<T>` or use `record struct`.

`record struct` generates equality, `ToString` and `with` like a record. Its positional properties are **mutable**, unless it's declared as
`readonly record struct`.

## `init`, `required` and primary constructors

```csharp
public class Order
{
    public required int Id { get; init; }   // must be set in the initializer (CS9035 otherwise)
    public string? Note { get; init; }      // may only be set during initialization (CS8852 afterwards)
}

var order = new Order { Id = 1 };

public class Service(string connectionString)      // primary constructor (C# 12)
{
    public string Describe() => $"uses {connectionString}";
}
```

- `init` allows assignment only in an object initializer, a constructor or `with`. That gives immutability without huge constructors.
- `required` forces the caller to set the member in the initializer. It's checked by the compiler.
- Primary constructor parameters in a **class or struct** are **not** properties: they're parameters visible in the whole body (captured as hidden
  fields when used by members), and they're mutable. Only in a **record** do they become public properties.

## How to choose

- **`class`**: the default choice. An object with identity and behavior, changing state (entities, services).
- **`record`**: immutable data where equality by value matters (DTOs, events, messages, value objects).
- **`struct` / `readonly record struct`**: small, frequently created values where avoiding allocations counts (coordinates, identifiers, money).

## Sources

- [Records (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)
- [Structure types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/struct)
- [Choosing between class and struct](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/choosing-between-class-and-struct)
- [The init keyword](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/init)
- [The required modifier](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/required)
- [Primary constructors](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/tutorials/primary-constructors)

## Questions

### How does a `record` differ from a `class`? {junior}

Both are reference types, but a record generates equality by data (`Equals`, `GetHashCode`, `==`), a readable `ToString`, `Deconstruct` and support for
`with`. Positional properties are init-only, so records encourage immutability. Two records with the same data are equal, while two class objects with the
same data are equal only if they're the same object.

### How does a `struct` differ from a `class`? {junior}

A struct is a value type: assignment and passing copy the whole value, and it has no object header or separate heap allocation (unless it's boxed). It
can't inherit from other types (it can implement interfaces) and always has a `default` value with zeroed fields. A class is a reference type: assignment
copies the reference to the same object, and objects are collected by the GC.

### What does `with` do, and is the copy deep? {mid}

It creates a new record instance with the same values, changing the listed properties (non-destructive mutation). The copy is shallow: reference-type
fields (e.g. `List<T>`) point at the same object in the original and the copy, so changing the list through one of them is visible in the other. For full
immutability, use immutable collections.

### Are two records with identical `List<string>` properties equal? {mid}

No, unless it's the same list instance. The generated `Equals` compares each field using `EqualityComparer<T>.Default`, and for `List<T>` that means
comparing references. If you need equality by collection contents, override `Equals` in the record or use a type with structural equality.

### What does `init` mean, and how does it differ from `required`? {mid}

`init` is a setter that works only during initialization: in an object initializer, a constructor or `with`. Afterwards assignment is a compile error
(CS8852). `required` means the caller must set the member in the initializer (CS9035 otherwise). They're often combined: `required ... { get; init; }` is
a mandatory, immutable property without a big constructor.

### When is it worth choosing a `struct`? {mid}

When a type represents a small, single value (e.g. a point, money, an identifier), is immutable and is created often, so avoiding heap allocations brings
a real gain. Microsoft's guideline is an instance under 16 bytes that won't be boxed often. Large or mutable structs cause costly copying and subtle bugs,
so a class is the default.

### Why doesn't `list[0].X = 5` compile when the list stores a struct? {mid}

The `List<T>` indexer returns a **copy** of the element, and modifying a field of a temporary copy would be lost, so the compiler reports CS1612. For an
array, `array[0].X = 5` works, because an array element is a variable. The solution is an immutable struct and replacing the whole element:
`list[0] = list[0] with { X = 5 }`. The problem is one more argument for immutable structs.

### How do primary constructors in classes differ from those in records? {mid}

In a record, positional parameters become public properties (init-only in `record class`) and take part in equality and deconstruction. In a class or
struct (C# 12+), parameters are only visible in the whole body: the compiler captures them in hidden fields when members use them, and they're mutable and
not public. If you want a property, you define it explicitly: `public string Name { get; } = name;`.

### Is a derived record equal to a base record with the same values? {senior}

No. Record equality checks the runtime type through the generated `EqualityContract` property, so an `Employee : Person` with the same `Name` and `Age` as
a `Person` isn't equal to it. This guarantees symmetry: `a.Equals(b) == b.Equals(a)`. The derived record also compares its extra fields.

### Why implement `IEquatable<T>` in a struct? {senior}

The default `ValueType.Equals` accepts `object`, so the argument is boxed, and when a struct contains reference fields it compares them through reflection,
which is slow. `IEquatable<T>` provides a strongly typed `Equals(T)` without boxing, used e.g. by `Dictionary`, `HashSet` and `List.Contains`. Together
with `GetHashCode` and the `==`/`!=` operators it gives full, fast value equality. `record struct` generates all of this automatically.
