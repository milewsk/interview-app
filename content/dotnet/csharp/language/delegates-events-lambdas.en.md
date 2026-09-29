# Delegates, events and lambda expressions {mid}

A **delegate** is a type that represents a reference to a method with a given signature, a type-safe
counterpart of a function pointer. A **lambda** is a concise way to create a delegate instance (or an
expression tree). An **event** (`event`) is a delegate wrapped so that outsiders can only subscribe (`+=`)
and unsubscribe (`-=`).

```csharp
Func<int, int, int> add = (a, b) => a + b;   // returns a value
Action<string> print = Console.WriteLine;     // void, a method group as a delegate
Predicate<int> isEven = n => n % 2 == 0;      // bool

delegate bool TryParse<T>(string text, out T result); // a custom delegate type
```

In practice you mostly use the generic `Func<...>` (the last type parameter is the result) and
`Action<...>`. Define custom delegate types when you need `ref`/`out`/`in` parameters or a descriptive name.

## Multicast delegates

A delegate can hold an **invocation list**. `+=` adds a method, `-=` removes it, and invoking runs them all
in order:

```csharp
Action log = () => Console.Write("A ");
log += () => Console.Write("B ");
log();                              // A B

Func<int> f = () => 1;
f += () => 2;
f();                                // 2: the LAST method's value is returned
```

- An exception in one method **stops** the remaining ones.
- `-=` removes only **the same** delegate instance. A new lambda with identical code is a different object,
  so `x -= () => ...` removes nothing.
- Delegates are **immutable**: `+=` creates a new object, which matters with multithreading.
- An empty delegate is `null`, which is why you invoke it with `handler?.Invoke(...)`.

## Events

```csharp
public class Order
{
    public event EventHandler<OrderShippedEventArgs>? Shipped;

    public void Ship()
    {
        // ... logic ...
        Shipped?.Invoke(this, new OrderShippedEventArgs(Id));
    }
}

public class OrderShippedEventArgs(int orderId) : EventArgs
{
    public int OrderId { get; } = orderId;
}

order.Shipped += (sender, e) => Console.WriteLine($"Shipped {e.OrderId}");
```

The difference between a public **delegate field** and an **event**:

| | field `Action? Changed` | `event Action? Changed` |
| --- | --- | --- |
| `+=` / `-=` from outside | yes | yes |
| invoke from outside | yes | **no** (error CS0070) |
| overwrite with `= null` from outside | yes (removes all subscribers) | **no** |

The .NET convention is the `(object? sender, TEventArgs e)` signature with the `EventHandler`/`EventHandler<T>`
type.

### Memory leaks through events

The publisher holds a reference to the subscriber (through a delegate pointing at its method). If the
publisher is long-lived (a singleton, a static event), the subscriber **won't be collected by the GC** until it
unsubscribes. Fixes: `-=` during cleanup (e.g. in `Dispose`), a short-lived publisher, or the weak event
pattern.

## Lambdas and closures

A lambda can use variables of the enclosing method. The compiler then moves them into a hidden class (the
closure), so the lambda sees **the variable, not a copy of its value**, and can modify it:

```csharp
var counter = 0;
Action inc = () => counter++;
inc(); inc();                        // counter == 2
```

The `for` loop pitfall: one variable for all iterations. Since C# 5, `foreach` creates a fresh variable per
iteration.

```csharp
for (var i = 0; i < 3; i++) actions.Add(() => Console.Write(i));      // 333
foreach (var j in new[] { 0, 1, 2 }) actions.Add(() => Console.Write(j)); // 012
```

A closure means an allocation. On hot paths you can use a `static` lambda, which may not capture variables,
and the compiler enforces it: `static x => x * x`.

## Delegate or expression tree

The same lambda can be compiled into two different things:

- `Func<int, bool> f = x => x > 5;` is **executable code** (LINQ to Objects),
- `Expression<Func<int, bool>> e = x => x > 5;` is a **data structure** describing code, which can be
  analyzed and translated, e.g. to SQL in EF Core. `e.Compile()` turns it into a delegate.

## Newer features

- **Natural type of lambdas** (C# 10): `var parse = (string s) => int.Parse(s);` gives `Func<string, int>`.
- **Default parameters and `params`** in lambdas (C# 12).
- **Modifiers without types** (C# 14): `TryParse<int> p = (text, out result) => int.TryParse(text, out result);`.

## Sources

- [Delegates (C# programming guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/delegates/)
- [Events (C# programming guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/events/)
- [Lambda expressions (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/lambda-expressions)
- [Expression trees](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)
- [What's new in C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14)

## Questions

### What is a delegate, and how do `Func`, `Action` and `Predicate` differ? {junior}

A delegate is a type describing a method signature. An instance points to a specific method (or several) that
can be invoked or passed on. `Func<T1, …, TResult>` returns a value (the last type parameter is the result),
`Action<T1, …>` returns `void`, and `Predicate<T>` takes a `T` and returns `bool` (equivalent to
`Func<T, bool>`).

### How is an `event` different from a public delegate field? {mid}

An `event` restricts outside access to `+=` and `-=`. Only the declaring class can invoke or clear it. A public
delegate field lets anyone invoke it (e.g. fake the event) or overwrite it with `= null` and remove all
subscribers. Trying to invoke an event from outside the class is compile error CS0070.

### What does invoking a multicast `Func<int>` return? {mid}

The value returned by the **last** method in the invocation list, and the earlier results are discarded. To
collect all of them, iterate `GetInvocationList()` and invoke each element separately. The same approach lets
you handle exceptions per subscriber, since with a plain invocation an exception stops the remaining ones.

### Why doesn't `handler -= () => DoWork()` unsubscribe a previously added lambda? {mid}

`-=` removes a delegate equal to one in the list, and every new lambda is a new instance with a different
target, even with identical code. To be able to unsubscribe, keep a reference to the delegate
(`var h = () => DoWork(); x += h; ... x -= h;`) or subscribe with a method (`x += DoWork`), because delegates
created from the same method and object are equal.

### How can events cause memory leaks? {mid}

The delegate in the event holds a reference to the subscriber object. If the publisher lives longer (a
singleton, a static event, a long-lived service), the subscriber stays reachable and the GC won't collect it,
even when nothing else uses it. The fix is unsubscribing (`-=`), e.g. in the subscriber's `Dispose`. Weak
references (the weak event pattern) or limiting the publisher's lifetime also work.

### What does `for (var i = 0; i < 3; i++) list.Add(() => Console.Write(i));` print after invoking all actions? {mid}

`333`. All lambdas capture **the same** variable `i`, which equals 3 after the loop ends. The fix is a local
copy inside the loop (`var copy = i;`). `foreach` doesn't have this problem since C# 5, because the iteration
variable is fresh on every pass.

### What happens to a local variable captured by a lambda? {mid}

The compiler moves it into a field of a hidden closure class. The method and the lambda share that instance,
so the lambda sees the current value and can change it, and the variable lives as long as the delegate. The
cost is allocating the closure object and the delegate. A `static` lambda forbids capturing and avoids it.

### What's the difference between `Func<T, bool>` and `Expression<Func<T, bool>>`? {mid}

`Func` is compiled code ready to invoke. `Expression<Func<...>>` is an expression tree, i.e. data describing code
that can be analyzed, modified and translated. That's why `IQueryable` (EF Core) takes expressions and turns them
into SQL, while `IEnumerable` takes delegates and runs them in memory. `Compile()` turns an expression into a
delegate.

### How do you raise an event safely in multithreaded code? {senior}

`Shipped?.Invoke(this, args)`. The `?.` operator reads the event field **once** into a local copy, so another
thread can't null it between the `null` check and the call (the older pattern was
`var handler = Shipped; if (handler != null) handler(...)`). Delegates are immutable, and the default `add`/`remove`
accessors of field-like events are thread-safe. A subscriber may still be invoked right after it unsubscribed.

### What's the convention for declaring events in .NET? {junior}

The `EventHandler` or `EventHandler<TEventArgs>` type with the `(object? sender, TEventArgs e)` signature, where
the arguments usually derive from `EventArgs`. The event is named with a verb (`Shipped`, `Changing`), and the
protected raising method is `OnShipped(...)`, which derived classes can override. No data means
`EventArgs.Empty`.
