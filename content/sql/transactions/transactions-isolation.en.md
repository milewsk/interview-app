# Transactions, ACID and isolation levels {mid}

A transaction groups several operations into one unit: either **all** of them take effect, or **none**. Isolation levels define how concurrent transactions
see each other's changes. It's one of the most frequently asked database topics, because it's where correctness bugs under load come from.

## ACID

- **Atomicity**: all or nothing. In a test, a transfer whose second `UPDATE` violated `CHECK (balance >= 0)` was rolled back entirely, and both balances
  stayed unchanged (100 and 0).
- **Consistency**: a transaction moves the database from one valid state to another, respecting constraints.
- **Isolation**: concurrent transactions don't interfere with each other more than the isolation level allows.
- **Durability**: once committed, changes survive a crash (thanks to the write-ahead log / transaction log).

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;            -- or ROLLBACK
```

- Without an explicit `BEGIN`, most databases run each statement in its own transaction (**autocommit**).
- **Savepoints** allow a partial rollback: `SAVEPOINT s1; ...; ROLLBACK TO SAVEPOINT s1;` undoes only the work after the savepoint (verified: the balance
  returned to 90, not 0).
- In PostgreSQL, after any error inside a transaction, every further statement fails with `current transaction is aborted, commands ignored until end of
  transaction block` until `ROLLBACK` (or a rollback to a savepoint).

## Concurrency anomalies

| Anomaly | What happens |
|---|---|
| **Dirty read** | reading data another transaction hasn't committed (it may still roll back) |
| **Non-repeatable read** | reading the same row twice in one transaction gives different values, because another transaction committed a change in between |
| **Phantom read** | re-running a query returns new or missing rows, because another transaction inserted or deleted matching rows |
| **Lost update** | two transactions read a value and both write a value computed from it; one change is overwritten |
| **Write skew** | two transactions read overlapping data, make decisions and write different rows, together breaking a rule (e.g. both doctors go off call) |

## Isolation levels (SQL standard)

| Level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| Read uncommitted | possible | possible | possible |
| **Read committed** | prevented | possible | possible |
| Repeatable read | prevented | prevented | possible |
| Serializable | prevented | prevented | prevented (and all other anomalies) |

Implementations differ from the standard:

- **PostgreSQL**: default `READ COMMITTED`; `READ UNCOMMITTED` behaves like `READ COMMITTED` (no dirty reads at all); `REPEATABLE READ` is snapshot isolation and
  also prevents phantoms; `SERIALIZABLE` (SSI) detects anomalies and aborts a transaction with a **serialization failure**. When two repeatable read transactions
  update the same row, the second fails with `could not serialize access due to concurrent update`, and the application must **retry** the whole transaction.
- **SQL Server**: default `READ COMMITTED` using **shared locks** (readers and writers block each other), unless the database has `READ_COMMITTED_SNAPSHOT` on,
  which uses row versioning (the default in Azure SQL Database). It also has a `SNAPSHOT` level (requires `ALLOW_SNAPSHOT_ISOLATION`). `READ UNCOMMITTED` equals
  `NOLOCK` and allows dirty reads.
- **MySQL InnoDB**: default `REPEATABLE READ` with consistent snapshots.
- **SQLite**: transactions are serializable; in WAL mode a read transaction sees a snapshot. In a test with two connections, a reader didn't see an uncommitted
  change (no dirty read), kept seeing 100 inside its transaction after the other connection committed 150, and saw 150 after committing. A second writer got
  `database is locked`.

## MVCC vs locking

**MVCC** (multi-version concurrency control, used by PostgreSQL, Oracle, MySQL InnoDB and SQL Server with snapshot options) keeps old row versions, so readers
see a consistent snapshot and **readers don't block writers, writers don't block readers**. Lock-based isolation (classic SQL Server `READ COMMITTED`) makes
readers wait for writers. Writers modifying the same row always conflict, whatever the model.

## Lost updates in application code

```text
A: SELECT balance → 100          B: SELECT balance → 100
A: UPDATE SET balance = 110      B: UPDATE SET balance = 120      → final 120, A's +10 is lost (verified: expected 130, got 120)
```

Default `READ COMMITTED` doesn't prevent this. Solutions:

1. **Atomic update in SQL**: `UPDATE accounts SET balance = balance + 10 WHERE id = 2` (verified: 130).
2. **Optimistic concurrency**: a version column, `UPDATE ... SET ..., version = version + 1 WHERE id = 1 AND version = @v`; 0 affected rows means someone else
   changed it (verified: the second update with a stale version changed 0 rows).
3. **Pessimistic locking**: `SELECT ... FOR UPDATE` (PostgreSQL, MySQL) or `WITH (UPDLOCK)` (SQL Server) before modifying.
4. A higher isolation level (`REPEATABLE READ`/`SERIALIZABLE`) plus retrying on serialization failures.

## Sources

- [PostgreSQL: transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL: transactions tutorial (savepoints)](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [SQL Server: SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql)
- [MySQL: InnoDB transaction isolation levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [SQLite: isolation in SQLite](https://www.sqlite.org/isolation.html)

## Questions

### What does ACID mean? {junior}

Atomicity (a transaction's operations take effect all together or not at all), Consistency (a transaction leaves the database in a state satisfying all
constraints), Isolation (concurrent transactions don't see each other's intermediate states beyond what the isolation level allows) and Durability (committed
changes survive crashes, thanks to the transaction log). Together they guarantee that e.g. a money transfer never loses or creates money.

### What are the standard isolation levels and which anomalies do they prevent? {mid}

Read uncommitted allows dirty reads; read committed prevents dirty reads but allows non-repeatable and phantom reads; repeatable read also prevents non-repeatable
reads; serializable prevents all anomalies, so the result equals some serial execution of the transactions. Higher levels give more consistency and less concurrency
(more blocking or more serialization failures). Databases implement them differently, e.g. PostgreSQL's repeatable read also prevents phantoms.

### What is the default isolation level in popular databases? {junior}

`READ COMMITTED` in PostgreSQL, SQL Server and Oracle; `REPEATABLE READ` in MySQL InnoDB; SQLite transactions are serializable. In SQL Server, `READ COMMITTED` uses
locks by default, but with the `READ_COMMITTED_SNAPSHOT` database option (on by default in Azure SQL Database) it uses row versioning instead, so readers don't block
writers.

### What is a non-repeatable read, and how does it differ from a phantom read? {mid}

A non-repeatable read is when the same row read twice in one transaction has different values, because another transaction updated and committed it in between.
A phantom read is when re-running a query returns a different set of rows, because another transaction inserted or deleted rows matching the condition. The first
concerns changes to existing rows, the second the set of rows itself.

### What is a lost update, and how do you prevent it? {mid}

Two transactions read the same value, compute a new value in the application and write it back, so the second write overwrites the first and one change is lost
(in a test: expected 130, got 120). Prevent it with an atomic SQL update (`SET balance = balance + 10`), optimistic concurrency with a version column checked in
`WHERE`, pessimistic locking with `SELECT ... FOR UPDATE`, or a stricter isolation level with retries.

### What is MVCC? {mid}

Multi-version concurrency control: instead of overwriting rows in place, the database keeps multiple versions, and each transaction or statement reads a consistent
snapshot as of a point in time. Readers don't block writers and writers don't block readers, which gives high concurrency for mixed workloads. The cost is storing and
cleaning up old versions (PostgreSQL's `VACUUM`, SQL Server's version store in `tempdb`).

### What is a serialization failure, and how should the application handle it? {senior}

In PostgreSQL's `REPEATABLE READ` and `SERIALIZABLE` levels, when a transaction's changes conflict with a concurrent committed transaction in a way that would break
the isolation guarantees, the database aborts it with an error such as `could not serialize access due to concurrent update`. It's not a bug but part of the contract:
the application must retry the whole transaction from the beginning, usually a few times with backoff. Frameworks and ORMs often provide retry policies for this.

### What does `NOLOCK` do in SQL Server, and why is it risky? {mid}

`WITH (NOLOCK)` (equivalent to `READ UNCOMMITTED`) reads without taking shared locks and without being blocked by writers, so it can return uncommitted data that later
rolls back (dirty reads), and during page splits it can even read rows twice or skip them. It's often added "for performance" to fix blocking, but row versioning
(`READ_COMMITTED_SNAPSHOT` or `SNAPSHOT`) solves reader-writer blocking without returning wrong data.

### What is a savepoint? {mid}

A named point inside a transaction to which you can roll back without aborting the whole transaction: `SAVEPOINT s1`, then `ROLLBACK TO SAVEPOINT s1` undoes only
the work after it. It's used for optional steps that may fail, or to recover from an error in PostgreSQL, where an error otherwise aborts the whole transaction.
ORMs use savepoints to implement nested transactions.

### Why should transactions be short? {junior}

While a transaction is open it holds locks on the rows it modified (and, depending on the level, on rows it read), keeps old row versions from being cleaned up and
holds a connection. Long transactions, especially ones waiting for user input or external HTTP calls, block other users, increase the chance of deadlocks and
conflicts, and bloat storage. Do the external work first, then open the transaction, perform the writes and commit.
