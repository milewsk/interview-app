# Strings, StringBuilder and Span<T> {mid}

`string` is the most frequently used type, and many interview questions concern its immutability, comparison and performance. `Span<T>` and
`Memory<T>` are the modern way to work on fragments of data without copying.

## `string` is immutable

A `string` is a reference type, but **immutable**: every "modifying" method (`ToUpper`, `Replace`, `Substring`, `+`) returns a **new** string. Thanks
to this, strings are safe to share between threads and to use as dictionary keys. `==` on `string` compares **contents** (the operator is overloaded).

```csharp
string a = "hello";
string b = "hello";
Console.WriteLine(ReferenceEquals(a, b));   // True: literals are interned (one instance)

object x = a, y = new StringBuilder("hel").Append("lo").ToString();
Console.WriteLine(x == y);                  // False: == on object compares references!
Console.WriteLine(x.Equals(y));             // True
```

**Interning**: the compiler puts all literals into a pool, so identical literals are the same object. Strings built at runtime aren't interned
(`string.Intern` does it explicitly, but it's rarely needed).

## Concatenation and `StringBuilder`

`acc += "x"` in a loop creates a new string every time and copies the whole contents: O(n²) in total. In a simple test, 20,000 concatenations took around
18 ms and `StringBuilder` under 1 ms, and the difference grows quadratically.

- **`StringBuilder`**: a mutable buffer for building text in loops.
- **Interpolation** `$"..."` and `string.Concat`/`string.Join`: for a fixed number of fragments. Since .NET 6 interpolation uses an efficient handler
  (`DefaultInterpolatedStringHandler`) without intermediate strings.
- **Raw string literals** (C# 11): `"""..."""` without escaping quotes and backslashes, handy for JSON, SQL and regular expressions.

## Comparison and culture

```csharp
"title".ToUpper(new CultureInfo("tr-TR"));    // "TİTLE": the Turkish dotted İ
string.Equals("File", "FILE", StringComparison.OrdinalIgnoreCase);   // True
```

- **Ordinal** (`StringComparison.Ordinal`, `OrdinalIgnoreCase`): compares code units. It's fast and predictable, so it's used for identifiers, keys,
  paths, protocols and anything that isn't text shown to a human.
- **Culture-sensitive** (`CurrentCulture`, `InvariantCulture`): follows the rules of a language, e.g. for sorting names displayed to the user.
- Methods without a `StringComparison` parameter (`ToUpper()`, `StartsWith(string)`, `string.Compare`) often use the **current culture**, which gives
  different results on servers with different settings. Analyzers (CA1307, CA1309, CA1310) point this out.
- Formatting numbers and dates also depends on culture: `$"{1234.5:N2}"` gives `1,234.50` in `en-US` and `1 234,50` in `pl-PL`. For data (logs, files,
  APIs) use `CultureInfo.InvariantCulture`.

## `Span<T>` and `ReadOnlySpan<T>`

A `Span<T>` is a **view** of a contiguous fragment of memory: part of an array, a string, a `stackalloc` buffer or native memory. Slicing a span
**doesn't allocate** or copy anything.

```csharp
ReadOnlySpan<char> line = "2026-09-26;42;Ada";
int sep = line.IndexOf(';');
ReadOnlySpan<char> date = line[..sep];                 // a view, no new string
ReadOnlySpan<char> rest = line[(sep + 1)..];
int number = int.Parse(rest[..rest.IndexOf(';')]);     // parsing directly from a span: 42

Span<int> buffer = stackalloc int[16];                 // a buffer on the stack, no GC
```

In a test, parsing a line with spans allocated **0 bytes**, while `Split(';')` allocated an array and three strings.

Spans are `ref struct` types, so they live only on the stack. They **can't**:

- be a field of a class (CS8345) or be boxed to `object`,
- survive an `await` or `yield` (CS4007); since C# 13 they may be used in `async` methods and iterators, but only between suspension points,
- be captured in a lambda.

For asynchronous code and storage in fields there's **`Memory<T>` / `ReadOnlyMemory<T>`**: a similar view that can live on the heap, from which you get
a span (`memory.Span`) for synchronous processing.

## Other tools

- `ArrayPool<T>.Shared.Rent/Return`: reusing buffers instead of allocating new arrays.
- `string.Create`: building a string directly in its target memory.
- `SearchValues<T>` (.NET 8): fast searching for any of many characters or strings.
- Many BCL APIs accept `ReadOnlySpan<char>` (`int.Parse`, `Path`, `Utf8JsonReader`), and C# 14 adds implicit conversions between arrays and spans.

## Sources

- [Strings (C# guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/strings/)
- [Best practices for comparing strings](https://learn.microsoft.com/en-us/dotnet/standard/base-types/best-practices-strings)
- [StringBuilder](https://learn.microsoft.com/en-us/dotnet/standard/base-types/stringbuilder)
- [Memory- and span-related types](https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/)
- [ref struct types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/ref-struct)
- [Raw string literals](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/tokens/raw-string)

## Questions

### Why is `string` immutable, and what are the consequences? {junior}

Immutability makes strings safe to share between threads, to use as dictionary keys (the hash doesn't change) and allows interning literals. The
consequence is that every "modification" (`Replace`, `ToUpper`, `+`) creates a new object, so building text in a loop by concatenation generates a lot of
garbage and copying. For that you use `StringBuilder`.

### When should you use `StringBuilder`? {junior}

When text is built in many steps, especially in a loop with an unknown number of iterations: `+=` in a loop copies the whole string every time, which
gives O(n²). `StringBuilder` keeps a mutable buffer and creates a string once at the end (`ToString()`). For a few fragments, interpolation or
`string.Join` is enough and more readable.

### Does `==` compare the contents of strings? {mid}

For variables of type `string`, yes: the `==` operator is overloaded and compares contents. But if both sides are typed as `object`, `==` compares
references and may return `false` for identical text. `Equals` always compares contents. Identical literals are also the same object thanks to interning,
which can hide the problem in tests.

### What is string interning? {mid}

The runtime keeps a pool of unique strings. All literals in the code are placed there, so identical literals refer to the same object. Strings built at
runtime (concatenation, `StringBuilder`, reading from a file) aren't interned unless you call `string.Intern`. Interned strings live until the end of
the process, so interning dynamic data can waste memory.

### Why should strings be compared with `StringComparison.Ordinal`? {mid}

Methods without a `StringComparison` parameter often use the current culture, so results depend on the machine's settings: in Turkish culture `"title".ToUpper()`
gives `"TİTLE"`, which breaks comparisons of keys or commands. Ordinal comparison compares code units, which is fast and deterministic, so it's used for
identifiers, paths, keys and protocols. Culture-sensitive comparison is only for text shown to people, e.g. sorting names.

### What is `Span<T>`, and what is it for? {mid}

A `Span<T>` is a type-safe view of a contiguous fragment of memory (an array, a string, a stack buffer). Slicing it doesn't allocate or copy, so you can
parse or process data without creating substrings and intermediate arrays. Many BCL APIs accept spans, e.g. `int.Parse(ReadOnlySpan<char>)`. It's the
basis of high-performance parsers and serializers.

### What are the limitations of `Span<T>`, and why? {senior}

`Span<T>` is a `ref struct`, so it may live only on the stack: it can't be a class field, be boxed, be captured in a lambda or survive an `await` or
`yield` (since C# 13 it can be used in `async` methods between suspension points). These rules guarantee that a span never outlives the memory it points
to, e.g. a `stackalloc` buffer. For asynchronous code or storage, use `Memory<T>`.

### How does `Span<T>` differ from `Memory<T>`? {senior}

`Span<T>` is a `ref struct`, so it's fast but restricted to the stack. `Memory<T>` is a regular struct, so it can be a class field, be passed through
`async` methods and be stored in collections. It doesn't give direct element access: you get a span from it with `.Span` in the synchronous part of the
code. APIs that are asynchronous (`Stream.ReadAsync(Memory<byte>)`) use `Memory<T>`, and synchronous ones use `Span<T>`.

### Why can formatting numbers give different results on different servers? {mid}

`ToString()`, interpolation and `Parse` use the current culture by default: `1234.5` is formatted as `1,234.50` in `en-US` and `1 234,50` in `pl-PL`, and
parsing `"1.5"` in Polish culture fails or gives a different value. For data that machines read (files, logs, APIs, the database) use
`CultureInfo.InvariantCulture`, and set culture explicitly only for display to the user.

### What are raw string literals? {junior}

A C# 11 literal delimited by at least three quotes (`"""..."""`), in which quotes and backslashes don't need escaping. A multi-line raw literal removes the
indentation common to all lines (based on the closing quotes), so JSON, SQL or regular expressions can be pasted into code in readable form. With `$$"""`
the interpolation braces are doubled, so single braces stay as text.
