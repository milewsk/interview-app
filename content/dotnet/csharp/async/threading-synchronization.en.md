# Threads and synchronization in .NET {mid}

`async/await` handles waiting without blocking, but whenever several threads access **shared mutable state**, you need synchronization. Interviews
check whether you recognize a race condition, know the basic tools (`lock`, `Interlocked`, `SemaphoreSlim`) and know how to avoid deadlocks.

## Thread, ThreadPool, Task

- **`Thread`**: a dedicated OS thread. It's expensive to create (about 1 MB of stack reserved by default), so today it's used rarely, e.g. for a long,
  dedicated background loop.
- **ThreadPool**: a pool of reused threads that the runtime scales automatically. Most work runs there: `Task.Run`, continuations after `await`, timers,
  ASP.NET Core requests.
- **`Task`**: an abstraction of an operation that will finish in the future. It isn't a thread: an I/O task (`HttpClient`, database) occupies no thread
  while waiting, and `Task.Run` puts CPU work on the pool.

**Thread pool starvation**: blocking pool threads (`.Result`, `.Wait()`, `Thread.Sleep` in async code) makes the pool add threads slowly, and the
application stops responding under load even though the CPU is idle. That's why "async all the way" matters.

## Race condition

```csharp
int counter = 0;
Parallel.For(0, 1_000_000, _ => counter++);
Console.WriteLine(counter);     // e.g. 143420, not 1000000
```

`counter++` is three operations (read, add, write). Two threads can read the same value, and one of the increments is lost. Regular collections also
aren't thread-safe: `List<T>.Add` from many threads can lose elements or throw an exception.

## Synchronization tools

| Tool | When |
|---|---|
| `lock` (`Monitor`, or `System.Threading.Lock` in .NET 9+) | short critical sections in synchronous code |
| `Interlocked` | atomic operations on one variable: `Increment`, `Add`, `Exchange`, `CompareExchange` |
| `SemaphoreSlim` | limiting concurrency to N and **async** mutual exclusion (`WaitAsync`) |
| `ReaderWriterLockSlim` | many readers, rare writers |
| Concurrent collections | `ConcurrentDictionary`, `ConcurrentQueue`, `Channel<T>` |
| Immutability | shared data that doesn't change needs no locks |

```csharp
private readonly Lock _gate = new();
private decimal _balance;

public void Deposit(decimal amount)
{
    lock (_gate) { _balance += amount; }
}

Interlocked.Increment(ref _requestCount);

private readonly SemaphoreSlim _mutex = new(1, 1);
public async Task RefreshAsync()
{
    await _mutex.WaitAsync();
    try { await ReloadCacheAsync(); }
    finally { _mutex.Release(); }
}
```

- **`await` inside `lock` is a compile error** (CS1996): the continuation could run on another thread than the one holding the lock. For async critical
  sections use `SemaphoreSlim(1, 1)` with `WaitAsync`.
- Lock on a **private object** used only for that purpose, never on `this`, a `Type` or a string, because external code could lock on the same object.
- Keep critical sections short, and don't call external code or I/O inside them.

## Deadlock

Two threads wait for each other: thread 1 holds `A` and wants `B`, thread 2 holds `B` and wants `A`. Prevention:

- a **fixed lock order** throughout the application,
- the smallest possible number of nested locks,
- timeouts (`Monitor.TryEnter`, `SemaphoreSlim.WaitAsync(timeout)`) to detect the problem,
- in async code: not blocking on tasks (`.Result` with a synchronization context is the classic async deadlock).

## `volatile`, memory model and other tools

- `volatile` guarantees that reads and writes aren't reordered or cached, but **doesn't make** `x++` atomic. It's rarely needed: `lock` and `Interlocked`
  provide the right memory barriers.
- `Lazy<T>` initializes a value once in a thread-safe way (the default mode is `ExecutionAndPublication`).
- `ThreadLocal<T>` gives each thread its own copy, and `AsyncLocal<T>` a value that flows with the async context across `await` (used e.g. for
  correlation IDs and `Activity`).
- `Channel<T>` implements the producer-consumer pattern without manual locks (see the parallelism topic).

## Sources

- [Managed threading best practices](https://learn.microsoft.com/en-us/dotnet/standard/threading/managed-threading-best-practices)
- [Overview of synchronization primitives](https://learn.microsoft.com/en-us/dotnet/standard/threading/overview-of-synchronization-primitives)
- [The lock statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock)
- [The managed thread pool](https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool)
- [Debug thread pool starvation](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-threadpool-starvation)

## Questions

### How does a `Thread` differ from a `Task`? {junior}

A `Thread` is a dedicated OS thread, expensive to create and manage manually. A `Task` is an abstraction of an operation that finishes in the future: CPU
work runs on reused ThreadPool threads (`Task.Run`), and I/O tasks occupy no thread at all while waiting. Tasks support `await`, composition
(`WhenAll`), cancellation and exception propagation, so they're the default choice.

### What is a race condition? Give an example. {junior}

A bug in which the result depends on the order in which threads interleave. The classic example is `counter++` from many threads: the operation consists of
reading, adding and writing, so two threads can read the same value, and one increment is lost. A test with a million increments gives a much smaller
result. The fix is `Interlocked.Increment`, a `lock` or not sharing state.

### How does `lock` work, and what should you lock on? {mid}

`lock (obj) { ... }` lets only one thread at a time into the block. It's `Monitor.Enter/Exit` in `try/finally`, and in .NET 9+ with a
`System.Threading.Lock` object the compiler uses `Lock.EnterScope()`. Lock on a private field (`private readonly Lock _gate = new()`), never on `this`,
`typeof(...)` or a string, because other code could lock on the same object and cause deadlocks.

### Why can't you use `await` inside `lock`, and what do you use instead? {mid}

The compiler forbids it (CS1996), because `Monitor` is tied to a thread, and after `await` the continuation may run on a different thread, which wouldn't
be able to release the lock. Besides, holding a lock during I/O blocks other threads. In async code, use `SemaphoreSlim(1, 1)` with
`await WaitAsync()` and `Release()` in `finally`.

### When should you use `Interlocked` instead of `lock`? {mid}

When the operation concerns one variable and can be expressed as an atomic operation: incrementing a counter (`Increment`, `Add`), swapping a reference
(`Exchange`) or conditional update (`CompareExchange`). It's lock-free and much cheaper than `lock`. When you need to update several related fields
consistently, `Interlocked` isn't enough, and you need a `lock`.

### What is a deadlock, and how do you avoid it? {mid}

A situation in which threads wait for each other forever, e.g. one holds lock A and waits for B, and the other holds B and waits for A. You prevent it with a
fixed lock order, few nested locks, short critical sections without calls to external code, and timeouts for detection. In async code, the typical cause is
blocking on a task (`.Result`, `.Wait()`) in a context with a synchronization context.

### What is `SemaphoreSlim` for? {mid}

It limits how many operations can run at the same time: `new SemaphoreSlim(3)` lets in at most three. It supports asynchronous waiting (`WaitAsync`), so
it's used to throttle concurrent HTTP calls or database connections, and as an async mutex (`new SemaphoreSlim(1, 1)`). `Release()` is always called in
`finally`, so an exception doesn't leave the semaphore occupied.

### What is thread pool starvation? {senior}

A situation in which all ThreadPool threads are blocked (e.g. by `.Result`, `.Wait()`, `Thread.Sleep` or synchronous I/O), and new work items wait in
the queue. The pool adds threads slowly, so the application stops responding and latency jumps, even though the CPU is barely used. The fix is async code
without blocking. Diagnosis: the growing thread count and the queue length (`dotnet-counters`) and stack dumps.

### Is `volatile` enough to make `counter++` thread-safe? {senior}

No. `volatile` only guarantees that each read and write goes to memory and isn't reordered by the compiler or CPU, but `counter++` is still a separate read
and write that another thread can interleave. It needs `Interlocked.Increment` or a `lock`. `volatile` is rarely needed in application code, because `lock`
and `Interlocked` already provide the proper memory barriers.

### How does `ThreadLocal<T>` differ from `AsyncLocal<T>`? {senior}

`ThreadLocal<T>` stores a separate value for each thread, so after `await`, when the continuation runs on another thread, the value may be different.
`AsyncLocal<T>` flows with the logical async flow (`ExecutionContext`): a value set before `await` is visible after it, even on another thread, and a change
made inside a called `async` method doesn't flow back to the caller (a change in a synchronous method does). `AsyncLocal` is used for request context,
e.g. correlation IDs.
