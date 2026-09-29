# Template method {mid}

**Template method** defines the **skeleton of an algorithm in a base class** and lets subclasses override **specific steps** without changing the overall structure. The
base class controls the order of operations; subclasses supply the details. It's inheritance-based reuse, and .NET frameworks use it heavily: `BackgroundService`,
`Stream`, `DbContext.OnModelCreating`, ASP.NET Core `AuthenticationHandler<T>`.

## Structure

```csharp
public abstract class DataExporter
{
    public string Export(int[] rows)                             // the template method: a fixed skeleton, not virtual
    {
        var sb = new StringBuilder();
        sb.Append(Header());
        for (int i = 0; i < rows.Length; i++) sb.Append(FormatRow(rows[i], i == rows.Length - 1));
        sb.Append(Footer());
        return sb.ToString();
    }

    protected abstract string FormatRow(int row, bool last);    // required step: subclasses must implement it
    protected virtual string Header() => "";                     // hook: optional step with a default
    protected virtual string Footer() => "";
}

public class CsvExporter : DataExporter
{
    protected override string Header() => "value\n";
    protected override string FormatRow(int r, bool last) => $"{r}\n";
}

public class JsonExporter : DataExporter
{
    protected override string Header() => "[";
    protected override string FormatRow(int r, bool last) => last ? $"{r}" : $"{r},";
    protected override string Footer() => "]";
}
```

Verified: for `[1, 2, 3]` the CSV exporter produced `value`, `1`, `2`, `3` on separate lines, and the JSON exporter `[1,2,3]`, both through the same `Export` skeleton.

- **Abstract steps** must be implemented; **hooks** are virtual methods with a default (often empty) that subclasses may override.
- The template method itself is **non-virtual** (in C#, methods aren't virtual by default), so subclasses can't change the order of steps.
- Steps are `protected`: they're extension points for subclasses, not part of the public API.
- This is the "Hollywood principle": *don't call us, we'll call you*; the base class calls the subclass code.

## In .NET

- **`BackgroundService`**: `StartAsync`/`StopAsync` handle the lifecycle, and you override only `ExecuteAsync`. In the test a `BackgroundService` counting ticks every 100 ms ran
  4 ticks and stopped cleanly when the host stopped, because the base class cancelled the token passed to `ExecuteAsync`.
- **`Stream`**: derived streams override `Read`/`Write`, and the base class builds `CopyTo`, `ReadAsync` and others on top of them.
- **`DbContext`**: `OnConfiguring`/`OnModelCreating` are hooks called during EF Core's initialization.
- **`AuthenticationHandler<TOptions>`**: you implement `HandleAuthenticateAsync`, the base handles the rest of the scheme's flow.
- **xUnit/NUnit** setup and teardown methods, `Controller` action filters (`OnActionExecuting`).

## Template method vs strategy

Template method varies parts of an algorithm through **inheritance** (compile time, one subclass per variant); strategy replaces the whole algorithm through **composition**
(runtime, an injected object). Modern C# code often prefers strategy or delegates (e.g. passing a `Func<int, string> formatRow`), because deep inheritance hierarchies are rigid
and harder to test, but template method remains the natural choice in frameworks that give you a base class to extend.

## Sources

- [Template Method (refactoring.guru)](https://refactoring.guru/design-patterns/template-method)
- [Worker services (BackgroundService)](https://learn.microsoft.com/en-us/dotnet/core/extensions/workers)

## Questions

### What is the template method pattern? {junior}

A behavioral pattern where a base class defines the skeleton of an algorithm in a method that calls a sequence of steps, some of which are abstract or virtual. Subclasses override
the steps to provide specific behavior, but can't change the overall structure or order. It reuses the common algorithm and puts only the differences in subclasses.

### What is the difference between an abstract step and a hook? {mid}

An abstract step has no implementation in the base class, so every subclass must implement it (e.g. formatting a row). A hook is a virtual method with a default implementation, often
empty, that subclasses may override if they need to (e.g. a header or footer, `OnBeforeSave`). Hooks provide optional extension points without forcing every subclass to implement
them.

### Why should the template method itself not be overridable? {mid}

Because its job is to fix the order and structure of the algorithm; if subclasses could override it, they could skip steps, change the order, or break invariants the base class relies
on. In C# methods are non-virtual by default, so simply not marking the template method `virtual` (or sealing an override) protects it. The steps are made `protected` so they are
extension points, not public API.

### What is the Hollywood principle? {mid}

"Don't call us, we'll call you": high-level components (the base class, a framework) call low-level code at the right time, instead of low-level code calling the framework. Template
method applies it: the base class calls the subclass's overridden steps. Frameworks rely on it in general, which is what distinguishes a framework (it calls your code) from a library
(you call it).

### Give examples of template method in .NET. {mid}

`BackgroundService`, where you override only `ExecuteAsync` while the base handles starting and stopping; `Stream`, where derived classes implement `Read`/`Write` and inherit
`CopyTo` and async wrappers; `DbContext.OnModelCreating` and `OnConfiguring`; `AuthenticationHandler<T>.HandleAuthenticateAsync`; controller and filter hooks like
`OnActionExecuting`; and test frameworks' setup and teardown methods.

### How does template method differ from strategy? {mid}

Template method uses inheritance: the base class fixes the algorithm and subclasses override parts of it, chosen at compile time by picking a subclass. Strategy uses composition: the
whole algorithm is an object injected into the context and can be swapped at runtime. Template method avoids duplicating the skeleton; strategy avoids inheritance and allows
combining independent variations.

### What are the drawbacks of template method? {mid}

It relies on inheritance, which tightly couples subclasses to the base class: changes to the base can break subclasses (the fragile base class problem), and a class can have only one
base class, so combining variations requires a subclass per combination. Understanding the flow requires reading both the base and the subclass. Many small overrides can also violate
the Liskov substitution principle if subclasses break the base's assumptions.

### How would you replace template method with composition? {senior}

Extract the varying steps into interfaces or delegates and inject them: instead of subclasses overriding `FormatRow`, `Header` and `Footer`, the exporter takes an `IRowFormatter` (or
`Func<int, string>`) and optional header and footer providers. The skeleton stays in one non-abstract class, variations can be combined freely and tested separately, and new variants
don't need a class hierarchy. It's a good trade when there are many independent variations.

### How does `BackgroundService` use the template method pattern? {mid}

`BackgroundService` implements `IHostedService`: its `StartAsync` starts your `ExecuteAsync` and returns, and its `StopAsync` cancels the stopping token and waits for `ExecuteAsync` to
finish. You override only `ExecuteAsync`, looping until the token is cancelled. The lifecycle logic, which is easy to get wrong, lives in the base class, and you write only the work
itself.

### Is `OnModelCreating` in EF Core a template method? {senior}

It's a hook in a template method: EF Core's model building process runs a fixed sequence (conventions, discovering entity types from `DbSet` properties, applying data annotations) and
at a defined point calls the virtual `OnModelCreating`, where you configure the model with the Fluent API. The base implementation does nothing essential, so overriding it is
optional; the framework controls when it runs, and the result is cached per context type.
