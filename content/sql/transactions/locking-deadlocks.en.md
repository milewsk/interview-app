# Locking, blocking and deadlocks {senior}

Isolation levels describe **what** concurrent transactions may see; **locks** are one of the main mechanisms that enforce it. Locks cause **blocking**
(one transaction waits for another) and sometimes **deadlocks** (transactions wait for each other forever). Interviews expect you to explain both, know how
databases resolve deadlocks and how to design code that avoids them.

## Locks in a nutshell

- **Shared (S)** locks for reading are compatible with each other; **exclusive (X)** locks for writing are compatible with nothing. SQL Server also has
  **update (U)** locks (read now, intend to write, preventing a common deadlock pattern) and **intent** locks on higher levels (IS, IX) that signal locks
  below.
- **Granularity**: row, page, table (and ranges of index keys for `SERIALIZABLE`). SQL Server may **escalate** many row locks to a table lock to save
  memory, which can suddenly block unrelated work. PostgreSQL stores row locks in the rows themselves and doesn't escalate.
- **A writer always takes an exclusive lock on the rows it modifies and holds it until the end of the transaction**, whatever the isolation level. With
  MVCC (PostgreSQL, SQL Server with row versioning) readers don't wait for these locks; with lock-based `READ COMMITTED` (SQL Server's default) they do.
- SQLite locks the **whole database** for writes: a second writer got `database is locked` in a test.

## Explicit row locking

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- lock the row until COMMIT: pessimistic locking
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
COMMIT;
```

| Clause | Behavior |
|---|---|
| `FOR UPDATE` (PostgreSQL, MySQL, Oracle) / `WITH (UPDLOCK, ROWLOCK)` (SQL Server) | lock the selected rows for modification |
| `FOR SHARE` | block others from modifying, allow other shared locks |
| `NOWAIT` | fail immediately instead of waiting if a row is locked |
| `SKIP LOCKED` (PostgreSQL, MySQL 8, Oracle; `READPAST` in SQL Server) | skip locked rows instead of waiting |

`SKIP LOCKED` is the standard way to build a **job queue** in a table: each worker runs
`SELECT ... WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`, so concurrent workers claim different jobs without blocking each other.

**Advisory locks** (PostgreSQL `pg_advisory_lock`, SQL Server `sp_getapplock`) are application-defined locks on arbitrary keys, e.g. "only one instance runs the
nightly job" or "one migration at a time".

## Blocking

Blocking is normal and usually brief. It becomes a problem when a transaction holds locks for long: long-running transactions, waiting for user input or an
HTTP call inside a transaction, missing indexes (an `UPDATE ... WHERE` without an index scans and locks many rows), or lock escalation. Diagnose with
`pg_stat_activity` / `pg_locks` in PostgreSQL, and `sys.dm_exec_requests` / `sys.dm_tran_locks` in SQL Server. Use lock timeouts (`lock_timeout`,
`SET LOCK_TIMEOUT`) so requests fail fast instead of hanging.

## Deadlocks

```text
T1: UPDATE accounts ... WHERE id = 1   (locks row 1)
T2: UPDATE accounts ... WHERE id = 2   (locks row 2)
T1: UPDATE accounts ... WHERE id = 2   → waits for T2
T2: UPDATE accounts ... WHERE id = 1   → waits for T1   ⇒ deadlock
```

- Databases **detect** deadlocks automatically and **abort one transaction** (the victim) so the others can continue. SQL Server returns **error 1205** to the
  victim and by default picks the transaction cheapest to roll back (unless `SET DEADLOCK_PRIORITY` says otherwise); PostgreSQL reports
  `deadlock detected`.
- The victim's work is rolled back, so the application must **catch the error and retry** the transaction.

How to minimize them (following the PostgreSQL and SQL Server guidance):

1. **Access objects and rows in the same order** everywhere, e.g. update accounts in ascending id order in a transfer.
2. **Keep transactions short**, with no user interaction or external calls inside.
3. **Index** the columns used in `WHERE` of updates and deletes, so fewer rows are locked.
4. Use the **lowest suitable isolation level**, and row versioning (`READ_COMMITTED_SNAPSHOT`, snapshot isolation) to avoid reader–writer deadlocks.
5. Lock what you'll update up front (`FOR UPDATE` / `UPDLOCK`), instead of reading with shared locks and upgrading later.

## Sources

- [PostgreSQL: explicit locking (row locks, deadlocks, advisory locks)](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL: SELECT (the locking clause)](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [SQL Server: deadlocks guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide)
- [SQL Server: transaction locking and row versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide)
- [SQLite: file locking and concurrency](https://www.sqlite.org/lockingv3.html)

## Questions

### What is a deadlock? {junior}

A situation in which two or more transactions each hold a lock the other needs and wait for each other, so none of them can proceed. The classic example: T1 locks
row 1 and wants row 2, while T2 locks row 2 and wants row 1. Without intervention they'd wait forever, so the database detects the cycle and aborts one of them.

### How do databases resolve deadlocks? {mid}

A deadlock detector periodically looks for cycles in the wait-for graph of transactions. When it finds one, it chooses a victim, rolls back its transaction and
returns an error (1205 in SQL Server, `deadlock detected` in PostgreSQL), which releases its locks and lets the others continue. SQL Server chooses the transaction
cheapest to roll back, unless `DEADLOCK_PRIORITY` is set. The application must catch the error and retry.

### How do you prevent deadlocks? {mid}

Access tables and rows in a consistent order in all code paths, keep transactions short and free of user interaction or external calls, index the columns used to
find rows for updates so fewer rows are locked, use the lowest isolation level that's correct and row versioning where possible, and lock rows you'll modify up
front instead of upgrading shared locks. Some deadlocks will still happen, so code must retry on the deadlock error.

### How does blocking differ from a deadlock? {junior}

Blocking is one transaction waiting for a lock held by another; it ends when the holder commits or rolls back, so it's normal, though long waits hurt performance. A
deadlock is a cycle of transactions waiting for each other, which never resolves on its own, so the database must abort one of them. Blocking chains can be long
without being deadlocks.

### What does `SELECT ... FOR UPDATE` do? {mid}

It reads rows and locks them for the rest of the transaction as if they were about to be updated, so other transactions can't modify, delete or lock them for update
until commit. It's pessimistic locking: used for read-modify-write sequences that must not be interleaved, e.g. checking a balance and then withdrawing. `NOWAIT` makes
it fail instead of waiting, and `SKIP LOCKED` skips rows that are already locked.

### How do you implement a job queue in a relational database? {senior}

Store jobs in a table and let each worker claim one inside a transaction with `SELECT ... WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`, update
its status (or delete it) and commit. `SKIP LOCKED` makes concurrent workers skip jobs claimed by others instead of waiting, so they don't block each other. Add an
index on the status/order columns, handle crashed workers (a timeout or "locked until" column), and keep the claiming transaction short.

### What is lock escalation in SQL Server? {senior}

When a transaction acquires a very large number of row or page locks on one table, SQL Server may replace them with a single table lock to save memory. That's more
efficient for the transaction, but blocks all other access to the table, so a large batch update can suddenly block unrelated queries. Mitigations: process in smaller
batches, add indexes so fewer rows are locked, or configure escalation per table. PostgreSQL doesn't escalate row locks.

### Why can a missing index cause blocking? {mid}

To find rows for `UPDATE ... WHERE email = ?` without an index, the database scans the table and, depending on the engine and isolation level, may lock or at least
examine many more rows than it changes. That increases lock duration and the number of locked rows, so concurrent transactions collide more often and deadlocks
become more likely. An index lets the statement touch only the target rows.

### What are advisory locks? {senior}

Locks on application-chosen keys rather than on rows or tables, provided by PostgreSQL (`pg_advisory_lock`, `pg_try_advisory_lock`) and SQL Server (`sp_getapplock`).
The database doesn't attach them to data, so their meaning is defined by the application. They're used to coordinate processes, e.g. to ensure only one instance of a
scheduled job or migration runs at a time, without creating a lock table.

### Why does SQLite have trouble with many concurrent writers? {mid}

SQLite allows only one writer at a time for the whole database file: a write transaction takes a database-level lock, and another writer gets `SQLITE_BUSY`
("database is locked") or waits for a busy timeout. WAL mode lets readers work concurrently with the single writer, but writes are still serialized. That's fine for
embedded and low-write workloads, but not for applications with many concurrent writers.
