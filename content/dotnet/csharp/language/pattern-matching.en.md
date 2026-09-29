# Pattern matching in C# {mid}

Pattern matching lets you test a value's **shape** (type, properties, ranges, list contents) and extract data from it in one expression. It's
available in `is` expressions, `switch` statements and **`switch` expressions**, and since C# 7 has grown into one of the language's most frequently
used features.

## `switch` expression

```csharp
string Classify(int n) => n switch
{
    < 0 => "negative",
    0 => "zero",
    > 0 and <= 100 => "small",
    _ => "large",               // discard: everything else
};
```

- Arms are checked **from top to bottom**, and the first match wins.
- An arm that can never match (because an earlier one covers it) is a **compile error** (CS8510).
- A non-exhaustive switch gives a **warning** (CS8509) with an example of an unhandled value, and at runtime a missing match throws
  `SwitchExpressionException`.

## Kinds of patterns

| Pattern | Example | Meaning |
|---|---|---|
| Constant | `0`, `"PL"`, `null` | equality with a constant |
| Type / declaration | `Circle c` | the type matches, and the value is assigned to `c` |
| Relational | `> 0`, `<= 100` | comparison with a constant |
| Logical | `and`, `or`, `not` | combining patterns (`not null`, `>= 1 and <= 9`) |
| Property | `{ Length: > 0 }` | checks properties recursively |
| Extended property | `{ Customer.Country: "PL" }` | a nested property without extra braces (C# 10) |
| Positional | `(> 0, > 0)` | uses `Deconstruct` (records, tuples) |
| `var` | `var x` | always matches and assigns the value |
| Discard | `_` | always matches |
| List | `[1, .., var last]` | array/list contents (C# 11) |

```csharp
static double Area(Shape shape) => shape switch
{
    Circle c => Math.PI * c.Radius * c.Radius,
    Rectangle { Width: var w, Height: var h } => w * h,
    null => throw new ArgumentNullException(nameof(shape)),
    _ => throw new ArgumentOutOfRangeException(nameof(shape)),
};

static decimal Discount(Order order) => order switch
{
    { Customer.IsVip: true, Total: > 100m } => 0.20m,
    { Customer.Country: "PL" } => 0.05m,
    _ => 0m,
};

static string Quadrant(Point p) => p switch
{
    (> 0, > 0) => "Q1",
    (< 0, < 0) => "Q3",
    (0, _) or (_, 0) => "on an axis",
    _ => "other",
};
```

## `is` with patterns

```csharp
if (obj is string { Length: > 3 } text)    // type + property + variable
    Console.WriteLine(text.ToUpper());

if (value is not null) { ... }
if (status is Status.Active or Status.Pending) { ... }
if (c is >= 'a' and <= 'z') { ... }
```

## List patterns

```csharp
static string Describe(int[] items) => items switch
{
    [] => "empty",
    [var single] => $"one element: {single}",
    [0, ..] => "starts with 0",
    [var first, .. var rest] when rest.Length > 2 => $"{first} and {rest.Length} more",
    [_, _] => "two elements",
    _ => "other",
};
```

`..` is a slice (any number of elements, at most once per pattern), and `.. var rest` captures the slice. They work for types with `Length`/`Count` and an
indexer (arrays, `List<T>`, `Span<T>`).

## `when` guards

`when` adds any condition to an arm: `>= 90 when hasBonus => "A+"`. Guards can't be checked for exhaustiveness by the compiler, so keep a catch-all
arm.

## When patterns help, and when they don't

Patterns are great for mapping values, handling a closed set of types (e.g. a hierarchy of records, results `Success`/`Failure`) and validation. But a
long `switch` over types that you extend often can be a sign that a virtual method (polymorphism) would be better: adding a new type then doesn't
require finding every `switch`.

## Sources

- [Patterns (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/patterns)
- [switch expression](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/switch-expression)
- [Pattern matching overview](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/functional/pattern-matching)

## Questions

### What is a `switch` expression, and how does it differ from a `switch` statement? {junior}

A `switch` expression returns a value (`var x = input switch { ... }`), uses `=>` arms without `case` and `break`, and supports all patterns. The compiler
checks it for exhaustiveness and unreachable arms. A `switch` statement executes blocks of code and has no result. The expression is more concise when you
map one value to another.

### In what order are the arms of a `switch` expression checked? {junior}

From top to bottom, and the first matching arm wins. So more specific patterns go before more general ones. An arm that can never match because an
earlier one covers it is a compile error (CS8510), e.g. `> 10` after `> 0`.

### What happens when no arm of a `switch` expression matches? {mid}

The compiler warns during compilation (CS8509) that the switch isn't exhaustive, and gives an example of an unhandled value. At runtime, a missing match
throws `SwitchExpressionException`. So you usually add a catch-all arm `_ => ...`, often throwing a meaningful exception like
`ArgumentOutOfRangeException`.

### What are property patterns, and what does the extended form give you? {mid}

A property pattern checks an object's properties: `order is { Status: "Paid", Total: > 100 }`, and also checks that the object isn't `null`. Since C# 10
the extended form lets you refer to nested properties with a dot: `{ Customer.Address.Country: "PL" }` instead of
`{ Customer: { Address: { Country: "PL" } } }`.

### What are relational and logical patterns? {mid}

Relational patterns compare with a constant: `< 0`, `>= 18`. Logical patterns combine patterns: `and`, `or`, `not`. Together they express ranges and
conditions without repeating the variable: `age is >= 18 and < 65`, `c is >= 'a' and <= 'z' or >= 'A' and <= 'Z'`, `x is not null`. They only work with
constants, not variables.

### How do list patterns work? {mid}

Since C# 11 you can match the contents of an array or list: `[]` is empty, `[var x]` has one element, `[1, 2, ..]` starts with 1 and 2, and
`[.., var last]` captures the last element. `..` is a slice of any length and may appear at most once, and `.. var rest` captures it. They work for types
with a `Length` or `Count` property and an indexer.

### What is a positional pattern? {mid}

It matches a value using its `Deconstruct` method, which records and tuples have out of the box: `point is (0, 0)`, or `(> 0, > 0) => "Q1"`. It's handy
with tuples to switch on several values at once: `(state, action) switch { (State.Open, Action.Close) => State.Closed, ... }`.

### What is a `when` guard for, and what is its downside? {mid}

It adds any boolean condition to an arm, e.g. comparing two captured variables, which a pattern alone can't express:
`Rectangle { Width: var w, Height: var h } when w == h => "square"`. The downside is that the compiler doesn't analyze guards when checking
exhaustiveness, so it can't warn about gaps.

### Why is `is not null` often preferred to `!= null`? {junior}

`is not null` always checks the reference and can't be changed by an overloaded `!=` operator, so it behaves predictably. It also reads naturally, works
with nullable value types, and integrates with the rest of the pattern syntax (`is not null and { Length: > 0 }`).

### When is a `switch` over types a design smell? {senior}

When the same set of types is switched on in many places and the set is open, i.e. new types are added often. Every new type then requires finding and
updating every `switch`, which breaks the open/closed principle, and a virtual method or interface would be better. Switching over a closed hierarchy
(e.g. `Result` = `Success` | `Failure`) or mapping at a system boundary is fine.
