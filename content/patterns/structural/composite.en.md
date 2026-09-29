# Composite {mid}

**Composite** lets you treat **individual objects and groups of objects uniformly**, by arranging them in a **tree** where leaves and containers implement the same
interface. The client calls an operation on the root, and it propagates recursively. Typical trees: file systems, menus and UI element hierarchies, organization charts,
product bundles, expression trees, rule sets.

## Structure

```csharp
public interface INode
{
    string Name { get; }
    long Size { get; }
}

public record FileItem(string Name, long Size) : INode;                       // leaf

public record Folder(string Name, List<INode> Children) : INode               // composite
{
    public long Size => Children.Sum(c => c.Size);                          // delegates to children, recursively
}

var root = new Folder("root", [
    new FileItem("a.txt", 100),
    new Folder("docs", [new FileItem("b.pdf", 2000), new FileItem("c.pdf", 3000), new Folder("empty", [])]),
    new FileItem("d.png", 500)]);

root.Size;   // 5600: the client doesn't care whether it's asking a file or a folder
```

- **Component**: the common interface (`INode`, `IPriced`).
- **Leaf**: an element without children that does the actual work (`FileItem`, `Product`).
- **Composite**: an element that contains components and implements operations by delegating to them, possibly adding its own logic.

A product catalog example: a `Bundle` of a pen (10), a pad (20) and a nested ink set (15 + 15) with a 10% discount costs 54, because the bundle sums its items, whether
they're products or other bundles, and applies its discount.

## Benefits and trade-offs

- **Uniformity**: client code doesn't need `if (node is Folder)` branches; adding new node types doesn't change clients (Open/Closed).
- **Recursion for free**: operations on arbitrarily deep trees are written once.
- **Design choice**: where to put child-management methods (`Add`, `Remove`). Putting them on the common interface gives transparency but lets clients call `Add` on a leaf
  (which must throw); putting them only on the composite is safer but requires type checks when building the tree. Modern C# usually favors the safe option with immutable
  construction.
- Beware of very deep trees (recursion depth) and cycles if nodes can be shared.

## In .NET

- `XElement`/`XNode` (LINQ to XML) and the HTML/JSON DOMs (`JsonNode`) are composites.
- Expression trees: `BinaryExpression` contains other `Expression`s.
- `CompositeFileProvider` combines several `IFileProvider`s into one (verified: it listed `one.txt` and `two.txt` from two directories), and `CompositeChangeToken`
  combines change tokens.
- UI frameworks: WPF/MAUI visual trees, Blazor/React component trees.
- Rule and specification combinators (`And`, `Or`, `Not`) build composite rules.

## Sources

- [Composite (refactoring.guru)](https://refactoring.guru/design-patterns/composite)
- [CompositeFileProvider (ASP.NET Core file providers)](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/file-providers)
- [Expression trees (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)

## Questions

### What is the composite pattern? {junior}

A structural pattern that composes objects into tree structures and lets clients treat individual objects (leaves) and compositions of objects (containers) the same way,
through a common interface. An operation called on a container is applied to its children recursively. Classic examples are file systems (files and folders), menus with
submenus, and organization charts.

### What roles exist in the composite pattern? {junior}

The component: the common interface or abstract class that clients use. The leaf: an element without children that implements the operation directly (a file with its size).
The composite: an element that holds child components and implements the operation by delegating to them and combining the results (a folder summing its children's sizes),
possibly with its own logic (a bundle applying a discount).

### What problem does composite solve? {mid}

Without it, client code must distinguish between single items and groups everywhere (`if (x is Folder f) { foreach ... } else { ... }`), and those checks are duplicated
and must be updated for each new node type. With a common interface, operations like "total size", "total price" or "render" are written once per node type, work on trees of any
depth and let new node types be added without changing clients.

### Where should methods for adding and removing children be declared? {senior}

It's a trade-off between transparency and safety. Declaring `Add`/`Remove` on the common component interface lets clients treat all nodes identically, but leaves then have
methods that make no sense and must throw. Declaring them only on the composite is type-safe, but code building the tree must know which nodes are composites. In C# the safe
approach is common, often with children passed to the constructor so trees are built immutably.

### Give examples of the composite pattern in .NET. {mid}

LINQ to XML (`XElement` containing other `XNode`s) and `System.Text.Json.Nodes` (`JsonObject`, `JsonArray`, `JsonValue` sharing `JsonNode`), expression trees (`Expression` nodes
containing other expressions), `CompositeFileProvider` and `CompositeChangeToken` in ASP.NET Core, and UI trees in WPF, MAUI and Blazor. They all let you work with a node
without caring whether it's a leaf or has children.

### How do you traverse a very deep composite tree safely? {senior}

Replace recursion with an explicit `Stack<T>` (depth-first) or `Queue<T>` (breadth-first): push the root, then repeatedly pop a node, process it and push its children.
Recursion uses the call stack, and a stack overflow terminates the .NET process and can't be caught. In a test, an iterative count of a 200,000-level chain returned 200000,
while the recursive version crashed with "Stack overflow." Iterative traversal also makes it easy to detect cycles with a visited set.

### What are the risks of the composite pattern? {mid}

A too-general component interface can force leaves to implement operations that don't apply to them. Very deep trees risk stack overflows with recursive operations, and if a
node can be added to several parents or to its own descendant, cycles make recursion infinite. Performance can suffer when operations repeatedly traverse large trees, which
caching aggregated values (e.g. folder sizes) addresses.

### How does composite differ from decorator? {senior}

Both use recursive composition through a common interface, but a decorator wraps exactly one component to add behavior to it, forming a chain, while a composite holds any
number of children to represent a part–whole hierarchy and aggregates their results, forming a tree. A decorator changes how one object behaves; a composite makes a group behave
like one object.

### How would you model a product bundle that can contain other bundles? {mid}

Define a common `IPriced` interface with a `Price` property, implement it in `Product` (a leaf returning its own price) and in `Bundle` (a composite holding a list of `IPriced`
and computing the sum of its items with its own discount). Nested bundles work automatically: in a test, a bundle with a pen (10), a pad (20) and an inner ink set (15 + 15) with a
10% discount cost 54.

### Is a tree of UI components an example of composite? {junior}

Yes. In frameworks like WPF, MAUI, Blazor or React, a window or page contains panels that contain other panels and controls, all sharing a common base (an element or component).
Operations like layout, rendering or event propagation are applied to the root and recursively flow through the tree, without the framework having to treat containers and simple
controls differently.
