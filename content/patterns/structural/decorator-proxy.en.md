# Decorator and proxy {mid}

Both patterns wrap an object in another object with **the same interface**. A **decorator** adds behavior (logging, caching, retries, compression) and can be
stacked; a **proxy** controls access to the real object (lazy creation, authorization, remote calls). They're everywhere in .NET: streams, `HttpClient` handlers,
ASP.NET Core middleware, EF Core lazy-loading proxies.

## Decorator

```csharp
public interface IProductRepository { Product Get(int id); }

public class CachingRepository(IProductRepository inner, IMemoryCache cache) : IProductRepository
{
    public Product Get(int id) => cache.GetOrCreate($"product:{id}", _ => inner.Get(id))!;
}

public class LoggingRepository(IProductRepository inner, ILogger<LoggingRepository> log) : IProductRepository
{
    public Product Get(int id) { log.LogInformation("Get {Id}", id); return inner.Get(id); }
}

IProductRepository repo = new LoggingRepository(new CachingRepository(new SqlProductRepository(...), cache), logger);
```

In a test, calling `Get(1)` twice produced `log Get(1) | SQL SELECT 1 | log Get(1)`: both calls were logged, but only the first reached SQL. The **order** of
decorators matters: logging outside the cache logs every call, logging inside it would log only cache misses.

- Adds behavior **without modifying** the original class and **without inheritance** (Open/Closed Principle, composition over inheritance); each decorator has one
  responsibility.
- Cross-cutting concerns fit well: caching, logging, metrics, retries, validation, authorization, transactions.
- DI: the built-in container has no `Decorate` method; register manually with a factory, or use the **Scrutor** library (`services.Decorate<IProductRepository,
  CachingRepository>()`).
- In .NET: **streams** (`GZipStream`, `CryptoStream`, `BufferedStream` wrap another `Stream`; in the test 10,000 characters compressed to 52 bytes), `HttpClient`
  **`DelegatingHandler`s** (in the test the chain ran `timing → auth header → stub saw auth=Bearer t0k3n`), ASP.NET Core middleware and MediatR pipeline behaviors
  (decorators around request handlers).

## Proxy

A stand-in with the same interface as the real object that controls how and when it's accessed:

| Kind | Purpose | Example |
|---|---|---|
| **Virtual proxy** | create an expensive object only when needed | `Lazy<T>`; EF Core lazy-loading proxies loading a navigation on first access |
| **Protection proxy** | check permissions before delegating | a proxy throwing for non-admin roles (verified: "role 'guest' can't delete") |
| **Remote proxy** | represent an object in another process | gRPC and WCF client stubs, HTTP API clients (Refit) |
| **Caching / smart proxy** | cache results, count references, log | a caching wrapper around a remote service |

```csharp
public class AuthorizingDocumentProxy(IDocumentService inner, ICurrentUser user) : IDocumentService
{
    public void Delete(int id)
    {
        if (!user.IsInRole("admin")) throw new UnauthorizedAccessException();
        inner.Delete(id);
    }
}
```

**Dynamic proxies** are generated at runtime instead of written by hand: .NET's `DispatchProxy` (verified: it intercepted `Delete(7)` before and after the call), Castle
DynamicProxy (used by Moq and NSubstitute for mocks, and by interception libraries). They need runtime code generation or reflection, so they don't work with Native AOT.

## Decorator vs proxy

The structure is identical; the difference is intent. A decorator **adds or enhances behavior** and is typically composed by the client (several can be stacked). A proxy
**controls access** to the subject and often manages its lifecycle (creates it lazily, connects remotely), usually transparently to the client. In practice, a caching
wrapper is described with either name.

## Sources

- [Decorator (refactoring.guru)](https://refactoring.guru/design-patterns/decorator)
- [Proxy (refactoring.guru)](https://refactoring.guru/design-patterns/proxy)
- [HttpClient message handlers (DelegatingHandler)](https://learn.microsoft.com/en-us/aspnet/web-api/overview/advanced/httpclient-message-handlers)
- [DispatchProxy class](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.dispatchproxy)
- [Scrutor (assembly scanning and decoration for MS DI)](https://github.com/khellang/Scrutor)

## Questions

### What is the decorator pattern? {junior}

A structural pattern that adds behavior to an object by wrapping it in another object implementing the same interface: the decorator does its extra work (logging, caching,
compression) and delegates the rest to the wrapped object. Decorators can be stacked, the client doesn't know they're there, and the original class isn't modified. It's
composition-based extension of behavior.

### How does a decorator differ from inheritance for adding behavior? {mid}

With inheritance, each combination of features needs its own subclass (`CachingLoggingRepository`, `LoggingRepository`, ...), the behavior is fixed at compile time and tied
to one base class. Decorators are combined at runtime in any order and number, each one does one thing, and they work with any implementation of the interface. That's why
decorators scale better for cross-cutting concerns.

### Why does the order of decorators matter? {mid}

Each decorator wraps the next, so calls pass through them from the outside in. A logging decorator outside a caching one logs every call, while inside it logs only cache
misses; a retry decorator outside a timeout retries after each timeout, while inside it the timeout covers all retries together. The composition order must reflect the
intended behavior.

### How do you register decorators with the .NET DI container? {senior}

The built-in container has no decoration API. You can register the inner implementation as a concrete type and the interface with a factory that builds the chain
(`services.AddScoped<IProductRepository>(sp => new CachingRepository(sp.GetRequiredService<SqlProductRepository>(), ...))`), or use the Scrutor library:
`services.Decorate<IProductRepository, CachingRepository>()`, which rewrites the registration so that the existing one becomes the inner dependency.

### Give examples of decorators in .NET. {mid}

Streams: `GZipStream`, `CryptoStream` and `BufferedStream` wrap another `Stream` and add compression, encryption or buffering. `DelegatingHandler`s wrap an `HttpClient`'s
inner handler to add logging, authentication headers, retries or resilience (`AddStandardResilienceHandler` is one). ASP.NET Core middleware and MediatR pipeline behaviors wrap
the next step in a pipeline in the same way.

### What is the proxy pattern? {junior}

A structural pattern in which a stand-in object with the same interface as the real object controls access to it: it can create the real object lazily (virtual proxy), check
permissions (protection proxy), forward calls to another process or machine (remote proxy), or cache and log (smart proxy). The client uses the proxy as if it were the real
object.

### How does a decorator differ from a proxy? {mid}

Structurally they're the same: a wrapper implementing the subject's interface and delegating to it. The intent differs: a decorator adds or enhances behavior and is usually
composed explicitly, often several in a chain; a proxy controls access to the subject (when it's created, who may call it, where it runs) and is usually transparent to the
client. Many real wrappers, like caching ones, fit both descriptions.

### What are dynamic proxies, and where are they used? {senior}

Proxy classes generated at runtime for an interface or virtual members, routing every call to an interceptor: .NET's `DispatchProxy` or Castle DynamicProxy. Mocking libraries
(Moq, NSubstitute) use them to create test doubles, AOP-style interception libraries use them for logging or transactions, and EF Core can use generated proxies for lazy loading and
change tracking. They rely on runtime code generation, so they're incompatible with Native AOT and trimming, where source generators are used instead.

### How does EF Core lazy loading relate to the proxy pattern? {senior}

With `UseLazyLoadingProxies()`, EF Core generates at runtime subclasses of your entity types that override virtual navigation properties. When code first reads such a property,
the proxy loads the related data from the database. That's a virtual proxy: the real data is fetched only on first access. It's also why navigation properties must be `virtual`
and why lazy loading can silently cause N+1 queries.

### What is a `DelegatingHandler`? {mid}

A base class for HTTP message handlers that sit in `HttpClient`'s pipeline: each handler receives the request, can modify it (e.g. add an authorization header), passes it to its
`InnerHandler`, and can inspect or change the response on the way back. Chaining handlers is the decorator pattern applied to HTTP; they're registered with
`IHttpClientFactory` via `AddHttpMessageHandler`, and resilience handlers are built the same way.
