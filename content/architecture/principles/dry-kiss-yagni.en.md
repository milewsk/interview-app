# DRY, KISS, YAGNI and other everyday principles {junior}

Besides SOLID, a handful of short principles shape everyday design decisions. They often pull in different directions (DRY pushes towards abstraction,
YAGNI and KISS against it), so interviews focus less on definitions and more on **judgment**: when to apply each and what happens when you overdo it.

## DRY: Don't Repeat Yourself

"Every piece of **knowledge** must have a single, unambiguous, authoritative representation within a system" (*The Pragmatic Programmer*).

- DRY is about **knowledge**, not text. The VAT rate, a validation rule or a mapping between enum values should be defined once; if it's duplicated, the copies
  eventually diverge.
- Two pieces of code that look the same today but represent **different knowledge** (e.g. validation of a customer name and of a product name) aren't
  duplication. Merging them couples things that change for different reasons.
- **The wrong abstraction**: forcing similar-looking code into one shared function, then adding parameters and `if`s for each new caller. Sandi Metz: "duplication
  is far cheaper than the wrong abstraction". The rule of three (abstract on the third repetition) is a useful heuristic.

## KISS: Keep It Simple

Prefer the simplest solution that works. Simple code is easier to read, test, debug and change. Signs of overcomplication: layers that only pass calls through,
generic frameworks for a single use case, clever one-liners that need a comment to understand, patterns applied because they're known rather than needed.
Kent Beck's rules of simple design, in priority order: passes the tests, reveals intention, no duplication, fewest elements.

## YAGNI: You Aren't Gonna Need It

A principle from Extreme Programming: don't build capabilities for **presumed** future needs. Martin Fowler lists the costs of such a feature: the cost of
building it, the cost of delay (other features wait), the cost of carrying the extra complexity, and the cost of repair when the guess turns out wrong. YAGNI
applies to **features**, not to keeping code easy to change: refactoring, tests and clean structure are what make adding the feature later cheap.

## Other principles you'll hear

- **Separation of concerns**: different concerns (UI, business rules, data access) live in different modules.
- **Law of Demeter** ("only talk to your immediate friends"): a method should use its own fields, parameters and objects it creates, not reach through chains
  like `order.Customer.Address.City.Name`. Long chains couple the caller to the structure of many objects.
- **Tell, don't ask**: instead of asking an object for data and deciding for it (`if (account.Balance >= amount) account.Balance -= amount;`), tell it what to do
  (`account.Withdraw(amount)`), keeping the rule inside the object that owns the data.
- **Fail fast**: validate inputs and invariants early and throw a clear error, instead of carrying invalid state that fails far away.
- **Principle of least astonishment**: an API should behave the way its name suggests; a `GetUser` method shouldn't create users or send e-mails.
- **Composition over inheritance**: build behavior from collaborating objects rather than deep class hierarchies (see the OOP topic).

## Sources

- [Yagni (Martin Fowler)](https://martinfowler.com/bliki/Yagni.html)
- [Beck design rules (Martin Fowler)](https://martinfowler.com/bliki/BeckDesignRules.html)
- [The wrong abstraction (Sandi Metz)](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- [Tell, don't ask (Martin Fowler)](https://martinfowler.com/bliki/TellDontAsk.html)
- [Architectural principles (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles)

## Questions

### What does DRY mean, and is all duplicated code a DRY violation? {junior}

"Don't Repeat Yourself": each piece of knowledge (a business rule, a constant, a mapping) should have one authoritative representation, so a change is made in one
place. Not all similar-looking code violates it: two fragments that look alike but express different knowledge and change for different reasons should stay
separate, because merging them couples unrelated concerns.

### What is "the wrong abstraction"? {mid}

An abstraction created too early from code that only looked similar: a shared method or base class that then grows parameters, flags and conditionals as each new
caller needs something slightly different, until nobody understands it. Sandi Metz argues that duplication is far cheaper than the wrong abstraction, and that
the fix is to inline it back into the callers and let the right abstraction emerge. The rule of three helps avoid it.

### What does YAGNI mean? {junior}

"You Aren't Gonna Need It": don't implement functionality for anticipated future requirements, only for current ones. A speculative feature costs time to build,
delays other work, adds complexity everyone has to carry, and often has to be redone because the real requirement turns out different. YAGNI doesn't forbid
keeping code clean and tested, which is exactly what makes adding the feature later cheap.

### How do DRY and YAGNI/KISS conflict? {mid}

DRY pushes you to extract shared abstractions as soon as you see repetition, while YAGNI and KISS push you to avoid abstractions until they're clearly needed. Too
much DRY gives premature, wrong abstractions; too little gives inconsistent copies of rules. A pragmatic balance: always deduplicate business knowledge (rules,
constants), and tolerate small code duplication until a pattern is clear (e.g. the third occurrence).

### What is the Law of Demeter? {mid}

A guideline that a method should only call methods of its own object, its parameters, objects it creates and its fields, not objects returned by them. A chain like
`order.Customer.Address.City.Name` couples the caller to the internal structure of four classes, so a change in any of them breaks it. The fix is to ask the nearest
object for what you need (`order.ShippingCityName()`) or pass the needed data directly.

### What does "tell, don't ask" mean? {mid}

Instead of asking an object for its data and making decisions about it outside (`if (account.Balance >= amount) account.Balance -= amount`), tell the object what to
do (`account.Withdraw(amount)`) and let it enforce its own rules. It keeps behavior next to the data it concerns, protects invariants (the balance can't be changed
from outside) and avoids duplicating the rule in every caller. It's a practical form of encapsulation.

### What is KISS, and what are signs that code violates it? {junior}

"Keep It Simple": choose the simplest design that meets the requirements. Signs of violation: layers or interfaces that only forward calls, generic frameworks built
for one use case, configuration for things that never change, clever code that needs explanation, and design patterns applied because they're familiar rather than
because the problem needs them. Simple code is easier to read, test and change.

### What is "fail fast"? {junior}

Detecting invalid input or state as early as possible and stopping with a clear error, instead of continuing and failing later in an unrelated place. Examples: guard
clauses at the start of a method (`ArgumentNullException.ThrowIfNull`), validating configuration at startup, constructors that refuse to create invalid objects. Errors
are cheaper to diagnose at their source than after corrupting data.

### What is separation of concerns? {junior}

Dividing a program into parts that each deal with one concern, such as presentation, business rules and data access, with clear boundaries between them. Each part
can then be understood, changed and tested independently: changing the UI doesn't require touching business rules, and switching the database doesn't affect
presentation. Layered and clean architectures are applications of this principle at the system level.

### When is duplication acceptable? {senior}

When the duplicated code represents different knowledge that happens to look the same today, when the duplication crosses boundaries you want to keep independent
(e.g. two microservices each having their own DTO instead of sharing a library that couples their deployments), in tests, where explicit repetition often improves
readability, and while you're still learning what the right abstraction is. Duplication of business rules within one bounded context is the kind to remove.
