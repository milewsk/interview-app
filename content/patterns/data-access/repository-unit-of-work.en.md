# Repository and unit of work {mid}

**Repository** mediates between the domain and data mapping layers, acting **like an in-memory collection of domain objects**: `Add`, `GetById`, `Find(...)`, without exposing
SQL or ORM details. **Unit of work** tracks everything changed during a business transaction and **writes it all at once**, in one transaction. Both come from Martin Fowler's
*Patterns of Enterprise Application Architecture*, and in .NET they're the center of a long-running debate, because **EF Core's `DbContext` already implements both**: the EF Core
API docs say "DbContext is a combination of the Unit Of Work and Repository patterns".

## DbContext as unit of work

```csharp
public class OrderRepository(ShopDb db)
{
    public void Add(Order o) => db.Orders.Add(o);
    public Task<Order?> GetByIdAsync(int id) => db.Orders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id);
    public Task<List<Order>> ListAsync(Specification<Order> spec) => db.Orders.Where(spec.ToExpression()).ToListAsync();
}

public class UnitOfWork(ShopDb db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}
```

Repositories share one scoped `DbContext`, so they share its change tracker. Verified: adding a customer through one repository and three orders through another, then calling
`SaveChangesAsync` once, saved 4 rows. When one of the changes violated a foreign key, `SaveChanges` failed and **nothing** was saved, not even the valid customer, because
`SaveChanges` wraps all its commands in a transaction.

## When a repository helps and when it hurts

A repository adds value when it:

- expresses **domain intent** (`GetOverdueInvoices()`, `GetWithLines(id)`) and keeps query details, `Include`s and tracking choices in one place;
- works per **aggregate root** in DDD, loading and saving the aggregate as a whole, so invariants can't be bypassed;
- hides the persistence technology from the domain (e.g. Dapper for some aggregates, EF for others, or a document database).

It hurts when it's a **generic `IRepository<T>` wrapper** over `DbSet<T>` that only re-exposes `Add`, `Remove`, `GetAll`:

- Returning `IEnumerable<T>` loses composability. Verified: filtering the result of `IEnumerable<Order> GetAll()` with `Where` loaded the whole table, and the generated SQL had
  **no `WHERE`**; the same filter through a specification produced SQL with `WHERE`.
- Returning `IQueryable<T>` keeps queries efficient but **leaks** the ORM: callers compose EF-specific queries, and the abstraction hides nothing.
- It blocks EF features (projections, `AsNoTracking`, `Include`, `ExecuteUpdate`, split queries) unless you re-expose each of them.
- It's often justified by testability, but mocking a repository hides query translation bugs; the EF Core docs recommend testing against the real database or the repository
  pattern as a deliberate test double, and warn against the in-memory provider.

A common pragmatic setup: use `DbContext` directly in query handlers (read side, projections to DTOs), and aggregate-specific repositories only on the write side.

## Sources

- [Repository (Martin Fowler, PoEAA)](https://martinfowler.com/eaaCatalog/repository.html)
- [Unit of Work (Martin Fowler, PoEAA)](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [DbContext class: remarks](https://learn.microsoft.com/en-us/dotnet/api/microsoft.entityframeworkcore.dbcontext)
- [Designing the infrastructure persistence layer (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
- [Choosing a testing strategy (EF Core)](https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy)
- [Transactions (EF Core)](https://learn.microsoft.com/en-us/ef/core/saving/transactions)

## Questions

### What is the repository pattern? {junior}

A pattern that puts data access behind an interface that looks like a collection of domain objects: you add, remove, get by ID and query objects without writing SQL or knowing how
they're stored. It separates domain and application logic from persistence details, gives queries meaningful names, and keeps data access code in one place.

### What is the unit of work pattern? {junior}

A pattern that tracks all objects added, changed and removed during a business operation and commits the changes together, as one transaction, at the end. It avoids many small
database calls and guarantees that either all changes of the operation are saved or none are. EF Core's change tracker and `SaveChanges` are a unit of work.

### Why is `DbContext` considered a repository and a unit of work? {mid}

`DbSet<T>` behaves like a repository: you add and remove entities and query them with LINQ without writing SQL. The `DbContext` tracks changes to all loaded and added entities, and
`SaveChanges` writes them in a single transaction, which is a unit of work. The EF Core API documentation states directly that `DbContext` combines the Unit Of Work and Repository
patterns.

### Should you put a generic repository on top of EF Core? {mid}

Usually not. A generic `IRepository<T>` with `GetAll`, `Add` and `Remove` duplicates what `DbSet<T>` already does, and either hides EF features you need (projections,
`AsNoTracking`, `Include`, bulk updates) or leaks them by returning `IQueryable<T>`. Specific repositories per aggregate that express domain operations can be worthwhile; a thin
generic wrapper mostly adds code without adding abstraction.

### What's wrong with a repository returning `IEnumerable<T>` from `GetAll()`? {mid}

The query is executed when the caller enumerates it, but further `Where`, `OrderBy` or `Take` calls on an `IEnumerable<T>` run in memory, so the whole table is loaded first. In a test,
filtering `GetAll()` with `Where` produced SQL without a `WHERE` clause. Filters must be applied inside the repository (method parameters, specifications) or the method must return
`IQueryable<T>`.

### What are the pros and cons of returning `IQueryable<T>` from a repository? {senior}

Pro: callers can compose filters, sorting, paging and projections that are translated to SQL, so queries stay efficient. Con: the repository no longer encapsulates data access:
query logic spreads across callers, they depend on the ORM's LINQ translation (a query may fail at runtime if it's not translatable), and the context's lifetime must outlive the
query. Many teams avoid it and use specifications or dedicated query methods instead.

### How do repositories and unit of work cooperate in one operation? {mid}

Several repositories share one unit of work, in EF Core one scoped `DbContext` per request, so all their changes are tracked together. The application service loads aggregates through
repositories, calls domain methods, and finally calls `SaveChanges` once on the unit of work. In a test, a customer added through one repository and orders through another were saved
together, and when one change violated a constraint, none of them were saved.

### Why do repositories in DDD work per aggregate root? {senior}

An aggregate is a consistency boundary: its invariants are enforced by the root, and it's loaded and saved as a whole. A repository per aggregate root (not per table) makes it impossible
to load or modify an inner entity directly and bypass the root's rules, and it defines exactly what gets loaded (the root with its children). Other aggregates are referenced by ID and
loaded through their own repositories.

### Do repositories make code easier to test? {mid}

They make it easy to replace data access with a fake in unit tests of business logic, which is their main practical benefit. However, a mocked repository doesn't test the actual
queries, so bugs in LINQ translation, mappings or constraints are missed. The EF Core documentation recommends integration tests against the real database engine (e.g. in a
container) and presents a repository as one way to create a test double, while discouraging the in-memory provider.

### How would you design data access for a CQRS application? {senior}

Separate the two sides: on the write side, use aggregate repositories and a unit of work (a `DbContext`) to load aggregates, enforce invariants and save changes atomically. On the read
side, skip repositories and query directly with `DbContext` projections (`Select` to DTOs, `AsNoTracking`), Dapper or database views, optimized for each screen. This keeps domain logic
protected while reads stay simple and fast.
