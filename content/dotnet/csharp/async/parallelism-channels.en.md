# Parallelism, PLINQ and channels {senior}

**Concurrency** is handling many things at once (e.g. many requests waiting for I/O). **Parallelism** is doing many things at the same time on
multiple cores. .NET has separate tools for CPU-bound work (`Parallel`, PLINQ), for many I/O operations (`Task.WhenAll`, `Parallel.ForEachAsync`) and
for passing data between producers and consumers (`Channel<T>`).

## Choosing a tool

| Scenario | Tool |
|---|---|
| Heavy computation on many items (CPU-bound) | `Parallel.For` / `Parallel.ForEach`, PLINQ |
| Many I/O operations, all at once | `await Task.WhenAll(...)` |
| Many I/O operations with a concurrency limit | `Parallel.ForEachAsync` with `MaxDegreeOfParallelism`, `SemaphoreSlim` |
| Processing results in completion order | `Task.WhenEach` (.NET 9), `Task.WhenAny` |
| A pipeline or producer–consumer queue | `Channel<T>` |

## `Parallel` for CPU-bound work

```csharp
Parallel.For(0, images.Length, i => images[i] = Resize(images[i]));
```

In a test of 64 CPU-heavy items on 16 cores, the sequential loop took ~650 ms and `Parallel.For` ~94 ms. `Parallel` **blocks the calling thread** until
it finishes and uses ThreadPool threads, so in ASP.NET Core it competes with requests for the same threads: parallelizing CPU work per request rarely
helps throughput. Exceptions from iterations are collected into an **`AggregateException`**.

Don't use `Parallel.ForEach` with an `async` lambda: it becomes `async void`, and the loop doesn't wait for the operations.

## `Parallel.ForEachAsync` for I/O with a limit

```csharp
await Parallel.ForEachAsync(urls,
    new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
    async (url, token) =>
    {
        var html = await http.GetStringAsync(url, token);
        await SaveAsync(url, html, token);
    });
```

It processes items asynchronously with at most N at a time (verified: the maximum number of concurrent operations was exactly 4), supports cancellation,
and doesn't start 10,000 requests at once like `Task.WhenAll(urls.Select(...))` would.

## PLINQ

```csharp
var result = orders.AsParallel()
    .Where(o => IsSuspicious(o))      // expensive predicate
    .Select(o => Score(o))
    .ToList();
```

- `AsParallel()` splits the source into partitions processed on multiple cores. It pays off only for **expensive** operations on many items, and for
  cheap ones the overhead wins.
- The result order **isn't guaranteed**: on a large source the results came out in a different order. `AsOrdered()` restores order at an extra cost.
- `WithDegreeOfParallelism`, `WithCancellation` and `ForAll` (processing without merging results) give more control.

## `Task.WhenAll`, `WhenAny`, `WhenEach`

- `WhenAll` waits for all tasks (and throws the first exception on `await`).
- `WhenAny` returns the task that finished first, e.g. for timeouts or "whoever answers first".
- `Task.WhenEach` (.NET 9) returns tasks **in order of completion** as an `IAsyncEnumerable`, so you can process each result as soon as it's ready:

```csharp
await foreach (var task in Task.WhenEach(downloads))
    Console.WriteLine(await task);     // fastest first
```

## Channels: producer–consumer

`System.Threading.Channels` is an asynchronous, thread-safe queue for passing data between producers and consumers.

```csharp
var channel = Channel.CreateBounded<Order>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.Wait,     // the producer waits when the queue is full
});

// producer
await channel.Writer.WriteAsync(order, ct);
channel.Writer.Complete();                      // no more items

// consumer
await foreach (var item in channel.Reader.ReadAllAsync(ct))
    await ProcessAsync(item);
```

- A **bounded** channel gives **backpressure**: when it's full, `WriteAsync` waits for space, so a fast producer doesn't flood memory. In a test with
  capacity 2, the producer wrote two items and then waited for each read.
- An **unbounded** channel never blocks the producer, but memory can grow without limit.
- Typical use: a `BackgroundService` processing a queue of jobs submitted by HTTP endpoints, pipelines (read → transform → save), and decoupling fast
  input from slow processing.

## Sources

- [Task Parallel Library (TPL)](https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/task-parallel-library-tpl)
- [Parallel.ForEachAsync](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.parallel.foreachasync)
- [Introduction to PLINQ](https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/introduction-to-plinq)
- [Channels](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)
- [Task.WhenEach](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.wheneach)

## Questions

### How does concurrency differ from parallelism? {mid}

Concurrency is handling many tasks in overlapping time periods, e.g. a server handling thousands of requests waiting for the database, and it can work even
on one core, thanks to async. Parallelism is performing computations at the same time on multiple cores to finish CPU work faster. Async/await gives
concurrency for I/O, while `Parallel` and PLINQ give parallelism for CPU-bound work.

### When should you use `Parallel.For`, and when `Task.WhenAll`? {mid}

`Parallel.For`/`ForEach` is for CPU-bound work on many items: it splits the work among ThreadPool threads and blocks the caller until it's done.
`Task.WhenAll` is for I/O operations: it starts them all and waits asynchronously without occupying threads. Using `Parallel` for I/O blocks threads while
waiting, and using `Task.Run` + `WhenAll` for CPU work is a manual reimplementation of `Parallel`.

### Why shouldn't you pass an `async` lambda to `Parallel.ForEach`? {mid}

`Parallel.ForEach` expects an `Action<T>`, so an async lambda becomes `async void`: each iteration ends at the first `await`, the loop finishes before the
operations complete, and exceptions can't be caught and may crash the process. For asynchronous work with limited concurrency use
`Parallel.ForEachAsync`, which accepts a `Func<T, CancellationToken, ValueTask>`.

### How do you limit the number of concurrent HTTP requests? {mid}

Most simply with `Parallel.ForEachAsync` and `MaxDegreeOfParallelism`, which processes the collection with at most N operations at a time and supports
cancellation. The alternative is `SemaphoreSlim(N)` with `WaitAsync`/`Release` around each call, combined with `Task.WhenAll`. Without a limit,
`Task.WhenAll(urls.Select(Fetch))` starts all requests at once, which can overload the remote server or exhaust connections.

### What is PLINQ, and when does it pay off? {mid}

Parallel LINQ: `source.AsParallel()` makes subsequent operators run in parallel on partitions of the data. It pays off for expensive operations on large
collections (complex calculations per item), while for cheap operations the overhead of partitioning and merging makes it slower than regular LINQ. The order
of results isn't guaranteed unless you call `AsOrdered()`, and side effects in lambdas must be thread-safe.

### How are exceptions reported from `Parallel.For`? {mid}

Iterations run on different threads, so several can fail: `Parallel.For` stops starting new iterations after the first exception, waits for those in
progress and throws an `AggregateException` containing all collected exceptions in `InnerExceptions`. `Parallel.ForEachAsync` awaited with `await` throws
the first exception directly, like `Task.WhenAll`.

### What is `Channel<T>` for? {senior}

It's an asynchronous, thread-safe queue for the producer–consumer pattern: producers call `WriteAsync`, consumers read with
`await foreach (... in reader.ReadAllAsync())`, and `Writer.Complete()` signals the end. It's used to decouple fast input from slow processing, e.g. HTTP
endpoints put jobs in the queue, and a `BackgroundService` processes them. Compared to `BlockingCollection`, it doesn't block threads while waiting.

### How does a bounded channel differ from an unbounded one? {senior}

A bounded channel has a maximum capacity, and when it's full, the behavior depends on `FullMode`: `Wait` makes the producer wait (backpressure), and
`DropOldest`, `DropNewest` or `DropWrite` drop items. That protects memory when the consumer can't keep up. An unbounded channel accepts everything
immediately, which is simpler, but with a slow consumer memory usage grows without limit.

### What does `Task.WhenEach` do? {mid}

Added in .NET 9, it takes a collection of tasks and returns an `IAsyncEnumerable<Task<T>>` that yields them in the order they complete. You can process each
result as soon as it's ready, e.g. show the fastest search results first, instead of waiting for all of them with `WhenAll` or calling `WhenAny` in a loop,
which has quadratic cost.

### Is it worth using `Parallel.For` inside an ASP.NET Core request? {senior}

Usually not. `Parallel` uses the same ThreadPool threads that handle requests, so under load parallelizing one request takes threads from others and doesn't
increase overall throughput: it may even make latency worse. The server already achieves parallelism by handling many requests at once. It can make sense
for rare, heavy operations when the server isn't loaded, or better, move such work to a background queue.
