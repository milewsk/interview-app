# Testing code that uses EF Core {mid}

The key decision is whether tests run against **your real database engine** (e.g. SQL Server in a container) or against a **test double**
(the InMemory provider, SQLite in memory, a mocked `DbSet`, a stubbed repository). The EF Core team's recommendation is clear: have good coverage
against the real database, and if you need doubles, stub at the **repository** level rather than faking the provider.

## Why fakes lie

A LINQ query is translated to SQL by the provider, so its behavior depends on the database. A fake runs it differently. In a test of the same model:

| Behavior | InMemory provider | SQLite in memory | SQL Server |
|---|---|---|---|
| FK to a missing parent | saved without error | `FOREIGN KEY constraint failed` | error |
| Duplicate in a unique index | saved without error | `UNIQUE constraint failed` | error |
| `BeginTransaction()` | error (transactions ignored, warning thrown by default) | works | works |
| `FromSql` | not supported | works if the SQL is compatible | works |
| `Url == "hello"` for `"Hello"` | no match (case-sensitive) | no match (case-sensitive) | match (default collation is case-insensitive) |

The last row is the classic trap: a test passes on a fake and the query behaves differently in production, or vice versa. Provider-specific functions
(`EF.Functions.DateDiffDay` for SQL Server) can't be tested on a fake at all.

- **The InMemory provider** isn't a relational database: no constraints, no transactions, no raw SQL, and fewer supported queries. The docs **strongly
  discourage** using it for tests.
- **SQLite in memory** is a better fake (real SQL, constraints, transactions), but it's still a different database with a different SQL dialect and
  type system.
- **Mocking `DbSet`** for queries turns LINQ into in-memory LINQ over a list, with the same problems as the InMemory provider.

## Testing against the real database

It's easier and faster than it seems: a local database or a container is fast, and EF Core itself runs tens of thousands of tests against SQL Server.

- **Testcontainers** (`Testcontainers.MsSql`, `Testcontainers.PostgreSql`) starts a disposable database container for the test run, with the same
  engine and version as production. LocalDB is an option on Windows.
- Create the schema once per run (`EnsureCreated` or apply migrations, which also tests them).
- **Isolation between tests**:
  - wrap each test in a transaction and roll it back at the end (in a test: 1 row before, 2 inside the transaction, 1 after rollback);
  - or reset data between tests (e.g. the Respawn library);
  - or give each test class its own database.
- In ASP.NET Core integration tests, `WebApplicationFactory<Program>` lets you replace the connection string or the `DbContext` registration with the
  test database.

```csharp
public class OrderTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Creates_order()
    {
        await using var db = fixture.CreateContext();
        await using var tx = await db.Database.BeginTransactionAsync();   // rolled back on dispose

        var service = new OrderService(db);
        await service.PlaceAsync(customerId: 1, sku: "PEN");

        db.ChangeTracker.Clear();                                          // read from the database, not the tracker
        Assert.Equal(1, await db.Orders.CountAsync());
    }
}
```

Clearing the change tracker (or using a second context) before assertions matters: otherwise you check objects still in memory, not what was actually saved.

## Test doubles: when and how

- **Unit tests of business logic** don't need a database at all: keep the logic in domain classes and services that take data as input.
- If code depends on data access, the reliable way to stub it is a **repository** returning materialized results (`IEnumerable`, DTOs), never `IQueryable`,
  because a stub can't reproduce SQL translation. The cost is an extra layer to maintain, and the repository's queries still need database tests.
- Doubles are also necessary to simulate failures (e.g. a timeout or a lost connection), which is easier with an interceptor than with a real database.

## Sources

- [Testing overview](https://learn.microsoft.com/en-us/ef/core/testing/)
- [Choosing a testing strategy](https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy)
- [Testing against your production database system](https://learn.microsoft.com/en-us/ef/core/testing/testing-with-the-database)
- [Testing without your production database system](https://learn.microsoft.com/en-us/ef/core/testing/testing-without-the-database)
- [Testcontainers for .NET](https://dotnet.testcontainers.org/)

## Questions

### Why is the InMemory provider not recommended for tests? {mid}

It isn't a relational database: it doesn't enforce foreign keys or unique indexes, doesn't support transactions or raw SQL, supports fewer queries and
compares strings differently than, for example, SQL Server. Tests can therefore pass while the same code fails in production, or fail for reasons that don't
exist in production. The EF Core documentation explicitly discourages it and keeps it only for legacy applications.

### Is SQLite in memory a good replacement for SQL Server in tests? {mid}

It's better than the InMemory provider, because it's a real relational database with constraints, transactions and SQL. But it's still a different engine:
SQLite compares strings case-sensitively while SQL Server's default collation doesn't, some queries and types behave differently, and SQL Server-specific
functions and raw SQL may not work. It's a reasonable compromise when a real database is unavailable, not a guarantee.

### How do you test against a real database without slow and flaky tests? {mid}

Run the same engine locally or in a container (Testcontainers, LocalDB), create the schema once per test run, and isolate tests: a transaction rolled back
after each test, resetting data between tests (e.g. Respawn), or a separate database per test class. With a small, local dataset these tests take
milliseconds, and parallel test classes don't interfere with each other.

### What is Testcontainers? {junior}

A library that starts disposable Docker containers from test code, e.g. a SQL Server or PostgreSQL database with the same version as production, and removes
them after the tests. It gives each test run a clean, real database without manual setup, both on a developer's machine and in CI. It requires Docker to be
available.

### How do you isolate tests that share one database? {mid}

The most common techniques are: start a transaction at the beginning of each test and roll it back at the end, so nothing persists; restore a known state before
each test by deleting data (e.g. Respawn); or use a separate database or schema per test class. The transaction approach doesn't work well when the tested code
opens its own transactions or uses several connections.

### Why clear the change tracker before asserting in a test? {mid}

After `SaveChanges` the entities remain tracked, so a query in the same context may return the in-memory instances through identity resolution instead of the
values actually stored in the database. A test could then pass even though a column wasn't saved correctly. `ChangeTracker.Clear()` or a new context instance
forces reading the real data.

### Can you mock `DbSet` to test queries? {mid}

Not in a meaningful way. LINQ operators are static extension methods over `IQueryable`, so a "mocked" `DbSet` is really a list evaluated with in-memory LINQ,
which ignores SQL translation: case sensitivity, null semantics, untranslatable expressions and provider functions all behave differently. Mocking the context
is acceptable for verifying calls like `Add` or `SaveChanges`, but not for query logic.

### How does the repository pattern help with testing? {senior}

A repository encapsulates each query in a method returning materialized data (`IEnumerable`, DTOs), so in unit tests you can stub the results directly
without running any LINQ, which is the only reliable way to remove EF from unit tests. The cost is an additional layer of code to maintain, and the repository's
own queries still need tests against the database. It shouldn't expose `IQueryable`, because that can't be stubbed.

### Do you need a repository on top of EF Core at all? {senior}

Not necessarily. `DbContext` already implements the unit of work pattern and `DbSet` the repository pattern, so a generic repository wrapping them often just
hides features (`Include`, projections, `AsNoTracking`) and adds code. Specific repositories or query objects make sense when they express the domain's
operations, centralize complex queries or are needed to stub data access in tests. Many teams use the `DbContext` directly in the application layer and test it
against a real database.

### How do you test migrations? {senior}

Apply all migrations to an empty database of the production engine in CI (e.g. in a container) and run the tests on the resulting schema, instead of creating
it with `EnsureCreated`, which bypasses migrations. Also generate the SQL script (`dotnet ef migrations script --idempotent`) and review it, and test migrations
on a copy of production data when they transform existing data. Since EF Core 9, `Migrate()` also fails if the model has changes not covered by a migration.
