# Clean, hexagonal and onion architecture {mid}

Hexagonal architecture (ports and adapters, Alistair Cockburn), onion architecture (Jeffrey Palermo) and clean architecture (Robert C. Martin) are variations of
one idea: **business logic sits at the center and doesn't depend on anything external**, while the database, web framework, message broker and UI are
replaceable details around it. The .NET architecture guide notes that applications following dependency inversion and DDD tend to arrive at this shape.

## The dependency rule

```
        ┌──────────────────────────────────────────────┐
        │ Presentation / Infrastructure (adapters)      │  ASP.NET Core endpoints, EF Core, SMTP, queues
        │   ┌──────────────────────────────────────┐    │
        │   │ Application (use cases)               │    │  PlaceOrderHandler, IOrderRepository, IEmailSender
        │   │   ┌──────────────────────────────┐    │    │
        │   │   │ Domain (entities, rules)      │    │    │  Order, Money, OrderPlaced
        │   │   └──────────────────────────────┘    │    │
        │   └──────────────────────────────────────┘    │
        └──────────────────────────────────────────────┘
                 source code dependencies point inward only
```

- **Source code dependencies point only inward.** Nothing in an inner circle knows about anything in an outer one: the domain doesn't reference EF Core,
  ASP.NET Core or any infrastructure type.
- The inner circles define **interfaces (ports)** for what they need from the outside (`IOrderRepository`, `IEmailSender`, `IPaymentGateway`), and the outer
  circles provide **adapters** implementing them. This is dependency inversion at the architecture level.
- Data crosses boundaries as simple structures (DTOs, commands, results), not as framework-specific objects.

## Ports and adapters

Cockburn's intent: "Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its
eventual run-time devices and databases."

- **Driving (primary) side**: actors that call the application: an HTTP API, a CLI, a message consumer, a test. Their adapters translate requests into use-case calls.
- **Driven (secondary) side**: things the application calls: the database, e-mail, payment providers. The application defines the port, the adapter implements it,
  and tests substitute fakes.

## A typical .NET solution

| Project | Contains | References |
|---|---|---|
| `Domain` | entities, value objects, domain events, domain services, invariants | nothing (only the base library) |
| `Application` | use cases / command and query handlers, ports (`IOrderRepository`), DTOs, validation | `Domain` |
| `Infrastructure` | EF Core `DbContext` and migrations, repository implementations, e-mail, file storage, external API clients | `Application` |
| `Web` / `Api` | endpoints, middleware, composition root (DI registration) | `Application`, and `Infrastructure` only for wiring |

The composition root (`Program.cs`) is the one place that knows every concrete type and wires them together. Architecture tests (e.g. NetArchTest, ArchUnitNET) can
enforce the rule in CI: "`Domain` must not depend on `Microsoft.EntityFrameworkCore`".

## Benefits

- Business rules can be **unit tested** without a database, web server or network.
- Frameworks and infrastructure can be replaced or upgraded with limited impact.
- The structure communicates intent: use cases are visible in the application layer.

## Criticism and trade-offs

- **Overhead for simple applications**: four projects, interfaces and mappings for CRUD over a few tables is ceremony without payoff.
- **Mapping everywhere**: entities, persistence models, DTOs and view models may all look alike.
- **Repository on top of EF Core**: `DbContext` already implements unit of work and repositories; wrapping it in generic repositories often hides useful features. Many
  teams let the application layer depend on an `IAppDbContext` abstraction or use EF Core directly in handlers.
- Pure isolation of the domain from persistence is rarely total in practice (EF Core needs parameterless constructors or specific mappings), and that's usually an
  acceptable compromise.

## Sources

- [Common web application architectures: clean architecture (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
- [The clean architecture (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [The onion architecture (Jeffrey Palermo)](https://jeffreypalermo.com/blog/the-onion-architecture-part-1/)
- [Clean architecture solution template (Steve Smith)](https://github.com/ardalis/cleanarchitecture)
- [NetArchTest](https://github.com/BenMorris/NetArchTest)

## Questions

### What is the core idea of clean architecture? {junior}

Business logic is placed at the center and doesn't depend on frameworks, the database, the UI or external services; those are details in the outer layers that depend on
the core. Source code dependencies may point only inward (the dependency rule). As a result, business rules can be understood and tested in isolation, and infrastructure
can change without rewriting them.

### How does clean architecture differ from the traditional N-layer architecture? {mid}

In N-layer architecture the business layer depends on the data access layer, so dependencies point toward the database. Clean architecture inverts that: the application
core defines interfaces (e.g. `IOrderRepository`), and the infrastructure layer implements them and depends on the core. The database becomes a plug-in detail, and the
core can be unit tested without it.

### What are ports and adapters? {mid}

In hexagonal architecture, a port is an interface defined by the application for a purpose, either for being called (driving ports, like "place an order") or for calling
out (driven ports, like "save the order" or "send an e-mail"). An adapter is a technology-specific implementation that plugs into a port: an HTTP controller or message
consumer on the driving side, an EF Core repository or SMTP client on the driven side. Tests can plug in their own adapters.

### What goes into the Domain, Application and Infrastructure projects? {mid}

Domain: entities, value objects, aggregates, domain events and business invariants, with no framework dependencies. Application: use cases (command and query handlers or
application services), ports for infrastructure (`IOrderRepository`, `IEmailSender`), DTOs and validation, depending only on Domain. Infrastructure: implementations of those
ports (EF Core `DbContext`, repositories, e-mail, storage, external API clients), depending on Application. The Web project hosts endpoints and the composition root.

### What is the composition root? {mid}

The single place, usually `Program.cs` in the startup project, where the application's object graph is assembled: interfaces from the inner layers are mapped to their
implementations from Infrastructure in the DI container. It's the only place allowed to know all concrete types, which is why the startup project may reference Infrastructure
even though the rest of the presentation layer shouldn't use it directly.

### How do you enforce the dependency rule? {senior}

Primarily with project references: the Domain project doesn't reference Application or Infrastructure, and Application doesn't reference Infrastructure, so violating code
doesn't compile. Architecture tests (NetArchTest, ArchUnitNET) add rules that references can't express, e.g. "types in Domain must not depend on
`Microsoft.EntityFrameworkCore`" or "handlers must be sealed", and run in CI. Code reviews and clear conventions cover the rest.

### What are the downsides of clean architecture? {mid}

It adds structure: several projects, interfaces and mapping between entities and DTOs, which is overhead for simple CRUD applications where there's little business logic to
protect. Abstractions like generic repositories over EF Core can hide useful ORM features. It's worth it when the domain is complex or long-lived; for simple services a
single project or vertical slices may be better.

### Should you wrap EF Core in repositories in a clean architecture? {senior}

It's debated. `DbContext` is already a unit of work and `DbSet` a repository, so a generic repository wrapper often adds code and hides features such as projections,
`Include` and `AsNoTracking`. Arguments for specific repositories: they express domain operations, keep aggregate loading rules in one place and allow stubbing in unit tests.
A common compromise is specific repositories for aggregates on the write side and direct `DbContext` or query objects for reads.

### How does clean architecture make testing easier? {junior}

Because the domain and application layers don't depend on infrastructure, their logic can be tested with fast unit tests using simple fakes of the ports (an in-memory
repository, a fake e-mail sender) instead of a real database or network. Infrastructure adapters are covered by a smaller number of integration tests against real
dependencies. This matches the test pyramid.

### Are hexagonal, onion and clean architecture the same thing? {mid}

They're variations of the same principle with different emphasis and terminology. Hexagonal architecture focuses on ports and adapters and the symmetry between driving and
driven sides. Onion architecture draws concentric layers with the domain model at the center. Clean architecture generalizes them with the dependency rule and names layers
entities, use cases, interface adapters and frameworks. In practice .NET solutions implementing any of them look very similar.
