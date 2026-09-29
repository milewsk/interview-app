# Nullable reference types and null handling {mid}

`NullReferenceException` is one of the most common errors in .NET. Since C# 8, **nullable reference types (NRT)** let the compiler track which
references may be `null` and warn about potential dereferences. New projects have them enabled by default (`<Nullable>enable</Nullable>`).

```csharp
string name = "Ada";        // non-nullable: shouldn't be null
string? nickname = null;    // nullable: may be null

Console.WriteLine(nickname.Length);    // ⚠️ CS8602: dereference of a possibly null reference
string s = nickname;                   // ⚠️ CS8600: converting a possibly null value to a non-nullable type

if (nickname is not null)
    Console.WriteLine(nickname.Length);   // ✅ flow analysis knows it's not null here
```

## What NRT really is

- It's **only compile-time analysis**: `string` and `string?` are the same runtime type. The compiler adds annotations (attributes) and warnings, and
  nothing is checked at runtime. A method with a `string` parameter can still get `null`, e.g. from code without NRT, reflection or deserialization.
- It's a **warning, not an error**. Teams often enable `<WarningsAsErrors>nullable</WarningsAsErrors>` to make it enforceable.
- The analysis tracks the **null state** of a variable in the flow of code: after `if (x is null) return;` the compiler knows `x` isn't null.
- A non-nullable property not set in the constructor gives CS8618. Solutions: set it in the constructor, `required`, a default value, or `?` if `null`
  is really allowed.

Nullable **value types** are something else: `int?` is `Nullable<int>`, a real runtime struct with `HasValue` and `Value`.

## Operators

| Operator | Meaning |
|---|---|
| `a?.B` | null-conditional: `null` if `a` is `null`, otherwise `a.B` |
| `a?[i]` | the same for indexers |
| `a ?? b` | null-coalescing: `a` if not null, otherwise `b` |
| `a ??= b` | assigns `b` only if `a` is null |
| `a!` | null-forgiving: "trust me, it's not null". It only suppresses the warning and gives an NRE at runtime if you're wrong |
| `a?.B = x` | (C# 14) null-conditional assignment: assigns only if `a` isn't null |

```csharp
var length = customer?.Address?.Street?.Length ?? 0;
cache ??= new Dictionary<string, int>();
```

`is null` / `is not null` are better than `== null`, because they can't be changed by an overloaded `==` operator.

## Guard clauses

For public APIs, still validate arguments at runtime, because NRT doesn't guarantee anything:

```csharp
public void Send(string email)
{
    ArgumentNullException.ThrowIfNull(email);
    ArgumentException.ThrowIfNullOrWhiteSpace(email);
}
```

## Attributes for flow analysis

When a method's contract is more complex than its signature, attributes from `System.Diagnostics.CodeAnalysis` tell the compiler what happens:

```csharp
public static bool TryFind(string key, [NotNullWhen(true)] out string? value) { ... }

if (TryFind("a", out var value))
    Console.WriteLine(value.Length);    // no warning: true means value isn't null
```

Others: `[MaybeNull]`, `[NotNull]` (e.g. on a parameter checked by a guard method), `[MemberNotNull]` (a method initializes the listed fields),
`[DoesNotReturn]`, `[NotNullIfNotNull]`.

## Migrating an existing project

Enable NRT gradually: per file with `#nullable enable`, starting with the lowest layers (models, utilities), fixing warnings, and only then turning it
on for the whole project. Avoid silencing warnings with `!` everywhere, because that just hides the problem.

## Sources

- [Nullable reference types](https://learn.microsoft.com/en-us/dotnet/csharp/nullable-references)
- [Attributes for null-state static analysis](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis)
- [Nullable value types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-value-types)
- [Member access operators (?. and ?[])](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators)
- [?? and ??= operators](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator)

## Questions

### What are nullable reference types? {junior}

A C# 8+ feature in which reference types are non-nullable by default (`string`), and a possibly null reference is marked `string?`. The compiler analyzes
the flow of code and warns about dereferencing a possibly null value or assigning `null` to a non-nullable variable. It's enabled with
`<Nullable>enable</Nullable>`, which new projects have by default.

### Does NRT guarantee that a `string` variable will never be `null`? {mid}

No. It's only compile-time analysis with warnings: `string` and `string?` are the same runtime type, and nothing is checked at runtime. `null` can
still come from code without NRT, reflection, deserialization or the `!` operator. So public APIs still validate arguments, e.g. with
`ArgumentNullException.ThrowIfNull`.

### How does `string?` differ from `int?`? {mid}

`int?` is `Nullable<int>`: a real struct with `HasValue` and `Value` that exists at runtime. `string?` is only a compiler annotation: at runtime it's
the same `string` type, which could always be `null`. So `typeof(int?) != typeof(int)`, but for strings the type is the same.

### What does the `!` (null-forgiving) operator do? {mid}

It tells the compiler to treat an expression as non-null and suppresses the warning. It doesn't change anything at runtime: if the value is `null`, a
dereference throws a `NullReferenceException` anyway. It's used when the programmer knows more than the compiler (e.g. after initialization in a
framework), but overusing it hides real problems.

### What do the `?.`, `??` and `??=` operators do? {junior}

`a?.B` returns `null` instead of throwing when `a` is `null` (the chain stops at the first `null`). `a ?? b` returns `a` if it isn't `null`, otherwise
`b`. `a ??= b` assigns `b` to `a` only when `a` is `null`, e.g. for lazy initialization. Together: `customer?.Address?.City ?? "unknown"`.

### How do you fix the CS8618 warning for a non-nullable property? {mid}

The warning means that a non-nullable property may be `null` after the constructor finishes. Options: set it in the constructor, give it a default
value, mark it `required` so the caller must set it in the initializer, or declare it `string?` if a missing value is correct. `= null!` just silences
the warning and is best avoided.

### Why is `is null` better than `== null`? {mid}

`is null` always checks the reference and can't be changed by an overloaded `==` operator in a type, so its result is predictable. `== null` calls the
overloaded operator if one exists, which may give surprising results. `is not null` reads naturally and works with nullable value types as well.

### What is the `[NotNullWhen(true)]` attribute for? {senior}

It describes a contract that the signature can't express: when the method returns `true`, the `out` parameter isn't `null`. After
`if (dict.TryGetValue(key, out var value))`, the compiler doesn't warn about using `value`. Similar attributes include `[MaybeNull]`, `[NotNull]`,
`[MemberNotNull]` and `[DoesNotReturn]`, and they let helper methods cooperate with flow analysis.

### How do you enable NRT in a large existing project? {mid}

Gradually: enable it per file with `#nullable enable` or per project, starting with the lowest layers (domain models, utilities), and fix the warnings
by correctly marking what may be `null`. When the warnings are gone, enable it for the whole solution and consider `WarningsAsErrors` for nullable. Don't
silence warnings in bulk with `!`, because that removes the benefit.

### What is null-conditional assignment in C# 14? {mid}

It allows `?.` and `?[]` on the left side of an assignment: `customer?.Order = order` assigns only when `customer` isn't `null`, and otherwise does
nothing (the right side isn't evaluated either). Previously it required an `if (customer is not null)` block. It also works with compound assignments
like `+=`, but not with `++` and `--`.
