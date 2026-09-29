# Concurrency and transactions in EF Core {mid}

Two related problems: how to save several changes **atomically** (transactions), and how to avoid
overwriting someone else's changes when two people edit the same data (**concurrency control**).

## Transactions

**`SaveChanges` is atomic.** All changes from one call go to the database in a transaction: either
everything is saved or nothing is. In most cases that's enough.

You need an explicit transaction when **several operations** must succeed together: multiple
`SaveChanges` calls, `ExecuteUpdate`/`ExecuteDelete`, raw SQL, or queries that must see a consistent
state.

```csharp
await using var tx = await db.Database.BeginTransactionAsync();

db.Orders.Add(order);
await db.SaveChangesAsync();

await db.Products
    .Where(p => p.Id == order.ProductId)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - order.Quantity));

await tx.CommitAsync(); // without Commit the transaction is rolled back on Dispose
```

- **Savepoints.** When `SaveChanges` runs inside an existing transaction, EF automatically creates a
  savepoint and rolls back to it on failure, so the transaction stays usable. You can also create them
  manually: `CreateSavepointAsync("x")` / `RollbackToSavepointAsync("x")`. On SQL Server they don't
  work with MARS enabled.
- **Isolation level:** `BeginTransactionAsync(IsolationLevel.Serializable)`.
- **Sharing a transaction** across contexts or with ADO.NET/Dapper: a shared `DbConnection` and
  `Database.UseTransaction(...)`.
- `TransactionScope` (an ambient transaction) in async code requires
  `TransactionScopeAsyncFlowOption.Enabled`.

### Transactions and retries (execution strategy)

With `EnableRetryOnFailure` (typical for Azure SQL) each EF operation is retried on its own. A user
transaction groups several operations, so EF can't replay just one and throws
`InvalidOperationException`. The fix is to run the **whole** transaction as one retriable unit.

```csharp
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync();
    // ... operations ...
    await tx.CommitAsync();
});
```

If the connection drops **during commit**, the outcome is unknown. A retry may duplicate data, so design
operations to be idempotent (e.g. client-generated GUID keys) or verify the outcome with
`ExecuteInTransactionAsync(..., verifySucceeded: ...)`.

## Isolation levels in a nutshell

| Level | Dirty read | Non-repeatable read | Phantom read |
| --- | --- | --- | --- |
| Read uncommitted | possible | possible | possible |
| Read committed | no | possible | possible |
| Repeatable read | no | no | possible |
| Serializable | no | no | no |
| Snapshot (SQL Server) | no | no | no, but write conflicts are possible |

SQL Server and PostgreSQL default to **Read committed**. On SQL Server, enabling
`READ_COMMITTED_SNAPSHOT` (on by default in Azure SQL Database) makes reads use row versioning instead
of locks. Higher isolation means fewer anomalies but more locking and deadlocks.

## The problem: a lost update

1. Alice and Bob open the same product (price 100).
2. Alice changes the price to 90 and saves.
3. Bob changes the stock and saves his object, which still has price 100.
4. Alice's change silently disappears.

## Optimistic concurrency (EF's default approach)

We assume conflicts are rare. We don't lock data, we **detect the conflict on save**. EF adds a condition
on a **concurrency token** to the `UPDATE`/`DELETE`. If nobody changed the row, the update hits 1 row.
If it hits 0, EF throws `DbUpdateConcurrencyException`.

```sql
UPDATE "Products" SET "Price" = @p0, "Version" = @p1
WHERE "Id" = @p2 AND "Version" = @p3
```

Configuring the token:

```csharp
// SQL Server: rowversion, changed automatically by the database on every UPDATE
public class Product
{
    public int Id { get; set; }
    [Timestamp] public byte[] Version { get; set; } = null!; // or .IsRowVersion()
}

// Any database: an application-managed token
public class Product
{
    public int Id { get; set; }
    [ConcurrencyCheck] public Guid Version { get; set; } // or .IsConcurrencyToken()
    // Version = Guid.NewGuid() on every change (e.g. in a SaveChanges override)
}
```

### Resolving a conflict

```csharp
try
{
    await db.SaveChangesAsync();
}
catch (DbUpdateConcurrencyException ex)
{
    var entry = ex.Entries.Single();
    var databaseValues = await entry.GetDatabaseValuesAsync();
    if (databaseValues is null) { /* the row was deleted */ }

    // "client wins": accept the current database state as the original and save again
    entry.OriginalValues.SetValues(databaseValues!);
    await db.SaveChangesAsync();
    // "database wins": await entry.ReloadAsync();
    // merge: compare entry.CurrentValues, OriginalValues and databaseValues field by field
}
```

APIs usually return **409 Conflict**, and the client fetches fresh data and decides. The token travels in
the DTO (or in `ETag`/`If-Match` headers). When saving a disconnected entity, set the token's **original**
value to the one from the client: `db.Entry(product).Property(p => p.Version).OriginalValue = dto.Version`.

`ExecuteUpdate`/`ExecuteDelete` don't check the token automatically. Add the condition yourself and check
the affected row count:

```csharp
var rows = await db.Products
    .Where(p => p.Id == id && p.Version == dto.Version)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - 1));
if (rows == 0) return Results.Conflict();
```

## Pessimistic concurrency

We lock the row **for the duration of the transaction** so nobody else can change it. EF Core has no API
for this, so you use raw SQL inside a transaction:

```csharp
await using var tx = await db.Database.BeginTransactionAsync();
var product = await db.Products
    .FromSql($"SELECT * FROM Products WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}") // SQL Server
    // PostgreSQL: SELECT * FROM products WHERE id = {id} FOR UPDATE
    .SingleAsync();
product.Stock -= 1;
await db.SaveChangesAsync();
await tx.CommitAsync();
```

The costs are locks, waiting and the risk of deadlocks. Use it for short operations with a high risk of
conflict (e.g. reserving the last item). A frequent alternative is an atomic conditional update:
`UPDATE ... SET Stock = Stock - 1 WHERE Id = @id AND Stock > 0`.

## Sources

- [Transactions](https://learn.microsoft.com/en-us/ef/core/saving/transactions)
- [Handling concurrency conflicts](https://learn.microsoft.com/en-us/ef/core/saving/concurrency)
- [Connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency)
- [ExecuteUpdate and ExecuteDelete: concurrency control](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)
- [SET TRANSACTION ISOLATION LEVEL (T-SQL)](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql)

## Questions

### Is `SaveChanges` transactional? When do you need an explicit transaction? {junior}

Yes. All changes from one `SaveChanges` call are saved atomically if the provider supports transactions.
You need an explicit transaction (`BeginTransactionAsync`) when several operations must succeed together:
multiple `SaveChanges` calls, `ExecuteUpdate`/`ExecuteDelete` (which don't join any transaction on their
own), raw SQL, or reads that must see a consistent state.

### What is optimistic concurrency control and how does it work in EF Core? {mid}

It's an approach where we don't lock data but detect conflicts on save. The entity has a concurrency token
(`rowversion` on SQL Server or a property marked `[ConcurrencyCheck]`). EF adds a condition on the token's
original value to the `WHERE` of the `UPDATE`/`DELETE`. If someone changed the row in the meantime, the
statement hits no rows and EF throws `DbUpdateConcurrencyException`.

### What's the difference between `[Timestamp]` and `[ConcurrencyCheck]`? {mid}

`[Timestamp]` (`IsRowVersion()`) maps a `byte[]` property to a SQL Server `rowversion` column, which the
**database** changes automatically on every row update. `[ConcurrencyCheck]` (`IsConcurrencyToken()`) marks
any property as a token, but the **application** must change it (e.g. a new `Guid` on every save). It works
with any database. You can also put it on a regular business field to detect conflicts only on that field.

### How do you resolve a `DbUpdateConcurrencyException`? {mid}

The exception exposes `Entries` with the conflicting entities. For each one you can fetch the current
database values (`GetDatabaseValuesAsync`, which returns `null` if the row was deleted) and choose a
strategy: **database wins** (`ReloadAsync`, discarding changes), **client wins**
(`OriginalValues.SetValues(dbValues)` and save again), or a field-by-field **merge**. APIs usually return
409 Conflict and let the user decide.

### How do you handle concurrency when the entity comes from an API (disconnected scenario)? {senior}

The client must receive the token with the data (in the DTO or as an `ETag`) and send it back on save (e.g.
`If-Match`). Before `SaveChanges`, set the token's **original** value to the client's:
`db.Entry(entity).Property(e => e.Version).OriginalValue = dto.Version`. Just assigning
`entity.Version = dto.Version` on a freshly loaded entity isn't enough, because EF compares against the
original value captured at load time.

### How do optimistic and pessimistic locking differ, and when should you use each? {mid}

Optimistic locking doesn't lock data and detects conflicts on save. It's cheap and scalable, and suits rare
conflicts and long interactions (forms). Pessimistic locking locks the row for the duration of a transaction
(`UPDLOCK`, `SELECT ... FOR UPDATE`) and prevents conflicts, at the cost of waiting, lower throughput and a
risk of deadlocks. Use it for short operations with a high collision risk. EF Core has no API for it, so you
need raw SQL.

### Why doesn't a user transaction work with `EnableRetryOnFailure`, and how do you fix it? {senior}

The retry strategy replays individual EF operations. An explicit transaction groups several operations, so
after a transient failure the whole group would need to be replayed, and EF doesn't know how. It throws
`InvalidOperationException` instead. The fix: `db.Database.CreateExecutionStrategy().ExecuteAsync(...)` with
the entire transaction, from `BeginTransaction` to `Commit`, inside a delegate that can be run again.

### What are savepoints and how does EF Core use them? {senior}

Points inside a transaction you can roll back to without aborting the whole transaction. When `SaveChanges`
runs inside an already-started transaction, EF automatically creates a savepoint and rolls back to it on
failure, so the transaction stays usable, e.g. for retrying after a concurrency conflict. You can also create
them manually (`CreateSavepointAsync`, `RollbackToSavepointAsync`). On SQL Server they don't work with MARS
enabled.

### How do you set the isolation level of a transaction in EF Core? {mid}

Pass it when beginning the transaction: `await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);` (with `System.Data.IsolationLevel`), or
use a `TransactionScope` with `TransactionOptions`. Without it, the database's default applies (read committed on SQL Server and PostgreSQL). Providers map levels to what the
database supports: on SQLite, a requested `RepeatableRead` became `Serializable` in a test. SQL Server's `Snapshot` also requires enabling snapshot isolation on the database.

### How do you safely decrement stock under many concurrent orders? {mid}

Most simply with an atomic conditional update in the database: `ExecuteUpdateAsync` with
`Where(p => p.Id == id && p.Stock >= qty)` and `SetProperty(p => p.Stock, p => p.Stock - qty)`, then check
that 1 row changed. Alternatives: an optimistic token with a retry on conflict, or a pessimistic lock in a
short transaction. The "read, check, write" pattern without any of these leads to overselling.
