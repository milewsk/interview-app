# Command {mid}

**Command** turns a request into a **standalone object** that contains everything needed to perform it. Once an action is an object, you can pass it around, store it,
queue it, log it, retry it, and **undo** it. The code that triggers the action (the **invoker**: a button, a menu, a scheduler) doesn't need to know what it does or which
object (the **receiver**) does the work.

## Undo and redo

```csharp
public interface ICommand { void Execute(); void Undo(); }

public class InsertText(TextEditor editor, string text) : ICommand
{
    public void Execute() => editor.Text += text;
    public void Undo() => editor.Text = editor.Text[..^text.Length];
}

public class DeleteLast(TextEditor editor, int count) : ICommand
{
    private string _removed = "";                                   // the command stores what it needs to undo itself
    public void Execute() { _removed = editor.Text[^count..]; editor.Text = editor.Text[..^count]; }
    public void Undo() => editor.Text += _removed;
}

public class CommandHistory
{
    private readonly Stack<ICommand> _undo = new(), _redo = new();
    public void Execute(ICommand c) { c.Execute(); _undo.Push(c); _redo.Clear(); }
    public void Undo() { var c = _undo.Pop(); c.Undo(); _redo.Push(c); }
    public void Redo() { var c = _redo.Pop(); c.Execute(); _undo.Push(c); }
}
```

In a test: insert "Hello", insert " world", delete the last 6 characters → `Hello`; undo → `Hello world`; undo → `Hello`; redo → `Hello world`. Executing a new command after an
undo cleared the redo stack. A **macro command** holding two inserts executed both and undid both, in reverse order.

## Other uses

- **Queues and background work**: commands put into a queue (a `Channel<T>`, a message broker) and executed later by a worker; in the test a worker read two `SendEmail`
  jobs from a channel and ran them in order. Serializable commands can be persisted, retried and sent to other processes.
- **CQRS commands**: a `record PlaceOrder(...)` with a separate handler is a command object: the data of the request is separated from its execution, and a mediator or
  message bus delivers it to the handler. Unlike the GoF command, the handler (not the command itself) contains the logic.
- **UI**: WPF/MAUI `ICommand` (`Execute`, `CanExecute`, `CanExecuteChanged`) binds buttons and menu items to actions; `RelayCommand`/`AsyncRelayCommand` from the MVVM
  Toolkit wrap delegates.
- In C#, a **delegate** (`Action`, `Func<Task>`) is the lightest command when you don't need undo, metadata or serialization.

## Sources

- [Command (refactoring.guru)](https://refactoring.guru/design-patterns/command)
- [Commanding overview (WPF)](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/commanding-overview)
- [RelayCommand (MVVM Toolkit)](https://learn.microsoft.com/en-us/dotnet/communitytoolkit/mvvm/relaycommand)
- [Channels (.NET)](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)

## Questions

### What is the command pattern? {junior}

A behavioral pattern that encapsulates a request as an object with everything needed to execute it: the receiver, the action and its parameters. The object that triggers the
action (the invoker) only calls `Execute()` and doesn't know what happens. Because actions become objects, they can be stored, queued, logged, retried and undone.

### What are the roles in the command pattern? {junior}

The command declares the execution method (`Execute`, often `Undo`). The concrete command binds an action to a receiver and holds its parameters. The receiver is the object that does
the actual work (the text editor, the account). The invoker triggers commands without knowing their details (a button, a toolbar, a scheduler, an undo manager). The client
creates commands and configures them with receivers.

### How do you implement undo and redo with commands? {mid}

Each command implements `Undo()` and keeps the state needed to reverse itself (e.g. the deleted text). A history object executes commands and pushes them onto an undo stack; undo pops
a command, calls `Undo` and pushes it onto a redo stack; redo does the reverse. Executing a new command clears the redo stack. An alternative for complex state is storing snapshots
(memento) instead of reverse operations.

### What is a macro command? {mid}

A command composed of other commands (the composite pattern applied to commands): executing it executes its children in order, and undoing it undoes them in reverse order. It
lets users record and replay sequences of actions or treat a multi-step operation as one undoable unit.

### How is the command pattern used for queuing and background processing? {mid}

Since a command is an object with its data, it can be put into a queue and executed later by a different component: an in-process `Channel<T>` read by a background service, or a
serialized message sent to a broker and handled by another service. This decouples accepting a request from executing it, smooths load spikes, and allows retries. Commands that
cross process boundaries must be serializable and their handlers idempotent.

### How do CQRS commands relate to the GoF command pattern? {senior}

Both represent a request as an object, but in CQRS a command is usually a plain data object (`record PlaceOrder(...)`) describing an intent to change state, and a separate handler
contains the logic; a mediator or message bus routes the command to its handler. In the GoF pattern the command object itself executes the action on its receiver and often supports
undo. CQRS commands are named in the imperative, validated, and can be rejected.

### What is `ICommand` in WPF and MAUI? {mid}

An interface with `Execute(object)`, `CanExecute(object)` and the `CanExecuteChanged` event, used to bind UI elements (buttons, menu items, key gestures) to actions in the view model
instead of event handlers in code-behind. The control disables itself when `CanExecute` returns false. Implementations such as `RelayCommand` and `AsyncRelayCommand` from the MVVM
Toolkit wrap delegates so you don't write a class per action.

### When is a delegate enough instead of a command class? {mid}

When the action has no undo, no metadata and isn't serialized: `Action` or `Func<Task>` captured in a list or passed to a scheduler is a command in all but name. A class is better when
the command needs `Undo`, a name or description for logging and history, validation, must be serialized to a queue, or needs dependencies injected into its handler.

### What are the drawbacks of the command pattern? {mid}

Every action becomes a class (or a command and a handler), which adds many small types and indirection, so simple operations become harder to follow. Undo requires each command to
correctly capture and restore state, which is error-prone for operations with side effects outside the receiver (sending e-mails, calling APIs), which can't really be undone and need
compensating actions instead.

### How do you make queued commands safe to retry? {senior}

Make handlers idempotent: give each command a unique ID and record processed IDs (or use natural idempotency, e.g. "set status to Paid" instead of "add payment"), so that a command
delivered twice after a failure or timeout has no additional effect. Combine this with persistence of the command before acknowledging it (e.g. the outbox pattern), a retry policy with
backoff, and a dead-letter queue for commands that keep failing.
