# Query optimization and execution plans {senior}

SQL is declarative: you say **what** you want, and the **query optimizer** decides **how** to get it, choosing access methods, join order and join
algorithms based on statistics and cost estimates. Optimizing a query means reading its **execution plan**, finding where the time or I/O goes, and
changing the query, the indexes or the statistics.

## Reading an execution plan

| Database | Estimated plan | Actual plan (the query is executed) |
|---|---|---|
| PostgreSQL | `EXPLAIN` | `EXPLAIN (ANALYZE, BUFFERS)` |
| SQL Server | "Display Estimated Execution Plan", `SET SHOWPLAN_XML ON` | "Include Actual Execution Plan", `SET STATISTICS IO, TIME ON` |
| MySQL | `EXPLAIN` | `EXPLAIN ANALYZE` (8.0.18+) |
| SQLite | `EXPLAIN QUERY PLAN` | — |

What to look for:

- **Scans of large tables** where you expected an index seek (`Seq Scan`, `Table Scan`, `Clustered Index Scan`).
- **Estimated vs actual rows**: a large difference means the optimizer is working with wrong information and may choose a bad plan. In a test, before
  statistics were collected PostgreSQL estimated 1,000 rows for `total = 7`; after `ANALYZE` it estimated 397, and the actual count was 400.
- **"Rows removed by filter"**: many rows read and thrown away (199,600 of 200,000) suggest a missing or unusable index.
- Expensive sorts, hash operations spilling to disk, key lookups repeated thousands of times, and the number of **buffers/pages read** (logical I/O is often a
  better measure than time).

## Join algorithms

| Algorithm | When it's good | Seen in a test |
|---|---|---|
| **Nested loop** | a small outer input, and an index on the inner join column | one customer joined with their orders |
| **Hash join** | large, unsorted inputs, equality join; builds a hash table from the smaller one | all customers × all orders, aggregated by country |
| **Merge join** | both inputs sorted on the join key (e.g. by indexes) | `customers.id = orders.id` with both primary keys |

The optimizer chooses the algorithm; a bad choice usually comes from wrong row estimates (a nested loop over what it thought was 10 rows but were 100,000).

## Statistics and plan caching

- The optimizer relies on **statistics** (row counts, value distributions, histograms). After large loads or changes they may be stale: PostgreSQL
  refreshes them with autovacuum/`ANALYZE`, SQL Server with auto-update statistics or `UPDATE STATISTICS`.
- Databases cache plans for parameterized queries. In SQL Server, **parameter sniffing** means the plan is compiled for the first parameter values; if the
  data is skewed (one customer with a million orders, most with a few), the cached plan can be terrible for other values. Remedies: `OPTION (RECOMPILE)`,
  `OPTIMIZE FOR`, Query Store plan forcing, or restructuring the query.

## Common fixes

- **Add or adjust an index** for selective filters, joins and `ORDER BY ... LIMIT` (see the indexes topic).
- **Make conditions sargable**: no functions or casts on indexed columns, date ranges instead of `YEAR(...)`, matching parameter types to column types
  (an `nvarchar` parameter against a `varchar` column in SQL Server causes an implicit conversion and a scan).
- **Read less**: select only needed columns, filter early, use covering indexes.
- **Keyset pagination instead of large `OFFSET`**: in a test, page 1 with `OFFSET 0` took ~1.3 ms, `OFFSET 190000` took ~46 ms (the plan shows 190,020 rows
  read to return 20), and `WHERE id > 190000 ORDER BY id LIMIT 20` took ~1 ms.
- **Avoid N+1** from the application: one query with a join or `IN` instead of a query per row.
- **`OR` across different columns**: PostgreSQL can combine two indexes (`BitmapOr`, verified), but some optimizers fall back to a scan, where rewriting as
  `UNION ALL` of two indexed queries helps.
- **`EXISTS` instead of `COUNT(*) > 0`**, `UNION ALL` instead of `UNION` when duplicates are impossible, pre-aggregating before joins.
- **Batch writes**, and keep transactions short so locks are held briefly.

Always measure before and after, on realistic data volumes: a plan for 100 rows in development can be completely different from one for 100 million in
production.

## Sources

- [PostgreSQL: using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL: statistics used by the planner](https://www.postgresql.org/docs/current/planner-stats.html)
- [SQL Server: execution plans](https://learn.microsoft.com/en-us/sql/relational-databases/performance/execution-plans)
- [SQL Server: parameter sensitive plan optimization](https://learn.microsoft.com/en-us/sql/relational-databases/performance/parameter-sensitive-plan-optimization)
- [MySQL: EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html)

## Questions

### How do you approach a slow query? {mid}

Reproduce it with realistic data and parameters, then look at its actual execution plan (`EXPLAIN ANALYZE`, the actual plan in SQL Server). Find the expensive
operators: scans of large tables, big differences between estimated and actual rows, expensive sorts or many repeated lookups. Then fix the cause: a missing or
unused index, a non-sargable condition, stale statistics or a query that reads too much. Measure again after each change.

### What is an execution plan? {junior}

The tree of physical operations the database uses to execute a query: which tables are read and how (full scan or index seek), in what order they're joined and
with which algorithm, where sorting and aggregation happen. The optimizer builds it from the declarative SQL using statistics and cost estimates. `EXPLAIN` shows
the estimated plan, and `EXPLAIN ANALYZE` (or an actual plan) executes the query and adds real row counts and times.

### Why compare estimated and actual row counts? {mid}

The optimizer chooses join algorithms, join order and index usage based on estimated row counts. If it expects 10 rows and gets 100,000, it may choose a nested
loop with 100,000 index lookups instead of a hash join. Large misestimates point to stale or insufficient statistics, correlated columns or non-sargable
expressions, and fixing the estimate often fixes the plan.

### What join algorithms do databases use? {mid}

Nested loop (for each outer row, look up matching inner rows, ideal for a small outer input with an index on the inner side), hash join (build a hash table from
the smaller input and probe it with the larger one, good for large unsorted inputs with equality conditions) and merge join (walk two inputs sorted on the join key
in parallel). The optimizer picks one per join based on estimated sizes and available indexes.

### Why do statistics matter, and when can they be out of date? {mid}

Statistics describe row counts and value distributions, and the optimizer uses them to estimate how many rows each step will produce. After a bulk load, a large
delete or a shift in data distribution they can be stale until the next automatic update, leading to wrong estimates and bad plans. You refresh them with
`ANALYZE` (PostgreSQL) or `UPDATE STATISTICS` (SQL Server), e.g. right after loading data.

### What is parameter sniffing? {senior}

In SQL Server, a parameterized query or procedure is compiled for the parameter values of its first execution, and the plan is cached and reused. If the data is
skewed, a plan that's great for a rare value (an index seek) can be terrible for a common one (millions of lookups), or vice versa, so performance depends on which
call came first. Fixes include `OPTION (RECOMPILE)`, `OPTIMIZE FOR`, forcing a plan with Query Store, or, in SQL Server 2022, parameter sensitive plan optimization.

### Why is `OFFSET` pagination slow on distant pages? {mid}

To return rows 190,001–190,020, the database still has to produce and discard the first 190,000 rows in order: in a test the plan showed 190,020 rows read, and the
query took ~46 ms versus ~1 ms for the first page. Keyset (seek) pagination filters by the last seen key (`WHERE id > @last ORDER BY id LIMIT 20`) and uses the index to
jump straight there, so every page costs the same. Its limitation is that you can't jump to an arbitrary page number.

### What is the N+1 query problem? {junior}

Running one query to get a list and then one more query for each item (e.g. loading 100 orders and then each order's customer separately), so N items cost N+1
database round trips. Latency adds up even if each query is fast. The fix is fetching the related data in one query with a join, an `IN (...)` list or batch loading,
and ORMs provide eager loading for it.

### How can a data type mismatch slow down a query? {senior}

If a parameter's type differs from the column's type, the database may convert the column value for every row to compare them, which makes the condition
non-sargable and turns an index seek into a scan. A classic SQL Server case is an `nvarchar` parameter (the default for .NET strings) compared with a `varchar` column.
Fix it by matching parameter types to column types (e.g. setting the parameter's `DbType` or column type in the ORM mapping).

### Why can a query be fast in development and slow in production? {mid}

Plans depend on data volume and distribution: with 100 rows a full scan is instant and the optimizer may ignore indexes, while with 100 million rows the same query
needs a completely different plan. Production also has concurrency (locks, contention), different statistics, cached plans from other parameter values and different
hardware or configuration. So performance testing uses realistic data volumes, and plans are compared from the production database when possible.
