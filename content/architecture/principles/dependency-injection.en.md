# Dependency injection and IoC containers {mid}

**Dependency injection (DI)** means an object receives its dependencies from outside instead of creating them. It's the main technique for applying
dependency inversion, it makes code testable and configurable, and in .NET it's built into the platform (`Microsoft.Extensions.DependencyInjection`, used by
ASP.NET Core, workers and MAUI).

```csharp
public class OrderService(IOrderRepository repository, IPaymentGateway payments, TimeProvider clock)   // constructor injection
{
    public async Task PlaceAsync(Order order) { ... }
}

builder.Services.AddScoped<IOrderRepository, SqlOrderRepository>();
builder.Services.AddSingleton<IPaymentGateway, StripeGateway>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<OrderService>();
```

## IoC, DI and the container

- **Inversion of control (IoC)**: the framework controls the flow and calls your code (you don't write `Main` for every request, ASP.NET Core calls your
  endpoint).
- **Dependency injection**: a form of IoC for dependencies. Kinds: **constructor injection** (the default: dependencies are explicit and required), method
  injection (`[FromServices]`, a parameter of a minimal API endpoint) and property injection (not supported by the built-in container).
- **The container** (composition root): the one place, at application startup, where interfaces are mapped to implementations and object graphs are built.
  Without it, DI is still possible (pure DI: `new OrderService(new SqlOrderRepository(...), ...)`).

## Lifetimes

| Lifetime | Instance | Typical use |
|---|---|---|
| **Transient** | a new instance every time it's requested | lightweight, stateless services |
| **Scoped** | one per scope (in ASP.NET Core: one per request) | `DbContext`, unit of work, per-request context |
| **Singleton** | one for the whole application | caches, configuration, `HttpClient` handlers, thread-safe stateless services |

Verified: two transient resolutions gave different objects, scoped gave the same object within a scope and different ones across scopes, and the singleton
was the same everywhere. The container also **disposes** the `IDisposable` services it created at the end of their scope (a transient was disposed with its
scope).

**Captive dependency**: a longer-lived service holding a shorter-lived one, most often a singleton with a scoped `DbContext`. The scoped object then lives as
long as the application, is shared between requests and isn't thread-safe. With scope validation (enabled by default in ASP.NET Core's Development
environment) the container reports it: `Cannot consume scoped service 'ScopedDep' from singleton 'CaptiveSingleton'`. Resolving a scoped service from the
root provider fails for the same reason. A singleton that needs scoped services creates a scope itself (`IServiceScopeFactory`) or uses a factory.

## Registration details

- **The last registration wins** when resolving a single service, and **all** registrations are returned for `IEnumerable<T>`: with `Email` then `Sms`
  registered, `INotifier` resolved to `SmsNotifier`, and `IEnumerable<INotifier>` gave both.
- `TryAdd*` registers only if the service isn't registered yet, which libraries use so applications can override their defaults.
- **Keyed services** (.NET 8+): `AddKeyedSingleton<IStorage, DiskStorage>("disk")` and `[FromKeyedServices("disk")]` or `GetRequiredKeyedService`.
- `ValidateOnBuild` checks at startup that every registered service can be constructed, so a missing registration fails immediately instead of on the first
  request.
- Factories: `AddScoped<IFoo>(sp => new Foo(sp.GetRequiredService<IBar>(), "config"))` for construction logic.

## Anti-patterns

- **Service locator**: injecting `IServiceProvider` and calling `GetService<T>()` inside business code hides dependencies, fails at runtime instead of at
  startup, and makes testing harder. Acceptable only in infrastructure code (factories, middleware).
- **Constructor over-injection**: a class needing 8+ dependencies usually has too many responsibilities.
- **Injecting implementations everywhere through interfaces with one implementation**, just "for DI": inject concrete classes when there's no reason for an
  abstraction (they can still be registered and replaced).
- **Static access** to services (`ServiceLocator.Current`), ambient context, and `new` for dependencies that have side effects.

## Sources

- [Dependency injection in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)
- [Service lifetimes and guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines)
- [Dependency injection in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [Inversion of Control containers and the DI pattern (Martin Fowler)](https://martinfowler.com/articles/injection.html)

## Questions

### What is dependency injection, and what are its benefits? {junior}

A technique in which an object receives its dependencies (usually through its constructor) instead of creating them with `new` or finding them in static state.
Dependencies become explicit in the constructor signature, implementations can be swapped through configuration (e.g. a fake payment gateway in tests or a
different storage per environment), and object creation and lifetime management move to one place, the composition root.

### What service lifetimes does .NET DI have? {junior}

Transient (a new instance every time it's resolved), scoped (one instance per scope, which in ASP.NET Core means per HTTP request) and singleton (one instance for
the application's lifetime). The choice depends on state and thread safety: stateless lightweight services can be transient or singleton, per-request state like
`DbContext` is scoped, and shared caches are singletons that must be thread-safe.

### What is a captive dependency? {mid}

A service with a longer lifetime holding a dependency with a shorter one, typically a singleton that receives a scoped `DbContext` in its constructor. The scoped
object is captured for the whole application lifetime and shared by concurrent requests, which leads to thread-safety bugs and stale data. .NET detects it when
scope validation is on (by default in Development): "Cannot consume scoped service ... from singleton ...". The fix is creating a scope with
`IServiceScopeFactory` or changing lifetimes.

### Why is the service locator considered an anti-pattern? {mid}

Calling `serviceProvider.GetService<T>()` inside business classes hides their real dependencies (the constructor doesn't show them), moves missing-registration
errors from startup to runtime, and couples the code to the container. Tests must set up a whole provider instead of passing a few fakes. It's acceptable in
infrastructure code that genuinely creates objects dynamically, such as factories or middleware.

### What happens when you register two implementations of the same interface? {mid}

Resolving the interface returns the last registered implementation, while resolving `IEnumerable<IInterface>` returns all of them in registration order. This is
used for composite patterns such as multiple validators or notification channels. `TryAdd*` methods register only when nothing is registered yet, which lets
libraries provide defaults that applications can override, and keyed services (.NET 8+) select an implementation by key.

### What does `ValidateOnBuild` do? {mid}

When the service provider is built, it checks that every registered service can be constructed: all constructor dependencies are registered and lifetimes are
compatible. A missing registration then fails at startup ("Unable to resolve service for type ... while attempting to activate ...") instead of on the first request
that needs it. ASP.NET Core enables it together with scope validation in the Development environment.

### Who disposes services created by the DI container? {mid}

The container disposes `IDisposable`/`IAsyncDisposable` services it created: scoped and transient ones at the end of their scope (e.g. the request), singletons when
the root provider is disposed at shutdown. Services you created yourself and registered as instances aren't disposed by the container. Transient disposables resolved
from the root provider are only disposed at shutdown, which can leak memory.

### How does constructor injection differ from method injection? {junior}

Constructor injection supplies dependencies when the object is created, so they're required, explicit and available to all methods; it's the default choice. Method
injection passes a dependency to a specific method, e.g. a parameter of a minimal API endpoint or `[FromServices]` on an action, which is useful when only one method
needs it or it depends on the call. Property injection (optional dependencies set after creation) isn't supported by the built-in .NET container.

### What does a constructor with many dependencies tell you? {mid}

That the class probably has too many responsibilities (an SRP violation): it coordinates too many collaborators. Splitting it into smaller classes, introducing a facade
service that groups related dependencies, or moving logic into the domain objects usually helps. DI makes the problem visible rather than causing it, which is a
benefit of explicit constructor dependencies.

### How do you use a scoped service from a singleton or a background service? {senior}

Inject `IServiceScopeFactory` (or `IServiceProvider`), create a scope for each unit of work (`using var scope = scopeFactory.CreateScope()`), resolve the scoped
service from `scope.ServiceProvider`, and dispose the scope when done. For `DbContext` specifically, `IDbContextFactory<T>` is an alternative. Injecting the scoped
service directly into the singleton would make it a captive dependency.
