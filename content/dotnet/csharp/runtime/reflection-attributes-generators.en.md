# Reflection, attributes and source generators {mid}

Frameworks such as ASP.NET Core, EF Core, serializers and DI containers need to learn about your types: their properties, constructors and
attributes. Traditionally they did it at runtime with **reflection**. Modern .NET increasingly moves that work to compile time with **source
generators**.

## Reflection

Reflection lets you inspect and use types at runtime through metadata stored in assemblies.

```csharp
Type type = typeof(Customer);                         // or obj.GetType()
foreach (PropertyInfo p in type.GetProperties())
    Console.WriteLine($"{p.Name}: {p.PropertyType.Name}");

var customer = (Customer)Activator.CreateInstance(type)!;
type.GetProperty("Name")!.SetValue(customer, "Ada");

var secret = type.GetField("_secret", BindingFlags.NonPublic | BindingFlags.Instance)!
    .GetValue(customer);                               // private members are reachable too
```

Uses: serializers, ORMs, DI containers, test frameworks, plugins, model binding and validation.

Drawbacks:

- **Performance**: in a test, 1,000,000 calls through `MethodInfo.Invoke` took ~34 ms, through a delegate created with `CreateDelegate` ~2 ms, and a direct
  call less than 1 ms. That's why libraries cache `PropertyInfo`/`MethodInfo` and turn them into delegates or compiled expressions.
- **No compile-time safety**: member names are strings, so a rename breaks the code only at runtime (`nameof` helps).
- **Breaks encapsulation**: private members are reachable.
- **Incompatible with trimming and Native AOT**: the trimmer doesn't know which members are used through reflection and may remove them.

## Attributes

Attributes attach declarative metadata to types, members and parameters. They do nothing by themselves: something must read them (the compiler, a
framework or your code via reflection).

```csharp
[AttributeUsage(AttributeTargets.Property)]
public sealed class MaxLengthAttribute(int length) : Attribute
{
    public int Length { get; } = length;
}

public class Customer
{
    [MaxLength(10)]
    public string Name { get; set; } = "";
}

var attr = typeof(Customer).GetProperty("Name")!.GetCustomAttribute<MaxLengthAttribute>();   // Length = 10
```

Attributes read by the compiler:

- `[Obsolete("Use New()")]`: a warning (CS0618) or error when used.
- `[CallerMemberName]`, `[CallerFilePath]`, `[CallerLineNumber]`, `[CallerArgumentExpression]`: the compiler fills in the caller's information, e.g. for
  logging and guard clauses (`ArgumentNullException.ThrowIfNull` shows the argument's expression thanks to this).
- Nullable analysis attributes (`[NotNullWhen]`), `[Flags]`, `[Conditional("DEBUG")]`, `[MethodImpl]`.

Framework attributes you know well: `[HttpGet]`, `[Authorize]`, `[Required]`, `[JsonPropertyName]`, `[Key]`, `[Fact]`.

## Source generators

A source generator is a Roslyn compiler plugin that analyzes your code **at compile time** and adds new C# code to the compilation. The generated
code is ordinary C#: visible in the IDE, debuggable, fast and compatible with Native AOT.

```csharp
public static partial class Validators
{
    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[a-z]{2,}$")]
    public static partial Regex Email();              // the regex engine is generated at compile time
}

[JsonSerializable(typeof(Customer))]
public partial class AppJsonContext : JsonSerializerContext { }

var json = JsonSerializer.Serialize(customer, AppJsonContext.Default.Customer);   // no runtime reflection
```

Other examples in .NET: `[LoggerMessage]` (high-performance logging), the configuration binder, ASP.NET Core minimal APIs with Native AOT (the request
delegate generator), and `[LibraryImport]` for P/Invoke. Many libraries (e.g. Mapperly for mapping, Mediator implementations) use generators instead of
reflection.

Generators use **`partial`** declarations: you declare a method or class, and the generator provides the implementation. Since C# 13 partial properties
and since C# 14 partial constructors and events are also possible.

| | Reflection | Source generator |
|---|---|---|
| When | at runtime | at compile time |
| Performance | slower, costly warmup | like hand-written code |
| Errors | at runtime | at compile time |
| Native AOT / trimming | problematic | fully compatible |
| Flexibility | handles types unknown at compile time (plugins) | only code known at compile time |

## Sources

- [Reflection in .NET](https://learn.microsoft.com/en-us/dotnet/fundamentals/reflection/reflection)
- [Attributes (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/reflection-and-attributes/)
- [Caller information attributes](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/caller-information)
- [Source generators](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/source-generators-overview)
- [System.Text.Json source generation](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation)
- [Regular expression source generators](https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-source-generators)

## Questions

### What is reflection, and what is it used for? {junior}

A mechanism for inspecting and using types at runtime based on assembly metadata: reading properties and methods, creating objects, calling members and
reading attributes. It's used by serializers, ORMs, DI containers, test frameworks, model binding and plugin systems, i.e. code that has to work with types
it doesn't know at compile time.

### What are the drawbacks of reflection? {mid}

It's slower than direct calls: `MethodInfo.Invoke` is many times slower than a delegate, and metadata lookups cost time. It has no compile-time safety,
because members are identified by strings, it can break encapsulation by reaching private members, and it doesn't work well with trimming and Native AOT,
because the trimmer can't see which members are used dynamically.

### How do you speed up code that uses reflection? {senior}

Cache `Type`, `PropertyInfo` and `MethodInfo` objects instead of looking them up every time, and turn them into delegates once
(`MethodInfo.CreateDelegate<Func<T, TResult>>()`) or compiled expression trees, which then run almost like direct calls. Even better, eliminate reflection
by generating code at compile time with a source generator, e.g. System.Text.Json's `JsonSerializerContext`.

### What are attributes, and how do they work? {junior}

They're classes derived from `Attribute` that attach metadata to types, methods, properties or parameters: `[Obsolete]`, `[Required]`, `[HttpGet]`.
They don't do anything by themselves: they're stored in the assembly metadata, and something has to read them, either the compiler (`[Obsolete]`, caller info)
or a framework or your own code through reflection (`GetCustomAttribute<T>()`) or a source generator.

### How do you create your own attribute? {mid}

Create a class derived from `Attribute`, with a name ending in `Attribute` (the suffix can be omitted when applying it), and mark it with
`[AttributeUsage]` to specify where it can be used (e.g. `AttributeTargets.Property`) and whether it can be repeated. Constructor parameters and
properties become the attribute's arguments, which must be compile-time constants. It's then read by reflection or a source generator.

### What do the `[CallerMemberName]` and `[CallerArgumentExpression]` attributes do? {mid}

They're placed on optional parameters, and the compiler fills them in at the call site: `[CallerMemberName]` with the name of the calling method or
property, `[CallerFilePath]`/`[CallerLineNumber]` with the location, and `[CallerArgumentExpression]` with the source text of another argument. They're used
in logging, `INotifyPropertyChanged` implementations and guard clauses, so `ThrowIfNull(user.Email)` reports "user.Email" in the message.

### What is a source generator? {mid}

A Roslyn compiler plugin that analyzes the code being compiled (e.g. types marked with an attribute) and adds new C# source files to the compilation. The
result is ordinary code, visible and debuggable in the IDE, with no runtime cost. Examples in .NET: `[GeneratedRegex]`, System.Text.Json source generation,
`[LoggerMessage]`, the configuration binder and `[LibraryImport]`.

### How do source generators differ from reflection? {mid}

Reflection examines types at runtime, which costs time at startup and during calls, reports errors only at runtime and doesn't work well with trimming
and Native AOT. Source generators do the analysis at compile time and generate ordinary code: it's fast, errors appear during compilation, and it's AOT
compatible. The limitation is that a generator only sees code known at compile time, so it doesn't replace reflection for plugins loaded dynamically.

### Why do Native AOT and trimming have problems with reflection? {senior}

Trimming removes code that static analysis doesn't see as used, and reflection accesses members by name at runtime, so the trimmer may remove a property
that a serializer later tries to read. Native AOT also has no JIT, so runtime code generation (`Reflection.Emit`) doesn't work, and expression trees are only interpreted, which is slower. That's
why libraries annotate their code (`[DynamicallyAccessedMembers]`), and AOT-ready frameworks use source generators instead of reflection.

### What is `[GeneratedRegex]` for? {mid}

It marks a `partial` method returning `Regex`, and the source generator creates code implementing that regular expression at compile time. You avoid the
cost of parsing and compiling the regex at runtime (faster startup), errors in the pattern are reported during compilation, the generated code is readable,
and it works with Native AOT. It's the recommended replacement for `new Regex(..., RegexOptions.Compiled)`.
