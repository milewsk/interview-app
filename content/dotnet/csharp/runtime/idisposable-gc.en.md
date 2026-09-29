# IDisposable and the garbage collector {mid}

In .NET the **garbage collector (GC)** manages managed memory, but it doesn't know how to release
**unmanaged resources**: file handles, network and database connections, sockets, locks. `IDisposable` exists to
release them deterministically.

## How the GC works

- Reference-type objects go on the **managed heap**. Allocation is essentially bumping a pointer, so it's very fast.
- A GC starts when generation 0 runs out of space, when system memory is low, or after `GC.Collect()`.
- **Marking**: starting from the **roots** (locals on the stack, static fields, GC handles, the finalization queue),
  the GC finds reachable objects. Everything else is garbage.
- **Compacting**: live objects are moved and references are updated. Managed threads are suspended during a
  collection (except for part of the work done by background GC).

### Generations

| Generation | Contents | How often collected |
| --- | --- | --- |
| 0 | new objects | most often, cheap |
| 1 | survived one collection, a buffer | less often |
| 2 | long-lived (caches, singletons) | rarely, a "full GC" |

An object that survives a collection is **promoted** to an older generation. The assumption: most objects die
young, so it pays to clean only generation 0 often.

**Large Object Heap (LOH)**: objects **≥ 85,000 bytes** (usually large arrays) go on a separate heap, logically
collected together with generation 2. By default it **isn't compacted**, because copying large objects is expensive,
which risks fragmentation. Frequent allocation of large temporary buffers is a typical performance problem, and the
fix is `ArrayPool<T>.Shared`.

```csharp
GC.GetGeneration(new byte[84_000]); // 0
GC.GetGeneration(new byte[85_000]); // 2 (LOH)
```

**GC modes**: *workstation* (desktop apps) and *server* (a separate heap and GC thread per core, higher throughput).
ASP.NET Core apps use server GC by default. *Background GC* lets generation 2 be collected concurrently with the
application.

## `IDisposable` and `using`

```csharp
using var connection = new SqlConnection(cs);   // using declaration (C# 8)
await connection.OpenAsync();
// Dispose at the end of the scope, even on an exception

using (var file = File.OpenRead(path))           // using statement
{
    // ...
}
```

- `using` is a `try/finally` that calls `Dispose()` **even on an exception**.
- Several `using var`s in one scope are disposed in **reverse** declaration order.
- `IAsyncDisposable` + `await using`: for resources whose release requires I/O (e.g. flushing a stream buffer,
  closing a connection).
- `Dispose` should be **idempotent**: calling it multiple times must not throw. After disposal, the object's
  methods throw `ObjectDisposedException` (`ObjectDisposedException.ThrowIf(disposed, this)`).

## Finalizers

A finalizer (`~MyClass()`) is a safety net: the GC calls it on a separate thread, **at some point**, if the
programmer forgot to call `Dispose`. It has serious drawbacks:

- an object with a finalizer survives at least **one extra collection**,
- the order and timing aren't guaranteed, and a finalizer must not touch other managed objects,
- an exception in a finalizer terminates the process.

That's why **unmanaged resources are wrapped in a `SafeHandle`**, which already has a correct finalizer. Custom
finalizers are very rarely needed today.

## The Dispose pattern

For a sealed class without a finalizer that only owns other `IDisposable`s, the simple version is enough:

```csharp
public sealed class ReportWriter : IDisposable
{
    private readonly StreamWriter _writer = new("report.txt");
    private bool _disposed;

    public void Write(string line)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _writer.WriteLine(line);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _writer.Dispose();
        _disposed = true;
    }
}
```

The full pattern (`protected virtual void Dispose(bool disposing)` + `GC.SuppressFinalize(this)`) is used in base
classes meant for inheritance and in classes with a finalizer. `disposing == true` means a call from `Dispose()`
(managed resources may be released), and `false` means a call from the finalizer (unmanaged only).

## Who calls `Dispose`

- An object created with `new` is disposed by whoever created it (usually via `using`).
- The DI container disposes the services **it created**: scoped ones at the end of the scope (request),
  singletons at application shutdown. Don't manually dispose injected dependencies.
- `HttpClient`: creating and disposing an instance per request can exhaust sockets (the `TIME_WAIT` state). Use
  `IHttpClientFactory`, or a long-lived client with `SocketsHttpHandler` and `PooledConnectionLifetime`.

## Memory leaks in managed code

The GC frees only **unreachable** objects. Leaks come from unwanted references:

- static collections and caches without a limit or expiration,
- events: a long-lived publisher keeps its subscribers alive,
- timers and background tasks holding objects,
- closures capturing large objects,
- undisposed `IDisposable`s (e.g. streams, a `CancellationTokenSource` with `CancelAfter`).

Diagnostics: `dotnet-counters` (heap size, GC counts), `dotnet-gcdump` / `dotnet-dump` and comparing heap
snapshots.

## Sources

- [Fundamentals of garbage collection](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals)
- [Implement a Dispose method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose)
- [Implement a DisposeAsync method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-disposeasync)
- [The large object heap](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/large-object-heap)
- [IHttpClientFactory guidelines](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines)

## Questions

### Why do we need `IDisposable` if .NET has a garbage collector? {junior}

The GC manages only managed memory and runs at an unpredictable time. Resources such as files, connections, sockets
or locks must be released **deterministically**, right after use, because they're limited or block others.
`IDisposable.Dispose()` is where that cleanup goes, and `using` guarantees it's called, even on an exception.

### How do GC generations work, and why are they used? {mid}

New objects go to generation 0, and those that survive a collection are promoted to 1, then to 2. The GC most often
collects only generation 0, which is fast because most objects die young (the generational hypothesis). The rarer
generation 2 collection (a "full GC") covers the whole heap and is the most expensive. Long-lived objects therefore
aren't scanned on every collection.

### What is the Large Object Heap, and what problems can it cause? {mid}

It's a separate heap for objects of at least 85,000 bytes, collected together with generation 2 and not compacted by
default. Frequent allocation of large temporary arrays causes expensive full GCs and memory fragmentation. Reusing
buffers (`ArrayPool<T>.Shared`, `RecyclableMemoryStream`) or streaming instead of loading everything into one array
helps.

### How is `Dispose` different from a finalizer? {mid}

`Dispose` is called explicitly by code (usually via `using`), deterministically and immediately, and it can release
both managed and unmanaged resources. A finalizer is called by the GC at an undefined time, on a separate thread, as
a safety net for a forgotten `Dispose`. It must not touch other managed objects, and the object itself survives an
extra collection. `Dispose` calls `GC.SuppressFinalize(this)` so the finalizer doesn't run.

### What are `Dispose(bool disposing)` and `GC.SuppressFinalize` for? {senior}

It's the pattern for inheritable classes or classes with a finalizer. Shared cleanup logic lives in
`Dispose(bool disposing)`: with `true` (called from `Dispose()`) you release managed and unmanaged resources, with
`false` (from the finalizer) only unmanaged ones, because other objects may already have been finalized.
`GC.SuppressFinalize(this)` tells the GC that cleanup is done, so the object doesn't go on the finalization queue and
doesn't survive an extra collection. A `sealed` class without a finalizer doesn't need this pattern.

### Why don't you call `GC.Collect()` in production code? {mid}

The GC chooses the timing and scope of collections based on allocations and survival rates. A forced full GC
suspends threads, promotes live objects to older generations (so they'll be collected less often and at higher
cost), and usually hurts performance. Legitimate exceptions are tests, benchmarks and very specific scenarios after
releasing a huge amount of memory.

### Can a .NET application leak memory? Give examples. {mid}

Yes. The GC frees only unreachable objects, and a leak is objects that are still reachable but no longer needed.
Examples: static dictionaries or caches without expiration, event subscriptions to long-lived objects without `-=`,
timers and background tasks holding references, closures capturing large objects, undisposed `IDisposable`
resources. You diagnose them with `dotnet-counters` and heap dumps (`dotnet-gcdump`).

### Who should call `Dispose` on a service injected via DI? {mid}

Nobody, manually. The DI container disposes the objects it created: scoped ones at the end of the scope (e.g. the HTTP
request), transients within the scope that created them, and singletons when the service provider shuts down. If you
register a ready-made instance (`AddSingleton(instance)`), the container **won't** dispose it. Manually disposing an
injected dependency can break its other users.

### Why is creating `new HttpClient()` per request a problem? {mid}

A disposed client closes its connections, but the sockets remain in the `TIME_WAIT` state for a while. Under heavy
traffic this leads to port exhaustion (socket exhaustion). Conversely, a single static client without configuration
doesn't react to DNS changes. Fixes: `IHttpClientFactory` (which manages a pool of handlers) or a long-lived
`HttpClient` with `SocketsHttpHandler` and `PooledConnectionLifetime` set.

### How does a `using` statement differ from a `using` declaration, and how does `await using` work? {junior}

`using (var x = ...) { }` disposes the resource at the end of the block. `using var x = ...;` (C# 8) disposes it at the
end of the enclosing scope, and several such declarations are disposed in reverse order. Both compile to
`try/finally`. `await using` calls `DisposeAsync()` from `IAsyncDisposable` when release requires asynchronous I/O,
e.g. flushing a stream buffer or closing a connection.
