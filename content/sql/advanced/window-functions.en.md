# Window functions {mid}

A window function computes a value over a **set of rows related to the current row** (a window), but, unlike `GROUP BY`, **doesn't collapse the rows**:
each row keeps its identity and gets an extra computed column. Rankings, running totals, "previous row" comparisons and "top N per group" are all
window function territory. They're supported by PostgreSQL, SQL Server, MySQL 8+, Oracle and SQLite 3.25+.

## Syntax

```sql
function(...) OVER (
    PARTITION BY region          -- separate windows per region (optional)
    ORDER BY day                 -- order within the window (needed for ranking, LAG, running totals)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW   -- frame: which rows go into the calculation (optional)
)
```

```sql
SELECT id, region, amount,
       SUM(amount) OVER (PARTITION BY region)                                  AS region_total,
       ROUND(100.0 * amount / SUM(amount) OVER (PARTITION BY region), 1)       AS pct_of_region
FROM sales;
-- every row stays: 1 | EU | 100 | 750 | 13.3, 2 | EU | 300 | 750 | 40.0, ...
```

## Ranking: `ROW_NUMBER`, `RANK`, `DENSE_RANK`

For amounts 400, 300, 300, 200:

| Function | Result | Ties |
|---|---|---|
| `ROW_NUMBER()` | 1, 2, 3, 4 | unique numbers; the order among ties is arbitrary unless `ORDER BY` is unique |
| `RANK()` | 1, 2, 2, 4 | the same rank, then a **gap** |
| `DENSE_RANK()` | 1, 2, 2, 3 | the same rank, **no gap** |
| `NTILE(n)` | bucket number | splits rows into n roughly equal groups |

## "Top N per group" and deduplication

Window functions can't be used in `WHERE` (`window functions are not allowed in WHERE`), because they're computed after it, so you filter in an outer
query:

```sql
SELECT region, id, amount
FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC, id) AS rn
    FROM sales s
) t
WHERE rn = 1;               -- the best sale per region; use RANK() = 1 to keep ties
```

The same pattern **removes duplicates** while keeping one row per key (e.g. the latest): `PARTITION BY` the duplicate key, `ORDER BY` what should win, keep
`rn = 1`. Some engines (Snowflake, BigQuery, DuckDB) have a `QUALIFY` clause for filtering on window results directly; PostgreSQL and SQL Server don't.

## `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`

```sql
SELECT day, amount,
       LAG(amount) OVER (PARTITION BY region ORDER BY day, id)             AS prev_amount,   -- NULL for the first row
       amount - LAG(amount, 1, 0) OVER (PARTITION BY region ORDER BY day, id) AS change,     -- default 0
       LEAD(day) OVER (PARTITION BY region ORDER BY day, id)               AS next_day
FROM sales;
```

`LAG`/`LEAD` compare a row with the previous or next one without a self-join: day-over-day change, time between events, detecting status changes.

## Frames and the default-frame trap

With `ORDER BY` in `OVER`, the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` includes all **peers** (rows with the same
`ORDER BY` value), which gives surprising running totals when there are ties:

```sql
SUM(amount) OVER (ORDER BY day)                                              -- 100, 700, 700, 750  (two rows on 01-02 both see 700)
SUM(amount) OVER (ORDER BY day, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)   -- 100, 400, 700, 750
```

- For running totals, specify `ROWS` and a unique order. SQL Server also processes `ROWS` frames more efficiently than the default `RANGE`.
- `LAST_VALUE` with the default frame returns the **current row** (the frame ends at it), not the last row of the partition. Use
  `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`, or `FIRST_VALUE` with a reversed order.
- Moving averages use a sliding frame: `AVG(amount) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` is a 7-row average.
- A named window (`WINDOW w AS (PARTITION BY region)`, then `OVER w`) avoids repeating the same definition (PostgreSQL, MySQL, SQLite, SQL Server 2022+).

## Gaps and islands

A classic interview puzzle: find ranges of consecutive values (days of activity, sequential IDs). Subtracting `ROW_NUMBER()` from the value gives a constant
for each consecutive run, which you then group by:

```sql
SELECT region, MIN(day) AS start_day, MAX(day) AS end_day, COUNT(*) AS days
FROM (
    SELECT region, day,
           day - CAST(ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) AS int) AS grp   -- PostgreSQL date arithmetic
    FROM (SELECT DISTINCT region, day FROM activity) d
) t
GROUP BY region, grp;
```

## Sources

- [PostgreSQL: window functions tutorial](https://www.postgresql.org/docs/current/tutorial-window.html)
- [PostgreSQL: window function calls (frames)](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS)
- [SQL Server: OVER clause](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-over-clause-transact-sql)
- [SQLite: window functions](https://www.sqlite.org/windowfunctions.html)

## Questions

### How does a window function differ from `GROUP BY`? {junior}

`GROUP BY` collapses each group into one row, so you lose the individual rows. A window function computes an aggregate or ranking over a set of related rows,
but returns a value for every row, keeping all of them. So you can show each sale together with its region's total or its share of it
(`amount / SUM(amount) OVER (PARTITION BY region)`) in one query.

### How do `ROW_NUMBER`, `RANK` and `DENSE_RANK` differ? {junior}

On ties: for values 400, 300, 300, 200, `ROW_NUMBER` gives 1, 2, 3, 4 (unique numbers, arbitrary order among ties), `RANK` gives 1, 2, 2, 4 (equal rank, then a
gap), and `DENSE_RANK` gives 1, 2, 2, 3 (equal rank, no gap). You choose based on whether ties should share a position and whether positions should be
consecutive.

### How do you get the top N rows per group? {mid}

Number the rows in each group with `ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC)` in a subquery or CTE, and filter `WHERE rn <= N` in the outer
query, because window functions can't be used in `WHERE`. Use `RANK()` or `DENSE_RANK()` if ties should all be included. Alternatives are `LATERAL`/`APPLY` with
`LIMIT`/`TOP`, which can be faster with a suitable index.

### How do you remove duplicate rows while keeping one of each? {mid}

Number the duplicates with `ROW_NUMBER() OVER (PARTITION BY <columns defining a duplicate> ORDER BY <which one wins, e.g. created_at DESC>)` and keep or delete
based on the number: `SELECT ... WHERE rn = 1` to read, or `DELETE ... WHERE id IN (SELECT id FROM numbered WHERE rn > 1)` to clean up. Adding a unique
constraint afterwards prevents new duplicates.

### What do `LAG` and `LEAD` do? {junior}

They return a value from a previous (`LAG`) or next (`LEAD`) row in the window order, without a self-join. `LAG(amount) OVER (ORDER BY day)` gives the previous
day's amount, so `amount - LAG(amount) OVER (...)` is the daily change. Optional arguments set the offset and a default for rows that have no predecessor
(otherwise `NULL`).

### How do you compute a running total? {mid}

`SUM(amount) OVER (PARTITION BY account ORDER BY created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. The explicit `ROWS` frame and a unique
`ORDER BY` matter: with the default `RANGE` frame, rows with the same `ORDER BY` value are peers and all get the same total (in a test two sales on the same day
both showed 700 instead of 400 and 700).

### Why does `LAST_VALUE` often return the current row's value? {senior}

Because with `ORDER BY` in `OVER` the default frame is from the start of the partition to the current row (and its peers), so the "last value" in the frame is
the current row. To get the last row of the whole partition, set the frame explicitly: `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`, or use
`FIRST_VALUE` with the order reversed.

### What is a window frame? {mid}

The subset of the partition's rows that a function like `SUM` or `AVG` considers for the current row, defined with `ROWS` (physical rows), `RANGE` (value ranges,
with peers) or `GROUPS`, e.g. `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` for a 3-row moving window. Without `ORDER BY` the frame is the whole partition; with
`ORDER BY` the default is from the start of the partition to the current row, using `RANGE`.

### Why can't you use a window function in `WHERE`? {mid}

Window functions are computed after `WHERE`, `GROUP BY` and `HAVING`, in the `SELECT` phase, because they operate on the rows that remain after filtering and
grouping. So `WHERE ROW_NUMBER() OVER (...) = 1` is an error. You compute the window function in a subquery or CTE and filter in the outer query; some engines
provide `QUALIFY` for this.

### What is the "gaps and islands" problem, and how do window functions solve it? {senior}

It's finding consecutive runs ("islands") in ordered data, e.g. streaks of consecutive active days or ranges of sequential numbers, and the gaps between them. The
trick: within a run, the value and `ROW_NUMBER()` both increase by 1, so `value - ROW_NUMBER()` is constant for the run. Grouping by that difference gives each
island's start, end and length with `MIN`, `MAX` and `COUNT`. `LAG` can also detect where a new island starts.
