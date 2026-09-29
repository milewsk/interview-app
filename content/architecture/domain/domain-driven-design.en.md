# Domain-Driven Design (DDD) {mid}

Domain-Driven Design (Eric Evans, 2003) is an approach to software with complex business rules: the code is organized around a **model of the business domain**,
built together with domain experts and expressed in their language. It has two parts: **strategic design** (how to divide a large domain) and **tactical design**
(building blocks for the model inside one part).

## Strategic design

- **Ubiquitous language**: one shared vocabulary used by developers and domain experts in conversations, documentation and **code**. If the business says "policy
  is underwritten", the code has `Policy.Underwrite()`, not `PolicyManager.UpdateStatus(3)`.
- **Bounded context**: an explicit boundary within which a model and its language are consistent. The same word can mean different things in different contexts:
  a "Product" in the catalog (description, photos), in warehousing (dimensions, stock) and in billing (price, tax rate). Instead of one huge shared model, each
  context has its own. Bounded contexts are natural candidates for modules or microservices.
- **Subdomains**: the **core** domain (the competitive advantage, where DDD effort pays off), **supporting** subdomains and **generic** ones (authentication,
  invoicing: often bought or used as a library).
- **Context mapping** describes relationships between contexts: shared kernel, customer–supplier, conformist, **anticorruption layer** (a translation layer that
  protects your model from a legacy or external model), open host service, published language.

## Tactical building blocks

| Block | What it is | Example |
|---|---|---|
| **Entity** | has an identity that persists over time; equality by ID | `Order`, `Customer` |
| **Value object** | defined only by its values, immutable, equality by value | `Money`, `Address`, `DateRange` |
| **Aggregate** | a cluster of objects treated as one unit for changes, with one **aggregate root** | `Order` with its `OrderLine`s |
| **Domain event** | something meaningful that happened in the domain | `OrderPaid` |
| **Repository** | a collection-like abstraction for loading and saving aggregates | `IOrderRepository` |
| **Domain service** | domain logic that doesn't belong to one entity | calculating a transfer between two accounts |
| **Factory** | encapsulates complex creation | `Order.Create(...)` |

```csharp
public readonly record struct Money
{
    public Money(decimal amount, string currency) { ArgumentOutOfRangeException.ThrowIfNegative(amount); Amount = amount; Currency = currency; }
    public static Money operator +(Money x, Money y) =>
        x.Currency == y.Currency ? new(x.Amount + y.Amount, x.Currency) : throw new InvalidOperationException("Currency mismatch");
    ...
}

public sealed class Order                       // aggregate root
{
    private readonly List<OrderLine> _lines = [];
    public IReadOnlyList<OrderLine> Lines => _lines;          // outsiders can't add lines directly
    public bool IsPaid { get; private set; }

    public void AddLine(string sku, int qty, Money price)
    {
        if (IsPaid) throw new InvalidOperationException("Cannot modify a paid order");   // invariant
        ...
    }

    public void Pay() { ...; IsPaid = true; _events.Add(new OrderPaid(Id, Total)); }
}
```

In a test: two `Money(10, "PLN")` values were equal, adding PLN to EUR threw "Currency mismatch", adding the same SKU twice merged it into one line with quantity 3,
paying raised `OrderPaid`, and adding a line afterwards threw "Cannot modify a paid order".

## Aggregate rules

- External code references and modifies the aggregate **only through its root**; internal objects (order lines) aren't changed directly.
- An aggregate is a **consistency boundary**: its invariants hold after every operation, and one transaction changes **one aggregate**. Other aggregates are updated
  through domain events and eventual consistency.
- Aggregates reference each other **by ID** (`CustomerId`), not by object references.
- Keep aggregates **small**: large aggregates cause concurrency conflicts and slow loading.

## When DDD is worth it

For complex, evolving business logic that's central to the product. For CRUD applications with little behavior, tactical DDD adds ceremony without much benefit, but
the strategic ideas (bounded contexts, ubiquitous language) are useful almost everywhere.

## Sources

- [Tackle business complexity with DDD and CQRS patterns (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/)
- [Domain events: design and implementation (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)
- [DDD reference (Eric Evans)](https://www.domainlanguage.com/ddd/reference/)
- [Bounded context (Martin Fowler)](https://martinfowler.com/bliki/BoundedContext.html)
- [DDD aggregate (Martin Fowler)](https://martinfowler.com/bliki/DDD_Aggregate.html)
- [Value object (Martin Fowler)](https://martinfowler.com/bliki/ValueObject.html)

## Questions

### What is Domain-Driven Design? {junior}

An approach to building software with complex business logic in which the code is structured around a model of the business domain, developed in close collaboration with
domain experts and expressed in a shared ubiquitous language. It includes strategic design (dividing the domain into bounded contexts and subdomains) and tactical patterns
(entities, value objects, aggregates, domain events, repositories) for implementing the model.

### What is a bounded context? {mid}

An explicit boundary (often a module, service or team) inside which a particular domain model and its terms have one consistent meaning. The same concept can be modeled
differently in different contexts: a "customer" in sales has leads and discounts, in support it has tickets, in billing it has payment methods. Separate models per context
avoid a bloated, ambiguous shared model, and bounded contexts are natural boundaries for modules or microservices.

### How does an entity differ from a value object? {junior}

An entity has an identity that persists as its attributes change: two orders with the same contents are still different orders, and equality is by ID. A value object has no
identity and is defined entirely by its values (money, an address, a date range): two `Money(10, "PLN")` are equal. Value objects should be immutable, validate themselves on
creation and are ideal for records in C#.

### What is an aggregate, and what is the aggregate root? {mid}

An aggregate is a cluster of related objects (e.g. an order and its lines) that is treated as a single unit for data changes and protects business invariants. The aggregate root
(the `Order`) is the only entry point: outside code calls its methods and holds references only to it, never modifying internal objects directly. This lets the root enforce rules
such as "a paid order can't be modified" in one place.

### Why should one transaction modify only one aggregate? {senior}

An aggregate is the consistency boundary, designed so its invariants can be enforced within one transaction. Changing several aggregates in one transaction makes the aggregates
larger in practice, increases locking and concurrency conflicts, and doesn't work when aggregates live in different services or databases. Changes to other aggregates are made in
separate transactions triggered by domain events, accepting eventual consistency between them.

### What are domain events? {mid}

Objects representing something meaningful that happened in the domain, named in the past tense in the ubiquitous language (`OrderPaid`, `CustomerRelocated`). An aggregate
records them when its state changes, and handlers react to them, e.g. by updating other aggregates, sending e-mails or publishing integration events for other services. They
decouple the side effects from the aggregate and make the business process explicit.

### What is an anticorruption layer? {mid}

A translation layer between your bounded context and another model, typically a legacy system or an external API. It converts the other side's concepts, formats and quirks into
your own model, so their design doesn't leak into and corrupt yours. It's implemented as adapters, facades and translators at the boundary, and it's particularly useful when you
can't change the other system.

### What is the ubiquitous language? {junior}

A common, precise vocabulary shared by developers and domain experts and used consistently in conversations, requirements, tests and the code itself (class, method and event
names). It reduces translation errors between "business speak" and "developer speak", and when the language changes, the code changes with it. It's valid within one bounded
context.

### Why should aggregates reference each other by ID? {senior}

Object references between aggregates blur their boundaries: loading one would pull in others, and code could modify another aggregate through the reference, bypassing its root and
its transaction. References by ID (`CustomerId` instead of `Customer`) keep aggregates independent, small and loadable on their own, make the transactional boundary explicit and
allow the aggregates to live in different databases or services.

### When is tactical DDD overkill? {mid}

When the application is mostly CRUD with little behavior: forms that save data with simple validation. Rich aggregates, value objects, domain events and repositories then add
ceremony without protecting meaningful invariants. DDD is worth it for the core domain, where business rules are complex, change often and give the business its advantage; supporting
and generic parts can use simpler approaches. Strategic ideas remain useful regardless.
