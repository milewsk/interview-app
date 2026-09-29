# Querying: LINQ translation, IQueryable and pagination {mid}

EF Core translates LINQ queries on `DbSet<T>` into SQL. Knowing **what gets translated, when the query runs and where the filtering happens** (in the
database or in application memory) is the foundation of efficient data access, and a frequent source of interview questions.

## `IQueryable` vs `IEnumerable`

```csharp
IQueryable<Order> query = db.Orders.Where(o => o.Total > 400);   // an expression tree, no SQL yet
var list = await query.ToListAsync();                             // SQL: ... WHERE [o].[Total] > 400.0

var bad = db.Orders.AsEnumerable().Where(o => o.Total > 400).ToList();   // 🔴 SELECT all rows, filter in memory
```

- `IQueryable<T>` builds an **expression tree** that the provider translates into SQL. Every operator added before execution (`Where`, `OrderBy`, `Select`,
  `Skip`, `Take`) becomes part of the SQL.
- After `AsEnumerable()`, `ToList()` or when a method accepts an `IEnumerable<T>` parameter, further operators run **in memory** on already loaded rows. In a
  test, `AsEnumerable().Where(...)` sent SQL without `WHERE` and downloaded all 50 rows to filter 10.
- A repository method returning `IEnumerable<T>` built from a `DbSet` hides this trap: callers think they're filtering in the database.

## Deferred execution

Defining a query doesn't run it. SQL is executed when results are **enumerated**: `ToList/ToListAsync`, `ToArray`, `First`, `Single`, `Count`, `Any`,
`Sum`, `foreach`. Enumerating the same `IQueryable` twice runs **two** queries (in a test, `Count()` and `ToList()` gave 2 round trips). Use the async
versions (`ToListAsync`, `FirstOrDefaultAsync`) in web applications so threads aren't blocked on I/O.

## Translation and client evaluation

```csharp
db.Orders.Where(o => Helpers.IsBig(o.Total)).ToList();
// InvalidOperationException: The LINQ expression '...Where(o => Helpers.IsBig(o.Total))' could not be translated.

db.Orders.Select(o => new { o.Id, Big = Helpers.IsBig(o.Total) }).ToList();   // ✅ allowed: evaluated on the client in the final projection
```

- EF translates known operators and many .NET methods: `string.Contains/StartsWith` → `LIKE`, `ToLower/ToUpper` → `LOWER/UPPER`, `Math.*`, date parts,
  `EF.Functions.Like`, `EF.Functions.DateDiffDay` and more.
- Since EF Core 3.0 an **untranslatable** expression in `Where`, `OrderBy` or joins throws an exception instead of silently downloading the whole table.
  Only the **final `Select`** may contain code that runs on the client.
- The fix is to rewrite the condition in translatable form, map the function to SQL (`HasDbFunction`), or consciously switch to in-memory processing
  (`AsEnumerable()`) after narrowing the data in the database.

## Selected translations

| LINQ | SQL (SQL Server) |
|---|---|
| `First()` / `FirstOrDefault()` | `TOP(1)` |
| `Single()` / `SingleOrDefault()` | `TOP(2)`, so it can detect more than one row |
| `Any(...)` | `EXISTS (SELECT 1 ...)` |
| `Skip(20).Take(10)` | `OFFSET @p ROWS FETCH NEXT @p1 ROWS ONLY` |
| `GroupBy(...).Select(g => new { g.Key, Count = g.Count() })` | `GROUP BY` with `COUNT(*)` |
| `Contains(term)` on a string | `LIKE @term_contains ESCAPE N'\'` (special characters escaped) |
| `o.Note == note` for nullable columns | C# semantics: `IS NULL` for `null`, `<> ... OR ... IS NULL` for `!=` |

- `Single` throws when there's more than one row ("Sequence contains more than one element"), and `First` returns the first one, so `First` without `OrderBy`
  gives an arbitrary row.
- EF preserves **C# null semantics**: comparing with a nullable column adds `IS NULL` checks, so results match what the same expression would give in memory.
- Captured variables become **parameters**, so the database can reuse its query plan, while literals in the query are inlined as constants.

## Pagination

```csharp
// offset: simple, but slows down on distant pages (the database still reads the skipped rows)
var page = await db.Orders.OrderBy(o => o.Id).Skip((pageNo - 1) * size).Take(size).ToListAsync();

// keyset (seek): fast on any page, stable when rows are inserted
var next = await db.Orders.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(size).ToListAsync();
```

Pagination always needs a **deterministic `OrderBy`** (ideally ending with a unique column), otherwise pages can overlap or skip rows. Offset pagination is
fine for small tables and page-number UIs, and keyset pagination is better for infinite scrolling, APIs and large tables.

## Sources

- [How queries work](https://learn.microsoft.com/en-us/ef/core/querying/how-query-works)
- [Client vs. server evaluation](https://learn.microsoft.com/en-us/ef/core/querying/client-eval)
- [Pagination](https://learn.microsoft.com/en-us/ef/core/querying/pagination)
- [Complex query operators](https://learn.microsoft.com/en-us/ef/core/querying/complex-query-operators)
- [Comparisons with null values](https://learn.microsoft.com/en-us/ef/core/querying/null-comparisons)

## Questions

### How does `IQueryable<T>` differ from `IEnumerable<T>` in EF Core? {junior}

`IQueryable<T>` represents a query as an expression tree that the provider translates into SQL, so filters, sorting and paging run in the database.
`IEnumerable<T>` operates on objects in memory: after `AsEnumerable()` or `ToList()`, subsequent `Where` calls filter data already downloaded. Treating a
`DbSet` as `IEnumerable` too early downloads the whole table and filters it in the application.

### When does an EF Core query actually execute? {junior}

When the results are enumerated: `ToList`/`ToListAsync`, `ToArray`, `First`, `Single`, `Count`, `Any`, aggregates or `foreach`. Building a query with `Where`
and `OrderBy` alone doesn't touch the database (deferred execution). Each enumeration of the same `IQueryable` runs a new query, so results used several
times should be materialized once.

### What does "could not be translated" mean? {mid}

EF couldn't translate part of the query, e.g. a call to your own C# method in `Where`, into SQL. Since EF Core 3.0 it throws an exception instead of silently
evaluating on the client, which used to download entire tables. Fix it by rewriting the condition with translatable operations, mapping a database function
(`HasDbFunction`), or, if the data is small, narrowing it in SQL first and continuing in memory after `AsEnumerable()`.

### Where is client-side evaluation still allowed? {mid}

In the final projection (the top-level `Select`): EF executes the translatable part in SQL, and the rest (e.g. formatting with a C# method) runs on the loaded
rows. That's safe, because it doesn't change which rows are downloaded. Client code in `Where`, `OrderBy`, `GroupBy` or joins would require downloading all
the data, so EF rejects it.

### How do `First` and `Single` translate to SQL, and when should you use each? {junior}

`First` returns the first matching row and throws when there isn't any, while `FirstOrDefault` returns `null`/default. `Single` additionally verifies that
exactly one row matches and throws "Sequence contains more than one element" when there are more, which is why it generates `TOP(2)`. `Single` is for queries
by a unique key, and `First` should be combined with `OrderBy`, because without it the "first" row is arbitrary.

### What SQL do `Any()` and `Count() > 0` produce, and which should you use? {junior}

`Any()` translates to `EXISTS`, which lets the database stop at the first matching row. `Count() > 0` must count all matching rows first. For large tables and
non-selective conditions the difference can be significant, and `Any()` also expresses the intent better.

### How do offset and keyset pagination differ? {mid}

Offset pagination (`Skip`/`Take` → `OFFSET ... FETCH`) is simple and supports jumping to any page number, but the database has to read and discard all skipped
rows, so distant pages are slow, and inserts between requests shift the results. Keyset pagination filters by the last seen key (`WHERE Id > @lastId ORDER BY Id`),
uses the index directly, and is fast and stable on any page, but only supports "next/previous" navigation.

### Why must paginated queries have an `OrderBy`? {junior}

Without an explicit sort, the database returns rows in an unspecified order, which may differ between executions. Then `Skip`/`Take` can return duplicates or
skip rows between pages. The sort should be deterministic, so it ends with a unique column (e.g. `OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)`). EF also warns
when `Skip`/`Take` is used without `OrderBy`.

### How does EF Core handle `null` comparisons? {mid}

It preserves C# semantics, even though in SQL `NULL = NULL` is unknown. `o.Note == null` becomes `IS NULL`, `o.Note != "x"` becomes
`[Note] <> N'x' OR [Note] IS NULL`, and comparing with a variable that may be `null` adds the right checks. As a result, a query returns the same rows as the
same LINQ expression executed on objects in memory, at the cost of slightly more complex SQL.

### Why does it matter whether a value in a query is a variable or a constant? {senior}

A captured variable becomes an SQL parameter (`@lastId`), so the query text stays the same for different values, and both EF's query cache and the database's
execution plan cache can reuse it. A constant (a literal in code) is inlined in the SQL. Building queries dynamically with constants, e.g. through the expression
API, produces a different SQL text for each value, which pollutes caches and forces recompilation.
