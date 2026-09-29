# SELECT and the logical order of query processing {junior}

A `SELECT` is written in one order, but **logically evaluated in another**. Understanding that order explains most "why doesn't this work?"
questions: why an alias can't be used in `WHERE`, why aggregates need `HAVING`, and why `ORDER BY` sees things that `WHERE` doesn't.

## Written order vs logical order

```sql
SELECT   customer, SUM(total) AS revenue      -- 5. compute the output columns
FROM     orders                               -- 1. take the rows (with JOINs)
WHERE    total >= 100                         -- 2. filter rows
GROUP BY customer                             -- 3. group
HAVING   SUM(total) > 300                     -- 4. filter groups
ORDER BY revenue DESC                         -- 6. sort (aliases are visible here)
LIMIT    10;                                  -- 7. limit the number of rows
```

The full logical order (as documented e.g. for SQL Server): `FROM` → `ON` → `JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` →
`ORDER BY` → `TOP`/`LIMIT`. Each step sees only what the previous ones produced. The optimizer may execute the query physically in a different order,
but the result must be as if this order were followed.

## Consequences

- **An alias from `SELECT` isn't visible in `WHERE`** (it's computed later): PostgreSQL returns `column "gross" does not exist`. Repeat the expression,
  or wrap the query in a subquery or CTE. MySQL and SQL Server reject it too, but SQLite accepts it, which is why "it worked on my database" happens.
- **An alias is visible in `ORDER BY`**, because sorting happens after `SELECT`.
- In `GROUP BY` an alias works in PostgreSQL, MySQL and SQLite, but **not in SQL Server**, which follows the logical order strictly.
- **Aggregates can't be in `WHERE`** (`aggregate functions are not allowed in WHERE`): `WHERE` filters rows before grouping, and `HAVING` filters groups
  after it. Conditions that don't need aggregates belong in `WHERE`, because they reduce the rows before grouping.
- **Every column in `SELECT` must be in `GROUP BY` or inside an aggregate**. PostgreSQL and SQL Server report an error, MySQL does too by default
  (`ONLY_FULL_GROUP_BY`), and SQLite silently returns a value from an arbitrary row of the group.
- With `SELECT DISTINCT`, `ORDER BY` can only use columns from the select list (PostgreSQL: `for SELECT DISTINCT, ORDER BY expressions must appear in
  select list`).

## Sorting and limiting

- **Without `ORDER BY` the order of rows is undefined**, even if it looks stable. Paging (`LIMIT`/`OFFSET`) always needs a deterministic `ORDER BY`.
- `NULL` placement differs: PostgreSQL treats `NULL` as larger than any value (last in `ASC`), while SQL Server, MySQL and SQLite put `NULL`s first in
  `ASC`. PostgreSQL and SQLite support `NULLS FIRST`/`NULLS LAST` explicitly.
- Limiting rows differs by dialect:

| Dialect | Syntax |
|---|---|
| Standard SQL, PostgreSQL, SQL Server 2012+, Oracle 12c+ | `ORDER BY ... OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY` |
| PostgreSQL, MySQL, SQLite | `LIMIT 5 OFFSET 10` |
| SQL Server | `SELECT TOP (5) ...` |

## Other basics

- `COUNT(*)` counts rows, `COUNT(column)` counts non-`NULL` values, and `COUNT(DISTINCT column)` counts distinct non-`NULL` values (in a test: 5, 3 and 3).
- String comparison depends on the **collation**: PostgreSQL and SQLite compare case-sensitively by default (`'ada' = 'Ada'` is false), while SQL Server
  and MySQL usually use case-insensitive collations.
- `SELECT *` in application code is fragile (new columns change the result, more data is transferred, covering indexes can't be used): list the columns.

## Sources

- [SELECT (PostgreSQL)](https://www.postgresql.org/docs/current/sql-select.html)
- [Logical processing order of SELECT (SQL Server)](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-transact-sql)
- [MySQL: GROUP BY handling (ONLY_FULL_GROUP_BY)](https://dev.mysql.com/doc/refman/8.4/en/group-by-handling.html)
- [SQLite: SELECT](https://www.sqlite.org/lang_select.html)

## Questions

### In what logical order are the clauses of a `SELECT` evaluated? {junior}

`FROM` (with `JOIN`s), then `WHERE`, `GROUP BY`, `HAVING`, `SELECT`, `DISTINCT`, `ORDER BY` and finally `LIMIT`/`TOP`. Each clause works on the result of the
previous ones. This is a logical order that defines the result: the optimizer can physically execute the query differently, as long as the result is the same.

### Why can't you use a column alias from `SELECT` in `WHERE`? {junior}

Because `WHERE` is logically evaluated before `SELECT`, so the alias doesn't exist yet. PostgreSQL and SQL Server report an unknown column. You can repeat the
expression in `WHERE`, or compute it in a subquery or CTE and filter the outer query. The alias does work in `ORDER BY`, which is evaluated after `SELECT`.

### How does `WHERE` differ from `HAVING`? {junior}

`WHERE` filters individual rows before grouping and can't use aggregate functions. `HAVING` filters groups after `GROUP BY` and can use aggregates, e.g.
`HAVING SUM(total) > 300`. Conditions on individual rows should go into `WHERE`, because they reduce the amount of data to group and let the database use
indexes.

### What happens if you select a column that isn't in `GROUP BY` or an aggregate? {mid}

In PostgreSQL and SQL Server it's an error, because one group can contain different values of that column, and it's not clear which one to return. MySQL rejects
it by default (`ONLY_FULL_GROUP_BY`). SQLite accepts it and returns a value from an arbitrary row of the group, which is a common source of silent bugs. The
exception (in PostgreSQL) is a column functionally dependent on a grouped primary key.

### Is the order of rows guaranteed without `ORDER BY`? {junior}

No. Without `ORDER BY` the database may return rows in any order, which can change with the execution plan, data, parallelism or version. If order matters,
including pagination with `LIMIT`/`OFFSET`, you need an explicit `ORDER BY`, ideally ending with a unique column so the order is deterministic.

### How do `COUNT(*)`, `COUNT(column)` and `COUNT(DISTINCT column)` differ? {junior}

`COUNT(*)` counts all rows, including those with `NULL`s. `COUNT(column)` counts only rows where the column isn't `NULL`. `COUNT(DISTINCT column)` counts
distinct non-`NULL` values. For example, for 5 orders of which 3 were shipped, by 3 customers: `COUNT(*) = 5`, `COUNT(shipped_at) = 3`,
`COUNT(DISTINCT customer) = 3`.

### How are `NULL`s sorted? {mid}

It depends on the database: PostgreSQL treats `NULL` as larger than any value, so it's last in ascending order, while SQL Server, MySQL and SQLite treat it as
the smallest, so it's first. PostgreSQL and SQLite (and Oracle) support `NULLS FIRST`/`NULLS LAST` explicitly; in SQL Server you sort by an extra expression,
e.g. `ORDER BY CASE WHEN col IS NULL THEN 1 ELSE 0 END, col`.

### How do you limit the number of rows in different databases? {junior}

The standard is `OFFSET n ROWS FETCH NEXT m ROWS ONLY` (PostgreSQL, SQL Server 2012+, Oracle 12c+). PostgreSQL, MySQL and SQLite also have `LIMIT m OFFSET n`,
and SQL Server has `SELECT TOP (m)`. In all cases, meaningful paging needs an `ORDER BY`; in SQL Server `OFFSET`/`FETCH` is even syntactically part of
`ORDER BY`.

### Is `'abc' = 'ABC'` true? {mid}

It depends on the collation. PostgreSQL and SQLite compare case-sensitively by default, so it's false. SQL Server and MySQL usually use case-insensitive
default collations, so it's true. That's why the same query may return different results on different databases, and why tests on a different engine than
production can mislead. Case-insensitive search can use `ILIKE` or `lower()` (PostgreSQL) or an explicit collation.

### Why is `SELECT *` discouraged in application code? {junior}

It returns all columns, including ones the code doesn't need, so more data is read and transferred, and the database can't answer from a covering index.
The result changes when columns are added or reordered, which can break code relying on column positions. Listing columns explicitly documents what the
query needs. `SELECT *` is fine for ad hoc exploration and in `EXISTS (SELECT * ...)`.
