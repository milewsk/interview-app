# SOLID principles {mid}

SOLID is a set of five object-oriented design principles popularized by Robert C. Martin. They aim at code that is **easy to change**: a new requirement
should mean adding code rather than editing a lot of existing code, and a change in one place shouldn't break unrelated places. Interviewers expect you
to explain each principle with an example, and to know when applying it is overkill.

## S: Single Responsibility Principle

"A class should have only one reason to change." A reason to change is an **actor** or concern: business rules, persistence, formatting, notifications.

```csharp
// 🔴 three reasons to change: pricing rules, the database, the e-mail template
class OrderService { decimal CalculateTotal(...); void SaveToDatabase(...); void SendConfirmationEmail(...); }

// ✅ separate responsibilities, composed by an application service
class PriceCalculator { ... }   class OrderRepository { ... }   class OrderNotifier { ... }
```

SRP isn't "one method per class": it's about cohesion. Splitting too finely produces many tiny classes that are hard to follow.

## O: Open/Closed Principle

"Software entities should be open for extension, closed for modification": new behavior is added by **adding code** (a new class), not by editing a
growing `switch`.

```csharp
interface IDiscount { decimal Apply(decimal price, Customer customer); }
class VipDiscount : IDiscount { public decimal Apply(decimal p, Customer c) => c.IsVip ? p * 0.9m : p; }
class BlackFridayDiscount : IDiscount { public decimal Apply(decimal p, Customer c) => p - 5m; }

class PriceCalculator(IEnumerable<IDiscount> discounts)
{
    public decimal Final(decimal price, Customer c) => discounts.Aggregate(price, (acc, d) => d.Apply(acc, c));   // 100 → 85
}
```

A new discount is a new `IDiscount` registered in DI; `PriceCalculator` doesn't change. Typical tools: polymorphism, strategy, decorators, plugins.

## L: Liskov Substitution Principle

"Subtypes must be substitutable for their base types" without breaking the caller's expectations: a derived class may not strengthen preconditions, weaken
postconditions or break invariants.

```csharp
static int AreaAfterResize(Rectangle r) { r.Width = 5; r.Height = 4; return r.Area; }

AreaAfterResize(new Rectangle());   // 20
AreaAfterResize(new Square());      // 16: the square keeps its sides equal, breaking the caller's expectation
```

A square "is a" rectangle mathematically, but not behaviorally when rectangles are mutable. Other classic violations: an override that throws
`NotSupportedException` (e.g. `ReadOnlyCollection<T>` implementing `ICollection<T>.Add`), or a subclass that ignores a method's contract. The fix is usually a
different abstraction, e.g. immutable shapes or a common `IShape` interface.

## I: Interface Segregation Principle

"Clients shouldn't be forced to depend on methods they don't use." Prefer small, role-based interfaces over a fat one:

```csharp
interface IReadRepository<T> { IEnumerable<T> GetAll(); }
interface IWriteRepository<T> { void Delete(T item); }
class ProductRepository : IReadRepository<Product>, IWriteRepository<Product> { ... }
```

A reporting service receives only `IReadRepository<Product>` and can't delete anything; test doubles implement only what's needed.

## D: Dependency Inversion Principle

"High-level modules shouldn't depend on low-level modules; both should depend on abstractions." Business logic defines the interface it needs
(`IClock`, `IOrderRepository`, `IPaymentGateway`), and infrastructure implements it.

```csharp
interface IClock { DateTime Now { get; } }
class GreetingService(IClock clock) { public string Greeting() => clock.Now is { Month: 12, Day: 24 } ? "Merry Christmas" : "Hello"; }

new GreetingService(new FixedClock(new DateTime(2026, 12, 24))).Greeting();   // "Merry Christmas": testable without the real date
```

DIP (a design principle) is different from **dependency injection** (a technique for supplying dependencies from outside), although DI is the usual way to
apply it. In .NET, `TimeProvider` is the built-in abstraction for time.

## Pragmatism

SOLID principles are heuristics, not laws. Applying them everywhere creates needless interfaces and indirection (an `IFooService` with one implementation
that will never have a second). Apply them where change is likely or testing needs a seam, and keep simple code simple (see KISS and YAGNI).

## Sources

- [Architectural principles (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles)
- [The Single Responsibility Principle (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)
- [Inversion of Control containers and the dependency injection pattern (Martin Fowler)](https://martinfowler.com/articles/injection.html)

## Questions

### What does SOLID stand for? {junior}

Single Responsibility (a class has one reason to change), Open/Closed (extend behavior by adding code, not modifying it), Liskov Substitution (subtypes can replace
their base types without breaking callers), Interface Segregation (small, client-specific interfaces instead of fat ones) and Dependency Inversion (high-level code
depends on abstractions, not on concrete low-level details). Together they aim at code that is easy to change and test.

### What does "one reason to change" mean in SRP? {mid}

A class should serve one actor or concern, so that it changes only when that concern changes. If a class calculates prices, saves orders and formats e-mails, a
change in pricing rules, the database schema or the e-mail template all touch the same class, increasing the risk of breaking something unrelated. SRP is about
cohesion, not about having one method per class.

### Give an example of the Open/Closed Principle. {mid}

Discounts: instead of a `switch` over discount types in `PriceCalculator` that must be edited for every new promotion, define an `IDiscount` interface, implement each
discount as a separate class and let the calculator apply all registered discounts. A new promotion is a new class registered in DI, and the calculator and existing
discounts stay untouched. Strategy, decorator and plugin-style designs are typical ways to achieve OCP.

### What is the Liskov Substitution Principle, and what is the classic violation? {mid}

Objects of a subtype must be usable wherever the base type is expected, without the caller noticing: same or weaker preconditions, same or stronger postconditions,
preserved invariants. The classic violation is a `Square` inheriting from a mutable `Rectangle`: code that sets width 5 and height 4 expects area 20 but gets 16,
because the square forces equal sides. Overrides throwing `NotSupportedException` are another common sign.

### What is the Interface Segregation Principle? {junior}

Clients shouldn't depend on methods they don't use. Instead of one large interface (e.g. a repository with dozens of methods), define smaller role interfaces
(`IReadRepository`, `IWriteRepository`) and let a class implement several. Consumers get only the capability they need, dependencies are clearer, and test doubles
are smaller.

### How does dependency inversion differ from dependency injection? {mid}

Dependency inversion is a design principle: high-level policy code shouldn't depend on low-level details; both depend on abstractions, often defined by the
high-level side (e.g. the domain defines `IOrderRepository`, infrastructure implements it). Dependency injection is a technique: an object receives its dependencies
from outside (constructor parameters) instead of creating them. DI is the usual way to apply DIP, but you can inject concrete classes without inverting anything.

### Why is `DateTime.Now` inside business logic a testability problem? {mid}

The logic depends on a hidden, uncontrollable dependency: tests can't check behavior for a specific date (e.g. Christmas, the end of a month) without waiting for it
or hacking the system clock. Following DIP, inject an abstraction such as .NET's `TimeProvider` (or your own `IClock`) and use a fixed or fake implementation in
tests. The same applies to random numbers, GUIDs, environment variables and file systems.

### Can you overuse SOLID? {senior}

Yes. Applying the principles mechanically produces an interface for every class with a single implementation, deep abstraction layers, many tiny classes and
indirection that makes simple code hard to follow. The principles are tools for managing change; they pay off where change is likely or a seam is needed for testing.
KISS and YAGNI balance them: start simple and introduce abstractions when a real second variant or test need appears.

### How does SOLID relate to testability? {mid}

Classes with a single responsibility are small and focused, so they're easy to test. Dependency inversion and injection let tests replace databases, clocks and
HTTP clients with fakes. Small interfaces (ISP) keep fakes small, and LSP ensures that a fake behaves like the real implementation from the caller's point of view.
Code that's hard to test is often a symptom of violating these principles.

### What does it mean that subtypes must not strengthen preconditions? {senior}

A caller relies on the base type's contract, so a subtype can't demand more than the base does: if `Save(Order order)` accepts any valid order, an override that
throws for orders over 1,000 breaks callers that were correct against the base type. Conversely, a subtype mustn't guarantee less (weaker postconditions), e.g.
returning `null` where the base promises a non-null result. Both break substitutability, which is what LSP forbids.
