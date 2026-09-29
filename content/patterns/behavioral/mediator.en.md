# Mediator {mid}

**Mediator** reduces chaotic dependencies between objects by making them **communicate through a mediator object** instead of referring to each other directly. Instead
of a web of N×N references, each component (a **colleague**) knows only the mediator, which coordinates them. In .NET the name is also strongly associated with **MediatR**,
a library that dispatches requests and notifications to handlers, which is a related but different use of the idea.

## Classic mediator

```csharp
public class ChatRoom                                           // the mediator
{
    private readonly Dictionary<string, User> _users = new();
    public void Join(User u) => _users[u.Name] = u;
    public void Broadcast(string from, string msg) { foreach (var u in _users.Values) if (u.Name != from) u.Receive(from, msg); }
    public void Direct(string from, string to, string msg) => _users[to].Receive(from, msg);
}

public class User(string name, ChatRoom room)                   // a colleague: knows only the room, not other users
{
    public string Name => name;
    public void Send(string msg) => room.Broadcast(name, msg);
    public void SendTo(string to, string msg) => room.Direct(name, to, msg);
    public void Receive(string from, string msg) => Console.WriteLine($"{name} <- {from}: {msg}");
}
```

In a test with three users: Ann's broadcast reached Bob and Cid (not Ann), and Bob's direct message reached only Ann. Typical uses: UI dialogs where controls affect each other
(a checkbox enables a field, a list selection fills a form), air traffic control, workflow coordination. The risk is that the mediator itself becomes a **god object** that
knows everything.

## In-process messaging: MediatR-style

```csharp
public record PlaceOrder(string Product, int Qty) : IRequest<int>;

public class PlaceOrderHandler : IRequestHandler<PlaceOrder, int>
{
    public Task<int> Handle(PlaceOrder r, CancellationToken ct) => Task.FromResult(42);
}

services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssemblyContaining<PlaceOrderHandler>();
    cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));             // pipeline behavior around every request
});

var id = await mediator.Send(new PlaceOrder("book", 2));        // one request → exactly one handler
await mediator.Publish(new OrderPlaced(id));                     // one notification → all handlers
```

Verified with MediatR 14: `Send` went through the logging behavior (`before → handler → after`) and returned 42; `Publish` ran both notification handlers (e-mail and statistics).

- The sender depends only on `IMediator` and a message type, not on the handler, so controllers stay thin and each use case is a separate handler (a common way to implement CQRS).
- **Pipeline behaviors** add cross-cutting concerns (validation, logging, transactions) around all handlers.
- Criticism: it's **indirection**; "go to definition" on `Send` doesn't lead to the handler, and injecting the handler (or a service) directly is often simpler. It adds
  little over plain DI in small applications.
- **Licensing**: newer MediatR versions are commercial (Lucky Penny Software) with a free Community license for small organizations (annual revenue under 5 million USD). Without
  a license key it logs a warning, which the message says is allowed for development and testing. Alternatives include source-generated `Mediator` (martinothamar), Wolverine,
  or a few dozen lines of your own dispatcher.

## Mediator vs observer vs facade

- **Observer**: one-way notifications from a subject to subscribers; the subject doesn't coordinate anything.
- **Mediator**: two-way coordination between peers that don't know each other; often implemented with events internally.
- **Facade**: simplifies access to a subsystem for clients; the subsystem's classes don't know the facade exists, while colleagues actively talk to the mediator.

## Sources

- [Mediator (refactoring.guru)](https://refactoring.guru/design-patterns/mediator)
- [MediatR (GitHub)](https://github.com/LuckyPennySoftware/MediatR)
- [MediatR licensing and pricing](https://mediatr.io/)
- [Mediator: source-generated alternative](https://github.com/martinothamar/Mediator)

## Questions

### What is the mediator pattern? {junior}

A behavioral pattern that defines an object which encapsulates how a set of objects interact. Instead of referring to each other directly, the objects (colleagues) communicate only
through the mediator, which coordinates them. This replaces many-to-many dependencies with one-to-many, so colleagues can be changed and reused independently.

### What problem does the mediator pattern solve? {junior}

When many components interact directly, each one holds references to several others, and the dependencies form a tangled web: changing one component affects many, and none of them
can be reused alone. Moving the interaction logic to a mediator makes components depend only on the mediator, and the rules of how they cooperate live in one place.

### What is MediatR and how does it relate to the pattern? {mid}

MediatR is a .NET library for in-process messaging: you send a request object through `IMediator.Send` and it's dispatched to exactly one registered handler, or publish a
notification to all its handlers. It decouples the sender from the handler, like a mediator, but it's closer to a command or message dispatcher than to the classic GoF mediator,
which coordinates interactions between colleagues. It's commonly used to structure CQRS-style handlers.

### What is the difference between `Send` and `Publish` in MediatR? {mid}

`Send` is for requests (commands and queries): each request type has exactly one handler, and the call returns its response. `Publish` is for notifications (events): any number of
handlers, including none, handle the same notification, and nothing is returned. By default notification handlers run sequentially, and an exception from one stops the rest, similar
to C# events.

### What are pipeline behaviors? {mid}

Behaviors are components that wrap the handling of every request (like middleware for the mediator): each receives the request and a `next` delegate, can run code before and after, or
short-circuit. They're registered as open generics (`AddOpenBehavior(typeof(LoggingBehavior<,>))`) and used for validation, logging, performance measurement, transactions and caching,
so handlers contain only the use case logic.

### What are the criticisms of using MediatR? {senior}

It adds indirection: the code sending a request doesn't show which handler runs, which makes navigation and debugging harder, and dependencies are hidden behind `IMediator` instead of
being visible in constructors. In many applications, injecting the handler or an application service directly is simpler and just as decoupled. Critics also point out that it's
sometimes used as a "service locator" for everything, including handlers calling other handlers. Its value grows with pipeline behaviors and a consistent handler-per-use-case
structure.

### What changed in MediatR licensing? {mid}

Newer MediatR versions are distributed under a commercial license by Lucky Penny Software, with a free Community license for small organizations (under 5 million USD annual revenue and
other conditions) and paid tiers for larger ones. The license key is configured at registration; without it the library logs a warning, while development and testing are allowed.
Teams that don't want the dependency stay on an older version or switch to alternatives like the source-generated Mediator library, Wolverine, or a small custom dispatcher.

### How does the mediator differ from the observer pattern? {mid}

Observer is one-way: a subject notifies subscribers about its changes and doesn't care what they do. Mediator coordinates interactions between several peer objects in both directions:
colleagues send messages to the mediator, which decides who to notify or what to call. A mediator is often implemented using observer internally (colleagues raise events, the mediator
subscribes).

### What is the risk of a mediator becoming a god object? {senior}

Since all interaction logic moves into the mediator, it can grow into a huge class that knows about every colleague and every rule, becoming the hardest part of the system to change and
test. Mitigations are keeping mediators small and focused on one interaction (one dialog, one workflow), splitting them by feature, and in message-based designs having a handler per
message instead of one central class.

### How would you implement a minimal mediator without a library? {senior}

Define `IRequest<TResponse>` and `IRequestHandler<TRequest, TResponse>` interfaces, register handlers in DI (e.g. with Scrutor scanning or manually), and write a dispatcher that
resolves `IRequestHandler<TRequest, TResponse>` from the `IServiceProvider` for the request's type and calls it. Pipeline behaviors can be added by resolving
`IEnumerable<IPipelineBehavior<...>>` and composing them around the handler call. A source generator can remove the reflection cost.
