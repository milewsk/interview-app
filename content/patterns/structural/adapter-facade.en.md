# Adapter and facade {junior}

Both patterns put a new interface in front of existing code, but for different reasons. An **adapter** makes an existing class **fit an interface** that the
client expects. A **facade** gives a **simple interface to a complex subsystem**. They're among the most frequently used patterns in integration code.

## Adapter

The client expects `IPaymentGateway`; a legacy payment system speaks XML with different names and units. The adapter implements the expected interface and translates
calls:

```csharp
public interface IPaymentGateway { Task<PaymentResult> ChargeAsync(PaymentRequest request); }

public class LegacyPaymentAdapter(LegacyPaySystem legacy) : IPaymentGateway      // adapts LegacyPaySystem to IPaymentGateway
{
    public Task<PaymentResult> ChargeAsync(PaymentRequest r)
    {
        var xml = new XElement("payment",
            new XElement("ref", r.OrderId),
            new XElement("amountCents", (int)(r.Amount * 100)),         // unit conversion
            new XElement("ccy", r.Currency)).ToString();
        var response = XDocument.Parse(legacy.Pay(xml)).Root!;
        return Task.FromResult(new PaymentResult(response.Element("status")!.Value == "OK", response.Element("txn")?.Value));
    }
}
```

In a test, `ChargeAsync` on the adapter returned `Success = true, TransactionId = T-ORD-1` from the XML legacy API. The client code knows only `IPaymentGateway`, so
the legacy system can be replaced later by a new adapter.

- **Object adapter** (composition: the adapter holds the adaptee) is the usual form in C#. A **class adapter** (inheriting from the adaptee) is limited by single
  inheritance.
- Adapters are the building blocks of **ports and adapters** architecture and of the **anticorruption layer** in DDD.
- In .NET: `StreamReader`/`StringReader` adapt a stream or string to `TextReader`, `ILogger` providers adapt logging libraries (Serilog, NLog), EF Core database
  providers adapt each database to EF's abstractions, `Task.Factory.FromAsync` adapted the old APM pattern to tasks.

## Facade

A subsystem has many classes that must be used together in the right order; the facade exposes one simple operation:

```csharp
public class CheckoutFacade(Inventory inventory, Billing billing, Shipping shipping)
{
    public string PlaceOrder(string sku, int qty, string city) =>
        !inventory.Reserve(sku, qty) ? "out of stock"
            : $"{billing.Invoice(sku, qty)}, {shipping.Schedule(city)}";      // → "INV-PEN-2, SHIP-Krakow"
}
```

- It **simplifies** usage and reduces coupling: clients depend on the facade, not on every subsystem class. The subsystem remains accessible for advanced uses.
- In .NET: `File.ReadAllText` (a facade over `FileStream`, `StreamReader` and encoding detection), `HttpClient.GetFromJsonAsync` (request, response handling and
  deserialization in one call), `WebApplication.CreateBuilder` hiding host configuration.
- Risk: a facade that keeps growing becomes a **god object** that knows everything. Keep it focused on one use case or area, and put logic in the subsystem, not in the
  facade.

## Adapter vs facade vs decorator vs proxy

| Pattern | Interface | Purpose |
|---|---|---|
| Adapter | **different** from the wrapped object's | make an incompatible object usable by a client |
| Facade | **new, simpler** interface over **many** objects | simplify a subsystem |
| Decorator | **same** as the wrapped object's | add behavior |
| Proxy | **same** as the wrapped object's | control access (lazy loading, caching, security, remoting) |

## Sources

- [Adapter (refactoring.guru)](https://refactoring.guru/design-patterns/adapter)
- [Facade (refactoring.guru)](https://refactoring.guru/design-patterns/facade)
- [Anti-corruption layer pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)

## Questions

### What is the adapter pattern? {junior}

A structural pattern that lets an object with an incompatible interface be used where a different interface is expected, by wrapping it in an adapter that implements the
expected interface and translates calls, data formats and units. Typical uses: integrating a legacy system or a third-party SDK behind your own interface, or supporting several
providers behind one abstraction.

### What is the facade pattern? {junior}

A structural pattern that provides a simple, higher-level interface to a complex subsystem made of many classes. The facade coordinates the subsystem objects for common tasks, so
clients call one method instead of orchestrating many objects in the right order. It reduces coupling between clients and the subsystem, which stays available for advanced use.

### How does an adapter differ from a facade? {mid}

An adapter converts one existing interface into another that a client already expects; it usually wraps a single object and doesn't simplify anything, it only makes it
compatible. A facade defines a new, simpler interface over a whole subsystem of objects, with the goal of making common operations easy. You write an adapter because of an
interface mismatch, and a facade because of complexity.

### How does an adapter differ from a decorator? {mid}

An adapter changes the interface: the wrapped object has a different interface from the one the client needs. A decorator keeps the same interface as the wrapped object and adds
behavior (logging, caching, retries), so decorators can be stacked and the client doesn't know they're there. Both wrap an object, but for different purposes.

### Give examples of adapters in .NET. {mid}

`StreamReader` and `StringReader` adapt a `Stream` or `string` to the `TextReader` API; logging providers for Serilog or NLog adapt those libraries to `ILogger`; EF Core providers
adapt SQL Server, PostgreSQL or SQLite to EF's internal abstractions; `Task.Factory.FromAsync` adapted the old Begin/End asynchronous pattern to `Task`; `ArraySegment<T>` and spans
expose parts of arrays through collection interfaces.

### How do adapters relate to hexagonal architecture? {senior}

In ports and adapters architecture, the application defines ports (interfaces) in its own terms, and adapters translate between those ports and concrete technologies: an EF
Core repository adapts the database, an SMTP client adapts e-mail, a controller adapts HTTP to use cases. The adapter pattern is exactly the mechanism that keeps the core
independent of infrastructure, and the anticorruption layer in DDD is a set of adapters protecting a model from an external one.

### What is the danger of a facade? {mid}

That it grows into a god object: every new feature adds a method, it starts containing business logic, and eventually everything depends on it and it depends on everything.
A facade should stay thin (coordinating, not deciding) and focused on one area; if it becomes large, split it into several facades or move logic into the subsystem's own classes.

### How do you test code that uses a third-party SDK? {mid}

Wrap the SDK behind your own interface with an adapter (`IPaymentGateway` implemented by `StripePaymentGateway`), so business code depends only on your interface and unit tests
use a fake implementation. The adapter itself is covered by a few integration tests against the real SDK or its sandbox. This also isolates the rest of the code from SDK version
changes and makes switching providers possible.

### What is the difference between an object adapter and a class adapter? {senior}

An object adapter uses composition: it holds a reference to the adaptee and delegates to it, so it can adapt any subclass of the adaptee and is the usual form in C#. A class
adapter uses inheritance: it derives from the adaptee and implements the target interface, which requires multiple inheritance of classes in the original form; in C# it's
possible only when the target is an interface, and it ties the adapter to one concrete adaptee class.

### Give an example of a facade in .NET. {junior}

`File.ReadAllText(path)` hides opening a `FileStream`, creating a `StreamReader`, detecting the encoding and reading to the end. `HttpClient.GetFromJsonAsync<T>` combines sending a
request, checking the status and deserializing JSON. `WebApplication.CreateBuilder(args)` sets up configuration sources, logging, DI and the web host in one call. Each simplifies
common usage while the detailed APIs remain available.
