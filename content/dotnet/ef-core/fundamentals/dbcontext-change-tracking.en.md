# DbContext and change tracking {mid}

`DbContext` is EF Core's central object. It plays several roles:

- **Unit of Work**: it collects changes and saves them together in `SaveChanges`,
- **Identity Map**: it ensures a single row (the same key) is represented by **one instance** of the
  entity within a given context,
- the entry point for queries (`DbSet<T>`) and model configuration (`OnModelCreating`).

A `DbContext` instance is meant for **a single unit of work**, so it should be short-lived.

## Lifetime and DI

- `AddDbContext` registers the context as **scoped**: in ASP.NET Core, one per HTTP request.
- **`DbContext` is not thread-safe.** You can't run multiple operations on it concurrently (e.g.
  `Task.WhenAll` over two queries). EF often detects this and throws `InvalidOperationException`:
  "A second operation started on this context before a previous operation completed". Always await
  each async operation immediately.
- `AddDbContextFactory` / `IDbContextFactory<T>`: for when the DI scope doesn't match the unit of
  work (Blazor Server, background jobs, parallel work). A context created from the factory must be
  disposed by you with `using`.
- `AddDbContextPool`: reuses context instances, reducing creation overhead in high-traffic apps.
- **Don't register `DbContext` as a singleton** and don't inject a scoped context into a singleton:
  that means a growing change tracker, threading problems and stale data.

## Entity states

| State | Meaning | What `SaveChanges` does |
| --- | --- | --- |
| `Detached` | the context doesn't track the entity | nothing |
| `Added` | a new entity | `INSERT` |
| `Unchanged` | loaded, not changed | nothing |
| `Modified` | at least one property changed | `UPDATE` of the changed columns only |
| `Deleted` | marked for deletion | `DELETE` |

```csharp
var blog = await db.Blogs.FirstAsync();   // Unchanged
blog.Name = "New name";                   // after change detection: Modified
db.Blogs.Add(new Blog { Name = "X" });    // Added
db.Remove(post);                          // Deleted
await db.SaveChangesAsync();              // INSERT, UPDATE, DELETE in one transaction
// after saving: entities are Unchanged, database-generated keys are filled in
```

## How EF detects changes

By default EF takes a **snapshot** of the values when an entity is loaded. `DetectChanges` compares the
current values with the snapshot. EF calls it automatically in `SaveChanges`, `Entry()` and
`ChangeTracker.Entries()`, among others. That's why a plain property assignment is enough. With
thousands of tracked entities, change detection has a cost, and the alternatives are notification
entities (`INotifyPropertyChanged`) or change-tracking proxies.

## Identity resolution

Within one context, two queries returning the same row give **the same instance**. The second query
**won't overwrite** unsaved changes:

```csharp
var a = await db.Blogs.FirstAsync(b => b.Id == 1);
a.Name = "Changed";
var b = await db.Blogs.FirstAsync(b => b.Id == 1); // ReferenceEquals(a, b) == true
// b.Name == "Changed", even though the database still has the old value
```

`Find(id)` checks the change tracker first and, if the entity is already tracked, **doesn't query the
database**.

## No-tracking queries

For read-only data (lists, reports, API GETs), tracking is wasted memory and time:

```csharp
var blogs = await db.Blogs.AsNoTracking().ToListAsync();          // Detached
var dtos = await db.Blogs.Select(b => new BlogDto(b.Id, b.Name)).ToListAsync(); // projection: not tracked
```

- `AsNoTracking()` also disables identity resolution. The same row appearing several times in the
  result (e.g. via `Include`) produces **separate instances**.
- `AsNoTrackingWithIdentityResolution()` doesn't track entities but deduplicates instances within the
  query.
- Globally: `UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)`.
- **Projecting to a DTO** (`Select`) is usually best for reads: it fetches only the needed columns and
  creates no tracked entities.

## Disconnected entities

In an API, an entity often arrives from outside (e.g. deserialized from JSON), so the context doesn't
know it.

- `Update(entity)` marks the entity as `Modified` and **all its properties** as changed. The `UPDATE`
  sets every column, overwriting even what the client didn't send.
- `Attach(entity)` attaches the entity as `Unchanged`. You can then mark specific properties:
  `db.Entry(entity).Property(e => e.Name).IsModified = true`.
- A safer pattern: **load the entity, copy the allowed fields from the DTO, save**. Change detection
  then works, and only the columns that actually changed go into the `UPDATE`.

## `ExecuteUpdate` / `ExecuteDelete`

Bulk operations executed **immediately** as a single SQL statement, without loading entities:

```csharp
await db.Blogs.Where(b => b.Rating < 3).ExecuteDeleteAsync();
await db.Blogs.Where(b => b.IsArchived)
    .ExecuteUpdateAsync(s => s.SetProperty(b => b.Rating, b => b.Rating + 1));
```

- **They bypass the change tracker.** Tracked instances don't see the changes, and a later
  `SaveChanges` may overwrite them. Don't mix the two approaches on the same data.
- They're not automatically part of a shared transaction. Each call is a separate statement, and you
  combine several operations with an explicit transaction.
- They don't check concurrency tokens automatically: add a condition on the token in `Where` and check
  the affected row count.
- EF Core 10: `ExecuteUpdateAsync` accepts a regular lambda (not only an expression tree), so you can
  add `SetProperty` calls conditionally.

## Sources

- [DbContext lifetime, configuration, and initialization](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)
- [Change tracking in EF Core](https://learn.microsoft.com/en-us/ef/core/change-tracking/)
- [Tracking vs. no-tracking queries](https://learn.microsoft.com/en-us/ef/core/querying/tracking)
- [Disconnected entities](https://learn.microsoft.com/en-us/ef/core/saving/disconnected-entities)
- [ExecuteUpdate and ExecuteDelete](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)

## Questions

### What is `DetectChanges`, and when does it run? {senior}

For plain entities EF uses snapshot change tracking: it stores the original values when an entity is attached and `DetectChanges` compares them with the current values to find
modifications. It runs automatically in `SaveChanges`, `Entries()`, `Entry()` and some other APIs. With `AutoDetectChangesEnabled = false`, a modified entity stayed
`Unchanged` in a test until `DetectChanges()` was called, then became `Modified`. Disabling it speeds up adding many entities, but you must call `DetectChanges` yourself
before saving.

### What does `ChangeTracker.Clear()` do, and when is it useful? {mid}

It stops tracking all entities at once, as if the context were new, without saving anything: in a test, after modifying a tracked entity and calling `Clear()`, the tracker was
empty and `SaveChanges` wrote 0 rows. It's useful in long-running units of work, such as batch imports, to keep memory and `DetectChanges` cost low between batches, and in
tests to make sure later queries hit the database instead of returning already-tracked instances. Creating a new short-lived context is often the cleaner alternative.

### Can you run two queries concurrently on one `DbContext`? {mid}

No. EF Core doesn't support multiple concurrent operations on one instance. It often detects this and
throws `InvalidOperationException` ("A second operation started on this context…"), and when it
doesn't, the behavior is undefined. Await every async call immediately, and use separate contexts for
parallelism (e.g. from `IDbContextFactory`).

### What states can an entity have, and how do they map to SQL? {junior}

`Detached` (unknown to the context), `Unchanged` (no changes, no SQL), `Added` (`INSERT`), `Modified`
(`UPDATE`) and `Deleted` (`DELETE`). After a successful `SaveChanges`, saved entities become
`Unchanged`, and database-generated keys are filled in.

### How does EF know an entity changed if it's a plain object? {mid}

When it loads the entity, it snapshots the original values. `DetectChanges` compares the current values
with the snapshot and sets the states. It's called automatically by `SaveChanges`, `Entry()` and
`ChangeTracker.Entries()`, among others. With a very large number of tracked entities this gets
expensive, so you can reduce tracking (`AsNoTracking`) or use change-notifying entities.

### When and why should you use `AsNoTracking()`? {junior}

For read-only queries whose results you won't modify and save. It saves memory and time, since there
are no snapshots or change-tracker entries. Entities are `Detached`, and the same row may produce
several instances, which `AsNoTrackingWithIdentityResolution()` prevents. A projection to a DTO, which
fetches only the needed columns, is often even better.

### How does `Find` differ from `FirstOrDefault(x => x.Id == id)`? {junior}

`Find` looks in the change tracker first. If an entity with that key is already tracked, it returns it
**without querying the database**. `FirstOrDefault`
always sends a query, although identity resolution makes it return the same tracked instance. `Find`
works only by primary key.

### What does `Update()` do with a disconnected entity, and what's the risk? {mid}

It attaches the entity as `Modified` and marks **all** properties as changed, so the `UPDATE` sets every
column. If the object came from an API without all fields, the missing values (e.g. `null`, `0`)
overwrite the data in the database. It's safer to load the entity, copy only the allowed fields from the
DTO, and call `SaveChanges`, which updates only the changed columns.

### How do you see what the change tracker is tracking? {mid}

Use `ChangeTracker.DebugView.ShortView` (one line per entity with key and state, e.g. `Order {Id: 1} Modified`) or `LongView` (all properties with original and current
values), which is also shown in the debugger. `ChangeTracker.Entries()` gives the entries programmatically, and `Entry(entity).Property(...).OriginalValue` shows a single
value. It's the quickest way to understand why `SaveChanges` issues unexpected updates or why an entity isn't saved.

### What is identity resolution, and what are its side effects? {senior}

It's the guarantee that within a context one row corresponds to one entity instance. The side effect:
querying the same row again **won't refresh** it with other users' changes if the entity is already
tracked. It returns the existing instance. To get fresh data, use a new context, `AsNoTracking()`, or
`db.Entry(entity).Reload()`.
