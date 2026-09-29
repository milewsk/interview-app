# Saving data and bulk operations {mid}

`SaveChanges` is EF Core's **unit of work**: you make changes to tracked entities, and one call persists them all. For operations on many rows,
EF Core 7+ also has `ExecuteUpdate` and `ExecuteDelete`, which work directly in the database without loading data.

## What `SaveChanges` does

1. Calls `DetectChanges`, comparing tracked entities with their snapshots.
2. Orders the commands so foreign keys are satisfied (principals before dependents).
3. Opens a **transaction** (if there isn't one already) and executes the commands, **batching** them where the provider allows it.
4. Reads back database-generated values (identity keys, defaults, concurrency tokens) and sets them on the entities.
5. Marks entities as `Unchanged` (and deleted ones as `Detached`).

```csharp
var products = Enumerable.Range(1, 100).Select(i => new Product { Sku = $"S{i}", Price = i }).ToList();
db.Products.AddRange(products);        // Id = 0: not yet known
await db.SaveChangesAsync();           // Id = 1..100: filled in from the database
```

- It's **atomic**: in a test, one of three inserts violated a unique index, and none of the rows were saved.
- An `UPDATE` sets **only changed columns**: after changing the price, the SQL was `UPDATE "Products" SET "Price" = @p0 WHERE ...`.
- **Batching**: SQL Server sends up to 42 statements in one round trip by default (configurable with `MaxBatchSize`/`MinBatchSize`). SQLite executed
  100 inserts as 100 separate commands, because its provider doesn't batch (it's an in-process database, so round trips are cheap).
- Call `SaveChanges` **once per unit of work** (e.g. per request), not after every `Add` in a loop.

## Disconnected graphs: `Add`, `Attach`, `Update`

When entities come from outside (e.g. from an API), EF decides each entity's state from its key:

| Method | Entity with a key value set | Entity with a default key (`0`) |
|---|---|---|
| `Add` | `Added` | `Added` |
| `Attach` | `Unchanged` | `Added` |
| `Update` | `Modified` (all columns) | `Added` |

In a test, `Attach` of an order with `Id = 7` containing a new line (`Id = 0`) and an existing line (`Id = 5`) gave `Unchanged`, `Added`, `Unchanged`, and
`Update` gave `Modified`, `Added`, `Modified`. `Update` writes **all** columns of modified entities, which can overwrite concurrent changes, so for API
updates it's often safer to load the entity and copy only the allowed fields.

## `ExecuteUpdate` and `ExecuteDelete`

```csharp
var raised = await db.Products
    .Where(p => p.Price < 10)
    .ExecuteUpdateAsync(s => s
        .SetProperty(p => p.Price, p => p.Price * 2)
        .SetProperty(p => p.Sku, p => p.Sku + "-sale"));     // one UPDATE ... WHERE statement

var removed = await db.Products.Where(p => p.IsDiscontinued).ExecuteDeleteAsync();   // one DELETE statement
```

- **One SQL statement**, no loading of rows, no change tracking: in a test, updating 8 rows and deleting 10 took one command each.
- They run **immediately**, not at `SaveChanges`, and outside its transaction unless you open one explicitly.
- They **bypass the change tracker**: already loaded entities keep old values, and EF-side features don't run: no `SaveChanges` interceptors or events,
  no cascade deletes configured only in EF (database `ON DELETE CASCADE` still works), no concurrency token checks (unless you add them to `Where`).
- Since EF Core 10 the setter lambda can be a regular block, so properties can be set conditionally (`if (discount) s.SetProperty(...)`).

## Inserting many rows

EF Core has no built-in bulk insert: `AddRange` + `SaveChanges` generates an `INSERT` per row (batched on SQL Server). For tens of thousands of rows
or imports, use the provider's bulk API (`SqlBulkCopy` for SQL Server, `COPY` for PostgreSQL) or a third-party library, and consider a separate,
short-lived context per chunk so the change tracker doesn't grow without limit.

## Sources

- [Saving data overview](https://learn.microsoft.com/en-us/ef/core/saving/)
- [ExecuteUpdate and ExecuteDelete](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)
- [Efficient updating (batching)](https://learn.microsoft.com/en-us/ef/core/performance/efficient-updating)
- [Disconnected entities](https://learn.microsoft.com/en-us/ef/core/saving/disconnected-entities)
- [Related data (saving graphs)](https://learn.microsoft.com/en-us/ef/core/saving/related-data)

## Questions

### What does `SaveChanges` do, step by step? {mid}

It detects changes in tracked entities, orders the SQL commands so relationships are satisfied, starts a transaction if none exists, executes the commands
(batched where the provider supports it), reads back generated values such as identity keys and concurrency tokens, and finally marks the entities as
`Unchanged`. If any command fails, the transaction is rolled back and nothing is saved.

### How do you delete an entity without loading it first? {junior}

Either use `ExecuteDelete` (`db.Orders.Where(o => o.Id == id).ExecuteDelete()`), which runs a `DELETE` immediately, or attach a stub with only the key and remove it:
`db.Remove(new Order { Id = 3 }); db.SaveChanges();` (checked: it produced a single `DELETE ... WHERE "Id" = @p0`). The stub approach goes through `SaveChanges`, so it joins
its transaction and interceptors, but EF can't cascade-delete dependents it hasn't loaded, and a concurrency token needs its original value set on the stub.

### When is the key of a new entity known? {junior}

For keys generated by the database (e.g. `IDENTITY`), only after `SaveChanges`: before that the property has a default value (`0`), and afterwards EF reads
the generated value and sets it on the entity, also fixing up the foreign keys of related entities. `Guid` keys are generated by EF already at `Add`. If you
need IDs before saving, consider client-generated keys or HiLo.

### Why shouldn't you call `SaveChanges` inside a loop? {junior}

Each call is a separate transaction and at least one round trip, so saving 1,000 entities one by one means 1,000 transactions and round trips instead of one
transaction with a few batches. It's also not atomic: a failure in the middle leaves part of the data saved. Add all entities and call `SaveChanges` once per
unit of work (for very large sets, in chunks).

### What does batching in `SaveChanges` mean? {mid}

EF groups several `INSERT`/`UPDATE`/`DELETE` statements into one database command, reducing round trips. For SQL Server, by default up to 42 statements go in
one batch (configurable with `MaxBatchSize`), because larger batches don't help. Batching depends on the provider: SQLite, an in-process database, executes
statements separately.

### How do `Attach` and `Update` differ for a disconnected entity? {mid}

`Attach` marks an entity with a set key as `Unchanged` (and entities without a key value as `Added`), so nothing is saved until you change properties or mark
them modified. `Update` marks entities with keys as `Modified`, which updates all their columns, even ones that didn't change, and can overwrite concurrent
changes. Both traverse the whole graph of reachable entities.

### How does `ExecuteUpdate` differ from loading entities and calling `SaveChanges`? {mid}

`ExecuteUpdate` translates to a single `UPDATE ... WHERE` statement executed immediately: no rows are loaded, nothing is tracked, and it can change millions of
rows in one round trip. The traditional way loads each entity, tracks it, and sends an `UPDATE` per row. The price of `ExecuteUpdate` is that it bypasses the
change tracker, interceptors, EF-side cascades and concurrency checks, and doesn't take part in the `SaveChanges` transaction by default.

### What doesn't happen when you use `ExecuteDelete`? {senior}

EF doesn't load the entities, so cascade deletes configured only in the EF model aren't applied (only database `ON DELETE` rules run), `SaveChanges`
interceptors and events don't fire, soft-delete logic implemented in `SaveChanges` is skipped, and tracked instances of the deleted rows remain in the context
as if nothing had happened. Global query filters are applied to the `WHERE`, which matters for multi-tenant data.

### How do you insert 100,000 rows efficiently? {senior}

Not with one huge `AddRange` + `SaveChanges`, which creates 100,000 tracked entities and `INSERT` statements. Use the provider's bulk copy mechanism
(`SqlBulkCopy`, PostgreSQL `COPY`) or a bulk extension library, which stream the data in a few operations. If you must use EF, insert in chunks (e.g. 1,000 per
`SaveChanges`) with a new context or `ChangeTracker.Clear()` between chunks, so memory and change detection costs stay constant.

### How do you update a single column without loading the entity? {mid}

With `ExecuteUpdate`: `db.Orders.Where(o => o.Id == 2).ExecuteUpdate(s => s.SetProperty(o => o.Status, "Delivered"))` runs one `UPDATE ... SET "Status" = @p` immediately,
bypassing the change tracker. Or attach a stub and mark only that property as modified:
`db.Attach(stub); db.Entry(stub).Property(o => o.Status).IsModified = true; db.SaveChanges();`. Checked: both generated an `UPDATE` setting only `Status`, and the other
columns kept their values. Avoid `Update()` here, since it would write every column.
