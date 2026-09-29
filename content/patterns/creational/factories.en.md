# Factories: simple factory, factory method, abstract factory {mid}

Factories move the decision **which concrete class to create** out of the code that uses the object. The caller works with an abstraction and doesn't need `new` for
concrete types, which keeps it decoupled and open for new variants. Three variants are commonly confused in interviews, so it's worth knowing exactly how they differ.

## Simple factory (not a GoF pattern)

One method or class that decides which object to create, usually based on a parameter:

```csharp
public static class NotifierFactory
{
    public static INotifier Create(string kind) => kind switch
    {
        "email" => new EmailNotifier(),
        "sms" => new SmsNotifier(),
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
```

Simple and often enough. Adding a type means editing the `switch`, which breaks the Open/Closed Principle, but keeps creation logic in one place.

## Factory method (GoF)

A base class defines an operation that needs an object, but leaves **which object** to a method overridden by subclasses:

```csharp
public abstract class ReportGenerator
{
    protected abstract IExporter CreateExporter();          // the factory method
    public string Generate(string period) => CreateExporter().Export($"report {period}");
}

public class PdfReportGenerator : ReportGenerator
{
    protected override IExporter CreateExporter() => new PdfExporter();   // → "report Q3.pdf"
}
```

It's based on **inheritance**: the base class contains the algorithm, subclasses decide the product. It's close to the template method pattern.

## Abstract factory (GoF)

An interface for creating **families of related objects** that must be used together, without naming concrete classes:

```csharp
public interface IUiFactory { IButton CreateButton(); ICheckbox CreateCheckbox(); }
public class DarkTheme : IUiFactory { public IButton CreateButton() => new DarkButton(); public ICheckbox CreateCheckbox() => new DarkCheckbox(); }
public class LightTheme : IUiFactory { ... }
```

The client receives one `IUiFactory` and gets consistent products (a dark button with a dark checkbox, never mixed). Other examples: database providers (connection,
command and parameter of the same provider: `DbProviderFactory` in ADO.NET), cloud providers, test vs production implementations.

## Factories and dependency injection

In modern .NET the DI container is the main "factory", but explicit factories are still needed when:

- the concrete type depends on **runtime data** (a user's choice, a tenant, a message type): inject a factory interface backed by keyed services
  (`GetRequiredKeyedService<INotifier>(kind)`) or a dictionary of strategies;
- an object needs both injected services and runtime parameters: `ActivatorUtilities.CreateInstance<T>(sp, runtimeArg)`, or a factory method
  `Func<string, IReportExporter>`;
- the object must be created later or many times: `IDbContextFactory<T>`, `IHttpClientFactory`.

## Static factory methods

A static method that creates an instance with a descriptive name: `TimeSpan.FromSeconds(90)`, `Guid.CreateVersion7()`, `DateOnly.FromDateTime(...)`,
`Order.Create(customerId)`. Advantages over constructors: meaningful names, the ability to return cached or derived instances, validation before creation, and
several creation paths with the same parameter types.

## Sources

- [Factory method (refactoring.guru)](https://refactoring.guru/design-patterns/factory-method)
- [Abstract factory (refactoring.guru)](https://refactoring.guru/design-patterns/abstract-factory)
- [IHttpClientFactory in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory)
- [Dependency injection: keyed services (.NET)](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)

## Questions

### What problem do factories solve? {junior}

They separate the creation of objects from their use: the calling code depends on an abstraction and asks a factory for an instance, instead of choosing and constructing the
concrete class itself. This removes knowledge of concrete types and construction details from the caller, centralizes creation logic, and makes it possible to add new variants
or swap implementations (e.g. in tests) without changing the callers.

### How does a simple factory differ from the factory method pattern? {mid}

A simple factory is a single method or class that chooses a concrete type, usually with a `switch` on a parameter; it's not a GoF pattern, and adding a type means editing it.
The factory method is a GoF pattern based on inheritance: a base class defines an algorithm that calls an abstract creation method, and subclasses override it to decide the
product. Adding a variant means adding a subclass.

### How does the factory method differ from the abstract factory? {mid}

The factory method creates one product and relies on inheritance: subclasses override a single creation method. The abstract factory is an object with several creation methods
for a family of related products (button + checkbox of the same theme, connection + command of the same database), relying on composition: the client receives a factory object
and uses it, which guarantees that the products are compatible.

### When do you still need a factory if you use a DI container? {mid}

When the concrete implementation depends on runtime data (the payment method the user chose, the message type, the tenant), when an object needs runtime parameters in addition
to injected services, or when objects must be created on demand and possibly many times (a `DbContext` per task, `HttpClient` instances). Then you inject a factory interface
implemented with keyed services, `ActivatorUtilities`, or framework factories like `IDbContextFactory<T>` and `IHttpClientFactory`.

### What are the advantages of static factory methods over constructors? {junior}

They have descriptive names (`TimeSpan.FromMinutes`, `Order.Create`), so different creation paths with the same parameter types are clear; they can validate input and return
a result or error, return cached or shared instances, or return a subtype; and they can hide constructors to enforce invariants. The downside is that they can't be overridden
and aren't visible to DI containers.

### What is `IHttpClientFactory`, and why is it a factory? {mid}

It creates `HttpClient` instances configured by name or type, while pooling and reusing the underlying `HttpMessageHandler`s. Creating `new HttpClient()` per request can exhaust
sockets, while a single static client doesn't respect DNS changes; the factory manages handler lifetimes to solve both. Code asks the factory (or receives a typed client) for a
client instead of constructing it, which is the factory pattern applied to infrastructure.

### Give an example of an abstract factory in .NET. {senior}

`DbProviderFactory` in ADO.NET: each database provider supplies a factory (`SqlClientFactory.Instance`, `NpgsqlFactory.Instance`) with methods like `CreateConnection`,
`CreateCommand` and `CreateParameter`, so code written against `DbProviderFactory` creates a consistent family of objects for one provider without referencing concrete types.
Swapping the factory switches the whole family.

### How do you select an implementation by key at runtime with DI? {mid}

Register implementations as keyed services (`AddKeyedTransient<INotifier, SmsNotifier>("sms")`), and inject a small factory that calls
`serviceProvider.GetRequiredKeyedService<INotifier>(key)`, or inject `IEnumerable<INotifier>` and pick by a property such as `Kind`. This keeps the selection in one place,
new implementations are added by registration only, and callers depend on the factory abstraction, not on the container.

### When is a factory overkill? {junior}

When there's only one implementation and no realistic prospect of another, when construction is trivial (`new Order()` with a couple of properties), or when the DI container
already resolves the right type. Adding factories "just in case" adds indirection without benefit, which YAGNI warns against. Introduce a factory when creation logic is
complex, repeated or depends on runtime conditions.

### How does the factory method relate to the template method? {senior}

The factory method is often a step of a template method: the base class defines an algorithm (the template) that calls an abstract method to create an object it needs, and
subclasses supply that object. Both use inheritance to let subclasses customize part of an algorithm; the factory method is the special case where the customized step is object
creation.
