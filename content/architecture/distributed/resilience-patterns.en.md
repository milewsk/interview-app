# Resilience patterns: timeout, retry, circuit breaker {mid}

In a distributed system, calls to other services and databases **will** fail: timeouts, dropped connections, overloaded dependencies, deployments. Resilience
patterns let an application survive **transient** faults and prevent one failing dependency from taking the whole system down. In .NET they're provided by
**Polly** and the `Microsoft.Extensions.Http.Resilience` package built on it.

## Timeout

Never wait indefinitely: a call without a timeout holds a thread, a connection and the caller's request until something gives up. Set timeouts **per attempt** and a
**total** timeout for the whole operation including retries, and pass `CancellationToken`s so the work is actually abandoned. Polly throws `TimeoutRejectedException`
(verified after 100 ms), not the standard `TimeoutException`.

## Retry

Repeat an operation that failed with a **transient** error (a timeout, HTTP 5xx, 408, 429, a dropped connection):

- **Only transient errors**: a 400 Bad Request or a validation exception will fail again. In a test, an `ArgumentException` wasn't retried because the strategy handled
  only `HttpRequestException`.
- **Exponential backoff**: wait longer after each failure (verified: 100 ms, then 200 ms), so an overloaded dependency gets room to recover.
- **Jitter**: randomize delays so many clients don't retry in synchronized waves (the thundering herd).
- **A limit** on attempts and a total timeout.
- **Only idempotent operations**: retrying a `POST` that actually succeeded but whose response was lost can create a duplicate order. Microsoft's docs warn about exactly
  this and provide `DisableForUnsafeHttpMethods()`; alternatively use idempotency keys.
- **Retry at one layer only**: retries at the client, the gateway and the service multiply (3 × 3 × 3 = 27 attempts).

## Circuit breaker

When a dependency keeps failing, retrying just adds load and makes callers wait. A circuit breaker tracks failures and **stops calling** for a while:

- **Closed**: calls go through; failures are counted.
- **Open**: after the failure threshold is reached, calls fail immediately (`BrokenCircuitException`) without touching the dependency.
- **Half-open**: after the break duration, a trial call is allowed; success closes the circuit, failure opens it again.

In a test with a 50% failure ratio and a minimum of 4 calls: `fail, fail, fail, fail, open, open, open`, so the dependency was called only 4 times out of 7, and after the
1-second break the next call succeeded.

## Other patterns

- **Fallback**: return a degraded result (cached data, a default) when the call fails (verified: "cached value").
- **Bulkhead** (isolation): limit concurrent calls to each dependency (a separate connection pool or semaphore), so one slow dependency can't exhaust all threads and
  connections.
- **Rate limiting**: limit how many requests you send or accept.
- **Hedging**: send a second parallel request if the first is slow, and use whichever answers first.
- **Health checks and graceful degradation**: report dependency health, and keep core functions working when optional features fail.

## In .NET

```csharp
builder.Services.AddHttpClient<CatalogClient>(c => c.BaseAddress = new("https://catalog"))
    .AddStandardResilienceHandler(o => o.Retry.DisableForUnsafeHttpMethods());
```

`AddStandardResilienceHandler` (package `Microsoft.Extensions.Http.Resilience`) chains five strategies, from outermost to innermost: rate limiter (1,000 permits), total
timeout (30 s), retry (3 attempts, exponential backoff with jitter, 2 s base delay), circuit breaker (10% failure ratio, minimum throughput 100, 30 s sampling, 5 s break) and
attempt timeout (10 s). It handles HTTP 5xx, 408, 429, `HttpRequestException` and `TimeoutRejectedException`. Custom pipelines are built with Polly's
`ResiliencePipelineBuilder`.

The **order** matters: a total timeout outside the retry limits the whole operation, while an attempt timeout inside the retry limits each try.

## Sources

- [Build resilient HTTP apps (.NET)](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [Polly documentation](https://www.pollydocs.org/)
- [Retry pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Circuit breaker pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [Bulkhead pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
- [Timeouts, retries and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

## Questions

### What is a transient fault? {junior}

A temporary failure that is likely to disappear if the operation is tried again after a short time: a network blip, a timeout, a dropped connection, a service restarting
during deployment, throttling (HTTP 429) or a temporary server error (5xx). It's the opposite of a permanent error, such as invalid input (400), missing permissions (403) or a
non-existent resource (404), which retrying won't fix.

### When should you retry an operation, and when not? {mid}

Retry only transient failures, only a limited number of times, with exponential backoff and jitter, and only operations that are idempotent (safe to execute twice). Don't retry
client errors like 400 or 404, validation failures or authorization errors, and don't blindly retry non-idempotent operations such as `POST` creating an order, because the first
attempt might have succeeded with the response lost. Retries also shouldn't be stacked at multiple layers.

### What is exponential backoff with jitter? {mid}

Exponential backoff increases the delay between retries after each failure (e.g. 100 ms, 200 ms, 400 ms), giving an overloaded dependency time to recover instead of hammering it.
Jitter adds randomness to the delays, so that many clients that failed at the same moment don't retry in synchronized waves (the thundering herd problem), which would recreate
the overload at each retry.

### How does a circuit breaker work? {mid}

It wraps calls to a dependency and tracks failures. While the failure rate is acceptable, it's closed and calls pass. When failures exceed a threshold within a sampling window, it
opens: calls fail immediately without reaching the dependency, protecting both the caller (no waiting) and the dependency (no extra load). After a break duration it goes half-open
and lets a trial call through; success closes it, failure opens it again.

### Why combine retry with a circuit breaker? {mid}

Retries handle short, sporadic failures, but when a dependency is down for longer, retries multiply the load and the waiting time. The circuit breaker detects that failures are
persistent and makes calls fail fast until the dependency recovers. Together they recover from brief glitches and stop wasting resources during outages; in Polly's standard
pipeline the circuit breaker sits inside the retry, so each attempt is counted by it.

### Why is a timeout the most important resilience mechanism? {mid}

Without timeouts, a slow or hung dependency makes callers wait indefinitely, holding threads, connections and memory, until the caller itself becomes unresponsive and the failure
cascades upstream. Timeouts bound how long any call can take, turn hangs into errors that other mechanisms (retry, fallback, circuit breaker) can handle, and must be combined with
cancellation so the abandoned work actually stops.

### What is the bulkhead pattern? {senior}

Isolating resources per dependency or per consumer, like watertight compartments in a ship: e.g. a separate connection pool, thread pool or concurrency limit (semaphore) for each
downstream service. If one dependency becomes slow, it can exhaust only its own compartment, while calls to other dependencies keep working. It prevents one failure from consuming
all shared resources of the application.

### What does `AddStandardResilienceHandler` configure? {mid}

A pipeline of five strategies for an `HttpClient`, from outermost to innermost: a rate limiter, a total request timeout (30 s), retry (3 attempts with exponential backoff and jitter),
a circuit breaker (opens at a 10% failure ratio with at least 100 requests in 30 s, breaks for 5 s) and a per-attempt timeout (10 s). It treats 5xx, 408, 429, `HttpRequestException`
and timeouts as transient. Retries for unsafe methods like `POST` can be disabled with `DisableForUnsafeHttpMethods`.

### How can retries make an outage worse? {senior}

If every layer retries (client, API gateway, service, database driver), a single failure multiplies into many attempts, and when a dependency is overloaded, synchronized retries
without backoff and jitter add even more load exactly when it's least able to cope (a retry storm). Retrying non-idempotent operations can also create duplicates. The remedies are
retrying at one layer, backoff with jitter, retry budgets or limits, circuit breakers and idempotency.

### What is a fallback, and when is it appropriate? {junior}

A predefined alternative result used when an operation fails: cached or stale data, a default value, a simplified response or a queued request for later processing. It's
appropriate when a degraded answer is better for the user than an error, e.g. showing recommendations from cache when the recommendation service is down. It's not appropriate when
the result must be correct and current, such as a payment authorization.
