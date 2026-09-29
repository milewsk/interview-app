# Global query filters, interceptors and events {senior}

Cross-cutting concerns such as **soft delete**, **multi-tenancy** and **auditing** shouldn't be repeated in every query and every save. EF Core
provides two mechanisms: **global query filters**, applied automatically to queries, and **interceptors/events**, which hook into saving,
commands and connections.

## Global query filters

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Post>().HasQueryFilter("SoftDelete", p => !p.IsDeleted);
    modelBuilder.Entity<Blog>().HasQueryFilter("Tenant", b => b.TenantId == TenantId);   // a context property
}

db.Posts.ToList();                                        // WHERE NOT IsDeleted
db.Posts.IgnoreQueryFilters().ToList();                  // all filters off
db.Posts.IgnoreQueryFilters(["SoftDelete"]).ToList();    // only the named filter off (EF Core 10)
```

- The filter is added to **every** query of the entity type, including `Include` of navigations (in a test the blog came with 1 of 2 posts),
  `Any`, `Count` and also `ExecuteUpdate`/`ExecuteDelete`.
- A filter referencing a context property (`TenantId`) is translated as a **parameter** (`@ef_filter__TenantId`) and evaluated for each context
  instance, so one cached model serves all tenants. In a test, two contexts with different `TenantId` values saw different blogs.
- Since **EF Core 10** an entity can have several **named filters**, and `IgnoreQueryFilters(["SoftDelete"])` disables just one. Previously there was
  only one filter per entity, and ignoring it disabled everything, including tenant isolation.
- Pitfall: if a **required** principal is filtered out, dependents that point to it can disappear from query results too, so EF warns about
  filters on the principal side of required relationships.
- Filters are a convenience, not a security boundary on their own: `IgnoreQueryFilters`, raw SQL and other contexts bypass them. Tenant isolation
  may additionally use database features (e.g. row-level security).

## Interceptors

Interceptors let you inspect or change EF's operations. They're registered on the options:

```csharp
builder.Services.AddScoped<AuditInterceptor>();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseSqlServer(connectionString)
           .AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));
```

| Interceptor | Hooks into |
|---|---|
| `SaveChangesInterceptor` | before/after `SaveChanges`: auditing, soft delete, domain events |
| `DbCommandInterceptor` | every SQL command: logging, hints, changing SQL, caching, simulating slowness in tests |
| `DbConnectionInterceptor` | opening connections: e.g. setting an access token or session context |
| `DbTransactionInterceptor` | starting, committing and rolling back transactions |
| `IMaterializationInterceptor` | creating entity instances from query results |

```csharp
public class AuditInterceptor(TimeProvider clock) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
    {
        foreach (var entry in eventData.Context!.ChangeTracker.Entries<IAuditable>())
        {
            if (entry.State == EntityState.Added) entry.Entity.CreatedAt = clock.GetUtcNow();
            if (entry.State == EntityState.Modified) entry.Entity.UpdatedAt = clock.GetUtcNow();
        }
        foreach (var entry in eventData.Context.ChangeTracker.Entries<ISoftDeletable>()
                     .Where(e => e.State == EntityState.Deleted))
        {
            entry.State = EntityState.Modified;          // turn DELETE into UPDATE
            entry.Entity.IsDeleted = true;
        }
        return ValueTask.FromResult(result);
    }
}
```

In a test, `db.Remove(post)` + `SaveChanges` with such an interceptor left the row in the database with `IsDeleted = true`, and the query filter hid it.

- Override **both** the sync and async methods (`SavingChanges` and `SavingChangesAsync`) if both are used in the application.
- An interceptor instance registered once is shared, so it should be stateless or resolved with a proper lifetime.
- `SaveChanges` interceptors **don't run** for `ExecuteUpdate`/`ExecuteDelete` or raw SQL, because those don't go through `SaveChanges`. A
  `DbCommandInterceptor` sees every command.

## Events

Simpler hooks without registration: `context.SavingChanges`, `SavedChanges`, `SaveChangesFailed`, and on the change tracker `Tracked` and
`StateChanged`. They're useful for code inside the context (e.g. setting timestamps), while interceptors are better for reusable,
DI-configured behavior.

## Sources

- [Global query filters](https://learn.microsoft.com/en-us/ef/core/querying/filters)
- [Interceptors](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/interceptors)
- [.NET events in EF Core](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/events)
- [Multi-tenancy](https://learn.microsoft.com/en-us/ef/core/miscellaneous/multitenancy)
- [What's new in EF Core 10](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/whatsnew)

## Questions

### What is a global query filter, and what is it used for? {mid}

A LINQ predicate configured on an entity type with `HasQueryFilter`, which EF automatically adds to every query of that type, including navigations loaded
with `Include`. Typical uses are soft delete (`!e.IsDeleted`) and multi-tenancy (`e.TenantId == CurrentTenantId`). It removes the risk of forgetting a
condition in one of many queries. It can be disabled for a query with `IgnoreQueryFilters()`.

### How do you implement soft delete in EF Core? {mid}

Add an `IsDeleted` (and optionally `DeletedAt`) column, a global query filter `!e.IsDeleted` that hides deleted rows, and a `SaveChanges` interceptor that turns
entities in the `Deleted` state into `Modified` with `IsDeleted = true`. Remember that `ExecuteDelete` and raw SQL bypass the interceptor, unique indexes
should usually be filtered to non-deleted rows, and cascades have to be handled by the same logic.

### How does a multi-tenant query filter know the current tenant? {senior}

The filter refers to a property or field of the context (`b.TenantId == TenantId`), which is set per context instance, e.g. from a scoped tenant service
injected into the context. EF translates it into a parameter evaluated each time a query runs, so the model is built once, and each context filters by its own
tenant. With context pooling, the tenant must be set every time a context is handed out, because the constructor runs only once.

### What are named query filters in EF Core 10? {mid}

Before EF Core 10 an entity could have only one filter, and `IgnoreQueryFilters()` disabled it entirely. Now you can define several filters with names, e.g.
`HasQueryFilter("SoftDelete", ...)` and `HasQueryFilter("Tenant", ...)`, and disable only chosen ones: `IgnoreQueryFilters(["SoftDelete"])` shows deleted
records while keeping tenant isolation. That was previously impossible without combining conditions by hand.

### Are global query filters a security mechanism? {senior}

Not on their own. They protect against forgetting a condition in LINQ queries, but they're bypassed by `IgnoreQueryFilters`, raw SQL, other applications
using the same database and mistakes in setting the tenant. For strong tenant isolation you add defense in depth: tests checking isolation, database
row-level security, or separate schemas or databases per tenant.

### What is an EF Core interceptor, and what kinds are there? {mid}

An object registered with `AddInterceptors` that is called before and after EF operations and can inspect, change or suppress them. Kinds include
`SaveChangesInterceptor` (saving), `DbCommandInterceptor` (every SQL command), `DbConnectionInterceptor` (opening connections), `DbTransactionInterceptor`
(transactions) and `IMaterializationInterceptor` (creating entity instances). Typical uses: auditing, soft delete, logging and setting connection context.

### How do you automatically fill `CreatedAt`/`UpdatedAt` columns? {mid}

In a `SaveChangesInterceptor` (or by overriding `SaveChanges`), iterate over `ChangeTracker.Entries<IAuditable>()` and set `CreatedAt` for `Added` entities
and `UpdatedAt` for `Modified` ones, using an injected `TimeProvider` so it can be tested. Alternatively, the database can generate the value
(`HasDefaultValueSql`), but only on insert. This doesn't cover `ExecuteUpdate`, where the column must be set explicitly.

### Do `SaveChanges` interceptors run for `ExecuteUpdate` and `ExecuteDelete`? {senior}

No. These methods send the SQL immediately, without the change tracker and `SaveChanges`, so auditing, soft delete or domain events implemented in a
`SaveChangesInterceptor` are silently skipped. Only a `DbCommandInterceptor` sees these commands. If the application relies on such logic, bulk operations must
replicate it (e.g. set `UpdatedAt` in `SetProperty`) or be restricted.

### Why should interceptors be stateless? {senior}

An interceptor instance added to the options is often shared by many context instances, and possibly used concurrently by different requests. State stored in
fields (e.g. the current user or a list of changes) would leak between requests or cause race conditions. Keep interceptors stateless, pass request data
through the `DbContext` (available as `eventData.Context`), or register them with the right DI lifetime and resolve them when configuring the context.

### How do EF Core events differ from interceptors? {mid}

Events (`SavingChanges`, `SavedChanges`, `SaveChangesFailed`, `ChangeTracker.Tracked` and `StateChanged`) are ordinary .NET events on a context instance: easy
to subscribe to inside the context, and handlers can modify tracked entities (e.g. set timestamps), but they can't suppress the operation or replace its result.
Interceptors are registered in the options, can be resolved from DI and reused across contexts, and can change results or skip operations. For reusable cross-cutting behavior interceptors are the better fit.
