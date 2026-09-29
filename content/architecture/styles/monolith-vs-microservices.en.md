# Monolith, modular monolith and microservices {mid}

"Would you build this as microservices?" is one of the most common architecture questions. A good answer isn't "microservices are modern", but a discussion
of **trade-offs**: team size, domain boundaries, scaling needs and the operational cost the organization can afford.

## Definitions

- **Monolith**: the application is built and deployed as **one unit** (one process), even if internally split into projects or layers. It scales by running more
  copies of the whole thing.
- **Modular monolith**: still one deployment unit, but internally divided into **modules with strict boundaries** (e.g. per bounded context): each module owns its
  data (separate schema or tables), exposes a small public API or events, and others can't reach into its internals.
- **Microservices**: in Martin Fowler and James Lewis's words, "an approach to developing a single application as a suite of small services, each running in its own
  process and communicating with lightweight mechanisms, often an HTTP resource API". Each service is **independently deployable**, **owns its data**, and is
  organized around a **business capability**.

## Characteristics of microservices (Fowler & Lewis)

Componentization via services, organized around business capabilities, products not projects, smart endpoints and dumb pipes, decentralized governance, decentralized
data management, infrastructure automation, design for failure, evolutionary design.

## Comparison

| | Monolith / modular monolith | Microservices |
|---|---|---|
| Deployment | one unit, simple | many independent units, needs CI/CD and orchestration |
| Scaling | the whole application | per service, where the load is |
| Communication | in-process method calls (fast, reliable) | network calls and messages (latency, partial failures) |
| Data and transactions | one database, ACID transactions | database per service, eventual consistency, sagas |
| Team autonomy | shared codebase and release | teams own and release services independently |
| Technology | one stack | can differ per service |
| Debugging and operations | one process, simple logs | distributed tracing, centralized logging, service discovery, more infrastructure |
| Refactoring boundaries | cheap (move code) | expensive (change APIs, migrate data) |

## When microservices make sense

- **Many teams** that need to work and release independently (Conway's law: system structure mirrors the organization's communication structure).
- Parts with very **different scaling or availability** requirements.
- A **well-understood domain** with stable boundaries.
- The organization can afford the **microservice premium**: automated deployment, monitoring, tracing, on-call for many services.

When they don't: small teams, early products whose domain is still being discovered, and systems without real independent scaling needs. Fowler's "MonolithFirst"
observation: almost all successful microservice stories started with a monolith that grew too big and was broken up, while systems built as microservices from scratch
often ended up in serious trouble, largely because the boundaries were wrong and refactoring between services is expensive.

## Migrating from a monolith

- Start by **modularizing** the monolith: clear module boundaries, no shared tables, communication through interfaces or in-process events. A well-modularized
  monolith is easy to split; a big ball of mud isn't.
- **Strangler fig**: put a routing layer in front, move one capability at a time into a new service, route its traffic there, and remove it from the monolith, until
  the old system is gone.
- Extract the parts with the clearest boundaries and the strongest need (independent scaling, a separate team) first.

## Common pitfalls

- A **distributed monolith**: services that share a database, call each other synchronously in long chains, or must be deployed together.
- Services split by **technical layer** (a "database service", a "validation service") instead of business capability.
- Chatty communication: one user request fanning out into dozens of synchronous calls.
- Underestimating the work of data consistency without distributed transactions.

## Sources

- [Microservices (James Lewis, Martin Fowler)](https://martinfowler.com/articles/microservices.html)
- [MonolithFirst (Martin Fowler)](https://martinfowler.com/bliki/MonolithFirst.html)
- [Microservices architecture style (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices)
- [.NET microservices: architecture for containerized .NET applications](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [Decompose by business capability (microservices.io)](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html)
- [Strangler fig application (Martin Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html)

## Questions

### What is a microservices architecture? {junior}

An architecture in which one application is built as a set of small services, each running in its own process, owning its data, deployable independently and responsible
for one business capability, communicating over the network (HTTP/gRPC APIs or messaging). It enables independent deployment, scaling and team ownership, at the cost of
distributed-system complexity.

### What are the advantages and disadvantages of a monolith? {junior}

Advantages: simple development, debugging, testing and deployment; fast in-process calls; ACID transactions across the whole domain; easy refactoring of boundaries. Disadvantages
as it grows: long build and test times, the whole application must be redeployed for every change, it can only be scaled as a whole, one team's change can break another's,
and without discipline it degrades into a "big ball of mud" with tangled dependencies.

### What is a modular monolith? {mid}

A single deployable application internally divided into modules with strict boundaries, typically aligned with bounded contexts. Each module owns its data (its own schema or
tables), exposes a small public interface or events, and other modules can't access its internals. It keeps the operational simplicity of a monolith while gaining much of the
maintainability of microservices, and makes a later split into services much easier.

### When would you choose microservices? {mid}

When several teams need to develop and release independently, when parts of the system have very different scaling or availability requirements, when the domain and its
boundaries are well understood, and when the organization has the automation and operational maturity (CI/CD, monitoring, tracing) to run many services. Without these, a
(modular) monolith is usually faster and cheaper, and Fowler recommends starting with one.

### Why is "monolith first" often recommended? {mid}

Getting service boundaries right requires understanding the domain, which early in a product is still changing, and moving functionality between services is much more expensive
than moving it between modules in one codebase. Microservices also carry a fixed operational premium that pays off only for complex systems. Starting with a well-modularized
monolith lets the team learn the domain and extract services later where it clearly helps.

### How should data be managed in microservices? {mid}

Each service owns its data and is the only one that reads and writes its database (database per service); others get data through its API or by consuming its events and keeping
their own copies. There are no distributed transactions across services, so consistency between them is eventual and multi-service processes use sagas. A shared database would
couple the services and defeat independent deployment.

### What is the strangler fig pattern? {mid}

A way to replace a legacy system incrementally: a routing layer (a proxy or API gateway) sits in front of the old application, new or rewritten functionality is built as a separate
service, and traffic for that functionality is gradually routed to it. Piece by piece the old system is "strangled" until it can be retired. It avoids a risky big-bang rewrite
and delivers value continuously.

### What is Conway's law, and why does it matter for architecture? {senior}

Conway's law says that organizations design systems that mirror their communication structures. With a UI team, a backend team and a database team, systems tend to split by
technical layers; with teams aligned to business capabilities, they split by capability. Microservice boundaries work best when they match team boundaries, so each team can own
and change its services independently; the "inverse Conway maneuver" shapes teams to get the desired architecture.

### What operational capabilities does a microservices architecture require? {mid}

Automated build, test and deployment per service (CI/CD), containerization and orchestration, centralized logging, metrics and distributed tracing (e.g. OpenTelemetry) to follow a
request across services, health checks, service discovery and configuration management, resilience mechanisms (timeouts, retries, circuit breakers), API versioning and contract
tests. Without them, many services quickly become impossible to operate and debug.

### How do you decide where to draw service boundaries? {senior}

Along business capabilities and bounded contexts, not technical layers: a service should own a cohesive part of the domain with its data and rules (orders, billing, catalog), so
most changes touch one service. Signs of good boundaries: few synchronous calls between services, little shared data, independent release cadence, and a team that can own it.
Event storming and domain analysis help find them, and a modular monolith lets you validate boundaries before paying the cost of splitting.
