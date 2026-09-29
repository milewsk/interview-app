# Coupling and cohesion {mid}

**Coupling** is how much modules depend on each other; **cohesion** is how strongly the elements inside one module belong together. The goal, from classes up
to microservices, is **low coupling and high cohesion**: a change should stay inside one module and not ripple through the system. Most design principles
(SRP, DIP, bounded contexts, modular monoliths) are ways of achieving it.

## Coupling

Two modules are coupled when a change in one may force a change in the other. Forms of coupling, from worst to most acceptable:

| Kind | Example |
|---|---|
| **Content** | one module modifies another's internal data (reflection into private fields, writing to another service's tables) |
| **Common / global** | modules share global mutable state (static variables, a shared database used by several services) |
| **Control** | one module passes a flag telling another what to do (`Process(order, isRefund: true)`) |
| **Stamp** | a module receives a whole structure but uses only part of it |
| **Data** | modules share only the simple data they need through parameters |
| **Message** | modules communicate only by messages or events, knowing nothing else about each other |

Other kinds that matter in practice:

- **Temporal coupling**: operations must happen in a certain order (`Init()` before `Run()`), or two services must both be available at the same time
  (synchronous calls).
- **Deployment coupling**: modules must be released together (shared libraries with breaking changes, a "distributed monolith").
- **Semantic coupling**: both sides share hidden assumptions, e.g. about the meaning of a status value.

## Cohesion

A module is cohesive when its elements work towards one purpose and change together. From best to worst: **functional** (everything contributes to one well-defined
task), sequential, communicational, procedural, temporal (things grouped because they run at the same time, e.g. "startup tasks"), logical (grouped by category,
e.g. a `Utils` class) and **coincidental** (no relationship at all). Classes named `Helper`, `Manager` or `Utils` are often signs of low cohesion.

## Measuring: stability and dependencies

Robert C. Martin's package metrics:

- **Afferent coupling (Ca)**: how many outside classes depend on this package (its responsibility).
- **Efferent coupling (Ce)**: how many outside classes this package depends on.
- **Instability** `I = Ce / (Ce + Ca)`, from 0 (stable: many depend on it, it depends on little) to 1 (unstable: easy to change, nothing depends on it).

The **stable dependencies principle**: depend in the direction of stability, i.e. volatile modules (UI, adapters) depend on stable ones (the domain), never the other
way around. The **acyclic dependencies principle**: no cycles between modules, because a cycle makes them effectively one module.

## Organizing code for cohesion

- **Package by layer** (`Controllers/`, `Services/`, `Repositories/`) groups code by technical role, so one feature change touches every folder.
- **Package by feature / vertical slices** (`Orders/`, `Invoices/`, each with its endpoint, handler, validation and data access) groups code that changes
  together, which increases cohesion and makes features easier to find, change and delete.
- Between modules, communicate through small, explicit interfaces or messages, and don't share database tables.

## Coupling in distributed systems

Splitting a system into services doesn't reduce coupling by itself: services that call each other synchronously in long chains, share a database or must be
deployed together are a **distributed monolith**, with the downsides of both. Lower it with asynchronous messaging, owning data per service, backward-compatible
contracts and consumer-driven design.

## Sources

- [Coupling (Wikipedia)](https://en.wikipedia.org/wiki/Coupling_%28computer_programming%29)
- [Cohesion (Wikipedia)](https://en.wikipedia.org/wiki/Cohesion_%28computer_science%29)
- [Software package metrics (Wikipedia)](https://en.wikipedia.org/wiki/Software_package_metrics)
- [Reducing coupling (Martin Fowler, IEEE Software)](https://martinfowler.com/ieeeSoftware/coupling.pdf)
- [Vertical slice architecture (Jimmy Bogard)](https://www.jimmybogard.com/vertical-slice-architecture/)

## Questions

### What do coupling and cohesion mean? {junior}

Coupling measures how dependent modules are on each other: with high coupling, a change in one forces changes in others. Cohesion measures how closely related the
responsibilities inside one module are: with high cohesion, everything in the module serves one purpose. Good design aims for low coupling between modules and high
cohesion within them, so changes stay local.

### Why is low coupling desirable? {junior}

Loosely coupled modules can be understood, changed, tested, deployed and scaled independently: a change inside one doesn't ripple into others, teams can work in
parallel, and parts can be replaced (e.g. swapping a payment provider behind an interface). High coupling makes every change risky and expensive, because you have
to understand and retest many parts of the system.

### What is control coupling? {mid}

One module passes a parameter that controls the internal logic of another, e.g. `Process(order, isRefund: true)` or an enum telling a method which branch to take.
The caller must know how the callee works inside, and the callee does several things. It's usually better to split it into separate operations (`Process`,
`Refund`) or use polymorphism, which also improves cohesion.

### What does a class named `Utils` or `Helper` usually say about cohesion? {mid}

That it probably has low (logical or coincidental) cohesion: unrelated functions grouped only because they didn't fit elsewhere, e.g. string formatting, date math
and file handling in one class. Such classes grow without limit, become dependencies of everything, and changes in them affect unrelated code. Moving each function
next to the concept it serves (an extension method on the type, a value object, a domain service) raises cohesion.

### What is instability in the sense of package metrics? {senior}

Robert C. Martin's metric `I = Ce / (Ce + Ca)`, where Ce is the number of outside classes a package depends on (efferent coupling) and Ca is the number of outside
classes that depend on it (afferent coupling). I = 0 means a stable package: many depend on it and it depends on nothing, so it's hard to change. I = 1 means an unstable
package that nothing depends on. Dependencies should point towards stability: the UI (unstable) depends on the domain (stable).

### What is temporal coupling? {mid}

A dependency on timing or order: methods that must be called in a specific sequence (`Open()` before `Read()`, `Init()` before use), or services that must all be
available at the same moment because they call each other synchronously. The first is reduced by designing objects that are valid after construction; the second by
asynchronous messaging, queues and caching, so a temporarily unavailable service doesn't take others down.

### How does package by feature differ from package by layer? {mid}

Package by layer groups code by technical role (`Controllers`, `Services`, `Repositories`), so implementing or changing one feature touches files spread across all
folders, and unrelated features sit next to each other. Package by feature (vertical slices) groups everything for one feature together (endpoint, handler,
validation, data access), which increases cohesion, makes features easier to find and delete, and lets them evolve independently.

### What is a distributed monolith? {senior}

A system split into services that remain tightly coupled: they share a database, call each other synchronously in long chains, share libraries with breaking changes
or must be deployed together. It has the operational complexity of microservices (network failures, distributed debugging) without their benefits (independent
deployment and scaling). It's usually a sign that service boundaries were drawn along technical layers rather than business capabilities.

### Why shouldn't two services share a database? {mid}

A shared database is common coupling: the schema becomes a contract that neither service can change without coordinating with the other, one service can bypass the
other's business rules by writing directly to its tables, and performance problems or migrations of one affect both. Each service should own its data and expose it
through an API or events. Read-only replicas or published data products are safer ways to share data.

### What is the acyclic dependencies principle? {mid}

The dependency graph between modules (projects, packages, namespaces) should have no cycles. If A depends on B and B depends on A, directly or through others, they
can't be built, tested or released independently and effectively behave as one module. Cycles are broken by extracting the shared part into a new module or by
dependency inversion: introduce an interface owned by one side and implemented by the other.
