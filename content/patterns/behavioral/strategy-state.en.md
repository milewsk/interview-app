# Strategy and state {mid}

**Strategy** encapsulates **interchangeable algorithms** behind a common interface, so the algorithm can be chosen at runtime. **State** lets an object **change its
behavior when its internal state changes**, by delegating to a state object. Their structure is almost identical; the difference is who changes the object and why,
which is a favorite interview question.

## Strategy

```csharp
public interface IShippingStrategy { decimal Cost(decimal weightKg); }
public class StandardShipping : IShippingStrategy { public decimal Cost(decimal w) => 10 + w * 2; }
public class ExpressShipping  : IShippingStrategy { public decimal Cost(decimal w) => 25 + w * 4; }
public class PickupShipping   : IShippingStrategy { public decimal Cost(decimal w) => 0; }

public class ShippingCalculator(IReadOnlyDictionary<string, IShippingStrategy> strategies)
{
    public decimal Cost(string method, decimal weightKg) => strategies[method].Cost(weightKg);   // 16 / 37 / 0 for 3 kg
}
```

- Replaces a growing `switch` or `if/else` over algorithm variants: each variant is a separate, testable class, and adding one doesn't modify existing code
  (Open/Closed).
- The **client or configuration** chooses the strategy; strategies usually don't know about each other.
- With DI, register all strategies and select by key (keyed services, a dictionary, or `IEnumerable<IStrategy>` with a `CanHandle` method).
- In C#, a **delegate** is a lightweight strategy: `Func<decimal, decimal> vat = p => p * 1.23m`, the `keySelector` in LINQ, or a predicate.
- In .NET: `IComparer<T>`/`StringComparer` for sorting (`names.Sort(StringComparer.OrdinalIgnoreCase)`), `IEqualityComparer<T>` for dictionaries, ASP.NET Core
  authentication handlers and authorization policies, EF Core value converters, compression providers.

## State

```csharp
public class Order
{
    internal IOrderState State { get; set; } = new NewState();
    public void Pay() => State.Pay(this);
    public void Ship() => State.Ship(this);
    public void Cancel() => State.Cancel(this);
}

public abstract class OrderStateBase : IOrderState
{
    public virtual void Pay(Order o) => Invalid("pay");
    public virtual void Ship(Order o) => Invalid("ship");
    public virtual void Cancel(Order o) => Invalid("cancel");
    private void Invalid(string action) => throw new InvalidOperationException($"Cannot {action} an order in state {GetType().Name}");
}

public class NewState  : OrderStateBase { public override void Pay(Order o) => o.State = new PaidState(); public override void Cancel(Order o) => o.State = new CancelledState(); }
public class PaidState : OrderStateBase { public override void Ship(Order o) => o.State = new ShippedState(); public override void Cancel(Order o) => o.State = new CancelledState(); }
public class ShippedState : OrderStateBase { }
```

In a test: `New → Paid → Shipped`; paying twice threw "Cannot pay an order in state PaidState", and cancelling a shipped order threw "Cannot cancel an order in state
ShippedState".

- Each state is a class that knows which operations are allowed and **which state comes next**; the context delegates to the current state.
- It replaces the same `switch (status)` repeated in every method with polymorphism, and keeps the rules for each state in one place.
- Alternatives for simpler cases: an enum plus a **transition table** or a state machine library such as **Stateless** (configure `Permit(Trigger.Pay, State.Paid)`),
  which also gives diagrams and guard conditions. With EF Core, the persisted state is usually an enum column, and state objects are created from it.

## Strategy vs state

| | Strategy | State |
|---|---|---|
| Who changes it | the **client** chooses and swaps it | the **states themselves** trigger transitions |
| Do variants know each other | no, independent | yes, a state knows its successors |
| What varies | *how* one task is done | *what* the object does depending on its situation |
| Typical example | payment, shipping, sorting algorithms | order lifecycle, document workflow, TCP connection |

## Sources

- [Strategy (refactoring.guru)](https://refactoring.guru/design-patterns/strategy)
- [State (refactoring.guru)](https://refactoring.guru/design-patterns/state)
- [Stateless state machine library](https://github.com/dotnet-state-machine/stateless)

## Questions

### What is the strategy pattern? {junior}

A behavioral pattern that defines a family of algorithms, puts each into a separate class implementing a common interface, and makes them interchangeable, so the client
can choose or swap the algorithm at runtime. Typical examples are shipping cost calculations, payment methods, pricing or discount rules, and sorting comparers. It replaces
conditional logic that selects an algorithm with polymorphism.

### What problem does the strategy pattern solve? {junior}

A method with a `switch` or long `if/else` chain choosing between variants of an algorithm grows with each new variant, mixes several algorithms in one place, and must be
modified (and retested) every time. With strategies each variant is a small, independently testable class, new variants are added by writing a new class (Open/Closed
Principle), and the choice can come from configuration or user input.

### How do you choose a strategy at runtime with DI? {mid}

Register all implementations and select by key: keyed services (`AddKeyedScoped<IShippingStrategy, ExpressShipping>("express")` resolved with the key), a dictionary built
from registrations, or `IEnumerable<IShippingStrategy>` where each strategy exposes a `Key` or `CanHandle(request)` method and a resolver picks the matching one. The calling
code depends only on the selection abstraction.

### Can a delegate replace the strategy pattern in C#? {mid}

Often, yes. When a strategy is a single operation without state or dependencies, a `Func<>` or `Action<>` (a lambda) expresses it more concisely: sorting with a key selector,
a filtering predicate, a pricing formula. A class-based strategy is better when the algorithm has several methods, dependencies to inject, configuration, or needs a name for
discovery and testing.

### What is the state pattern? {junior}

A behavioral pattern in which an object's behavior depends on its current state, and each state is represented by a class implementing a common interface. The object (context)
delegates operations to its current state object, and states decide which operations are allowed and which state comes next. It replaces repeated `switch (status)` statements in
every method with polymorphism.

### How does the strategy pattern differ from the state pattern? {mid}

Their structure is the same (a context delegating to an interchangeable object), but in strategy the client chooses the algorithm and the strategies are independent of each
other, while in state the state objects themselves trigger transitions to other states and know their successors. Strategy varies how a task is performed; state varies what the
object does depending on where it is in its lifecycle.

### When would you use a state machine library instead of the state pattern? {mid}

When the states and transitions are many or change often, when you want declarative configuration (`Permit`, guard conditions, entry and exit actions), visualization of the
workflow, or persistence of the state as a simple enum value. Libraries like Stateless give that with less code than one class per state. The classic state pattern fits better
when each state has substantial, distinct behavior beyond transitions.

### Give examples of the strategy pattern in .NET. {mid}

`IComparer<T>` and `StringComparer` passed to sorting and collections, `IEqualityComparer<T>` for dictionaries and `HashSet<T>`, LINQ methods taking a selector or predicate delegate,
authentication handlers and authorization policies in ASP.NET Core, the pluggable `JsonNamingPolicy` in System.Text.Json, and compression or serialization providers chosen by
configuration.

### How do you persist an object implemented with the state pattern in EF Core? {senior}

Persist the state as a simple value, usually an enum or string column (`Status`), and map it to the corresponding state object when the entity is loaded, e.g. with a factory
or a property that returns the state class for the current status. The state classes stay stateless and can be shared instances. Alternatively keep behavior in the entity with a
transition table and use the enum directly, which is simpler to persist and query.

### How do you prevent invalid transitions? {mid}

Make each state explicitly allow only the valid operations and throw (or return an error result) for the rest: in the example, paying an already paid order threw "Cannot pay
an order in state PaidState". Keep the state property's setter private or internal so outside code can't jump to any state, and cover transitions with tests. State machine
libraries enforce allowed transitions declaratively and report invalid triggers.
