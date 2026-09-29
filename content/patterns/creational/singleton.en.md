# Singleton {junior}

**Singleton** ensures a class has **only one instance** and provides a global point of access to it. It's the best-known GoF pattern, and also the most criticized:
interviews usually check whether you can implement it thread-safely and whether you know why, in modern .NET, you'd rather let the **DI container** manage a single
instance.

## Implementations in C#

```csharp
// 🔴 not thread-safe: two threads can both see null and create two instances
public sealed class NaiveSingleton
{
    private static NaiveSingleton? _instance;
    private NaiveSingleton() { }
    public static NaiveSingleton Instance => _instance ??= new NaiveSingleton();
}

// ✅ Lazy<T>: lazy and thread-safe (default mode ExecutionAndPublication)
public sealed class Configuration
{
    private static readonly Lazy<Configuration> _instance = new(() => new Configuration());
    private Configuration() { }
    public static Configuration Instance => _instance.Value;
}

// ✅ static readonly field: thread-safe thanks to the CLR's type initialization guarantees
public sealed class Clock
{
    public static readonly Clock Instance = new();
    private Clock() { }
}
```

In a test with 16 threads accessing the instance at once, the naive version ran its constructor **16 times**, while `Lazy<T>`, the `static readonly` field and a
double-checked lock each ran it exactly once. Double-checked locking works (with `volatile`), but `Lazy<T>` achieves the same with less room for mistakes.

Key elements: a **private constructor**, a `sealed` class (so a subclass can't create more instances), and a static access point.

## Why singleton is considered an anti-pattern (in its classic form)

- **Hidden dependency**: code calling `Configuration.Instance` doesn't declare the dependency in its constructor, so it's invisible and hard to replace.
- **Global mutable state**: any code can change it, which couples unrelated parts and causes order-dependent bugs.
- **Hard to test**: tests can't substitute a fake, and state leaks between tests.
- **Violates SRP**: the class manages both its behavior and its own lifetime.
- **Thread safety** of the instance's own state is still your responsibility.

## The modern alternative: singleton lifetime in DI

```csharp
builder.Services.AddSingleton<IExchangeRateCache, ExchangeRateCache>();

public class PriceService(IExchangeRateCache cache) { ... }   // the dependency is explicit and replaceable
```

The container guarantees one instance per application, the class stays an ordinary class with a public constructor, dependencies are explicit, and tests can pass a
fake. Good candidates for a single instance: caches, configuration, `HttpClient` handlers (through `IHttpClientFactory`), stateless services. They must be thread-safe.

## Where you meet it in .NET

`TimeProvider.System`, `StringComparer.Ordinal`, `ArrayPool<T>.Shared`, `EqualityComparer<T>.Default`: shared, stateless or thread-safe instances exposed as static
properties, which is an acceptable use of the pattern.

## Sources

- [Singleton (refactoring.guru)](https://refactoring.guru/design-patterns/singleton)
- [Implementing the singleton pattern in C# (Jon Skeet)](https://csharpindepth.com/articles/singleton)
- [Lazy&lt;T&gt; class](https://learn.microsoft.com/en-us/dotnet/api/system.lazy-1)
- [Service lifetimes (.NET DI)](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)

## Questions

### What is the singleton pattern? {junior}

A creational pattern that ensures a class has only one instance and provides a global access point to it. It's implemented with a private constructor, a static field
holding the instance and a static property or method returning it. Typical examples are configuration, logging or caches, although in modern .NET the DI container's
singleton lifetime usually replaces the hand-written pattern.

### How do you implement a thread-safe singleton in C#? {mid}

The simplest ways are a `static readonly` field initialized inline, which the CLR initializes once in a thread-safe way, or `Lazy<T>` with the default
`ExecutionAndPublication` mode, which also delays creation until first use. Double-checked locking with a `volatile` field and a `lock` works too, but is easy to get
wrong. A naive `if (_instance == null) _instance = new()` isn't thread-safe: in a test with 16 threads it created 16 instances.

### Why is the singleton often called an anti-pattern? {mid}

Because the classic form introduces global state accessed through a static property: dependencies are hidden (not visible in constructors), unrelated code becomes coupled
through shared mutable state, tests can't replace the instance and state leaks between them, and the class mixes its responsibilities with lifetime management. The problem
isn't having one instance, but how it's accessed.

### How does a DI singleton differ from the singleton pattern? {mid}

With `AddSingleton<IService, Service>()`, the container ensures one instance per application, but the class itself is ordinary: public constructor, no static access, its
dependencies injected. Consumers declare it as a constructor dependency, so it's explicit and replaceable in tests. The pattern, by contrast, enforces the single instance inside
the class and exposes it globally.

### What is `Lazy<T>` for? {junior}

It defers creating a value until it's first accessed through `.Value`, and by default guarantees thread-safe, one-time initialization (`LazyThreadSafetyMode.ExecutionAndPublication`).
Besides singletons, it's used for expensive objects that may not be needed, e.g. a heavy parser or a connection created only when a feature is used. The factory runs at most
once, and exceptions from it are cached in that mode.

### Why is the singleton class usually `sealed` with a private constructor? {junior}

The private constructor prevents other code from creating instances with `new`, and `sealed` prevents inheritance, because a derived class could otherwise create additional
instances through its own constructor (a derived class can call a private constructor only if it's nested, but sealing makes the intent explicit). Together they enforce the "only
one instance" rule.

### What problems do singletons cause in unit tests? {mid}

Tests can't substitute a fake for a singleton accessed statically, so code using it pulls in real behavior (a real clock, a real cache, a real connection). State stored in the
singleton survives between tests, so the order of tests can change results, and parallel tests interfere. Injecting the dependency through an interface solves both problems.

### Must a singleton be thread-safe beyond its creation? {mid}

Yes. Thread-safe creation only guarantees one instance; the instance is then shared by all threads, so any mutable state inside it (a dictionary cache, counters) needs thread-safe
structures (`ConcurrentDictionary`, `Interlocked`, locks) or immutability. This applies equally to DI singletons: a singleton service holding a non-thread-safe field is a common
source of concurrency bugs.

### Give examples of singleton-like instances in .NET. {junior}

`TimeProvider.System`, `StringComparer.Ordinal`, `EqualityComparer<T>.Default`, `ArrayPool<T>.Shared` and `Encoding.UTF8` are shared instances exposed as static properties. They
are either stateless or internally thread-safe, which is what makes static access acceptable. In applications, `IHttpClientFactory` manages shared message handlers so that
`HttpClient` doesn't exhaust sockets.

### When is a hand-written singleton still reasonable? {senior}

For truly stateless or immutable objects where DI would add nothing (comparers, null objects, cached default instances), in library code that can't assume a DI container, or
for low-level infrastructure needed before the container exists. Even then it's best exposed as an implementation of an interface, so consumers can receive it through DI and
tests can replace it.
