# Joins {mid}

A join combines rows from two tables based on a condition. Interviews check not only the types of joins, but mostly their **side effects**: which
rows disappear, where `NULL`s appear and when rows get **multiplied**.

Example data: customers Ada (orders 10, 11), Bob (order 12), Cy (no orders), and order 13 pointing at a nonexistent customer 99.

## Join types

| Join | Result |
|---|---|
| `INNER JOIN` | only pairs that match the condition: Ada-10, Ada-11, Bob-12 |
| `LEFT [OUTER] JOIN` | all rows from the left table + matches, `NULL`s when there's none: also Cy-`NULL` |
| `RIGHT [OUTER] JOIN` | all rows from the right table: also `NULL`-13 |
| `FULL [OUTER] JOIN` | all rows from both sides: Cy-`NULL` and `NULL`-13 |
| `CROSS JOIN` | the Cartesian product: every row with every row (3 × 4 = 12) |

`RIGHT JOIN` is rarely used in practice (you swap the tables and use `LEFT`). `FULL OUTER JOIN` isn't supported by MySQL (emulated with `UNION` of two
outer joins), while SQLite has had `RIGHT` and `FULL` since version 3.39.

## `ON` vs `WHERE` in an outer join

```sql
-- all customers, with their paid orders (if any)
SELECT c.name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid';     -- Ada-10, Bob-12, Cy-NULL

-- 🔴 the WHERE filter removes rows with NULLs: the LEFT JOIN became an INNER JOIN
SELECT c.name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid';                                              -- Ada-10, Bob-12 (Cy is gone)
```

For an `INNER JOIN` it doesn't matter where the condition is. For an outer join, a condition on the optional table belongs in `ON`, because `WHERE` runs
after the join and rejects rows where that table's columns are `NULL`.

## Semi-join and anti-join

```sql
-- anti-join: customers without orders
SELECT c.name FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;                                                   -- Cy

-- or, often clearer:
SELECT c.name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- semi-join: customers who have a paid order, each once
SELECT c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'paid');
```

Using `JOIN` just to check whether a related row exists **duplicates** the left rows (Ada appears twice, once per order), which people then "fix" with
`DISTINCT`. `EXISTS` expresses the intent directly and doesn't duplicate anything.

## Row multiplication (fan-out)

```sql
-- 🔴 order 10 has two payments, so it's counted twice: Ada = 400 instead of 300
SELECT c.name, SUM(o.total)
FROM customers c
JOIN orders o ON o.customer_id = c.id
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY c.name;

-- ✅ aggregate the "many" side first, then join one row per order
SELECT c.name, SUM(o.total) AS order_total, SUM(pp.paid) AS paid
FROM customers c
JOIN orders o ON o.customer_id = c.id
LEFT JOIN (SELECT order_id, SUM(amount) AS paid FROM payments GROUP BY order_id) pp ON pp.order_id = o.id
GROUP BY c.name;                                                      -- Ada 300 | 100
```

When a query joins two independent one-to-many relationships (orders and payments, or order lines and shipments) and then aggregates, the sums get
multiplied. Aggregate each branch separately in a subquery or CTE, then join the results.

## Other useful forms

- **Self-join**: a table joined with itself, e.g. employees with their managers (`emp e LEFT JOIN emp m ON m.id = e.manager_id`).
- **`LATERAL`** (PostgreSQL, MySQL 8.0.14+) / **`CROSS APPLY`, `OUTER APPLY`** (SQL Server): a subquery that can refer to columns of the preceding table,
  e.g. the latest order of each customer (`LEFT JOIN LATERAL (... ORDER BY id DESC LIMIT 1) ON true`).
- `USING (col)` and `NATURAL JOIN` join on columns with the same names. `NATURAL JOIN` is risky, because adding a column with a matching name silently
  changes the join condition.
- Rows with `NULL` in the join key **never match** (`NULL = NULL` is unknown), not even with another `NULL`.

## Sources

- [PostgreSQL: joins between tables](https://www.postgresql.org/docs/current/tutorial-join.html)
- [PostgreSQL: table expressions (joined tables, LATERAL)](https://www.postgresql.org/docs/current/queries-table-expressions.html)
- [SQL Server: joins](https://learn.microsoft.com/en-us/sql/relational-databases/performance/joins)
- [SQLite: SELECT (join operators)](https://www.sqlite.org/lang_select.html)

## Questions

### How does `INNER JOIN` differ from `LEFT JOIN`? {junior}

`INNER JOIN` returns only rows that have a match in both tables. `LEFT JOIN` returns all rows from the left table, and for those without a match it fills the
right table's columns with `NULL`s. For example, customers `LEFT JOIN` orders also returns customers who have never ordered, with `NULL` in the order
columns.

### What is a `FULL OUTER JOIN`, and when is it useful? {mid}

It returns all rows from both tables: matched pairs, left rows without a match (with `NULL`s on the right) and right rows without a match (with `NULL`s on the
left). It's useful for comparing two data sets, e.g. reconciling records from two systems and finding what's missing on either side. MySQL doesn't support it
directly; it's emulated with a `UNION` of a `LEFT` and a `RIGHT` join.

### Does it matter whether a condition goes into `ON` or `WHERE`? {mid}

For an `INNER JOIN`, no. For an outer join, yes: a condition in `ON` decides which rows of the optional table are joined, while the preserved table keeps all
its rows. The same condition in `WHERE` runs after the join, rejects rows where the optional table's columns are `NULL`, and turns the `LEFT JOIN` into an
`INNER JOIN` in effect. Conditions on the optional table belong in `ON`.

### How do you find rows that have no match in another table? {junior}

An anti-join: either `LEFT JOIN` and `WHERE right.id IS NULL`, or `WHERE NOT EXISTS (SELECT 1 FROM right WHERE right.fk = left.id)`. Both return, for example,
customers without orders. `NOT IN (SELECT fk FROM right)` also works, but returns no rows if the subquery contains a `NULL`, so `NOT EXISTS` is the safer
default.

### Why can sums be too large after joining several tables? {mid}

Because each join to a one-to-many table multiplies the rows: if an order has two payments, the order appears twice, and `SUM(order.total)` counts it twice.
It happens especially when joining two independent "many" relationships of the same parent. The fix is to aggregate each child table in a subquery or CTE first
(one row per parent), and then join those results.

### How does a semi-join with `EXISTS` differ from a `JOIN`? {mid}

A `JOIN` returns one row for each match, so a customer with three orders appears three times, and you need `DISTINCT` to deduplicate. `EXISTS` only checks
whether at least one matching row exists, returns each left row at most once, and lets the database stop searching at the first match. It expresses "has at
least one" directly.

### What is a `CROSS JOIN`? {junior}

The Cartesian product: every row of the first table combined with every row of the second, without a condition, so 3 × 4 rows give 12. It's used deliberately
to generate combinations, e.g. every product with every size, or every day of a calendar with every store, before a `LEFT JOIN` with actual data. Accidentally
omitting a join condition produces the same effect.

### What is a self-join? {junior}

Joining a table with itself using two aliases, used for hierarchical or related rows in the same table. The classic example is employees and managers:
`FROM emp e LEFT JOIN emp m ON m.id = e.manager_id` returns each employee with the name of their manager (and `NULL` for the top boss). Deeper hierarchies
need a recursive CTE.

### What are `LATERAL` and `CROSS APPLY` for? {senior}

They allow a subquery in `FROM` to refer to columns of the tables before it, so it's evaluated per row. The typical use is "top N per group": the latest order
of each customer, `LEFT JOIN LATERAL (SELECT ... WHERE o.customer_id = c.id ORDER BY created_at DESC LIMIT 1) ON true` in PostgreSQL, or `OUTER APPLY`
with `TOP (1)` in SQL Server. An alternative is a window function (`ROW_NUMBER()`) with filtering.

### Do rows with `NULL` in the join column ever match? {mid}

No. The join condition `a.k = b.k` is `UNKNOWN` when either side is `NULL`, even when both are `NULL`, and joins keep only `TRUE` results. So rows with a
missing foreign key are dropped by an `INNER JOIN` and appear with `NULL`s in an outer join. If `NULL`s should match each other, use `IS NOT DISTINCT FROM` in
the condition, which usually prevents the use of indexes.
