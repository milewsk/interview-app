# Generics in C# {mid}

Generics let you write types and methods parameterized by a type: `List<T>`, `Dictionary<TKey, TValue>`, `Task<T>`. The benefits are **type safety**
checked by the compiler, **no boxing** for value types and a single implementation for many types.

```csharp
public class Repository<T> where T : class, IEntity
{
    private readonly List<T> _items = [];
    public void Add(T entity) => _items.Add(entity);
    public T? Find(int id) => _items.FirstOrDefault(x => x.Id == id);
}

static T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;
Max(3, 7);        // the type argument is inferred: Max<int>
```

Before generics there was `ArrayList`, which stored `object`: every `int` was boxed, and reading required a cast that could fail only at runtime.

## Constraints

| Constraint | Meaning |
|---|---|
| `where T : class` | a reference type (`class?` allows nullable) |
| `where T : struct` | a non-nullable value type |
| `where T : notnull` | any non-nullable type |
| `where T : unmanaged` | a value type without references (e.g. for `stackalloc`, pointers) |
| `where T : new()` | has a public parameterless constructor |
| `where T : BaseClass` / `IInterface` | inherits from the class / implements the interface |
| `where T : U` | `T` is or derives from another type parameter |
| `where T : allows ref struct` | (C# 13) `T` may be a `ref struct`, e.g. `Span<T>` |

Constraints give access to members (`T : IComparable<T>` allows calling `CompareTo`), and the compiler checks the type arguments: `F<string>` with
`where T : struct` is a compile error (CS0453).

## Reification and performance

Unlike Java (type erasure), .NET generics exist at runtime: `typeof(List<int>)` is a separate type from `List<string>`, and you can check the type
argument with reflection. The JIT generates **specialized code for each value type** (`List<int>` stores real `int`s without boxing), and **shares
one implementation** for all reference types.

Each closed type has **its own static fields**: `Counter<int>.Count` and `Counter<string>.Count` are different variables. This is used e.g. for
per-type caches (`EqualityComparer<T>.Default`).

## `default(T)`

`default` gives `0` for numbers, `null` for reference types and a zeroed struct for value types. In an unconstrained generic method, `T?` doesn't mean
`Nullable<T>`: for value types it's just `T`, so `default` returns `0`, not `null`.

## Variance: `out` and `in`

```csharp
IEnumerable<object> objects = new List<string>();      // ✅ covariance: IEnumerable<out T>
Action<string> printString = (object o) => Console.WriteLine(o);   // ✅ contravariance: Action<in T>
List<object> list = new List<string>();                // 🔴 CS0029: List<T> is invariant
```

- **Covariance (`out T`)**: `T` only appears in output positions (return values). You can use a more derived type where a more general one is expected:
  `IEnumerable<T>`, `IReadOnlyList<T>`, `Func<out TResult>`. `Task<T>` isn't covariant, because it's a class.
- **Contravariance (`in T`)**: `T` only appears in input positions (parameters). `Action<in T>`, `IComparer<in T>`, `IEqualityComparer<in T>`.
- **Invariance**: `List<T>` has both `Add(T)` and a `T` indexer, so it can't be either.
- Variance works only for **interfaces and delegates** and only for **reference types**: `IEnumerable<int>` isn't an `IEnumerable<object>`.
- **Arrays are covariant** for historical reasons, and that's unsafe: `object[] arr = new string[1]; arr[0] = 42;` compiles but throws
  `ArrayTypeMismatchException`.

## Generic math

Since .NET 7 (C# 11) interfaces with static abstract members let you write mathematical algorithms once for all number types:

```csharp
static T Sum<T>(IEnumerable<T> items) where T : IAdditionOperators<T, T, T>, IAdditiveIdentity<T, T>
{
    var total = T.AdditiveIdentity;
    foreach (var item in items) total += item;
    return total;
}

Sum([1, 2, 3]);         // 6
Sum([0.1m, 0.2m]);      // 0.3
```

`INumber<T>` combines most of these interfaces.

## Sources

- [Generic type parameters (C# guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/generic-type-parameters)
- [Constraints on type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/constraints-on-type-parameters)
- [Covariance and contravariance in generics](https://learn.microsoft.com/en-us/dotnet/standard/generics/covariance-and-contravariance)
- [Generic math](https://learn.microsoft.com/en-us/dotnet/standard/generics/math)

## Questions

### What are generics for, and what do they give over `object`? {junior}

They let you write one type or method for many types while keeping type safety. Compared to storing `object` (e.g. `ArrayList`), they give checks at
compile time instead of runtime `InvalidCastException`s, no casts in code and no boxing of value types, because `List<int>` stores `int`s directly.

### What generic constraints are there, and what are they for? {mid}

`class`, `struct`, `notnull`, `unmanaged`, `new()`, a base class, an interface, another type parameter and (C# 13) `allows ref struct`. They limit
which types can be passed as arguments, and in return let you use their members in generic code, e.g. `where T : IComparable<T>` allows calling
`CompareTo`, and `new()` allows `new T()`. The compiler reports an error when the argument doesn't meet the constraint.

### How do .NET generics differ from Java generics? {mid}

.NET generics are reified: type information exists at runtime, `List<int>` and `List<string>` are separate types, and you can check `typeof(T)`. For
value types the JIT generates specialized code without boxing. Java uses type erasure: after compilation there's only `List<Object>`, primitive types
must be boxed (`Integer`), and the type argument can't be checked at runtime.

### What is covariance and contravariance? {mid}

Covariance (`out T`) lets you use a more derived type in place of a more general one where `T` is only returned: `IEnumerable<string>` can be assigned to
`IEnumerable<object>`. Contravariance (`in T`) works the other way where `T` is only consumed: an `Action<object>` can be used as `Action<string>`. It
applies only to generic interfaces and delegates, and only to reference types.

### Why can't you assign `List<string>` to `List<object>`? {mid}

`List<T>` is invariant, because `T` appears both in input and output positions. If the assignment were allowed, you could call `list.Add(42)` through
`List<object>` and put an `int` into a list of strings. When you only need to read, use a covariant interface: `IEnumerable<object>` or
`IReadOnlyList<object>`.

### Why is array covariance considered a design mistake? {senior}

`object[] arr = new string[1]` compiles, so the compiler can't guarantee type safety of writes: `arr[0] = 42` throws `ArrayTypeMismatchException` only at
runtime. To enforce this, the runtime must check the type on every write to a reference-type array element, which costs performance. It was carried over
for Java compatibility, and generic interfaces have safe, declared variance instead.

### Is a static field in a generic class shared between `Foo<int>` and `Foo<string>`? {mid}

No. Each closed generic type is a separate type with its own static fields, so `Foo<int>.Count` and `Foo<string>.Count` are independent. This is used for
per-type caches, e.g. `EqualityComparer<T>.Default` or a cached per-type delegate, and it's a pitfall when someone expects one shared counter.

### What does `default(T)` return, and what does `T?` mean for an unconstrained `T`? {senior}

`default(T)` returns `null` for reference types, `0` for numbers and a zeroed struct for other value types. In an unconstrained generic method, `T?` means
"`T`, possibly null for reference types": for value types it's plain `T`, not `Nullable<T>`, so `default` returns `0`, not `null`. To get `Nullable<T>`
you need a `where T : struct` constraint.

### What is generic math in .NET? {senior}

Since .NET 7, numeric types implement interfaces with static abstract members, such as `INumber<T>`, `IAdditionOperators<T, T, T>` and
`IAdditiveIdentity<T, T>`. A generic method with such constraints can use operators and constants (`T.Zero`, `+`) on `T`, so one `Sum<T>` or `Average<T>`
works for `int`, `double`, `decimal` and custom number types, without duplicating code or boxing.

### Does the JIT generate separate code for every type argument? {senior}

For each value type, yes: `List<int>` and `List<double>` get specialized machine code, which allows full optimization without boxing. For all reference
types the JIT shares one implementation (references have the same size), and type information is passed through a hidden parameter. That's why generics
over value types are fast, and the cost of many instantiations is larger code size.
