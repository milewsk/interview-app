# Observer and publish–subscribe {mid}

**Observer** defines a one-to-many dependency: when one object (the **subject**) changes, all its **observers** are notified automatically, without the subject knowing
their concrete types. It's the basis of event-driven code: C# events, `IObservable<T>`, data binding (`INotifyPropertyChanged`), domain events, and, at the system level,
publish–subscribe messaging.

## C# events: the built-in observer

```csharp
public class Stock
{
    private decimal _price;
    public event EventHandler<PriceChangedEventArgs>? PriceChanged;       // the subject exposes an event

    public decimal Price
    {
        get => _price;
        set { _price = value; PriceChanged?.Invoke(this, new PriceChangedEventArgs(value)); }   // notify all observers
    }
}

stock.PriceChanged += OnPrice;    // subscribe
stock.PriceChanged -= OnPrice;    // unsubscribe
```

In a test with two subscribers, setting the price to 10 notified both, and after unsubscribing the first one, setting 12 notified only the second (`A:10, B:10, B:12`).

Pitfalls verified in tests:

- **Handlers run synchronously, in order, on the publisher's thread.** If one throws, the remaining handlers don't run and the exception reaches the code that raised
  the event (in the test the third handler never ran).
- **Memory leaks**: the publisher's delegate holds a reference to the subscriber. If a long-lived publisher (a static event, a singleton service) outlives a subscriber
  that never unsubscribes, the subscriber can't be collected (in the test it survived GC when not unsubscribed, and was collected when it unsubscribed). Unsubscribe in
  `Dispose`, or use weak event patterns.
- Handlers with slow work block the publisher; `async void` handlers make exceptions unobservable.

## `IObservable<T>` and `IObserver<T>`

.NET's formal observer interfaces: the observer receives `OnNext(value)`, `OnError(exception)` and `OnCompleted()`, and `Subscribe` returns an `IDisposable` whose
disposal unsubscribes (verified: after disposing, the observer received nothing more, not even completion). **Reactive Extensions** (Rx.NET, `System.Reactive`) builds a
rich LINQ-style API on top: filtering, throttling, merging and buffering streams of events (`Throttle`, `Buffer`, `Merge`).

## Observer vs publish–subscribe

- In the **observer** pattern, subjects know their observers directly (they hold references), notification is usually synchronous and in-process.
- In **publish–subscribe**, publishers and subscribers don't know each other: messages go through an intermediary (an event bus, a mediator, a message broker), often
  asynchronously and across processes. It decouples them more but adds infrastructure and eventual consistency.
- **Domain events** in DDD sit in between: an aggregate records events, and after saving, a dispatcher (often in-process, e.g. MediatR notifications) delivers them to
  handlers; integration events go through a broker to other services.

## Where you see it in .NET

C# `event`s everywhere (UI frameworks, `FileSystemWatcher.Changed`, `Process.Exited`), `INotifyPropertyChanged` and `ObservableCollection<T>` for data binding,
`IObservable<T>`/Rx.NET, `IChangeToken` and `IOptionsMonitor<T>.OnChange` for configuration reloading, `DiagnosticListener` and `EventSource`/`EventListener` for diagnostics.

## Sources

- [Observer (refactoring.guru)](https://refactoring.guru/design-patterns/observer)
- [Observer design pattern (.NET)](https://learn.microsoft.com/en-us/dotnet/standard/events/observer-design-pattern)
- [Handling and raising events (.NET)](https://learn.microsoft.com/en-us/dotnet/standard/events/)
- [Weak event patterns (WPF)](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/events/weak-event-patterns)
- [Reactive Extensions for .NET (Rx.NET)](https://github.com/dotnet/reactive)

## Questions

### What is the observer pattern? {junior}

A behavioral pattern where a subject maintains a list of observers and notifies them automatically when its state changes, without depending on their concrete types. It
decouples the source of a change from the reactions to it. In C#, events and delegates implement it directly, and `IObservable<T>`/`IObserver<T>` are the formal interfaces.

### How do C# events implement the observer pattern? {junior}

The subject declares an `event` of a delegate type (e.g. `EventHandler<TArgs>`); observers subscribe with `+=` and unsubscribe with `-=`, and the subject raises the event with
`Event?.Invoke(this, args)`, calling every subscribed handler. The `event` keyword restricts outside code to subscribing and unsubscribing, so only the owning class can raise it
or clear the list.

### When would you use Rx.NET instead of plain C# events? {mid}

When you work with streams of events over time rather than single notifications: throttling or debouncing input, combining several sources, windowing or buffering, retrying
and timeouts, or turning events into queries with LINQ-style operators. Plain events are simpler and enough for one-off notifications between objects. Rx adds a dependency and
a learning curve (schedulers, hot and cold observables, disposing subscriptions), so it pays off mainly in event-heavy code such as UIs, sensors or real-time data.

### What happens if an event handler throws an exception? {mid}

Handlers of a multicast delegate run synchronously one after another; if one throws, the invocation stops, the remaining handlers aren't called, and the exception propagates to the
code that raised the event. If handlers must be isolated, the publisher can iterate `GetInvocationList()` and call each handler in its own `try/catch`, or dispatch notifications
through a mechanism that handles failures per subscriber.

### How do `IObservable<T>` and `IObserver<T>` work? {mid}

An `IObservable<T>` is a source of values; observers implement `IObserver<T>` with `OnNext`, `OnError` and `OnCompleted`. Calling `Subscribe(observer)` returns an `IDisposable`, and
disposing it unsubscribes. The contract is that after `OnError` or `OnCompleted` no more notifications are sent. Rx.NET builds a composable query language over these interfaces for
event streams.

### How does the observer pattern differ from publish–subscribe? {mid}

In observer, the subject holds direct references to its observers and notifies them itself, usually synchronously and within one process. In publish–subscribe, publishers and
subscribers don't know about each other: messages pass through an intermediary such as an event bus or message broker, can be asynchronous, persistent and cross process boundaries.
Pub/sub gives looser coupling and scalability at the cost of infrastructure and eventual consistency.

### What is `INotifyPropertyChanged`? {junior}

An interface with a `PropertyChanged` event that objects raise when a property value changes. UI frameworks (WPF, MAUI, WinForms binding) subscribe to it to update controls
automatically, which is the observer pattern applied to data binding. `ObservableCollection<T>` does the same for collections with `CollectionChanged`. Source generators such as
the MVVM Toolkit generate the boilerplate.

### How do domain events relate to the observer pattern? {senior}

Domain events apply the observer idea to business logic: an aggregate records that something happened (`OrderPaid`) without knowing who reacts, and handlers subscribe to event types.
Usually the events are collected during the operation and dispatched after (or during) saving, often in-process through a mediator, so reactions like sending an e-mail or updating
another aggregate are decoupled from the aggregate. Events for other services are published as integration events through a broker.

### What is the weak event pattern? {senior}

A way for a publisher to notify subscribers without keeping them alive: the subscription holds only a weak reference to the subscriber, so if nothing else references it, the GC can
collect it and the publisher simply drops the dead subscription. WPF provides `WeakEventManager` for this. It solves leaks when subscribers can't reliably unsubscribe, at the cost of
complexity and slightly slower dispatch.

### Why can synchronous event handlers be a problem? {mid}

Handlers run on the publisher's thread before the raising code continues, so a slow handler (I/O, heavy computation) delays the publisher and all other handlers, and on a UI thread
freezes the interface. `async void` handlers avoid blocking but make exceptions unobservable by the publisher and completion untrackable. For heavy or unreliable reactions, queue the
work (a channel, a background service, a message broker) instead of doing it inside the handler.
