# Modifying data: INSERT, UPDATE, DELETE, upsert {mid}

Data modification statements (DML) look simple, but interviews check the details: updating based on another table, **upsert** ("insert or update"),
returning changed rows, the difference between `DELETE` and `TRUNCATE`, and concurrency traps.

## `INSERT`

```sql
INSERT INTO products (sku, name, price) VALUES ('A', 'Pen', 2), ('B', 'Ink', 5);   -- multi-row insert
INSERT INTO products (sku, name, price)
SELECT u.sku, 'New', u.new_price FROM price_updates u
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = u.sku);                    -- INSERT ... SELECT
```

Always list the target columns: the statement then doesn't depend on the column order, and omitted columns get their `DEFAULT` values.

## `UPDATE` and `DELETE` based on another table

| Database | Update with a join |
|---|---|
| PostgreSQL, SQLite 3.33+ | `UPDATE products SET price = u.new_price FROM price_updates u WHERE u.sku = products.sku` |
| SQL Server | `UPDATE p SET price = u.new_price FROM products p JOIN price_updates u ON u.sku = p.sku` |
| MySQL | `UPDATE products p JOIN price_updates u ON u.sku = p.sku SET p.price = u.new_price` |
| standard | `UPDATE products SET price = (SELECT ...) WHERE EXISTS (SELECT ...)` or `MERGE` |

- In standard SQL (and PostgreSQL, SQLite, SQL Server) all expressions on the right side of `SET` use the **old** values, so `SET a = b, b = a` swaps two
  columns (verified: 10, 20 → 20, 10). **MySQL evaluates single-table assignments from left to right**, so the same statement sets both to 20.
- `UPDATE` or `DELETE` **without `WHERE`** changes every row. A safe habit: first run the `SELECT` with the same `WHERE`, and run changes inside a transaction.
- Large updates and deletes are often done in batches (e.g. 5,000 rows at a time) to limit locks, transaction log growth and replication lag.

## Returning changed rows

- PostgreSQL and SQLite 3.35+: `... RETURNING id, price` after `INSERT`, `UPDATE`, `DELETE` (and `MERGE` in PostgreSQL).
- SQL Server: `OUTPUT inserted.id, deleted.price` (the `inserted` and `deleted` pseudo-tables hold new and old values).
- MySQL has no `RETURNING`; the generated key is read with `LAST_INSERT_ID()`.

This returns generated keys and computed values without a second query.

## Upsert: insert or update

```sql
-- PostgreSQL, SQLite
INSERT INTO products (sku, name, price, stock) VALUES ('A', 'Pen v2', 2.75, 10)
ON CONFLICT (sku) DO UPDATE
SET price = excluded.price,                     -- excluded = the row that was proposed for insertion
    stock = products.stock + excluded.stock;

INSERT INTO products (sku, name, price) VALUES ('B', 'dup', 0) ON CONFLICT DO NOTHING;
```

| Database | Syntax |
|---|---|
| PostgreSQL, SQLite | `INSERT ... ON CONFLICT (key) DO UPDATE / DO NOTHING` |
| MySQL | `INSERT ... ON DUPLICATE KEY UPDATE col = VALUES(col)` (or a row alias in 8.0.19+) |
| SQL Server, Oracle, PostgreSQL 15+ | `MERGE INTO target USING source ON ... WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT ...` |

- `ON CONFLICT` requires a **unique constraint or index** on the conflict columns and is atomic: two concurrent upserts of the same key don't both insert.
- The "check then insert" pattern in application code (`SELECT`, then `INSERT` if not found) is a **race condition**: two requests can both see no row and
  both insert, producing a duplicate or a unique-key error. Use the database's upsert, or at least a unique constraint plus retry.
- SQL Server's `MERGE` as an upsert under concurrency needs the `HOLDLOCK` (serializable) hint to avoid unique-key violations, and Microsoft's documentation
  warns that at scale `MERGE` can introduce complicated concurrency issues. Separate `UPDATE` then `INSERT` statements in a transaction are a common
  alternative.

## `DELETE` vs `TRUNCATE`

| | `DELETE` | `TRUNCATE` |
|---|---|---|
| `WHERE` | yes | no, always the whole table |
| Speed on large tables | removes row by row, logs each row | deallocates data pages, very fast |
| Triggers | `DELETE` triggers fire | row triggers don't fire |
| Identity / sequence | continues | usually reset (SQL Server; in PostgreSQL with `RESTART IDENTITY`) |
| Rollback | yes | yes in PostgreSQL and SQL Server (verified in PostgreSQL); in MySQL it causes an implicit commit |
| Foreign keys | checked per row | not allowed if the table is referenced (unless `CASCADE` in PostgreSQL) |

SQLite has no `TRUNCATE` (`DELETE FROM t` without `WHERE` is optimized instead).

## Sources

- [PostgreSQL: INSERT (ON CONFLICT)](https://www.postgresql.org/docs/current/sql-insert.html)
- [PostgreSQL: MERGE](https://www.postgresql.org/docs/current/sql-merge.html)
- [SQL Server: MERGE](https://learn.microsoft.com/en-us/sql/t-sql/statements/merge-transact-sql)
- [SQL Server: OUTPUT clause](https://learn.microsoft.com/en-us/sql/t-sql/queries/output-clause-transact-sql)
- [MySQL: UPDATE](https://dev.mysql.com/doc/refman/8.4/en/update.html)
- [SQLite: UPSERT](https://www.sqlite.org/lang_upsert.html)

## Questions

### How do you update rows based on data from another table? {mid}

With a join in `UPDATE`, whose syntax differs by database: `UPDATE t SET ... FROM other WHERE other.key = t.key` in PostgreSQL and SQLite,
`UPDATE t SET ... FROM t JOIN other ON ...` in SQL Server, `UPDATE t JOIN other ON ... SET ...` in MySQL. The portable form uses a correlated subquery in `SET`
with `WHERE EXISTS`, or `MERGE`. Always check that the join doesn't match several source rows per target row, because then the result is ambiguous.

### What is an upsert, and how do you do it safely? {mid}

"Insert, or update if it already exists." Safely means atomically, in the database: `INSERT ... ON CONFLICT (key) DO UPDATE` in PostgreSQL and SQLite,
`INSERT ... ON DUPLICATE KEY UPDATE` in MySQL, `MERGE` (with `HOLDLOCK`) in SQL Server. It requires a unique constraint on the key. Doing `SELECT` and then
`INSERT` in application code is a race condition: two concurrent requests can both decide to insert.

### What does `excluded` mean in `ON CONFLICT DO UPDATE`? {mid}

It's a pseudo-table containing the row that was proposed for insertion but caused the conflict. So `SET price = excluded.price` takes the new value, while
`products.stock + excluded.stock` combines the existing and the new value, e.g. to add stock. The existing row is referred to by the table name (or alias).
MySQL's equivalent is `VALUES(col)` or a row alias.

### How do you get the ID of a newly inserted row? {junior}

Without a second query: `INSERT ... RETURNING id` in PostgreSQL and SQLite 3.35+, `OUTPUT inserted.id` in SQL Server, and `LAST_INSERT_ID()` in MySQL. Avoid
`SELECT MAX(id)` after inserting, because another session may insert in between, and in SQL Server prefer `SCOPE_IDENTITY()` or `OUTPUT` over `@@IDENTITY`,
which can return a key generated by a trigger.

### How does `DELETE` differ from `TRUNCATE`? {mid}

`DELETE` removes rows one by one, can have a `WHERE`, fires triggers and logs every row. `TRUNCATE` always empties the whole table by deallocating its pages,
so it's much faster, doesn't fire row triggers, usually resets identity counters and can't be used on a table referenced by foreign keys. It can be rolled
back in PostgreSQL and SQL Server, but in MySQL it causes an implicit commit.

### What does `UPDATE t SET a = b, b = a` do? {senior}

In standard SQL, PostgreSQL, SQL Server and SQLite, every expression on the right side of `SET` sees the values from before the update, so the columns are
swapped. MySQL evaluates single-table assignments from left to right, so `a` gets `b`'s value first and then `b` gets the new `a`, and both end up equal. It's a
good example of dialect differences that code relying on "standard behavior" can hit.

### Why is "check if exists, then insert" a bug? {mid}

Between the `SELECT` that finds nothing and the `INSERT`, another transaction can insert the same key, because a plain read doesn't lock the non-existent row
(at default isolation levels). The result is a duplicate or a unique-key violation under load. The fix is a unique constraint plus the database's atomic upsert,
or catching the unique violation and retrying or updating.

### How do you safely delete or update millions of rows? {senior}

In batches: repeatedly delete or update a limited number of rows (`DELETE ... WHERE id IN (SELECT id ... LIMIT 5000)`, `DELETE TOP (5000)` in SQL Server) in
separate transactions until nothing is left. One huge statement holds locks for a long time, grows the transaction log, can block other users and
replication, and a failure rolls everything back. If the whole table goes away, `TRUNCATE` or dropping a partition is faster.

### What does `MERGE` do? {mid}

It joins a target table with a source (a table, subquery or values list) and, in one statement, performs different actions depending on whether rows match:
`WHEN MATCHED THEN UPDATE` or `DELETE`, `WHEN NOT MATCHED THEN INSERT`, and in SQL Server also `WHEN NOT MATCHED BY SOURCE`. It's used for synchronizing
tables and upserts. It's available in SQL Server, Oracle and PostgreSQL 15+; in SQL Server it needs care with concurrency (`HOLDLOCK`).

### How do you protect yourself from an `UPDATE` without `WHERE`? {junior}

Write and run the corresponding `SELECT` with the same `WHERE` first, check the number of rows, and run the change in an explicit transaction so it can be rolled
back if the affected row count is wrong. Tools and settings help too: MySQL's `sql_safe_updates`, code review of migration scripts, and restricted production
access. Backups and point-in-time recovery are the last line of defense.
