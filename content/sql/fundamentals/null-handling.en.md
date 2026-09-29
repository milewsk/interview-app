# NULL and three-valued logic {mid}

`NULL` means **"unknown" or "missing"**, not zero or an empty string. Any comparison with `NULL` gives neither `TRUE` nor `FALSE`, but **`UNKNOWN`**.
SQL uses **three-valued logic**, and most `NULL` bugs come from forgetting it.

## Three-valued logic

| Expression | Result |
|---|---|
| `NULL = NULL`, `NULL <> 1`, `NULL > 0` | `UNKNOWN` |
| `NOT UNKNOWN` | `UNKNOWN` |
| `TRUE OR UNKNOWN` | `TRUE` |
| `FALSE AND UNKNOWN` | `FALSE` |
| `TRUE AND UNKNOWN`, `FALSE OR UNKNOWN` | `UNKNOWN` |

- `WHERE` and `JOIN ... ON` keep only rows where the condition is `TRUE`, so `UNKNOWN` behaves like `FALSE` there.
- `CHECK` constraints reject only `FALSE`, so `UNKNOWN` passes: `CHECK (bonus >= 0)` accepts `NULL`. If a value is required, add `NOT NULL`.
- `CASE WHEN NULL THEN ...` goes to `ELSE`.

## Typical traps

```sql
SELECT * FROM emp WHERE manager_id = NULL;    -- 🔴 always 0 rows
SELECT * FROM emp WHERE manager_id IS NULL;   -- ✅

SELECT * FROM emp WHERE bonus <> 100;         -- rows with bonus = NULL are NOT returned
```

**`NOT IN` with a `NULL` in the subquery returns nothing:**

```sql
-- employees who aren't anybody's manager
SELECT name FROM emp WHERE id NOT IN (SELECT manager_id FROM emp);   -- 🔴 0 rows, because manager_id contains NULL
SELECT name FROM emp e
WHERE NOT EXISTS (SELECT 1 FROM emp s WHERE s.manager_id = e.id);    -- ✅ Cy, Di
```

`id NOT IN (1, 2, NULL)` means `id <> 1 AND id <> 2 AND id <> NULL`, and the last part is always `UNKNOWN`, so no row passes. The fix is `NOT EXISTS` (or
filtering out `NULL`s in the subquery). `IN` with a `NULL` in the list works normally, it just never matches the `NULL`.

## Functions and operators

- `COALESCE(a, b, ...)` returns the first non-`NULL` argument (standard). `ISNULL` (SQL Server), `IFNULL` (MySQL, SQLite) and `NVL` (Oracle) are dialect
  variants for two arguments.
- `NULLIF(a, b)` returns `NULL` when `a = b`, which is used to avoid division by zero: `total / NULLIF(count, 0)`.
- `a IS DISTINCT FROM b` compares treating `NULL` as a normal value (`NULL IS DISTINCT FROM NULL` is false). It's supported by PostgreSQL, SQLite and SQL
  Server 2022+; SQLite also has `IS NOT`, and MySQL has the `<=>` operator (null-safe equality).
- **Arithmetic and concatenation with `NULL` give `NULL`**: `1 + NULL`, `'a' || NULL`. The `CONCAT()` function ignores `NULL`s (`concat('a', NULL, 'b')` =
  `'ab'`) in PostgreSQL, SQL Server and MySQL.
- Oracle treats an empty string `''` as `NULL`; other databases don't.

## Aggregates, grouping and uniqueness

- **Aggregates skip `NULL`s**: for bonuses `100, NULL, 50, NULL`, `SUM = 150`, `AVG = 75` (the average of 2 values, not 4) and `COUNT(bonus) = 2`, while
  `COUNT(*) = 4`. If missing means zero, use `AVG(COALESCE(bonus, 0))` = 37.5.
- `SUM` over only `NULL`s (or no rows) returns `NULL`, not 0, so reports often use `COALESCE(SUM(x), 0)`.
- `GROUP BY` and `DISTINCT` treat all `NULL`s as **one group**.
- A `UNIQUE` constraint allows **many `NULL`s** in PostgreSQL, SQLite, MySQL and Oracle (they're not equal to each other), but **only one** in SQL Server
  (use a filtered unique index `WHERE col IS NOT NULL` there). PostgreSQL 15+ has `UNIQUE NULLS NOT DISTINCT` to allow just one.

## Sources

- [PostgreSQL: comparison functions and operators](https://www.postgresql.org/docs/current/functions-comparison.html)
- [PostgreSQL: conditional expressions (COALESCE, NULLIF)](https://www.postgresql.org/docs/current/functions-conditional.html)
- [SQL Server: IS [NOT] DISTINCT FROM](https://learn.microsoft.com/en-us/sql/t-sql/queries/is-distinct-from-transact-sql)
- [SQLite: NULL handling in SQLite versus other database engines](https://www.sqlite.org/nulls.html)

## Questions

### What does `NULL` mean in SQL, and what does `NULL = NULL` return? {junior}

`NULL` means an unknown or missing value, not zero or an empty string. Comparing anything with `NULL`, including another `NULL`, gives `UNKNOWN`, not `TRUE`,
because two unknown values can't be known to be equal. That's why you check for `NULL` with `IS NULL` / `IS NOT NULL`, and `WHERE col = NULL` never returns
rows.

### What is three-valued logic? {mid}

A logic with three values: `TRUE`, `FALSE` and `UNKNOWN`, the result of comparisons involving `NULL`. `NOT UNKNOWN` is still `UNKNOWN`, `TRUE OR UNKNOWN` is
`TRUE`, and `FALSE AND UNKNOWN` is `FALSE`. `WHERE` keeps only rows where the condition is `TRUE`, while `CHECK` constraints reject only `FALSE`, so a
`NULL` passes a check such as `price > 0`.

### Why can `NOT IN` with a subquery return no rows? {mid}

If the subquery returns at least one `NULL`, `x NOT IN (..., NULL)` expands to `... AND x <> NULL`, which is `UNKNOWN` for every row, so nothing passes the
`WHERE`. For example, finding employees who aren't anyone's manager with `id NOT IN (SELECT manager_id FROM emp)` returns 0 rows when some `manager_id` is
`NULL`. Use `NOT EXISTS`, which isn't affected by `NULL`s, or filter them out in the subquery.

### Why does `WHERE status <> 'closed'` not return rows where `status` is `NULL`? {junior}

Because `NULL <> 'closed'` is `UNKNOWN`, not `TRUE`, and `WHERE` keeps only `TRUE`. If rows with a missing status should be included, add it explicitly:
`WHERE status <> 'closed' OR status IS NULL`, or use `status IS DISTINCT FROM 'closed'`.

### How do aggregate functions handle `NULL`? {mid}

They ignore `NULL`s: `SUM`, `AVG`, `MIN`, `MAX` and `COUNT(column)` consider only non-`NULL` values, and `COUNT(*)` counts all rows. So `AVG` is the average of
the known values, not of all rows, and `SUM` over no non-`NULL` values returns `NULL`, not 0. If missing values should count as zero, use `COALESCE` inside
the aggregate, and `COALESCE(SUM(x), 0)` for the result.

### What are `COALESCE` and `NULLIF` for? {junior}

`COALESCE(a, b, c)` returns the first non-`NULL` argument, e.g. a default value: `COALESCE(nickname, first_name)`. `NULLIF(a, b)` returns `NULL` when the
arguments are equal, and `a` otherwise; the typical use is avoiding division by zero: `total / NULLIF(quantity, 0)` gives `NULL` instead of an error.

### How do you compare two columns that may contain `NULL`s? {mid}

`a = b` gives `UNKNOWN` when either is `NULL`, so two `NULL`s aren't considered equal. The null-safe comparison is `a IS NOT DISTINCT FROM b` (PostgreSQL,
SQLite, SQL Server 2022+), `a <=> b` in MySQL, or manually: `(a = b OR (a IS NULL AND b IS NULL))`. It matters e.g. when detecting changed rows during data
synchronization.

### Can a column with a `UNIQUE` constraint contain several `NULL`s? {mid}

It depends on the database. In PostgreSQL, MySQL, SQLite and Oracle yes, because `NULL`s aren't equal to each other. SQL Server allows only one `NULL` in a
unique constraint, so a filtered unique index (`WHERE col IS NOT NULL`) is used when many rows may lack a value. PostgreSQL 15+ lets you choose
`NULLS NOT DISTINCT` to allow only one.

### What does `1 + NULL` or `'abc' || NULL` return? {junior}

`NULL`: almost every operator with a `NULL` argument returns `NULL`, because the result is unknown. This often surprises in concatenation, e.g.
`first_name || ' ' || middle_name` becomes `NULL` when there's no middle name. Use `COALESCE` for each part, or the `CONCAT()` function, which treats `NULL`
as an empty string in PostgreSQL, SQL Server and MySQL.

### How are `NULL`s treated by `GROUP BY` and `DISTINCT`? {mid}

Unlike comparisons, grouping and `DISTINCT` treat all `NULL`s as equal, so they form one group and count as one distinct value. For example,
`GROUP BY manager_id` returns one row for all employees without a manager. The same holds for set operations like `UNION`, which removes duplicate rows
containing `NULL`s.
