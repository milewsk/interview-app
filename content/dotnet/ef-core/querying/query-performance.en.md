# EF Core query performance {senior}

Most EF Core performance problems aren't caused by EF itself, but by **what the queries ask the database for**: too many rows, too many columns, too many
round trips or missing indexes. The approach is always the same: **measure first**, find the expensive query, fix its shape, measure again.

## 1. Measure and find the culprit

- Log SQL with timings (`LogTo`, or the `Microsoft.EntityFrameworkCore.Database.Command` category): every command is logged with its duration, e.g.
  `Executed DbCommand (58ms)`.
- `TagWith("Dashboard: top orders")` adds a comment (`-- Dashboard: top orders`) to the SQL, so the query can be found in database monitoring tools and
  logs.
- Look at the **execution plan** in the database (SQL Server: actual execution plan, Query Store; PostgreSQL: `EXPLAIN ANALYZE`) to see table scans and
  missing indexes.
- EF Core metrics and events (`dotnet-counters`, OpenTelemetry) show query counts, the query cache hit rate and `SaveChanges` rates.

## 2. Download only what you need

In a test on 50,000 rows (SQLite, average of 3 runs):

| Query | Time | Allocated |
|---|---|---|
| `db.Orders.ToListAsync()` (tracked entities) | ~294 ms | ~69 MB |
| `AsNoTracking()` | ~95 ms | ~37 MB |
| `Select(o => new { o.Id, o.Total })` | ~46 ms | ~16 MB |

- **Projections** (`Select` into a DTO) read only the needed columns and aren't tracked, so they're the best choice for read-only views and APIs.
- **`AsNoTracking()`** for read-only queries skips creating change-tracker entries and snapshots.
- `AsNoTracking` doesn't resolve identities, so the same related row loaded several times gives **separate instances** (in a test, two orders of one
  customer had two different `Customer` objects). `AsNoTrackingWithIdentityResolution()` deduplicates them without tracking.
- Filter and page in the database (`Where`, `Skip`/`Take`), never after `ToList()`.

## 3. Fewer round trips

- Avoid **N+1**: load related data with `Include` or projections instead of lazy loading in loops (see the topic on loading related data).
- Watch out for **cartesian explosion** with several collection `Include`s: use `AsSplitQuery()` or projections.
- `SaveChanges` **batches** inserts and updates into a small number of commands, and `ExecuteUpdate`/`ExecuteDelete` change many rows in a single
  statement without loading them.

## 4. Indexes and query shape

EF doesn't create indexes for your filters (only for foreign keys and configured indexes). A `Where` or `OrderBy` on an unindexed column scans the whole
table. Add indexes with `HasIndex` based on real queries, and avoid expressions that prevent index use, such as a function on the column
(`LOWER(Name) = ...`) or `LIKE '%text%'`.

## 5. Large result sets: buffering vs streaming

`ToListAsync()` loads all rows into memory before returning. `AsAsyncEnumerable()` (or `foreach` over the query) **streams** rows one by one, so processing
starts with the first row and memory stays low. In a test, processing started before all 50,000 rows were loaded. Streaming holds the connection open
longer, so don't do slow work per row during it.

## 6. EF overhead in hot paths

Usually negligible compared to I/O, but for very high throughput:

- **Compiled queries** (`EF.CompileAsyncQuery`) skip the lookup of the query in EF's cache by building the delegate once.
- **Parameters, not constants**: dynamically built queries with constants produce different SQL for every value and defeat both EF's query cache and the
  database's plan cache.
- **DbContext pooling** reduces context setup costs.
- **Compiled models** (`dotnet ef dbcontext optimize`) shorten startup for very large models (hundreds of entities), with limitations (e.g. no global
  query filters).

## Sources

- [Performance diagnosis](https://learn.microsoft.com/en-us/ef/core/performance/performance-diagnosis)
- [Efficient querying](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying)
- [Advanced performance topics](https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics)
- [Tracking vs. no-tracking queries](https://learn.microsoft.com/en-us/ef/core/querying/tracking)
- [Query tags](https://learn.microsoft.com/en-us/ef/core/querying/tags)

## Questions

### How do you find a slow query in an EF Core application? {mid}

Enable SQL logging with timings (`LogTo` or the `Database.Command` logging category), where each command shows its execution time, and add `TagWith` to
important queries so they can be found in database tools. Then analyze the execution plan in the database (SQL Server's Query Store, `EXPLAIN ANALYZE` in
PostgreSQL) for table scans and missing indexes. APM tools and EF metrics show which queries run most often or longest.

### Why is `AsNoTracking()` faster? {junior}

A tracking query creates a change-tracker entry for every entity, stores a snapshot of its original values and performs identity resolution. `AsNoTracking`
skips all of that, so it uses less memory and CPU: in a test on 50,000 rows it was about 3 times faster and allocated half as much. It's for data that won't
be modified in the same context, e.g. lists and details returned by an API.

### How does `AsNoTracking` differ from `AsNoTrackingWithIdentityResolution`? {senior}

`AsNoTracking` creates a new object for every row, so the same related entity loaded several times (e.g. one customer of many orders with `Include`) gives
separate instances with duplicated data. `AsNoTrackingWithIdentityResolution` uses a temporary identity map during the query, so the same key gives the same
instance, but it still doesn't track the entities afterwards. It costs a bit more than plain `AsNoTracking`.

### Why is a projection to a DTO usually the fastest way to read data? {mid}

A projection reads only the columns you ask for, so less data is transferred and materialized, and the database can sometimes use a covering index. The
results aren't entities, so they're never tracked, and related data can be flattened into the same query instead of using `Include`. In a test, a 2-column
projection over 50,000 rows was twice as fast as `AsNoTracking` on whole entities.

### When should you stream results with `AsAsyncEnumerable()` instead of `ToListAsync()`? {mid}

When the result set is large and can be processed row by row, e.g. exporting to a file or sending to a queue. Streaming doesn't keep all rows in memory
and lets processing start with the first row. The downsides: the connection and reader stay open during processing, and you can't run other queries on the
same context at the same time, so slow per-row work should be avoided.

### What are compiled queries, and when are they worth it? {senior}

`EF.CompileAsyncQuery` turns a LINQ query into a delegate once, so subsequent executions skip analyzing the expression tree and looking it up in EF's
query cache. The gain is small in absolute terms (microseconds per query), so it matters only for very hot queries in high-throughput services. They require
simple scalar parameters and a single model, and they don't work with dynamically built queries.

### Why do dynamically built queries with constants hurt performance? {senior}

EF caches translated queries by the shape of the expression tree. If a value is embedded as a constant (e.g. `Expression.Constant(url)`), each value creates a
new tree and new SQL text, so EF recompiles the query every time and the database creates a separate execution plan for each variant, which pollutes both caches.
Values should be captured as parameters, which keeps one cached query and one plan.

### Does EF Core create indexes for columns used in `Where`? {junior}

No. By convention EF creates indexes only for foreign keys, and other indexes must be configured explicitly with `HasIndex` (or `[Index]`) and added through a
migration. Without an index, filtering or sorting on a column requires scanning the whole table. Indexes are chosen based on real queries and execution plans,
because each one also slows down writes.

### What does `TagWith` do? {junior}

It adds a comment to the generated SQL (`-- Dashboard: top orders`), which appears in logs, database profilers and Query Store. Thanks to it, when a DBA or a
monitoring tool finds a slow statement, you know which part of the code generated it. It doesn't change the query's results or plan.

### What EF-level optimizations exist for very high throughput? {senior}

DbContext pooling (lower setup cost per request), compiled queries for hot paths, compiled models for large models with slow startup, and disabling thread
safety checks (`EnableThreadSafetyChecks(false)`) after thorough testing. These give gains in microseconds, so they matter only after the queries themselves
are optimal: fewer round trips, projections, no-tracking reads and proper indexes give much bigger improvements.
