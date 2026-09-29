# Loading related data and the N+1 problem {mid}

EF Core doesn't load navigations (`blog.Posts`, `post.Author`) automatically. There are three ways to
load them, plus a fourth that's often best: **projection**.

| Approach | How | Number of queries |
| --- | --- | --- |
| Eager loading | `Include` / `ThenInclude` | 1 (or several with `AsSplitQuery`) |
| Explicit loading | `Entry(x).Collection(...).LoadAsync()` | 1 per call |
| Lazy loading | proxies or `ILazyLoader`, accessing the navigation | 1 per first access |
| Projection | `Select(x => new Dto { ... })` | 1, only the needed columns |

## Eager loading: `Include`

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts)
        .ThenInclude(p => p.Author)
    .Include(b => b.Owner)
    .ToListAsync();
```

**Filtered include** lets you limit the loaded collection:

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts.Where(p => p.IsPublished).OrderByDescending(p => p.Date).Take(5))
    .ToListAsync();
```

Note: in **tracking** queries, entities already loaded into the context also appear in the navigation
(relationship fixup), even if they don't match the filter.

## The N+1 problem

One query for the list (1), then a separate query for **each** element (N):

```csharp
var blogs = await db.Blogs.ToListAsync();                 // 1 query
foreach (var blog in blogs)
    await db.Entry(blog).Collection(b => b.Posts).LoadAsync(); // + N queries
```

With **lazy loading** the same problem is invisible in the code: a plain `blog.Posts.Count` in a loop
(or in a view or serializer) sends a query on every iteration. For 100 blogs that's 101 queries instead
of one.

**How to detect it:** SQL logging (`LogTo(Console.WriteLine)`, `Information` level for the
`Microsoft.EntityFrameworkCore.Database.Command` category), a database profiler, APM or OpenTelemetry.
The warning sign is many identical queries that differ only by a parameter.

**How to fix it:** `Include`, a projection, or loading all children in one query
(`Where(p => blogIds.Contains(p.BlogId))`).

## Projection: usually the best choice for reads

```csharp
var list = await db.Blogs
    .Select(b => new BlogSummary(b.Name, b.Posts.Count, b.Owner.Name))
    .ToListAsync();
```

EF translates navigations inside `Select` into `JOIN`s or subqueries, fetches **only the needed
columns** and creates no tracked entities. `Include` isn't needed here: it's ignored when the result
contains no entities.

## Lazy loading

You enable it with the `Microsoft.EntityFrameworkCore.Proxies` package and `UseLazyLoadingProxies()`
(navigations must be `virtual`), or by injecting `ILazyLoader`. It's convenient, but:

- N+1 comes easily,
- each load is a synchronous query, with no `await`,
- after the context is disposed, accessing an unloaded navigation throws `InvalidOperationException`
  (the `LazyLoadOnDisposedContextWarning` is treated as an error by default),
- since EF Core 7 it also works for entities from `AsNoTracking` queries, so disabling tracking
  doesn't protect you from N+1,
- serializing entities to JSON can walk the navigations and load half the database (or loop).

Web apps usually avoid it.

## Cartesian explosion and `AsSplitQuery`

Several collection `Include`s at the same level in one query produce `JOIN`s that multiply rows. 10 posts
× 10 tags means 100 rows per blog, with the blog's columns repeated in each of them.

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts)
    .Include(b => b.Tags)
    .AsSplitQuery()        // 3 queries: Blogs, Posts, Tags
    .ToListAsync();
```

- **Single query** (default): one query and a consistent read, but a risk of data explosion.
- **Split query**: several queries without duplication, but more round trips and **no consistency
  guarantee** if data changes between the queries (unless in a transaction with a suitable isolation
  level). EF Core 10 improved ordering consistency for split queries with `Take`/`Skip`.
- Globally: `UseSqlServer(cs, o => o.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery))`,
  and locally `AsSingleQuery()`.
- When EF detects several collections in one query, it logs the `MultipleCollectionIncludeWarning`.

## Relationship fixup

The context automatically connects tracked entities. If you load a blog's posts first and then the blog
itself, `blog.Posts` already contains those posts, without `Include`. This can be handy, but it can also
surprise you, because the navigation only contains what happens to be in the context.

## Parameterized collections in EF Core 10

`Where(b => ids.Contains(b.Id))` is translated by default in EF Core 10 into separate parameters
`IN (@ids1, @ids2, …)` with the parameter count "padded". Query plans cache better, and the optimizer
knows the collection's cardinality. You can change the strategy globally (`UseParameterizedCollectionMode`)
or per query (`EF.Constant`, `EF.Parameter`).

## Sources

- [Loading related data](https://learn.microsoft.com/en-us/ef/core/querying/related-data/)
- [Eager loading](https://learn.microsoft.com/en-us/ef/core/querying/related-data/eager)
- [Lazy loading](https://learn.microsoft.com/en-us/ef/core/querying/related-data/lazy)
- [Single vs. split queries](https://learn.microsoft.com/en-us/ef/core/querying/single-split-queries)
- [Efficient querying](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying)

## Questions

### What is the N+1 problem and how do you detect it in EF Core? {junior}

After one query for a list (1), you run a separate query for each element (N), e.g. loading each blog's
posts in a loop. It usually comes from lazy loading or explicit loading in a loop. You detect it by
logging SQL (`LogTo`, logs of the `Microsoft.EntityFrameworkCore.Database.Command` category), with a
database profiler or APM. You'll see a series of identical queries with different parameters.

### How do you fix N+1? {mid}

Load the data in one query: `Include`/`ThenInclude`, a `Select` projection to a DTO (EF produces a
`JOIN` or subquery), or a batch query for the children (`Where(p => ids.Contains(p.BlogId))`) and
stitching the results in memory. Lazy loading is best disabled, or at least kept out of loops.

### How do eager, explicit and lazy loading differ? {junior}

**Eager** (`Include`) loads related data together with the main entity, in the same query (or in split
queries). **Explicit** loads it later, on demand: `Entry(e).Collection(...).LoadAsync()` or
`.Reference(...)`. **Lazy** loads it automatically on first access to the navigation, via proxies or
`ILazyLoader`. It's convenient, but it hides queries and invites N+1.

### Why is a projection to a DTO often better than `Include`? {mid}

It fetches only the needed columns, not whole entities. EF translates navigations in `Select` into
`JOIN`s or subqueries, and the database computes aggregates (`Count`, `Sum`). The result isn't tracked,
so there's no change-tracker cost. `Include` makes sense when you need full entities to modify and save.

### What is a cartesian explosion and how do you prevent it? {mid}

When one query includes several collections at the same level (e.g. `Include(Posts)` and
`Include(Tags)`), the `JOIN` multiplies rows: posts × tags per blog, with the parent's columns repeated.
Prevent it with `AsSplitQuery()` (a separate query per collection), a projection that returns only the
needed data, or by not loading one of the collections.

### What are the downsides of `AsSplitQuery()`? {senior}

More database round trips. No consistency guarantee: if someone changes data between the queries, the
results may not match up, unless everything runs in a transaction with a suitable isolation level (e.g.
snapshot). With `Skip`/`Take` you need deterministic ordering. EF Core 10 improved `ORDER BY`
consistency across split queries.

### Why can lazy loading be dangerous in web applications? {mid}

Queries are hidden behind plain property access, so N+1 happens easily in a loop, a view, or during JSON
serialization (the serializer walks navigations and can load a huge graph or loop forever). Lazy-loading
queries are synchronous. Since EF Core 7 it also works for `AsNoTracking` entities, so disabling tracking
doesn't protect you from N+1. After the context is disposed, accessing an unloaded navigation throws
`InvalidOperationException` (`LazyLoadOnDisposedContextWarning`).

### What is filtered include? {mid}

It's `Include` with operators on the collection: `Where`, `OrderBy`, `Skip`, `Take`, e.g.
`Include(b => b.Posts.Where(p => p.IsPublished).Take(5))`. It loads only the selected elements. In
tracking queries, though, the navigation may also contain other entities already loaded into the context
(relationship fixup).

### What is relationship fixup? {mid}

The context automatically fills in navigations between tracked entities based on foreign keys. If a
blog's posts were loaded earlier, then after loading the blog `blog.Posts` contains them without
`Include`. The navigation therefore reflects the context's state, not the full state of the database.

### How does EF Core 10 translate `ids.Contains(x.Id)`, and why does it matter? {senior}

By default into a list of separate parameters `IN (@ids1, @ids2, …)`, padded to fixed sizes. Previously
values were inlined as constants (each list is a new query and a new plan) or, since EF 8, sent as one
JSON parameter (`OPENJSON`), which hid the cardinality from the optimizer. The new approach limits the
number of plans and gives the optimizer the size. If needed, change the strategy with
`UseParameterizedCollectionMode`, `EF.Constant` or `EF.Parameter`.
