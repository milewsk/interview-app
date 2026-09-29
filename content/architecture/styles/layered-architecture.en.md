# Layered (N-layer) architecture {junior}

The most common way to organize business applications is to split them into **layers** by responsibility: presentation, business logic and data access.
It's the default starting point in many .NET projects and the reference point for comparing other styles (clean architecture, vertical slices).

## The classic layers

```
Presentation (UI / API)     controllers, endpoints, views, request/response DTOs
        ↓
Business logic (BLL)        services, domain rules, validation, transactions
        ↓
Data access (DAL)           repositories, EF Core DbContext, SQL
        ↓
Database
```

- Each layer has one responsibility and talks only to the layer below it: the UI doesn't query the database directly, and business logic goes through the data
  access layer.
- **Strict layering**: a layer may call only the layer directly beneath. **Relaxed layering**: it may skip layers (e.g. a read-only report endpoint querying data
  directly). Relaxing is common in practice for simple reads.
- An **application layer** (use cases / application services) is often placed between presentation and domain: it orchestrates a use case, opens the transaction,
  calls domain objects and repositories, and returns DTOs.

## Layers vs tiers

**Layers** are a **logical** separation inside the code (projects, namespaces). **Tiers** are a **physical** separation into processes or machines (browser, web
server, database server). A three-layer application is often deployed as a single tier plus a database; adding tiers adds network calls, latency and failure modes,
so it should be done for a reason (security zones, independent scaling).

## Benefits

- Separation of concerns: code is easier to find and reason about.
- Layers can be replaced (e.g. a different data store behind the same interface) and tested with fakes.
- Teams can specialize, and conventions are familiar to most developers.

## Drawbacks and common problems

- **Dependencies point toward the database.** In the traditional form, business logic depends on the data access layer (and therefore on the database), which makes
  it hard to unit test without a database. Clean architecture fixes this by inverting that dependency.
- **One feature touches every layer**: adding a field means changing the DTO, controller, service, repository and entity, spread across folders.
- **Pass-through layers**: services that only forward calls to repositories add code without adding value.
- **Anemic domain model** (Martin Fowler): entities are just data holders with getters and setters, and all the rules sit in "service" classes. That's procedural code
  in object clothing; rules get duplicated across services and invariants are easy to break.
- **Leaky layers**: returning EF Core entities or `IQueryable` from the data layer to controllers couples the UI to the database schema and allows accidental
  queries (e.g. lazy loading during serialization).

## Practical guidelines

- Map between layers deliberately: API DTOs are not entities, so schema changes don't leak into public contracts, and over-posting is prevented.
- Keep validation of input shape at the edge (request DTOs) and business invariants in the domain.
- Put transaction boundaries in the application layer (one use case = one transaction / `SaveChanges`).
- For small CRUD applications, a single project with folders is fine; split into projects when size or team structure requires it.

## Sources

- [Common web application architectures (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
- [N-tier architecture style (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/n-tier)
- [Presentation–domain–data layering (Martin Fowler)](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- [Anemic domain model (Martin Fowler)](https://martinfowler.com/bliki/AnemicDomainModel.html)

## Questions

### What is a layered architecture? {junior}

A way of organizing an application into horizontal layers with separate responsibilities, typically presentation (UI or API), business logic and data access, where
each layer uses only the layer below. It separates concerns, makes the code easier to navigate and allows replacing or faking a layer (e.g. data access in tests). It's
the most common structure for business applications and a frequent starting point.

### How do layers differ from tiers? {junior}

Layers are a logical division of code (projects, namespaces) within one application; tiers are a physical division into separately deployed processes or machines, such as a
browser, a web server and a database server. A three-layer application is often deployed as one tier plus a database. Every additional tier adds network latency and
failure points, so physical separation should serve a purpose like security or independent scaling.

### What is the main drawback of the traditional N-layer architecture? {mid}

Compile-time dependencies go from top to bottom, so the business logic layer, which holds the most important code, depends on the data access layer and indirectly on the
database. Testing business rules then needs a database or complex mocking of data access details, and infrastructure concerns leak upward. Clean architecture solves it by
having the business layer define interfaces that the data layer implements.

### What is an anemic domain model? {mid}

A model where entities are just property bags without behavior, and all business rules live in service classes that manipulate them. Martin Fowler calls it an anti-pattern:
it looks object-oriented but is procedural, rules get duplicated across services, and nothing stops code from putting an entity into an invalid state. A rich domain model
puts behavior and invariants into the entities themselves (`order.AddLine(...)`, `account.Withdraw(...)`).

### Why shouldn't controllers receive EF Core entities or `IQueryable`? {mid}

Returning entities couples the public API to the database schema, so renaming a column changes the JSON contract, and binding requests to entities allows over-posting (a
client setting fields like `IsAdmin`). `IQueryable` lets upper layers build queries that run later, possibly with lazy loading during serialization or N+1 queries, and blurs
where data access happens. DTOs or projections at the boundary keep layers independent.

### What is the difference between strict and relaxed layering? {mid}

In strict layering a layer may only call the layer immediately below it, so presentation always goes through business logic to reach data. Relaxed layering allows skipping
layers, e.g. a read-only query endpoint reading data directly. Strict layering enforces consistency but creates pass-through code for simple operations; many systems relax it
for reads while keeping writes going through the business layer (which also leads naturally to CQRS).

### Where should transactions be managed in a layered application? {mid}

In the application (service) layer, around a whole use case: one business operation should succeed or fail as a unit. With EF Core that usually means one `SaveChanges` per
use case, or an explicit transaction when several are needed. Managing transactions in repositories makes each repository call its own transaction and loses atomicity across
them; managing them in controllers mixes infrastructure concerns into the presentation layer.

### What are pass-through layers? {junior}

Layers that add no logic and only forward calls, e.g. a `ProductService.GetById` that just calls `ProductRepository.GetById`, which just calls `DbContext.Find`. They add files,
indirection and mapping without value. They appear when layering is applied mechanically. Allowing relaxed layering for simple reads, or organizing by feature, reduces them.

### When is a layered architecture a good choice? {junior}

For typical business and CRUD applications of small to medium size, with a team familiar with the style, where the domain logic isn't very complex. It's simple, well
understood and easy to start with. As domain complexity grows, dependency inversion (clean architecture) or feature-based organization (vertical slices) usually scale
better, and the layering can evolve in that direction.

### How does a vertical slice architecture differ from a layered one? {mid}

A layered architecture groups code by technical concern across the whole application, so one feature is spread across all layers. Vertical slices group code by feature (or
request): each slice contains its endpoint, handler, validation and data access, and slices can use different approaches internally (EF Core for one, raw SQL for another).
Slices maximize cohesion within a feature and minimize coupling between features, at the cost of less enforced structure across the codebase.
