# Messaging and data consistency: outbox, sagas, idempotency {senior}

Once data is spread across services (or between a database and a message broker), a single ACID transaction no longer covers the whole operation. Interviews
check whether you know the resulting problems (**dual writes**, duplicated messages, partial failures) and the standard patterns: **transactional outbox**,
**idempotent consumers** and **sagas**.

## Synchronous vs asynchronous communication

- **Synchronous** (HTTP, gRPC): the caller waits for the answer. Simple to reason about, but creates temporal coupling: if the callee is slow or down, so is the caller,
  and chains of calls multiply latency and failure probability.
- **Asynchronous** (messages through a broker: RabbitMQ, Azure Service Bus, Kafka): the sender publishes and continues; the receiver processes later. Services stay
  available independently and load is buffered, at the cost of **eventual consistency** and more moving parts.
- **Commands** ("ReserveStock") are addressed to one handler and express intent; **events** ("OrderPlaced") announce facts to any interested subscribers.

## The dual-write problem

```csharp
await db.SaveChangesAsync();                 // 1. commit the order
await bus.PublishAsync(new OrderPlaced(...)); // 2. publish the event → if the process dies here, the event is lost
```

Two separate systems can't be updated atomically: if publishing fails after the commit, other services never learn about the order; if you publish first and the commit
fails, they react to an order that doesn't exist. Distributed transactions (2PC) across a database and a broker are usually unavailable or too costly.

## Transactional outbox

Write the message into an **outbox table in the same database transaction** as the business change; a separate **relay** (a background worker or change data capture)
reads unprocessed rows, publishes them to the broker and marks them processed.

```csharp
db.Orders.Add(order);
db.Outbox.Add(new OutboxMessage { Type = "OrderPlaced", Payload = JsonSerializer.Serialize(new { order.Id, order.Total }) });
await db.SaveChangesAsync();                 // one transaction: both or neither
```

In a test with EF Core and SQLite, a failed save left neither the order nor the outbox message, and when the relay crashed after publishing but before marking the message
processed, the broker received the same message **twice**. The outbox guarantees **at-least-once** delivery, so consumers must tolerate duplicates. Libraries such as
MassTransit, NServiceBus, Wolverine and Brighter implement it for .NET.

## Idempotent consumers

A message handler is idempotent when processing the same message several times has the same effect as processing it once. Techniques:

- record processed message IDs in a table with a unique key, **in the same transaction** as the handler's changes (in the test: the duplicate was rejected by the key and
  only one shipment was created);
- design operations as naturally idempotent (`SET status = 'Shipped'` rather than `stock = stock - 1`), or use upserts;
- carry a business key or version in the message and ignore stale ones.

"Exactly-once processing" in practice means at-least-once delivery plus idempotent handling.

## Sagas

A saga implements a business process spanning several services as a **sequence of local transactions**, each publishing an event or message that triggers the next step.
If a step fails, **compensating transactions** undo the previous steps (refund the payment, release the reserved stock), because there's no global rollback.

- **Choreography**: services react to each other's events with no central coordinator. Simple for a few steps, but the flow becomes hard to follow and change as it grows.
- **Orchestration**: a saga orchestrator (a state machine, e.g. MassTransit's, or a workflow engine) tells each participant what to do and tracks progress. The flow is
  explicit and easier to monitor, at the cost of a central component.
- Compensations are business actions, not technical undo: an e-mail that was already sent can't be unsent, only followed by another one. Steps may need **pivot** points
  after which the saga only moves forward.

## Other practices

- Messages need unique IDs, correlation IDs for tracing, and a schema that evolves in a backward-compatible way.
- **Dead-letter queues** hold messages that repeatedly fail, so one poison message doesn't block the queue.
- Consumers must not assume ordering unless the broker guarantees it per key (e.g. Kafka partitions, Service Bus sessions).

## Sources

- [Transactional outbox (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
- [Idempotent consumer (microservices.io)](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
- [Saga pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
- [Compensating transaction pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
- [Communication in a microservice architecture (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/communication-in-microservice-architecture)

## Questions

### How do synchronous and asynchronous communication between services differ? {mid}

Synchronous calls (HTTP, gRPC) make the caller wait for a response, which is simple but couples availability and latency: if the callee is down or slow, the caller is too,
and long call chains amplify failures. Asynchronous messaging through a broker lets the sender continue immediately and the receiver process later, so services stay
available independently and load spikes are buffered, at the cost of eventual consistency, duplicate handling and more infrastructure.

### What is the dual-write problem? {senior}

It occurs when an operation must update two systems that can't share a transaction, typically saving to a database and publishing a message. If the process fails between the
two, the systems disagree: the order is saved but no event is published, or an event is published for data that was never committed. Retrying doesn't fix it reliably. The
transactional outbox pattern solves it by making the message part of the database transaction.

### How does the transactional outbox pattern work? {senior}

The service writes the business change and a message record into an outbox table in the same local transaction, so both are committed or neither is. A separate relay process
(polling or change data capture) reads unpublished outbox records, publishes them to the broker and marks them as sent. Because the relay can crash after publishing and before
marking, the same message can be published more than once, so the pattern provides at-least-once delivery and requires idempotent consumers.

### What is an idempotent consumer, and why is it needed? {mid}

A message handler that produces the same result whether a message is processed once or several times. It's needed because brokers and outbox relays deliver at least once:
retries after timeouts, redeliveries after crashes and relay restarts all create duplicates. Typical implementation: store processed message IDs in a table with a unique
constraint in the same transaction as the handler's changes, and skip messages already recorded; or make the operation naturally idempotent.

### What is a saga? {senior}

A way to implement a business transaction that spans several services without a distributed transaction: it's a sequence of local transactions in each service, where each step
publishes an event or message that triggers the next. If a step fails, previously completed steps are undone by compensating transactions (e.g. refund the payment, release
reserved stock). The system is eventually consistent while the saga runs.

### How does choreography differ from orchestration in sagas? {senior}

In choreography there's no coordinator: each service listens to events and reacts, publishing its own events; it's decentralized and simple for short flows, but the overall
process is implicit and hard to follow, and cyclic dependencies can appear. In orchestration a central orchestrator (a state machine or workflow) sends commands to participants
and tracks the state, which makes the flow explicit, easier to monitor and change, at the cost of a central component that knows the whole process.

### What is a compensating transaction? {mid}

A business operation that semantically undoes the effect of an earlier completed step in a saga, since there's no rollback across services: cancel a reservation, refund a
payment, send a correction. Compensations must themselves be reliable and idempotent, and some effects can't be undone (a sent e-mail), so the process is designed with that in
mind, e.g. by performing irreversible steps last.

### Is "exactly-once" message delivery possible? {senior}

Not across a network in the general case: a sender can't distinguish a lost message from a lost acknowledgement, so it must either risk losing messages (at-most-once) or resend
them (at-least-once). What systems achieve is effectively-once processing: at-least-once delivery combined with idempotent or deduplicating consumers, and transactional handling
of the consumer's side effects. Some brokers offer "exactly-once" features that work within their own boundaries only.

### How does a command differ from an event in messaging? {mid}

A command is a request to do something (`ReserveStock`), sent to one specific handler that may accept or reject it; it's named in the imperative. An event is a notification that
something already happened (`OrderPlaced`), published to any number of subscribers that the publisher doesn't know about; it's named in the past tense and can't be rejected.
Commands couple the sender to the receiver's capability, events decouple them.

### What is a dead-letter queue? {mid}

A separate queue where the broker moves messages that couldn't be processed after a configured number of attempts, or that expired or were rejected. It prevents a "poison"
message from blocking the queue or being retried forever, and gives operators a place to inspect, fix and replay failed messages. Monitoring and alerting on dead-letter queues is
part of running a messaging system.
