# Views, stored procedures, functions and triggers {mid}

Besides tables, a database can hold **logic**: named queries (views), code executed on demand (procedures and functions) and code executed automatically
on data changes (triggers). Interviews check what each one is for, their pitfalls, and the classic question: should business logic live in the database?

## Views

```sql
CREATE VIEW active_accounts AS
SELECT id, owner, balance FROM accounts WHERE active
WITH CHECK OPTION;
```

- A view is a **stored query**, not stored data: each time it's queried, the underlying query runs on the current data. In a test, changing a balance in the
  table was immediately visible through the view.
- Uses: simplifying complex joins, a stable interface for reporting or other teams, exposing only some columns or rows (security).
- **Simple views** (one table, no aggregates or `DISTINCT`) are updatable in PostgreSQL, SQL Server and MySQL: an `UPDATE` through the view changes the base
  table. `WITH CHECK OPTION` rejects changes that would make the row invisible through the view.
- Views on views on views hide the real cost of queries and make optimization harder.

## Materialized views

```sql
CREATE MATERIALIZED VIEW totals AS SELECT SUM(balance) AS total FROM accounts;
REFRESH MATERIALIZED VIEW totals;          -- PostgreSQL: recompute (CONCURRENTLY avoids blocking readers, needs a unique index)
```

A materialized view **stores the result** like a table, so reading it is fast, but it shows a snapshot: in a test it returned the old total until
`REFRESH`. It's used for expensive reports and aggregates that can be slightly stale. PostgreSQL and Oracle have materialized views; SQL Server has
**indexed views**, which the engine maintains automatically on every change (with many restrictions), and MySQL has neither.

## Functions and stored procedures

```sql
CREATE FUNCTION balance_of(p_id int) RETURNS numeric LANGUAGE sql STABLE
AS $$ SELECT balance FROM accounts WHERE id = p_id $$;

CREATE PROCEDURE transfer(p_from int, p_to int, p_amount numeric) LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT balance FROM accounts WHERE id = p_from) < p_amount THEN
        RAISE EXCEPTION 'insufficient funds';
    END IF;
    UPDATE accounts SET balance = balance - p_amount WHERE id = p_from;
    UPDATE accounts SET balance = balance + p_amount WHERE id = p_to;
END $$;

CALL transfer(1, 2, 30);
```

| | Function | Stored procedure |
|---|---|---|
| Called | inside queries (`SELECT balance_of(2)`) | as a statement (`CALL`, `EXEC`) |
| Returns | a value or a table | nothing or output parameters / result sets |
| Side effects | in SQL Server not allowed to modify data; in PostgreSQL allowed | allowed |
| Transaction control | no | PostgreSQL 11+ and SQL Server procedures can commit/roll back |

Pros of procedures: fewer round trips for multi-step operations, logic close to the data, a permission boundary (grant `EXECUTE` without table access),
plan reuse. Cons: logic split between two places, harder testing, versioning and debugging, vendor-specific languages (T-SQL, PL/pgSQL) that tie you to
one database, and the database becomes a harder-to-scale bottleneck. Modern applications usually keep business logic in the application and use procedures
selectively (data-heavy batch operations, integration with legacy systems).

## Triggers

```sql
CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_touch BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch();
```

- `BEFORE` triggers can change or reject the row (set `updated_at`, validate); `AFTER` triggers react to completed changes (audit, denormalized counters).
- **Row-level vs statement-level**: PostgreSQL supports both (`FOR EACH ROW` / `FOR EACH STATEMENT`), MySQL and SQLite only row-level. **SQL Server triggers fire
  once per statement**, with all affected rows in the `inserted` and `deleted` pseudo-tables, so a trigger written as if for one row is a classic bug.
- A trigger runs **in the same transaction** as the statement: if it fails, the change is rolled back, and it slows every write. In a test, one `UPDATE` of 4
  rows fired the audit trigger 4 times.
- Downsides: "invisible" logic that surprises developers, cascades of triggers, harder debugging and bulk operations. Good uses: audit trails, maintaining
  `updated_at`, enforcing rules that must hold regardless of which application writes the data.

## Sources

- [PostgreSQL: CREATE VIEW (updatable views)](https://www.postgresql.org/docs/current/sql-createview.html)
- [PostgreSQL: materialized views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [PostgreSQL: CREATE PROCEDURE](https://www.postgresql.org/docs/current/sql-createprocedure.html)
- [PostgreSQL: triggers](https://www.postgresql.org/docs/current/trigger-definition.html)
- [SQL Server: CREATE TRIGGER (DML triggers)](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-trigger-transact-sql)
- [SQL Server: indexed views](https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views)

## Questions

### What is a view, and does it store data? {junior}

A view is a named, stored `SELECT` that can be queried like a table. It doesn't store data: every query on the view runs its underlying query on the current
data of the base tables. Views simplify complex queries, provide a stable interface and can restrict which rows and columns users see. Materialized views are
the exception that does store the result.

### How does a view differ from a materialized view? {mid}

A regular view is only a query definition, so it always shows current data but costs as much as the query each time. A materialized view stores the result
physically, so reads are fast, but the data is a snapshot that must be refreshed (`REFRESH MATERIALIZED VIEW` in PostgreSQL) and can be stale in between. SQL
Server's indexed views are materialized too, but are updated automatically with every change to the base tables.

### Can you modify data through a view? {mid}

Yes, if it's a simple view: based on one table, without aggregates, `GROUP BY`, `DISTINCT` or set operations. Then `INSERT`, `UPDATE` and `DELETE` on the view
change the base table. `WITH CHECK OPTION` rejects changes that would produce rows not visible through the view. More complex views can be made writable with
`INSTEAD OF` triggers.

### How does a stored procedure differ from a function? {mid}

A function returns a value (or a table) and is called inside queries, e.g. in `SELECT` or `WHERE`; in SQL Server it can't modify data. A procedure is called
as a separate statement (`CALL` / `EXEC`), may modify data, return result sets or output parameters, and in PostgreSQL 11+ and SQL Server can control
transactions. Functions are for computations reused in queries, procedures for operations.

### Should business logic live in stored procedures? {senior}

Usually not as the default. Logic in the application is easier to test, version, debug, deploy and scale, and it isn't tied to one vendor's language. Procedures
make sense for data-intensive operations where moving data to the application is expensive, for enforcing rules in databases shared by many applications, as
a permission boundary, or in existing systems built that way. The key is consistency, so logic isn't scattered between the two layers.

### What is a trigger, and what is it used for? {junior}

Code that the database runs automatically before or after `INSERT`, `UPDATE` or `DELETE` on a table. Typical uses are audit logs (recording old and new
values), maintaining `updated_at`, enforcing complex integrity rules and keeping denormalized data (counters, summaries) in sync. It runs in the same transaction
as the triggering statement.

### What are the downsides of triggers? {mid}

They're invisible from application code, so developers are surprised by side effects; they slow down every write, because they run inside the transaction
(a row trigger runs for each affected row); they can cascade into other triggers; and they complicate bulk operations, migrations and debugging. They should be
small, fast and documented, and used only where database-level enforcement is truly needed.

### How do triggers in SQL Server differ from those in PostgreSQL or MySQL? {senior}

SQL Server DML triggers fire once per statement, not once per row: all affected rows are available in the `inserted` and `deleted` pseudo-tables. A trigger that
reads a single value (`SELECT @id = id FROM inserted`) works for one row and silently mishandles multi-row updates. PostgreSQL offers both `FOR EACH ROW` and
`FOR EACH STATEMENT` (with transition tables), while MySQL and SQLite have only row-level triggers with `OLD`/`NEW`.

### How do `BEFORE` and `AFTER` triggers differ? {mid}

A `BEFORE` trigger runs before the row is written, so it can modify the new values (e.g. set `updated_at`, normalize text) or reject the operation. An `AFTER`
trigger runs after the change is applied, so it sees the final state and is used for actions depending on it, such as writing to an audit table. SQL Server has
`AFTER` and `INSTEAD OF` triggers, but not `BEFORE`.

### What are the advantages of stored procedures for security and performance? {mid}

Security: you can grant `EXECUTE` on a procedure without granting access to the underlying tables, so users can perform only defined operations, and parameters
protect against SQL injection. Performance: a multi-step operation runs in one round trip, close to the data, and its execution plan can be cached. The same
benefits can often be achieved with parameterized queries and transactions in the application, so they're not a reason on their own.
