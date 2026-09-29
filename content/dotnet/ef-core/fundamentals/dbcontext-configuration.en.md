# DbContext configuration, DI and lifetime {mid}

A `DbContext` is a **lightweight, short-lived** object: one per unit of work (in a web app, one per request). Registering it correctly in dependency
injection and choosing between a regular context, a **pool** and a **factory** is a frequent interview topic, because mistakes here cause bugs that
only show up under load.

## Registration in ASP.NET Core

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default"))
           .EnableDetailedErrors(builder.Environment.IsDevelopment()));

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();
}
```

- `AddDbContext` registers the context as **scoped** by default: one instance per request (per DI scope), shared by all services in that request, and
  disposed at the end of the scope. A test confirmed: the same instance within a scope, different ones across scopes.
- Resolving a scoped context from the root provider (e.g. in a singleton) fails when scope validation is on (`InvalidOperationException`), and without
  validation it creates a context that lives as long as the application, which is a serious bug.
- The connection string comes from configuration (`appsettings.json`, environment variables, a secrets store), never hard-coded.

## `DbContext` is not thread-safe

One context must not be used by two operations at the same time. When two queries overlap (e.g. `Task.WhenAll(db.A.ToListAsync(), db.B.ToListAsync())`),
EF throws `InvalidOperationException: A second operation was started on this context instance before a previous operation completed`. Always `await`
each operation before the next one, or use separate contexts for parallel work.

## Context pooling

```csharp
builder.Services.AddDbContextPool<AppDbContext>(o => o.UseSqlServer(connectionString), poolSize: 1024);
```

Instead of creating a new context every request, the pool **reuses instances**: at the end of the scope EF resets the context's state (the change
tracker is cleared) and it goes back to the pool. In a test the same instance came back in the next scope with 0 tracked entities. It reduces the
setup cost in very high-throughput applications (the default pool size is 1024, and beyond it EF creates contexts normally). The consequence is that a
pooled context behaves like a **singleton reused across requests**: `OnConfiguring` and the constructor run only once, so per-request state (e.g. a tenant
ID) can't be set there. It must be assigned each time a context is handed out, e.g. by a scoped factory wrapping `AddPooledDbContextFactory`. EF also
doesn't reset state you changed yourself on the underlying `DbConnection`.

## Context factory

```csharp
builder.Services.AddDbContextFactory<AppDbContext>(o => o.UseSqlServer(connectionString));

public class ReportJob(IDbContextFactory<AppDbContext> factory)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);   // you own it, so you dispose it
        ...
    }
}
```

The factory is registered as a **singleton** and creates a new context on demand. Use it where there's no natural request scope or where you need
several contexts at the same time: `BackgroundService`, Blazor Server (a scope lives as long as the user's circuit), parallel processing (a context per
task), or singletons. `AddPooledDbContextFactory` combines a factory with pooling.

## Other options

- **Logging SQL**: `LogTo(Console.WriteLine, LogLevel.Information)` or the standard `ILogger` (category `Microsoft.EntityFrameworkCore.Database.Command`).
  Parameter values are hidden (`@name='?'`) unless you enable `EnableSensitiveDataLogging()`, which should be used **only in development**, because it
  writes data to logs.
- `EnableDetailedErrors()`: more precise error messages (e.g. which column failed to read), at a small performance cost.
- **Connection resiliency**: `UseSqlServer(cs, o => o.EnableRetryOnFailure())` automatically retries operations after transient errors (e.g. in Azure
  SQL). With manual transactions it requires an execution strategy (see the transactions topic).
- `UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)` changes the default for a read-heavy context.
- **Several contexts** in one application (e.g. per bounded context or per database) are fine: each has its own options and migrations.

## Sources

- [DbContext lifetime, configuration, and initialization](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)
- [Advanced performance topics: DbContext pooling](https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics)
- [Simple logging](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/simple-logging)
- [Connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency)

## Questions

### What lifetime does `AddDbContext` give the context, and why? {junior}

Scoped: one instance per DI scope, which in ASP.NET Core means one per HTTP request. All services handling the request share the same context, so they
take part in one unit of work (one `SaveChanges`), and the context is disposed when the request ends. A context should live briefly, because the change
tracker grows with every loaded entity.

### Why shouldn't `DbContext` be registered as a singleton? {mid}

A context isn't thread-safe, so concurrent requests using it would throw exceptions or corrupt its state. Its change tracker would also keep growing,
holding all entities ever loaded (a memory leak and stale data), and one failed `SaveChanges` would leave broken state for everyone. A context should be
short-lived: per request or per unit of work.

### What happens when you run two queries on the same `DbContext` at the same time? {mid}

EF Core detects it and throws `InvalidOperationException` ("A second operation was started on this context instance before a previous operation
completed"). The context isn't thread-safe and has one connection and one change tracker. Each operation must be awaited before the next one starts,
and for real parallelism each task needs its own context, e.g. from `IDbContextFactory`.

### How do you use `DbContext` in a `BackgroundService`? {mid}

A hosted service is a singleton, so you can't inject a scoped context into it. Either inject `IDbContextFactory<T>` and create a context per unit of work
(`await using var db = await factory.CreateDbContextAsync()`), or inject `IServiceScopeFactory` and create a scope for each iteration, resolving the
context from it. Either way the context lives briefly and is disposed after each unit of work.

### What is DbContext pooling, and what are its limitations? {mid}

`AddDbContextPool` reuses context instances: after the scope ends, the context's state is reset and it returns to the pool, which avoids the cost of
creating and configuring a context every request. It helps in very high-throughput applications. The limitation is that instances are reused across
requests like a singleton: the constructor and `OnConfiguring` run only once, so per-request state (e.g. a tenant ID for query filters) must be set each
time a context is handed out, e.g. through a custom scoped factory. The default pool size is 1024.

### When would you use `IDbContextFactory`? {mid}

When there's no request scope or the scope lives too long: in `BackgroundService`s and other singletons, in Blazor Server (a scope lasts as long as the
user's connection), in desktop applications and in parallel processing where each task needs its own context. The factory is a singleton, and the code
that creates the context is responsible for disposing it.

### How do you see the SQL generated by EF Core? {junior}

Enable logging: `LogTo(Console.WriteLine, LogLevel.Information)` on the options, or configure the `Microsoft.EntityFrameworkCore.Database.Command`
category at `Information` level in the standard logger. `ToQueryString()` on a query returns the SQL without executing it. Parameter values are hidden in
logs unless `EnableSensitiveDataLogging()` is enabled, which should be done only in development.

### Why shouldn't `EnableSensitiveDataLogging` be enabled in production? {mid}

It writes parameter values and entity data to logs and exception messages, e.g. emails, personal data, passwords or tokens. Logs are often stored longer,
shared more widely and less protected than the database, so this can cause a data leak and a GDPR violation. Without it, parameters appear as `'?'`.
Enable it only locally or temporarily in a controlled environment.

### What is connection resiliency in EF Core? {mid}

An execution strategy that automatically retries database operations after transient errors, such as a dropped connection or a failover in a cloud
database. It's enabled with `EnableRetryOnFailure()` in the provider configuration (e.g. SQL Server). When you use explicit transactions, the whole
transactional block must be run through `Database.CreateExecutionStrategy().ExecuteAsync(...)`, so it can be retried as a unit.

### Can one application have several `DbContext` classes? {mid}

Yes. It's common to have separate contexts for different databases, for different bounded contexts in a modular monolith, or a read-only context
configured with `NoTracking`. Each context has its own options, model and migrations (with `--context` in the CLI tools), and they don't share a change
tracker or transactions unless you explicitly share the connection and transaction.
