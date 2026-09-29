# Specification {senior}

**Specification** encapsulates a **business rule or query criterion as an object** that can answer "does this object satisfy the rule?" and can be **combined** with other
specifications using `And`, `Or` and `Not`. It comes from Eric Evans and Martin Fowler. In C#, a specification built on **expression trees** (`Expression<Func<T, bool>>`) serves
two purposes at once: EF Core translates it to SQL, and it can be compiled to check objects in memory.

## Expression-based specification

```csharp
public abstract class Specification<T>
{
    public abstract Expression<Func<T, bool>> ToExpression();
    public bool IsSatisfiedBy(T entity) => ToExpression().Compile()(entity);          // in-memory check

    public Specification<T> And(Specification<T> other) => new Combined<T>(this, other, Expression.AndAlso);
    public Specification<T> Or(Specification<T> other) => new Combined<T>(this, other, Expression.OrElse);
    public Specification<T> Not() => new NotSpecification<T>(this);
}

public class ExpensiveOrders(decimal min) : Specification<Order>
{
    public override Expression<Func<Order, bool>> ToExpression() => o => o.Total > min;
}
public class OrdersWithStatus(string status) : Specification<Order>
{
    public override Expression<Func<Order, bool>> ToExpression() => o => o.Status == status;
}

var spec = new ExpensiveOrders(100).And(new OrdersWithStatus("Paid"));
var orders = await db.Orders.Where(spec.ToExpression()).ToListAsync();              // translated to SQL
```

Combining two lambdas needs a common parameter: `Combined<T>` rewrites the right expression's parameter to the left one with a small `ExpressionVisitor`, then joins the bodies with
`AndAlso`/`OrElse`. Verified on SQLite with orders of 120 (Paid), 40 (New) and 900 (Paid):

- `And` produced `WHERE ... "o"."Total" ... @min ... AND "o"."Status" = @s`, with the values passed as **parameters**, and returned 120 and 900;
- `Not(Total > 500 Or Status = New)` returned only 120;
- `IsSatisfiedBy` on an unsaved order (150, Paid) returned `true` without touching the database;
- combining with `Expression.Invoke` instead of parameter replacement also worked, because EF Core inlines invocations, but other LINQ providers may not, so the visitor is the
  portable approach.

## Uses and trade-offs

- **Reusable, named query criteria**: `ActiveCustomers`, `OverdueInvoices` instead of the same `Where` copied across the codebase; a repository takes a specification instead of
  growing methods like `GetByStatusAndDateAndCustomer`.
- **Validation and selection rules** in the domain: the same object that filters the database can check a single entity (`IsSatisfiedBy`), e.g. "can this order be shipped?".
- **Dynamic filters**: combining specifications from user-selected criteria at runtime (it's a composite).
- Libraries such as **Ardalis.Specification** extend the idea to whole queries: criteria plus `Include`, ordering, paging and projections, evaluated by a repository.
- Costs: more classes and indirection than an inline `Where`, and specifications must stay **translatable**: calling a custom C# method inside the expression works in memory but
  fails in EF Core at runtime. For simple CRUD, plain LINQ or a static extension method (`query.Paid()`) is usually enough.

## Sources

- [Specifications (Eric Evans, Martin Fowler)](https://martinfowler.com/apsupp/spec.pdf)
- [Ardalis.Specification](https://github.com/ardalis/Specification)
- [Expression trees (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)
- [Designing the infrastructure persistence layer (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

## Questions

### What is the specification pattern? {mid}

A pattern that encapsulates a business rule or selection criterion in a separate object with a method like `IsSatisfiedBy(entity)`. Specifications can be combined with `And`, `Or` and
`Not` to build complex rules from simple ones. They give rules a name, make them reusable across validation, selection and querying, and keep them out of services and controllers.

### Why use `Expression<Func<T, bool>>` instead of `Func<T, bool>` in a specification? {mid}

A `Func<T, bool>` is compiled code: passing it to `Where` on a `DbSet` makes it the `IEnumerable` overload, so all rows are loaded and filtered in memory. An expression tree is data
describing the lambda, which EF Core can translate to a SQL `WHERE` clause, and which can still be compiled with `.Compile()` to check a single object in memory. So one specification
serves both database queries and in-memory checks.

### How do you combine two expression-based specifications? {senior}

Two lambdas each have their own parameter, so you can't just join their bodies. Replace the parameter of one expression with the parameter of the other using an `ExpressionVisitor`,
then create a new lambda with `Expression.AndAlso` or `Expression.OrElse` over the two bodies; for `Not`, wrap the body in `Expression.Not`. EF Core also accepts combining via
`Expression.Invoke`, but parameter replacement produces a cleaner tree that other LINQ providers handle as well.

### What problem does the specification pattern solve in repositories? {mid}

Without it, repositories accumulate query methods for every combination of criteria (`GetActiveByCustomer`, `GetActiveByCustomerAndDate`...), or they expose `IQueryable` and let query
logic spread around. With specifications the repository has one method, e.g. `ListAsync(ISpecification<T>)`, and each criterion is a named, testable, reusable class that can be
combined.

### How is the specification pattern related to the composite pattern? {mid}

`And`, `Or` and `Not` specifications are composites: they contain other specifications and evaluate by combining their children's results. A complex rule becomes a tree of small
specifications, which can be built at runtime, for example from filters chosen by a user in the UI.

### What can go wrong when a specification is used with EF Core? {senior}

The expression must be translatable to SQL. Calling a custom C# method, a non-mapped property, or some .NET functions inside the lambda works when compiled in memory but throws at
runtime when EF Core can't translate it (or, in older versions, silently evaluated on the client). Also, complex combined expressions can produce inefficient SQL, so it's worth checking
the generated query with `ToQueryString()` or logging.

### What does Ardalis.Specification add to the basic pattern? {senior}

It turns a specification into a description of a whole query, not just a predicate: criteria, `Include`s, ordering, paging, projections (`Select`), `AsNoTracking` and caching settings,
defined with a fluent builder in the specification's constructor. A generic repository (or an evaluator applied to a `DbSet`) applies the specification to produce the EF Core query. This
keeps query logic in named, reusable classes while still using EF features.

### When is the specification pattern overkill? {mid}

When criteria are simple and used in one place: an inline `Where` or a static extension method on `IQueryable<T>` (e.g. `orders.Paid().CreatedAfter(date)`) is shorter, composable, and
translatable. Specifications pay off when rules are domain concepts reused in several places, need to be checked both in memory and in queries, or are combined dynamically.

### How do you test specifications? {mid}

Test the rule itself with `IsSatisfiedBy` on in-memory objects: fast unit tests for each specification and combination, including edge cases. Then check translation separately: an
integration test running the specification against a real database (or at least calling `ToQueryString()` to catch untranslatable expressions), because in-memory evaluation can
succeed where SQL translation fails and may differ in details such as string comparison or null semantics.

### How do specifications support domain validation? {senior}

A domain rule like "an order can be shipped if it's paid and has an address" can be a specification used by the aggregate before a state change (`if (!new ShippableOrder().IsSatisfiedBy(this)) throw ...`),
by the UI to enable a button, and by a query to list all shippable orders. Having one definition of the rule removes duplicated and diverging conditions across layers.
