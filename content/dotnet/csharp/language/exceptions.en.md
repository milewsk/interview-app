# Exception handling in C# {mid}

Exceptions in .NET signal situations that the current code **can't handle** at this point: a missing file, a network error, a broken contract. All
derive from `System.Exception` and carry a message, a **stack trace** and optionally an **inner exception** (`InnerException`).

```csharp
try
{
    var config = await File.ReadAllTextAsync(path);
    return JsonSerializer.Deserialize<Config>(config)!;
}
catch (FileNotFoundException)
{
    return Config.Default;                       // an expected case we can handle
}
catch (JsonException ex)
{
    throw new ConfigException($"Invalid config in {path}", ex);   // wrap, keeping the cause
}
finally
{
    // always runs: after try, after catch, also on return
}
```

## Rules of `try`/`catch`/`finally`

- `catch` blocks are checked **in order**, so specific types go before general ones. A general `catch (Exception)` before a specific one is a
  compile error (CS0160).
- `finally` runs **always**: after normal completion, after an exception, and after `return` (the return value is captured before `finally`, so changing
  the variable in `finally` doesn't change the result). It doesn't run only when the process is killed or crashes (e.g. `Environment.FailFast`, a
  `StackOverflowException`).
- An exception thrown in `finally` **replaces** the original one, which is then lost.
- `using` / `await using` is `try/finally` with `Dispose()`, so resources are released even on an exception.

## `throw` vs `throw ex`

```csharp
catch (Exception ex)
{
    logger.LogError(ex, "Failed");
    throw;        // ✅ rethrows and keeps the original stack trace
    // throw ex;  // 🔴 resets the stack trace to this line (analyzer CA2200)
}
```

When you need to rethrow an exception later (e.g. on another thread), `ExceptionDispatchInfo.Capture(ex).Throw()` keeps the original stack trace.
Wrapping (`throw new MyException("context", ex)`) is fine as long as you pass the original as `innerException`.

## Exception filters: `when`

```csharp
catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode.ServiceUnavailable)
{
    // only 503; other status codes go further
}
```

The filter is evaluated **before** the stack unwinds. If it returns `false`, the exception keeps looking for a handler higher up, and the stack is left
intact (useful for diagnostics and dumps). This is cleaner than catching, checking and rethrowing.

## Exceptions and `async`

- `await` rethrows the **original** exception from a task (not an `AggregateException`).
- `.Wait()` and `.Result` wrap it in an `AggregateException`, which is one more reason not to block on tasks.
- `await Task.WhenAll(...)` throws the **first** exception. All of them are in `task.Exception.InnerExceptions`.
- An exception in an `async void` method can't be caught by the caller and usually crashes the process.

## Custom exceptions

```csharp
public sealed class OrderNotFoundException(int orderId)
    : Exception($"Order {orderId} was not found.")
{
    public int OrderId { get; } = orderId;
}
```

Create them when the caller needs to react to a specific case (`catch (OrderNotFoundException)`) or needs extra data. The name ends with `Exception`, and
it derives from `Exception` (not `ApplicationException`). Built-in types are often enough: `ArgumentException`, `ArgumentNullException`,
`ArgumentOutOfRangeException`, `InvalidOperationException`, `NotSupportedException`, `KeyNotFoundException`, `TimeoutException`,
`OperationCanceledException`.

## Good practices

- **Don't use exceptions for control flow**: throwing is expensive (collecting the stack trace). In a simple test, 100,000 thrown exceptions took around
  250 ms, while 100,000 failed `int.TryParse` calls took around 9 ms. For expected cases use the `TryXxx` pattern, return values or a `Result` type.
- **Don't swallow exceptions**: an empty `catch {}` hides bugs. Catch only what you can handle, and let the rest go up.
- **Catch at boundaries**: one global handler (e.g. ASP.NET Core middleware `UseExceptionHandler` with `ProblemDetails`) logs and maps exceptions to a
  response, instead of `try/catch` in every method.
- **Fail fast**: validate arguments at the start of a method (`ArgumentNullException.ThrowIfNull`, `ArgumentOutOfRangeException.ThrowIfNegative`).
- Log the whole exception object (`logger.LogError(ex, ...)`), not just `ex.Message`, so you have the stack trace and inner exceptions.

## Sources

- [Exceptions and exception handling](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/)
- [Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)
- [Exception-handling statements (try, catch, finally)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/exception-handling-statements)
- [CA2200: Rethrow to preserve stack details](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca2200)

## Questions

### How does `throw` differ from `throw ex`? {junior}

`throw;` in a `catch` block rethrows the same exception and keeps its original stack trace, so you can see where the error really happened. `throw ex;`
treats the exception as thrown again from that line and resets the stack trace, which loses information about the source. Analyzers report this as
CA2200.

### Does `finally` run when `try` contains `return`? {junior}

Yes. `finally` runs after the value to return is computed, but before control returns to the caller. Changing the returned variable in `finally` doesn't
change the result, because the value has already been captured. `finally` doesn't run only when the process is terminated, e.g. with
`Environment.FailFast` or a stack overflow.

### Why does the order of `catch` blocks matter? {junior}

`catch` blocks are checked from top to bottom, and the first one matching the exception type wins. So more specific types (`FileNotFoundException`) go
before general ones (`IOException`, `Exception`). If a general `catch` precedes a specific one, the compiler reports error CS0160, because the specific one
would never be reached.

### What are exception filters (`when`), and what do they give you? {mid}

`catch (Exception ex) when (condition)` catches the exception only when the condition is true. The filter runs before the stack unwinds, so when the
condition is false the exception goes further with an intact stack, which is better for diagnostics than catch-check-rethrow. It's used e.g. to handle only
certain HTTP status codes or to log without catching (`when (Log(ex))` returning `false`).

### What happens with an exception thrown inside `finally`? {mid}

It replaces the exception that was propagating from `try` or `catch`, and the original is lost without a trace. That's why `finally` (and `Dispose`)
should be written so they don't throw: clean up safely, and if necessary catch and log inside `finally`.

### How do exceptions behave with `async`/`await`? {mid}

`await` rethrows the original exception from the task, so `catch (InvalidOperationException)` works as expected. Blocking with `.Wait()` or `.Result`
wraps the exception in an `AggregateException`. `await Task.WhenAll` throws the first exception, and all of them are in `Exception.InnerExceptions` of the
returned task. Exceptions from `async void` can't be caught by the caller.

### Why shouldn't you use exceptions for control flow? {mid}

Throwing an exception is expensive: the runtime collects the stack trace and searches for a handler, so it's tens of times slower than returning a value.
It also makes code harder to follow and makes debuggers break on "first-chance" exceptions. For expected situations (invalid user input, a missing key)
use `TryParse`/`TryGetValue`, return values, `null` or a `Result` type.

### When should you create your own exception type? {mid}

When the caller needs to react to a specific case in a different way than to others (`catch (OrderNotFoundException)`), or when the exception must carry
extra data (an ID, an error code). The class ends with `Exception`, derives from `Exception` and has constructors with a message and an inner exception.
If a built-in type (`ArgumentException`, `InvalidOperationException`, `KeyNotFoundException`) says enough, use that.

### Where should exceptions be caught in a web application? {mid}

Mostly in one place, at the boundary: global middleware (in ASP.NET Core, `UseExceptionHandler` with an `IExceptionHandler` or `ProblemDetails`) logs
the exception and maps it to an HTTP response with the appropriate status. In methods, catch only exceptions you can really handle (a retry, a fallback,
wrapping with context). Catching `Exception` everywhere and returning `null` hides bugs.

### What is `ExceptionDispatchInfo` for? {senior}

It lets you capture an exception (`ExceptionDispatchInfo.Capture(ex)`) and rethrow it later, even on another thread, while keeping the original stack
trace (`.Throw()` appends the new frames instead of overwriting them). It's used by `await` itself and by infrastructure code that passes exceptions
between threads or rethrows them after additional work.
