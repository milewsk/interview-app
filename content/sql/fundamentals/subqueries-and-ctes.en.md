# Subqueries, CTEs and set operations {mid}

Subqueries and **CTEs** (common table expressions, `WITH`) let you build a query from steps: compute something, then use the result. **Recursive CTEs**
handle hierarchies and graphs, and **set operations** (`UNION`, `INTERSECT`, `EXCEPT`) combine the results of whole queries.

## Kinds of subqueries

```sql
-- scalar: returns one value
SELECT name FROM emp WHERE salary > (SELECT AVG(salary) FROM emp);

-- correlated: refers to the outer row, logically evaluated per row
SELECT e.name FROM emp e
WHERE e.salary > (SELECT AVG(x.salary) FROM emp x WHERE x.dept = e.dept);   -- above their department's average

-- derived table: a subquery in FROM, must have an alias
SELECT d.dept, d.avg_sal
FROM (SELECT dept, AVG(salary) AS avg_sal FROM emp GROUP BY dept) d
WHERE d.avg_sal > 150;

-- IN / EXISTS: membership
SELECT name FROM emp e WHERE EXISTS (SELECT 1 FROM emp s WHERE s.manager_id = e.id);
```

- A scalar subquery that returns **more than one row** is an error in PostgreSQL (`more than one row returned by a subquery used as an expression`) and SQL
  Server, but **SQLite silently takes the first row**.
- A correlated subquery isn't necessarily slow: optimizers often rewrite it into a join. But when it runs per row over a large table, a join with a
  pre-aggregated derived table or a window function is usually better.
- `IN (subquery)` and `EXISTS` usually give the same plan; the difference that matters is `NOT IN` with `NULL`s (see the `NULL` topic).

## CTE: `WITH`

```sql
WITH dept_avg AS (
    SELECT dept, AVG(salary) AS avg_sal FROM emp GROUP BY dept
)
SELECT e.name, e.salary, d.avg_sal
FROM emp e JOIN dept_avg d ON d.dept = e.dept
WHERE e.salary > d.avg_sal;
```

- A CTE is a named subquery visible in the rest of the statement. It improves readability by splitting a query into named steps, and can be referenced
  several times.
- It's not a temporary table: usually the optimizer inlines it like a subquery. In PostgreSQL 12+ a CTE referenced once is inlined, and you can force either
  behavior with `AS MATERIALIZED` / `AS NOT MATERIALIZED`. (Before PostgreSQL 12 CTEs were always materialized, which acted as an "optimization fence".)
- A CTE can also contain `INSERT`/`UPDATE`/`DELETE ... RETURNING` in PostgreSQL (data-modifying CTEs).

## Recursive CTE

```sql
WITH RECURSIVE sub AS (
    SELECT id, name, 0 AS depth FROM emp WHERE name = 'Ann'        -- anchor: the starting rows
    UNION ALL
    SELECT e.id, e.name, s.depth + 1                               -- recursive part: joins with the previous level
    FROM emp e JOIN sub s ON e.manager_id = s.id
)
SELECT name, depth FROM sub;      -- Ann 0, Eve 1, Joe 2
```

- It consists of an **anchor** and a **recursive part** joined by `UNION ALL`. The recursive part runs repeatedly on the rows produced in the previous step
  until it produces no new rows.
- Uses: org charts, category trees, bill of materials, graph paths, generating series of numbers or dates (PostgreSQL also has `generate_series`).
- **Cycles** in the data cause infinite recursion. Protect against them with a depth limit (`WHERE s.depth < 10`), by tracking the visited path, with the
  standard `CYCLE` clause (PostgreSQL 14+: `CYCLE id SET is_cycle USING path`), or with SQL Server's `OPTION (MAXRECURSION n)` (the default limit is 100).
- Dialects: PostgreSQL, MySQL and SQLite require `WITH RECURSIVE`; SQL Server and Oracle just use `WITH`.

## Set operations

| Operation | Result |
|---|---|
| `UNION` | rows from both queries, **duplicates removed** (requires sorting or hashing) |
| `UNION ALL` | all rows, with duplicates, faster |
| `INTERSECT` | rows present in both results |
| `EXCEPT` (`MINUS` in Oracle) | rows from the first result that aren't in the second |

The queries must return the same number of columns with compatible types. Column names come from the first query, and `ORDER BY` applies to the whole result
at the end. Use `UNION ALL` unless you really need deduplication: `UNION` quietly adds a sort or hash step. (In a test: 3 distinct departments with `UNION`,
12 rows with `UNION ALL`.)

## Sources

- [PostgreSQL: WITH queries (CTEs)](https://www.postgresql.org/docs/current/queries-with.html)
- [PostgreSQL: subquery expressions](https://www.postgresql.org/docs/current/functions-subquery.html)
- [PostgreSQL: combining queries (UNION, INTERSECT, EXCEPT)](https://www.postgresql.org/docs/current/queries-union.html)
- [SQL Server: WITH common_table_expression](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql)
- [SQLite: WITH clause](https://www.sqlite.org/lang_with.html)

## Questions

### What is a correlated subquery? {junior}

A subquery that refers to columns of the outer query, so it's logically evaluated separately for each outer row. For example,
`WHERE e.salary > (SELECT AVG(x.salary) FROM emp x WHERE x.dept = e.dept)` compares each employee with their own department's average. Optimizers often turn
it into a join, but on large data sets it's worth checking the plan or rewriting it with a pre-aggregated join or a window function.

### What happens when a scalar subquery returns more than one row? {mid}

In PostgreSQL, SQL Server and most databases it's a runtime error ("more than one row returned by a subquery used as an expression" / "Subquery returned more
than 1 value"). SQLite doesn't complain and silently uses the first row, which can hide a bug. The fix is to guarantee one row (filter by a unique key,
aggregate, or add `LIMIT 1` with an explicit `ORDER BY` when "any one" is really intended).

### How does a CTE differ from a subquery? {mid}

Functionally, a non-recursive CTE is a named subquery: it gives the same results. The differences are readability (the query is built from named steps read top
to bottom), the ability to reference it several times, and recursion, which only CTEs support. Performance depends on the database: modern optimizers usually
inline CTEs, and PostgreSQL lets you control it with `MATERIALIZED` / `NOT MATERIALIZED`.

### Is a CTE a temporary table? {mid}

No. It exists only for the duration of one statement and usually isn't stored at all: the optimizer merges it into the main query. Some databases may
materialize it (PostgreSQL before version 12 always did, and now does so when it's referenced several times or marked `MATERIALIZED`). When an intermediate
result is needed by several statements or should have its own indexes, a temporary table is the right tool.

### How does a recursive CTE work? {mid}

It consists of an anchor query returning the starting rows and a recursive query that refers to the CTE itself, joined by `UNION ALL`. The database runs the
anchor, then repeatedly runs the recursive part on the rows produced in the previous iteration, until an iteration produces no rows. The typical use is
traversing a hierarchy, e.g. all subordinates of a manager with their depth, or a path from an employee to the top.

### How do you protect a recursive CTE from cycles in the data? {senior}

Cyclic data (A manages B, B manages A) makes recursion infinite. Protections: a depth counter with a limit (`WHERE depth < 20`), tracking the visited path (an
array or string) and stopping when an ID repeats, the standard `CYCLE` clause (PostgreSQL 14+), or SQL Server's `MAXRECURSION` option, which by default
stops after 100 levels with an error. Using `UNION` instead of `UNION ALL` helps only when the repeated rows are fully identical.

### How does `UNION` differ from `UNION ALL`? {junior}

`UNION` combines the results and removes duplicate rows, which requires an additional sort or hash operation. `UNION ALL` just appends the results, including
duplicates, so it's faster. Use `UNION ALL` by default, and `UNION` only when duplicates must be removed and can actually occur.

### What do `INTERSECT` and `EXCEPT` do? {junior}

`INTERSECT` returns rows present in the results of both queries, and `EXCEPT` (called `MINUS` in Oracle) returns rows from the first query that aren't in the
second. Both remove duplicates and compare whole rows, treating `NULL`s as equal. They're handy e.g. for comparing two data sets or finding IDs present in one
list but not in another.

### When should you use `EXISTS` instead of `IN`? {mid}

For membership tests (`IN`) they usually produce the same plan. `EXISTS` is preferable for negation, because `NOT IN` returns no rows when the subquery contains a
`NULL`, while `NOT EXISTS` behaves as expected. `EXISTS` also naturally expresses correlated conditions with several columns, and stops at the first match. `IN`
with a short list of constants is clearest for simple filters.

### How do you rewrite a slow correlated subquery? {senior}

Compute the correlated value for all groups at once and join it: e.g. replace `WHERE salary > (SELECT AVG(salary) ... WHERE dept = e.dept)` with a join to
`(SELECT dept, AVG(salary) FROM emp GROUP BY dept)`, or use a window function: `AVG(salary) OVER (PARTITION BY dept)` in a subquery and filter outside. Then the
data is scanned once instead of once per row. Always compare the execution plans, because optimizers often do this rewrite themselves.
