# LINQ {mid}

LINQ (Language Integrated Query) is a set of operators (`Where`, `Select`, `OrderBy`, `GroupBy`…)
for processing sequences uniformly regardless of the source: in-memory collections, a database via
EF Core, or XML.

```csharp
var adults = people
    .Where(p => p.Age >= 18)
    .OrderBy(p => p.LastName)
    .Select(p => new { p.FirstName, p.LastName });
```

The same query in query syntax, which the compiler translates into the same method calls:

```csharp
var adults = from p in people
             where p.Age >= 18
             orderby p.LastName
             select new { p.FirstName, p.LastName };
```

## Deferred execution

Most operators **don't run when the query is defined**. A query is a recipe that runs only when
iterated (`foreach`, `ToList()`, `Count()`, `First()`…).

```csharp
var numbers = new List<int> { 1, 2, 3 };
var threshold = 1;
var query = numbers.Where(n => n > threshold);

threshold = 2;     // the lambda captures the variable, not its value
numbers.Add(4);    // changes to the source are visible too

Console.WriteLine(string.Join(",", query)); // 3,4
```

Consequences:

- **Multiple enumeration.** Every `Count()`, `Sum()` or `foreach` over the same query runs it again,
  including side effects and expensive operations. If you need the result several times,
  materialize it (`ToList()`, `ToArray()`).
- **Exceptions surface late**, during iteration, not on the line with `Where`/`Select`.
- **Immediate** operators (`ToList`, `ToArray`, `ToDictionary`, `ToLookup`, `Count`, `Sum`,
  `First`, `Any`…) execute the query right away.

## Streaming vs buffering

Deferred operators are either:

- **streaming** (`Where`, `Select`, `Take`, `Skip`): they process one element at a time. `First()`
  after `Where` stops at the first matching element,
- **buffering** (`OrderBy`, `GroupBy`, `Reverse`, `Distinct` in some cases): they must read the
  **entire** source before yielding the first element.

```csharp
source.Where(x => x > 2).First();            // reads 3 elements
source.Where(x => x > 2).OrderBy(x => x).First(); // reads the whole source
```

## `IEnumerable<T>` vs `IQueryable<T>`

| | `IEnumerable<T>` (LINQ to Objects) | `IQueryable<T>` (e.g. EF Core) |
| --- | --- | --- |
| Operators take | `Func<T, bool>` delegates | `Expression<Func<T, bool>>` expression trees |
| Execution | .NET code in memory | the provider translates the expression, e.g. to SQL |
| Filtering | after fetching data | in the database |

Pitfall: switching to `IEnumerable` (via `AsEnumerable()`, `ToList()` or a method parameter of type
`IEnumerable<T>`) makes **all later operators run in memory**:

```csharp
// 🔴 fetches ALL orders and filters in the application
IEnumerable<Order> orders = db.Orders;
var recent = orders.Where(o => o.Date > since).ToList();

// ✅ WHERE goes to SQL
var recent = await db.Orders.Where(o => o.Date > since).ToListAsync();
```

## Commonly confused operators

- **`First` / `FirstOrDefault` / `Single` / `SingleOrDefault`**: `First` takes the first element and
  throws for an empty sequence. `Single` requires **exactly one** element and throws if there are
  more. The `OrDefault` variants return `default`, and since .NET 6 you can pass your own default:
  `FirstOrDefault(-1)`.
- **`Any()` instead of `Count() > 0`**: `Any` stops at the first element, while `Count()` on a plain
  `IEnumerable` walks everything.
- **`Select` vs `SelectMany`**: `Select` maps 1:1 (a collection of collections stays a collection of
  collections). `SelectMany` flattens.
- **`GroupBy` vs `ToLookup`**: `GroupBy` is deferred, while `ToLookup` is immediate and produces a
  multi-value dictionary. For a missing key, `lookup[key]` returns an empty sequence.

## Newer operators

- .NET 6: `Chunk`, `DistinctBy`, `MaxBy`/`MinBy`, `ExceptBy`, `IntersectBy`, `UnionBy`.
- .NET 9: `CountBy`, `AggregateBy`, `Index`.
- .NET 10: `LeftJoin` and `RightJoin`, also supported by EF Core 10 (translated to
  `LEFT/RIGHT JOIN`).

```csharp
var words = new[] { "apple", "avocado", "banana", "blueberry", "cherry" };
words.CountBy(w => w[0]);                 // a=2, b=2, c=1
words.AggregateBy(w => w[0], 0, (sum, w) => sum + w.Length); // a=12, b=15, c=6
foreach (var (i, w) in words.Index()) { } // (0, "apple"), (1, "avocado")…

people.LeftJoin(departments,
    p => p.DeptId, d => d.Id,
    (p, d) => $"{p.Name} - {d?.Name ?? "[none]"}");
```

## A custom operator: `yield return`

LINQ operators are ordinary extension methods on `IEnumerable<T>`. An iterator using `yield return` is
automatically deferred and streaming:

```csharp
public static IEnumerable<T> WhereNot<T>(this IEnumerable<T> source, Func<T, bool> predicate)
{
    foreach (var item in source)
        if (!predicate(item))
            yield return item;
}
```

## Sources

- [Language Integrated Query (LINQ)](https://learn.microsoft.com/en-us/dotnet/csharp/linq/)
- [Deferred execution and lazy evaluation](https://learn.microsoft.com/en-us/dotnet/standard/linq/deferred-execution-lazy-evaluation)
- [Introduction to LINQ queries (deferred and immediate execution)](https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries)
- [Standard query operators overview](https://learn.microsoft.com/en-us/dotnet/csharp/linq/standard-query-operators/)
- [What's new in EF Core 10: LeftJoin and RightJoin](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/whatsnew)

## Questions

### What is deferred execution in LINQ? {junior}

A query made of operators like `Where` or `Select` is just a description. It runs only when iterated
(`foreach`, `ToList()`, `Count()`…). That's why the result reflects changes to the source, and to
variables captured in lambdas, made after the query was defined. Exceptions also surface only during
iteration.

### After defining `numbers.Where(n => n > threshold)` we change `threshold` from 1 to 2 and add 4 to the list. What does the query return? {mid}

For the list `1, 2, 3` the result is `3, 4`. The query runs only on iteration, the lambda captures the
**variable** `threshold` (which is 2 by then), and the list already contains 4.

### Why can multiple enumeration of an `IEnumerable` be a problem? {mid}

Each iteration runs the whole query again: it calls the lambdas again (with their side effects), reads
the file again and, for `IQueryable`, sends another query to the database. If you need the result
several times, materialize it once (`ToList()`, `ToArray()`). Analyzers and ReSharper warn about
"possible multiple enumeration".

### What's the difference between `IEnumerable<T>` and `IQueryable<T>`? {mid}

Operators on `IEnumerable<T>` take delegates and run in memory. Operators on `IQueryable<T>` take
expression trees, which a provider (e.g. EF Core) translates into another language, such as SQL, and
executes at the source. Casting an `IQueryable` to `IEnumerable` (e.g. `AsEnumerable()` or a method
parameter) moves later filtering into memory, which can mean fetching the whole table.

### How do `First`, `FirstOrDefault`, `Single` and `SingleOrDefault` differ? {junior}

`First` returns the first element and throws `InvalidOperationException` for an empty sequence.
`Single` returns the only element and throws if there are zero or more than one, so it's used to
enforce uniqueness. The `OrDefault` variants return `default` (or a given value) instead of throwing
for an empty sequence, but `SingleOrDefault` still throws for multiple elements. Against a database,
`Single` generates `TOP(2)` (SQL Server) or `LIMIT 2` (SQLite, PostgreSQL) to detect a duplicate.

### Why is `Any()` better than `Count() > 0`? {junior}

`Any()` stops at the first element found. `Count()` on a plain `IEnumerable` must walk the whole
sequence. For collections implementing `ICollection<T>` `Count()` is fast, but `Any()` expresses the
intent more clearly. In EF Core `Any()` translates to `EXISTS`, which the database can short-circuit.

### What's the difference between `Select` and `SelectMany`? {junior}

`Select` maps each element to exactly one result, so a list of lists stays a list of lists.
`SelectMany` maps each element to a sequence and **flattens** the results into one sequence, e.g. all
orders of all customers: `customers.SelectMany(c => c.Orders)`.

### Which LINQ operators execute immediately and which are deferred? {mid}

Operators that return a single value or a materialized collection execute immediately: `ToList`,
`ToArray`, `ToDictionary`, `ToLookup`, `Count`, `Sum`, `Max`, `First`, `Single`, `Any`, `All`. Those
returning `IEnumerable<T>`/`IQueryable<T>` are deferred: `Where`, `Select`, `OrderBy`, `GroupBy`,
`Skip`, `Take`, `Join`. Among deferred operators some stream (`Where`, `Select`) and some buffer the
whole source on first read (`OrderBy`, `GroupBy`).

### How do you write a custom LINQ operator? {mid}

As an extension method on `IEnumerable<T>` with a `yield return` iterator. Such an iterator is
automatically deferred and streaming. Put argument validation in a separate non-iterator method,
because inside an iterator the exception would surface on the first iteration, not at the call.

### How do you do a left join in LINQ? {mid}

Since .NET 10 there's the `LeftJoin(inner, outerKey, innerKey, resultSelector)` operator, where a
missing right-hand element is `null`. EF Core 10 translates it to `LEFT JOIN`. Previously you combined
`GroupJoin` + `SelectMany` + `DefaultIfEmpty()`. Query syntax (`from … join …`) doesn't yet have a
dedicated left-join form.
