# What's new in C# 12–14 {mid}

Interviewers like to ask "what do you know about the latest C# version?". Each C# version ships with a .NET version: **C# 12 with .NET 8** (LTS),
**C# 13 with .NET 9**, **C# 14 with .NET 10** (LTS). By default a project uses the C# version matching its target framework (`net10.0` → C# 14), and
changing `<LangVersion>` beyond that isn't supported.

## C# 12 (.NET 8)

```csharp
public class OrderService(IOrderRepository repository, ILogger<OrderService> logger)   // primary constructor
{
    public Task<Order?> Get(int id) => repository.Find(id);
}

int[] numbers = [1, 2, 3];                       // collection expressions
List<int> more = [.. numbers, 4];                // spread

var increment = (int x, int step = 1) => x + step;   // default parameters in lambdas

using Point = (int X, int Y);                    // alias any type (here a tuple)
```

- **Primary constructors** in classes and structs: parameters are visible in the whole body (in records they also become properties).
- **Collection expressions** `[...]` with spread `..`: one syntax for arrays, lists, spans and immutable collections.
- **Default lambda parameters**, **alias any type**, `ref readonly` parameters, inline arrays (mainly for library authors),
  `[Experimental]`, and interceptors (preview, for source generators).

## C# 13 (.NET 9)

```csharp
static int Sum(params ReadOnlySpan<int> values) { ... }     // params collections: no array allocation
Sum(1, 2, 3);

private readonly Lock _gate = new();                         // System.Threading.Lock
lock (_gate) { ... }                                         // the compiler uses Lock.EnterScope() instead of Monitor

var countdown = new Timer { Buffer = { [^1] = 0, [^2] = 1 } };   // ^ in object initializers
```

- **`params` collections**: `params` works with `Span<T>`, `ReadOnlySpan<T>`, `List<T>` and collection interfaces, not only arrays.
- **The new `Lock` type**: a dedicated synchronization object that's more efficient than locking on an `object` with `Monitor`.
- **`\e`** escape sequence (the ESC character, `U+001B`).
- `ref` locals and `ref struct` types (e.g. `Span<T>`) are allowed in `async` methods and iterators, as long as they don't cross `await`/`yield`.
- `ref struct` types can implement interfaces, and the `allows ref struct` anti-constraint lets them be generic arguments.
- **Partial properties and indexers** (important for source generators), `[OverloadResolutionPriority]` for library authors.

## C# 14 (.NET 10)

```csharp
public static class EnumerableExtensions
{
    extension<T>(IEnumerable<T> source)               // extension block
    {
        public bool IsEmpty => !source.Any();         // extension property
    }

    extension<T>(IEnumerable<T>)                      // static extension members
    {
        public static IEnumerable<T> Pair(T item) => [item, item];
    }
}

items.IsEmpty;                          // used like an instance property
IEnumerable<int>.Pair(7);               // used like a static member of the type

public string Name
{
    get;
    set => field = value.Trim();        // field: the compiler-generated backing field
}

customer?.Order = GetCurrentOrder();    // null-conditional assignment
nameof(List<>);                         // "List": unbound generic types in nameof

TryParse<int> parse = (text, out result) => int.TryParse(text, out result);   // modifiers without types
```

- **Extension members**: `extension` blocks allow extension **properties**, static extension members and operators, not only methods.
- **The `field` keyword**: an accessor with logic (validation, trimming, notifications) without declaring a backing field by hand.
- **Null-conditional assignment** `a?.B = x`: assigns only when `a` isn't `null` (the right side isn't evaluated otherwise), also works with `+=`, but not
  with `++`/`--`.
- **Implicit span conversions**: arrays convert implicitly to `Span<T>`/`ReadOnlySpan<T>`, which improves overload resolution and generic inference.
- **`nameof` with unbound generic types**, lambda parameter **modifiers** (`out`, `ref`, `in`, `scoped`) without types, **partial constructors and
  events**, **user-defined compound assignment operators** (`+=` without creating a new object).

## .NET 10 around the language

.NET 10 also introduced **file-based apps**: `dotnet run app.cs` runs a single `.cs` file without a project, and directives like
`#:package Microsoft.EntityFrameworkCore.Sqlite@10.*` and `#:property ...` replace the `.csproj`. It's handy for scripts, prototypes and learning.

## Sources

- [What's new in C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14)
- [What's new in C# 13](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-13)
- [What's new in C# 12](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-12)
- [C# language versioning](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/configure-language-version)
- [Extension members](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/extension-methods)

## Questions

### Which C# version ships with which .NET version? {junior}

C# 12 ships with .NET 8, C# 13 with .NET 9 and C# 14 with .NET 10. By default the compiler picks the version matching the project's target framework, so
a `net10.0` project uses C# 14. You can set `<LangVersion>` explicitly, but using a newer language version than the framework supports isn't
supported, because some features need runtime or library support.

### What are primary constructors, and how do they differ between classes and records? {mid}

Since C# 12, a class or struct can declare constructor parameters right after its name (`class Service(IRepo repo)`), and the parameters are visible in the
whole body, which reduces boilerplate, e.g. in dependency injection. In a record, the parameters also become public properties that take part in equality.
In a class they're just captured parameters: not public, mutable, and without a generated property.

### What are collection expressions? {junior}

A C# 12 syntax `[1, 2, 3]` for creating collections, which works for arrays, `List<T>`, `Span<T>`, immutable collections and collection interfaces. The
spread element `..other` inserts the contents of another collection: `[.. first, .. second, 42]`. The compiler chooses an efficient way to build the target
type, e.g. without an intermediate array for spans.

### What changed in `params` in C# 13? {mid}

`params` no longer has to be an array: it can be `Span<T>`, `ReadOnlySpan<T>`, `List<T>`, `IEnumerable<T>` and other collection types. With
`params ReadOnlySpan<T>`, the compiler can pass arguments without allocating an array on the heap, which speeds up frequently called methods like
`string.Concat` or logging methods. Existing calls work without changes.

### What is the new `Lock` type in .NET 9? {mid}

`System.Threading.Lock` is a dedicated synchronization type. When the `lock` statement is used on a `Lock` object, the compiler generates code using
`Lock.EnterScope()` instead of `Monitor.Enter/Exit`, which is more efficient and expresses intent better than locking on an arbitrary `object`. You just
change the field type to `Lock`, and the rest of the code stays the same.

### What are extension members in C# 14? {mid}

A new `extension` block syntax in a static class that allows declaring not only extension methods, but also extension properties, static extension members
(called on the type, e.g. `IEnumerable<int>.Identity`) and operators. Previously only instance methods with `this` on the first parameter were possible.
Existing extension methods keep working, and the new syntax groups members for one receiver type.

### What does the `field` keyword do? {mid}

In a property accessor, `field` refers to the backing field generated by the compiler. You can add logic to one accessor, e.g.
`set => field = value.Trim()` or `get => field ??= Create()`, while leaving the other automatic, without declaring a private field by hand. If a type
already has a member named `field`, you use `@field` or `this.field` to refer to it.

### What is null-conditional assignment? {junior}

C# 14 allows `?.` and `?[]` on the left side of an assignment: `customer?.Order = order` assigns only when `customer` isn't `null`. If it is `null`,
nothing happens and the right side isn't evaluated. It also works with compound assignments (`+=`), but not with increment and decrement (`++`, `--`).

### What are implicit span conversions in C# 14? {senior}

The language recognizes `Span<T>` and `ReadOnlySpan<T>` as first-class types: arrays convert implicitly to spans, spans convert to read-only spans, and these
conversions work with extension method receivers and generic type inference. As a result, span-based overloads (usually faster) are chosen more often
without explicit `.AsSpan()` calls, and extension methods defined for `ReadOnlySpan<T>` work directly on arrays.

### What are file-based apps in .NET 10? {junior}

The ability to run a single `.cs` file without a project: `dotnet run app.cs`. Directives at the top of the file replace the project file, e.g.
`#:package Name@version` adds a NuGet package, and `#:property` sets an MSBuild property. It's useful for scripts, prototypes and learning, and the file can
later be converted into a regular project with `dotnet project convert app.cs`.
