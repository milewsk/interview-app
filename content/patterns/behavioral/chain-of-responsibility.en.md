# Chain of responsibility {mid}

**Chain of responsibility** passes a request along a **chain of handlers**. Each handler decides whether to process the request, pass it to the next handler, or both, and
may **stop** the chain. The sender doesn't know which handler will deal with it. In .NET you use it daily: the **ASP.NET Core middleware pipeline** and **HttpClient message
handlers** are chains of responsibility.

## Classic chain

```csharp
public abstract class Handler
{
    private Handler? _next;
    public Handler SetNext(Handler next) { _next = next; return next; }
    public virtual string Handle(Payment p) => _next?.Handle(p) ?? "approved";      // end of chain
}

public class NotEmptyValidator : Handler
{
    public override string Handle(Payment p) => p.Account == "" ? "rejected: no account" : base.Handle(p);
}
public class AmountLimitValidator : Handler
{
    public override string Handle(Payment p) => p.Amount > 10_000 ? "rejected: over limit" : base.Handle(p);
}

var chain = new NotEmptyValidator();
chain.SetNext(new AmountLimitValidator()).SetNext(new FraudCheck());
```

In a test: an empty account stopped at the first handler, 50 000 at the limit check, 9 999 at the fraud check, and 100 went through the whole chain and was approved.
Handlers are small and independent, and the chain can be reordered or extended without changing the others.

Two variants:

- **Stop at the first handler that can handle it** (the original GoF version): e.g. support levels, event bubbling in UI, exception handler lookup.
- **Every handler does its part and calls the next** (a pipeline): middleware, validation pipelines, MediatR pipeline behaviors.

## ASP.NET Core middleware

```csharp
app.Use(async (ctx, next) => { log.Add("A in"); await next(ctx); log.Add("A out"); });
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path == "/blocked") { ctx.Response.StatusCode = 403; return; }    // short-circuit: next is not called
    log.Add("B in"); await next(ctx); log.Add("B out");
});
app.Run(ctx => { log.Add("endpoint"); return Task.CompletedTask; });
```

Verified: `/ok` → `A in > B in > endpoint > B out > A out` (each middleware runs code before and after the rest of the pipeline), `/blocked` → `A in > B short-circuit > A out`
with status 403. **Order matters**: exception handling first, then HTTPS redirection, static files, routing, CORS, authentication, authorization, endpoints; putting
authorization before authentication, for example, breaks it.

## HttpClient: `DelegatingHandler`

Outgoing requests go through a chain of `DelegatingHandler`s ending with the real `HttpClientHandler`; each one can modify the request, the response, or retry. Verified order:
`outer in > inner in > terminal > inner out > outer out`. With `IHttpClientFactory`, `AddHttpMessageHandler<T>()` adds handlers (the first registered is the outermost), which is
how logging, auth tokens and resilience policies are attached.

## Sources

- [Chain of Responsibility (refactoring.guru)](https://refactoring.guru/design-patterns/chain-of-responsibility)
- [ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/)
- [Make HTTP requests using IHttpClientFactory: outgoing request middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/http-requests)

## Questions

### What is the chain of responsibility pattern? {junior}

A behavioral pattern in which a request is passed along a chain of handler objects; each handler either processes it, passes it to the next handler, or both, and can stop further
processing. The sender only knows the first handler, not which one ends up handling the request. It decouples senders from receivers and lets you compose processing steps.

### What problem does chain of responsibility solve? {junior}

It replaces one big method full of sequential checks (validation, authorization, caching, logging) with separate, small handlers that each have one responsibility. Handlers can be
reused, tested in isolation, reordered and added without modifying the others, and the chain can be configured at runtime.

### How is the ASP.NET Core middleware pipeline an example of it? {mid}

Each middleware receives the `HttpContext` and a `next` delegate; it can run code before calling `next`, call it to pass the request on, run code after it returns (on the way back),
or not call it at all to short-circuit (e.g. returning 401, a cached response or a static file). The pipeline built from `Use`, `Map` and `Run` calls is exactly a chain of
responsibility where the response flows back through the same handlers in reverse order.

### Why does middleware order matter? {mid}

Middleware runs in the order it's registered, and each one only sees what earlier ones have done. Exception handling must be first to catch errors from everything after it;
authentication must run before authorization, which needs the user identity; CORS and routing must come before the endpoints that need them. Wrong order causes subtle bugs, such as
authorization failing for every request or errors escaping the exception handler.

### What is short-circuiting in a chain? {junior}

A handler stopping the request instead of passing it on: in middleware, not calling `next` and writing a response directly (403, 304 from cache, a static file). Handlers later in the
chain and the endpoint never run. It's how validation or authorization rejects requests early and how caching avoids unnecessary work.

### How would you write a middleware that measures request duration? {mid}

Start a `Stopwatch`, `await next(context)`, stop it and log the elapsed time, and register it early so it covers the rest of the pipeline. To return the time in a response
header, don't set it after `next`: by then the response has usually started, and in a test that threw "The response headers cannot be modified because the response has already
started". Register `context.Response.OnStarting(...)` before calling `next`, which runs just before headers are sent (the header set there arrived in the response).

### What's the difference between the "first handler wins" and pipeline variants? {mid}

In the classic GoF variant, the request travels until one handler takes responsibility and handles it, and the rest never see it (support escalation, UI event bubbling). In the
pipeline variant, every handler does its part and passes the request on, and any of them may still short-circuit (middleware, message handlers, MediatR behaviors). Both use the same
structure; they differ in whether handling is exclusive.

### What are the risks of chain of responsibility? {mid}

A request may reach the end of the chain without being handled, so there should be a defined default (a final handler or a clear result). The flow is harder to trace because it's
spread across many handlers and depends on their order, which is configured elsewhere. Long chains add overhead, and a handler that forgets to call the next one silently drops the
request.

### How does it relate to the decorator pattern? {senior}

Structurally they're similar: each element wraps or references the next and can act before and after it. A decorator adds behavior and always delegates to the wrapped object, and
wrappers are usually stacked around one object; a chain handler can decide not to pass the request on, and the chain is about who handles the request. Middleware and
`DelegatingHandler`s sit in between: they're pipeline handlers that behave like decorators of the next handler but can short-circuit.

### How would you implement a validation pipeline for commands? {senior}

Define a pipeline step interface (e.g. `IPipelineBehavior<TRequest, TResponse>` in MediatR, or your own `Handle(request, next)`), and register behaviors such as validation, logging,
transactions and caching, which run around the actual command handler in registration order. The validation behavior runs all validators for the request type (e.g. FluentValidation)
and short-circuits with an error result or exception if any fail, so handlers can assume valid input.
