# Aggregation and grouping {mid}

Aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) collapse many rows into one value. With `GROUP BY` they compute one value per group. Reports,
dashboards and many interview tasks ("revenue per region", "customers with more than 3 orders") are built on this.

## `GROUP BY` and `HAVING`

```sql
SELECT region, product, SUM(qty) AS qty
FROM sales
WHERE status = 'paid'            -- filter rows before grouping
GROUP BY region, product         -- one row per (region, product) pair
HAVING SUM(qty) >= 2             -- filter groups
ORDER BY region, product;
```

- Every column in `SELECT` must be in `GROUP BY` or inside an aggregate.
- You can group by an expression (`GROUP BY qty % 2`, `GROUP BY date_trunc('month', created_at)`).
- An aggregate **without** `GROUP BY` always returns one row, even for an empty table: `COUNT(*) = 0`, `SUM` and `MAX` = `NULL`. With `GROUP BY` an empty
  input gives **zero** rows.

## Conditional aggregation

Pivoting ("paid vs refunded per region") in one pass over the data:

```sql
SELECT region,
       SUM(CASE WHEN status = 'paid' THEN qty * price ELSE 0 END)     AS paid,
       SUM(CASE WHEN status = 'refunded' THEN qty * price ELSE 0 END) AS refunded,
       COUNT(*) FILTER (WHERE status = 'refunded')                    AS refunds   -- standard FILTER clause
FROM sales
GROUP BY region;
```

`CASE` inside an aggregate works everywhere. The standard `FILTER (WHERE ...)` clause is supported by PostgreSQL and SQLite, but not by SQL Server or MySQL.

## Subtotals: `ROLLUP`, `CUBE`, `GROUPING SETS`

```sql
SELECT region, product, SUM(qty) FROM sales GROUP BY ROLLUP (region, product);
-- EU | ink | 2,  EU | pen | 4,  EU | NULL | 6 (subtotal),  ...,  NULL | NULL | 16 (grand total)
```

- `ROLLUP (a, b)` adds subtotals per `a` and a grand total, `CUBE (a, b)` all combinations, and `GROUPING SETS ((a), (b), ())` exactly the chosen groupings.
- In subtotal rows the grouped-away columns are `NULL`. The `GROUPING(col)` function returns 1 in such rows, which distinguishes them from real `NULL`s in
  the data.
- Supported by PostgreSQL, SQL Server and Oracle (MySQL has `WITH ROLLUP`, SQLite none of these).

## Traps

- **Integer division and averages**: `7 / 2` is `3` in PostgreSQL, SQLite and SQL Server. `AVG` of an integer column returns a fractional result in
  PostgreSQL and SQLite (2.67), but an **integer** in SQL Server, so cast first: `AVG(CAST(qty AS decimal(10,2)))`.
- `AVG` and other aggregates ignore `NULL`s (see the `NULL` topic).
- `COUNT(DISTINCT x)` counts distinct non-`NULL` values; for several columns, count distinct combinations with a subquery.
- Joining before aggregating can **multiply rows** and inflate sums (see the joins topic).

## Concatenating values in a group

| Database | Function |
|---|---|
| PostgreSQL | `string_agg(product, ',' ORDER BY product)` |
| SQL Server 2017+ | `STRING_AGG(product, ',') WITHIN GROUP (ORDER BY product)` |
| MySQL | `GROUP_CONCAT(product ORDER BY product SEPARATOR ',')` |
| SQLite | `group_concat(product, ',' ORDER BY product)` (`ORDER BY` inside aggregates since 3.44) |

Without an explicit ordering inside the aggregate, the order of concatenated values is undefined: in a test SQLite returned `pen,ink` and PostgreSQL with
`ORDER BY` returned `ink,pen`.

## Sources

- [PostgreSQL: aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html)
- [PostgreSQL: GROUPING SETS, CUBE and ROLLUP](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUPING-SETS)
- [SQL Server: AVG](https://learn.microsoft.com/en-us/sql/t-sql/functions/avg-transact-sql)
- [SQL Server: GROUP BY (ROLLUP, CUBE, GROUPING SETS)](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-group-by-transact-sql)
- [SQLite: aggregate functions](https://www.sqlite.org/lang_aggfunc.html)

## Questions

### What does `GROUP BY` do? {junior}

It splits rows into groups with the same values of the listed columns or expressions and returns one row per group, in which aggregate functions (`SUM`,
`COUNT`, `AVG`...) are computed over the group's rows. For example, `GROUP BY region` with `SUM(amount)` gives revenue per region. Columns in the select list
must be grouped or aggregated.

### How do you count several different things in one query, e.g. paid and refunded orders per region? {mid}

With conditional aggregation: `SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END)` and a second `SUM` for the other status, or
`COUNT(*) FILTER (WHERE status = 'refunded')` in databases supporting `FILTER`. It computes all the values in one pass over the data, instead of separate
queries or self-joins, and is also the standard way to pivot rows into columns.

### What does an aggregate return on an empty set? {mid}

Without `GROUP BY`, an aggregate query always returns one row: `COUNT(*)` gives 0, and `SUM`, `AVG`, `MIN`, `MAX` give `NULL`. With `GROUP BY`, an empty input
gives no rows at all, because there are no groups. That's why reports use `COALESCE(SUM(x), 0)` and why "no rows" and "a row with zero" need different
handling in application code.

### What are `ROLLUP` and `GROUPING SETS`? {mid}

Extensions of `GROUP BY` that compute several levels of aggregation in one query. `ROLLUP (region, product)` returns sums per region and product, subtotals
per region and a grand total. `CUBE` returns all combinations, and `GROUPING SETS` exactly the listed groupings. In subtotal rows the grouped-away columns
are `NULL`, and `GROUPING(col) = 1` distinguishes them from `NULL`s in the data.

### Why can `AVG` return an unexpected value on an integer column? {mid}

In SQL Server `AVG` over an `int` column returns an `int`, so the average 2.67 is truncated to 2. Integer division (`7 / 2 = 3`) has the same effect in most
databases. Cast to a decimal type before aggregating: `AVG(CAST(qty AS decimal(10,2)))` or `AVG(qty * 1.0)`. PostgreSQL and SQLite return a fractional
average for integers, which is another dialect difference worth knowing.

### How do you find customers with more than 3 orders? {junior}

Group orders by customer and filter the groups with `HAVING`:
`SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 3`. `WHERE` can't be used for this, because it's evaluated before grouping,
when the count doesn't exist yet. To also get the customer names, join the result with the customers table or group by their key and name.

### How do you concatenate values from a group into one string? {mid}

With a string aggregation function, which differs by database: `string_agg(col, ',')` in PostgreSQL, `STRING_AGG(col, ',')` in SQL Server 2017+,
`GROUP_CONCAT(col)` in MySQL and `group_concat(col)` in SQLite. For a deterministic result, specify the order inside the aggregate (`ORDER BY` or
`WITHIN GROUP (ORDER BY ...)`), because otherwise it's undefined.

### How does `COUNT(DISTINCT col)` differ from `COUNT(col)`? {junior}

`COUNT(col)` counts all non-`NULL` values, including repetitions, while `COUNT(DISTINCT col)` counts each distinct non-`NULL` value once. For example, orders
from 3 customers, one of whom ordered twice: `COUNT(customer_id) = 4`, `COUNT(DISTINCT customer_id) = 3`. On large tables `COUNT(DISTINCT)` is more
expensive, because it requires sorting or hashing the values.

### Can you group by an expression? {junior}

Yes: `GROUP BY date_trunc('month', created_at)` groups by month, `GROUP BY qty % 2` by parity, `GROUP BY CASE WHEN total > 100 THEN 'big' ELSE 'small' END`
by category. The same expression is then repeated in `SELECT` (or, in PostgreSQL, MySQL and SQLite, referenced by alias). Grouping by a function of a column
usually prevents using a plain index on that column.

### How do you get the top product per region, not just the maximum value? {senior}

`MAX(qty)` with `GROUP BY region` gives only the value, not the row it belongs to, and you can't simply add `product` to the select list. Use a window function:
number the rows in each region with `ROW_NUMBER() OVER (PARTITION BY region ORDER BY qty DESC)` and keep those with number 1, or use `LATERAL`/`APPLY`. Joining
back on the maximum value also works, but returns several rows on ties.
