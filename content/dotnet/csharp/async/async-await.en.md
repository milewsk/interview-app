# async/await in C# {mid}

`async`/`await` lets you write asynchronous code that reads like synchronous code. The main goal is
**not blocking a thread** while waiting on I/O (database, HTTP, files), so a server can handle more
requests and a UI stays responsive.

```csharp
public async Task<User> GetUserAsync(int id, CancellationToken ct)
{
    var response = await _http.GetAsync($"/users/{id}", ct); // the thread returns to the pool
    response.EnsureSuccessStatusCode();
    return (await response.Content.ReadFromJsonAsync<User>(ct))!;
}
```

## How it works

- The compiler turns an `async` method into a **state machine**. Each `await` is a point where the
  method can suspend and later resume.
- The method runs **synchronously until the first `await`** that actually has to wait (an
  incomplete `Task`). It then returns an incomplete `Task` to the caller.
- When the operation completes, the **continuation** (the rest of the method) is scheduled on the
  `SynchronizationContext` captured at the `await` (e.g. the UI thread). If there isn't one, it runs
  on the thread pool.
- **`await` doesn't create a new thread.** Asynchronous I/O doesn't occupy any thread while waiting.

A `Task` represents an operation that will complete: with a result (`Task<T>`), an exception, or
cancellation.

## Sequential or concurrent

```csharp
// sequential: ~400 ms
await Task.Delay(200);
await Task.Delay(200);

// concurrent: ~200 ms
await Task.WhenAll(Task.Delay(200), Task.Delay(200));
```

- `Task.WhenAll`: waits for all of them. `await` throws the **first** exception, and the full list
  of errors is in `task.Exception.InnerExceptions` (`AggregateException`).
- `Task.WhenAny`: waits for the first one to finish (e.g. a timeout, the first of several servers).
- `Task.WhenEach` (.NET 9+): an `IAsyncEnumerable` of tasks **in completion order**.

```csharp
await foreach (var task in Task.WhenEach(downloads))
    Console.WriteLine(await task); // fastest first
```

## Exceptions

An exception thrown in an `async Task` method is **stored in the returned `Task`** and rethrown only
at `await`. Calling the method without `await` won't surface it right away, so a "fire-and-forget"
`Task` can hide an error.

## `async void`: only for event handlers

An `async void` method can't be awaited, and the caller can't catch its exception. An unhandled
exception goes to the `SynchronizationContext` and usually **crashes the process**. Use it only for
event handlers (`button.Click += async (s, e) => ...`), and use `async Task` everywhere else.

## Blocking and deadlocks

`.Result`, `.Wait()` and `.GetAwaiter().GetResult()` **block the thread**. With a single-threaded
`SynchronizationContext` (WinForms, WPF, classic ASP.NET) this leads to a deadlock:

1. the UI thread blocks on `.Result`,
2. the continuation after an `await` inside the method wants to resume **on the UI thread**,
3. the UI thread is blocked, so nothing progresses.

The fix is **async all the way**. ASP.NET Core has no `SynchronizationContext`, so this deadlock
can't happen there, but blocking still wastes pool threads and under load leads to thread pool
starvation.

## `ConfigureAwait(false)`

It says the continuation **doesn't need to return** to the captured context. It's mainly used in
**library code** that doesn't know which app it will run in. It reduces overhead and prevents the
deadlock described above. In ASP.NET Core application code there's no context to capture, so it
doesn't change behavior. In a UI app you must not touch controls after `ConfigureAwait(false)`.

## Cancellation: `CancellationToken`

Pass the token **all the way down the call chain**. A cancelled operation throws
`OperationCanceledException` (or the derived `TaskCanceledException`).

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
await DoWorkAsync(cts.Token);
```

In ASP.NET Core, `HttpContext.RequestAborted` (or a `CancellationToken` action parameter) cancels
work when the client disconnects.

## CPU-bound vs I/O-bound

- **I/O-bound** (network, database, files): use asynchronous APIs (`ReadAsync`, `ToListAsync`).
  Don't wrap them in `Task.Run`.
- **CPU-bound** (computation): in a UI app, move the work off the UI thread with
  `await Task.Run(...)`. In ASP.NET Core `Task.Run` gains nothing: it takes another thread from the
  same pool and adds overhead.

## `ValueTask`

`ValueTask<T>` is a struct that avoids allocating a `Task` when the result is often available
**synchronously** (e.g. from a cache). It has restrictions: it may be awaited **only once**, and you
must not read `.Result` before it completes. `Task` remains the default choice, and `ValueTask` is
for measured hot paths.

## Async streams

`IAsyncEnumerable<T>` combines `yield return` with `await` and is consumed with `await foreach`.
It's useful for paging through APIs or streaming results from a database.

```csharp
static async IAsyncEnumerable<int> NumbersAsync()
{
    for (var i = 1; i <= 3; i++)
    {
        await Task.Delay(10);
        yield return i;
    }
}
```

## Sources

- [Asynchronous programming with async and await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/)
- [Task-based asynchronous pattern (TAP)](https://learn.microsoft.com/en-us/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap)
- [ConfigureAwait FAQ (.NET Blog)](https://devblogs.microsoft.com/dotnet/configureawait-faq/)
- [Task.WhenEach](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.wheneach)

## Questions

### Does `await` create a new thread? {junior}

No. `await` registers a continuation and releases the current thread. Asynchronous I/O doesn't occupy
any thread while waiting. When the operation completes, the continuation runs on the captured
`SynchronizationContext` (e.g. the UI thread) or on a pool thread. Only `Task.Run` explicitly puts
work on a pool thread.

### What happens if you call an `async` method without `await`? {mid}

The method runs synchronously up to its first "real" `await` and returns an incomplete `Task`, and
the rest of the work continues in the background. An exception from the method is stored in the
`Task` and isn't surfaced until someone awaits it, so it's easy to miss. In ASP.NET Core such work
can also outlive the request scope and use dependencies that were already disposed (e.g. `DbContext`).

### Why can `.Result` or `.Wait()` cause a deadlock? {mid}

With a single-threaded `SynchronizationContext` (UI, classic ASP.NET), the thread blocks waiting for
the `Task`. The continuation inside that method wants to run on **the same**, blocked thread. Each
waits for the other. Fixes: async all the way, or `ConfigureAwait(false)` in library code. ASP.NET
Core doesn't deadlock, but blocking still wastes pool threads.

### When should you use `ConfigureAwait(false)`? {mid}

In general-purpose library code that doesn't need to return to the caller's context. It improves
performance and prevents deadlocks when the library is used from a UI app that blocks on `.Result`.
It has no effect in ASP.NET Core application code, since there's no context. In UI code, don't use it
where you need to touch controls after the `await`.

### Why avoid `async void`? {junior}

The caller gets no `Task`, so it can't wait for completion or handle an exception. An unhandled
exception goes straight to the `SynchronizationContext` and usually crashes the process. `async void`
methods are also hard to test. They're acceptable only as event handlers, because the event signature
requires `void`.

### How do you run several independent async operations concurrently, and how do you handle errors? {mid}

Start them all (without `await`), then `await Task.WhenAll(t1, t2, t3)`. The total time is that of the
longest operation, not the sum. `await` throws the first exception, and all of them are available in
`whenAllTask.Exception.InnerExceptions`. For results in completion order use `Task.WhenEach`
(.NET 9+). Note: operations on **the same** `DbContext` can't run concurrently.

### What's the difference between I/O-bound and CPU-bound work with regard to async? {mid}

I/O-bound work waits on an external system. Use natively asynchronous APIs, and no thread waits.
CPU-bound work is computation that always occupies a thread. In a UI you move it off the UI thread
with `Task.Run`. In ASP.NET Core `Task.Run` just shifts work to another thread in the same pool,
which gains nothing and adds overhead.

### What is `ValueTask` and when should you use it? {senior}

It's a struct that can hold a ready result without allocating a `Task`. It pays off when a method
often completes synchronously (cache, buffer) and is called very frequently. Restrictions: await it
only once, never await it concurrently, and don't read its result before it completes. If you need
to, convert it to a `Task` with `.AsTask()`.

### How does cancellation work in .NET? {mid}

Cooperatively. A `CancellationTokenSource` issues a `CancellationToken` that is passed down the call
chain. Methods check it (`ThrowIfCancellationRequested`) or pass it on to async APIs. Cancellation
ends the operation with an `OperationCanceledException`. You can also set a timeout:
`new CancellationTokenSource(TimeSpan.FromSeconds(5))` or `CancelAfter`.

### What is `IAsyncEnumerable<T>`? {mid}

The asynchronous counterpart of `IEnumerable<T>`. The producer combines `yield return` with `await`,
and the consumer uses `await foreach`. Items are delivered as they become available, without
buffering everything in memory, e.g. when paging an API or using `AsAsyncEnumerable()` in EF Core.
