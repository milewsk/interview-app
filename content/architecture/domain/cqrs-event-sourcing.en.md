# CQRS and event sourcing {senior}

**CQRS** (Command Query Responsibility Segregation) uses **different models for writing and reading** data. **Event sourcing** stores the **history of changes**
(events) instead of the current state. They're often mentioned together and combine well, but each can be used without the other, and both add complexity that's
justified only in specific parts of a system.

## From CQS to CQRS

- **CQS** (command–query separation, Bertrand Meyer) is a method-level rule: a method either changes state (a command, returns nothing) or returns data (a query, has no
  side effects), not both.
- **CQRS** lifts it to the architecture: Martin Fowler describes it as using "a different model to update information than the model you use to read information".

```
Commands ──► command handlers ──► domain model (aggregates, rules) ──► write store
                                                    │ events
                                                    ▼
Queries  ──► query handlers ──► read models (denormalized, DTO-shaped) ◄── projections
```

- The **write side** focuses on business rules and consistency: rich aggregates, validation, transactions.
- The **read side** focuses on queries: DTOs projected directly from the database (plain SQL, Dapper, EF Core projections with `AsNoTracking`), or separate
  denormalized read tables, caches or search indexes.
- **Levels**: the lightest form is simply separate command and query handlers over the same database (common in .NET with MediatR-style handlers). The heavier form
  has a separate read database updated asynchronously from events, which means the read side is **eventually consistent**.

Fowler's warning: "for most systems CQRS adds risky complexity"; apply it only to specific bounded contexts where reads and writes are very different, not to the whole
system.

## Event sourcing

Instead of storing the current balance, store what happened: `AccountOpened`, `Deposited(100)`, `Withdrawn(30)`. The current state is derived by **replaying** the events.

```csharp
public static Account Rehydrate(IEnumerable<Event> events)
{
    var account = new Account();
    foreach (var e in events) account.Apply(e);   // Deposited → +amount, Withdrawn → −amount
    return account;
}
```

A test of a minimal event store showed:

- replaying `AccountOpened`, `Deposited(100)` and `Withdrawn(30)` gave balance 70 at version 3;
- appending with a stale **expected version** failed: "expected version 2, actual 3", which is the optimistic concurrency mechanism of event stores;
- replaying only the first 2 events gave the state at that point in time (100): **time travel** and a full audit trail for free;
- a **projection** built a read model (`Ada, 120, 3 transactions`) from the event stream;
- a **snapshot** (state at version 3) plus the later events gave the same result as a full replay.

Benefits: complete audit log, the ability to rebuild state and new read models from history, temporal queries, natural integration through events. Costs: events are
**immutable and permanent**, so changing their schema requires versioning or upcasting; queries need projections; streams grow and need snapshots; eventual consistency
of read models; GDPR "right to be forgotten" is harder (crypto-shredding); and a steep learning curve.

## When to use them

- CQRS: when read and write workloads differ a lot (complex domain rules on writes, many varied queries or very high read load), or when different teams own reads and
  writes. The simple form (separate handlers, projections for reads) is cheap and widely useful.
- Event sourcing: domains where the history itself matters (finance, accounting, logistics, auditing), or where you need to derive many views from the same events. Not
  for simple CRUD.

## Sources

- [CQRS pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Event sourcing pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html)
- [Event sourcing (Martin Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Simplified CQRS and DDD in a microservice (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns)

## Questions

### What is CQRS? {mid}

Command Query Responsibility Segregation: separating the model used to change data (commands, handled by a write model with business rules and aggregates) from the model used to
read it (queries, served by read models shaped for the UI). Each side can be optimized independently: the write side for consistency and invariants, the read side for fast,
denormalized queries. It ranges from separate handlers over one database to separate databases synchronized by events.

### How does CQS differ from CQRS? {mid}

CQS (command–query separation) is a principle for individual methods: a method should either change state and return nothing, or return a value without side effects. CQRS
applies the same idea at the architectural level: separate models, handlers, and possibly stores for commands and queries. CQS is almost always a good idea; CQRS is a trade-off
worth making only in some contexts.

### Does CQRS require two databases? {mid}

No. The simplest CQRS uses one database with separate command handlers (loading aggregates, enforcing rules, saving) and query handlers (projecting directly to DTOs, e.g. with
`AsNoTracking` or Dapper). Separate read stores (denormalized tables, a document database, a search index) are an optional step for scaling or very different read shapes, and
bring eventual consistency and synchronization work.

### What is event sourcing? {mid}

A persistence approach in which the system stores the sequence of domain events that changed an entity (`AccountOpened`, `Deposited`, `Withdrawn`) instead of its current state.
The current state is reconstructed by replaying the events, and new events are appended. It gives a complete audit trail and the ability to rebuild state as of any moment or to
build new read models from history.

### How does optimistic concurrency work in an event store? {senior}

Each stream (aggregate) has a version equal to the number of its events. A command loads the stream, decides, and appends new events with the version it read as the
"expected version". If another writer appended in the meantime, the actual version differs and the append is rejected (in a test: "expected version 2, actual 3"). The command is
then retried against the fresh state or the conflict is reported to the user.

### What are projections and snapshots? {senior}

A projection processes the event stream and builds a read model optimized for queries, e.g. a table of account balances with transaction counts; it can be rebuilt from scratch by
replaying all events. A snapshot stores an aggregate's state at a given version, so loading it only needs the snapshot plus the events after it, instead of replaying a very long
stream. Both are optimizations derived from the events, which remain the source of truth.

### What are the downsides of event sourcing? {senior}

Complexity and a learning curve, eventual consistency of read models, the need for projections for any query, event schema evolution (stored events never change, so new versions
need upcasting or versioned handlers), growing streams that need snapshots, and difficulty deleting personal data (GDPR), often solved with crypto-shredding. It's rarely justified
for simple CRUD domains.

### When would you not use CQRS? {mid}

For simple domains and CRUD applications where the same model works fine for reading and writing, and for teams without experience with eventual consistency. Martin Fowler warns
that for most systems CQRS adds risky complexity and should be applied only to specific bounded contexts. A light form (separate query handlers that project to DTOs) gives much of
the benefit without the risk.

### How do read models stay up to date in CQRS with a separate read store? {senior}

The write side publishes events after a successful change (reliably, e.g. via a transactional outbox), and projection handlers consume them and update the read store. The read side
is therefore eventually consistent: for a short time after a command, a query may return old data. UIs handle it by returning the new state from the command, optimistic updates,
or waiting for the projection to reach a version.

### What does event sourcing give you that a normal audit log table doesn't? {senior}

In event sourcing the events are the source of truth, not a side record: the state is derived from them, so the history is guaranteed to be complete and consistent with the
state. You can rebuild state as of any point in time, fix bugs in derived data by replaying, and create new read models from past events. A separate audit table can drift from
the real state or miss changes made outside the code path that writes it.
