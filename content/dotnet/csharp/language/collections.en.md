# Collections in .NET {mid}

Choosing a collection is about the operations you'll do most often: access by index, lookup by key, uniqueness, order, concurrent access. Interviews
check the complexity of basic operations, the interface hierarchy and typical pitfalls.

## The most important collections

| Collection | Structure | Key operations |
|---|---|---|
| `T[]` | contiguous array, fixed size | index O(1) |
| `List<T>` | dynamic array | index O(1), `Add` amortized O(1), `Insert`/`Remove` O(n), `Contains` O(n) |
| `Dictionary<TKey, TValue>` | hash table | lookup/insert/remove O(1) on average |
| `HashSet<T>` | hash table without values | `Add`/`Contains`/`Remove` O(1), set operations |
| `SortedDictionary<TKey, TValue>` | red-black tree | O(log n), keys in order |
| `SortedList<TKey, TValue>` | two sorted arrays | lookup O(log n), insert O(n), less memory |
| `Queue<T>` / `Stack<T>` | circular buffer / array | FIFO / LIFO in O(1) |
| `PriorityQueue<TElement, TPriority>` | binary heap | `Enqueue`/`Dequeue` O(log n), lowest priority first |
| `LinkedList<T>` | doubly linked list | insert/remove at a known node O(1), no index |

`List<T>` doubles its **capacity** when it runs out of space (4, 8, 16, 32…), copying elements to a new array. If you know the size, pass it in the
constructor (`new List<int>(1000)`) to avoid resizing.

## Interface hierarchy

```
IEnumerable<T>              — can be iterated (foreach, LINQ)
├── IReadOnlyCollection<T>  — + Count
│   └── IReadOnlyList<T>    — + read-only indexer
└── ICollection<T>          — + Add, Remove, Clear, Contains
    └── IList<T>            — + indexer, Insert, RemoveAt
```

The rule: **accept the most general type** you need (`IEnumerable<T>` if you only iterate), and **return a specific or read-only type**
(`IReadOnlyList<T>`, `List<T>`). An `IEnumerable<T>` parameter may be a lazy LINQ query that runs again on every enumeration.

## Read-only, immutable and frozen

- **`IReadOnlyList<T>`** is only a view of the interface: the caller can cast it back to `List<T>`, and the owner can still change the data.
- **`ReadOnlyCollection<T>`** (`list.AsReadOnly()`) is a wrapper that blocks modification through itself, but changes to the source list are visible.
- **`ImmutableList<T>`, `ImmutableDictionary<TKey, TValue>`** (`System.Collections.Immutable`): every "change" returns a new collection, and the
  original stays unchanged. They're thread-safe for reading and good for shared state, but slower than regular collections.
- **`FrozenDictionary<TKey, TValue>` / `FrozenSet<T>`** (.NET 8+): created once (`ToFrozenDictionary()`) and optimized for very fast reads. Ideal for
  configuration and lookup tables built at startup.

## Pitfalls

```csharp
foreach (var item in list)
    if (item.IsExpired) list.Remove(item);     // 🔴 InvalidOperationException: collection was modified

list.RemoveAll(item => item.IsExpired);         // ✅
```

- **Modifying a collection during `foreach`** throws `InvalidOperationException`. Use `RemoveAll`, a `for` loop from the end, or iterate over a copy.
- **Dictionary**: the indexer throws `KeyNotFoundException` for a missing key, so use `TryGetValue` or `GetValueOrDefault`. `Add` throws for an existing
  key, while `dict[key] = value` overwrites it.
- **Key mutability**: if an object's `GetHashCode` depends on a field that changes after it's added to a `HashSet` or used as a `Dictionary` key, the
  collection won't find it anymore. Keys should be immutable.
- **Comparers**: `new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)` gives case-insensitive keys.
- **Iteration order** of `Dictionary` and `HashSet` isn't guaranteed. When order matters, use `SortedDictionary`, or sort.

## Concurrent collections

Regular collections aren't thread-safe for writes. `System.Collections.Concurrent` provides `ConcurrentDictionary`, `ConcurrentQueue`,
`ConcurrentStack`, `ConcurrentBag` and `BlockingCollection`. In `ConcurrentDictionary.GetOrAdd(key, factory)` **the factory may run more than
once** for the same key under concurrent access (only one result is stored), so it shouldn't have side effects. If it must run exactly once, store a
`Lazy<T>`.

## Collection expressions (C# 12)

```csharp
int[] numbers = [1, 2, 3];
List<int> more = [.. numbers, 4, 5];     // spread
ReadOnlySpan<char> vowels = ['a', 'e', 'i'];
```

One syntax works for arrays, lists, spans and immutable collections, and the compiler chooses an efficient way to build them.

## Sources

- [Collections (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/collections)
- [Selecting a collection class](https://learn.microsoft.com/en-us/dotnet/standard/collections/selecting-a-collection-class)
- [Thread-safe collections](https://learn.microsoft.com/en-us/dotnet/standard/collections/thread-safe/)
- [System.Collections.Frozen namespace](https://learn.microsoft.com/en-us/dotnet/api/system.collections.frozen)
- [Collection expressions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/collection-expressions)

## Questions

### How does `List<T>` differ from an array? {junior}

An array has a fixed size set when it's created, while `List<T>` grows dynamically: underneath it has an array that it replaces with one twice as large
when capacity runs out. Both give O(1) access by index. Arrays suit data of a known size and performance-critical code, and `List<T>` suits collections
that grow or shrink.

### What is the complexity of lookup in `List<T>` and `Dictionary<TKey, TValue>`? {junior}

`List<T>.Contains` and `IndexOf` scan the elements, so they're O(n). `Dictionary` lookup by key uses a hash table, so it's O(1) on average (O(n) in the
worst case, with many collisions). So when you often search by key or check membership, a `Dictionary` or `HashSet` is much faster than a list.

### How does `IEnumerable<T>` differ from `IList<T>`, and which should a method accept? {mid}

`IEnumerable<T>` only allows iteration, while `IList<T>` adds `Count`, an indexer and modification. A method should accept the most general type it needs:
`IEnumerable<T>` if it only iterates, and `IReadOnlyList<T>` if it needs `Count` or index access. Remember that an `IEnumerable<T>` may be a lazy query that
runs again on every enumeration, so materialize it (`ToList()`) if you enumerate it several times.

### Why does removing items from a list inside `foreach` throw an exception? {junior}

The enumerator checks the collection's version on every step, and any modification makes it throw `InvalidOperationException` ("Collection was
modified"), because continuing would give unpredictable results. Solutions: `list.RemoveAll(predicate)`, a `for` loop running backwards, or iterating
over a copy (`foreach (var x in list.ToList())`).

### What happens when an object used as a `Dictionary` key changes? {mid}

If the change affects `GetHashCode` or `Equals`, the dictionary looks for the object in a different bucket and can't find it: `ContainsKey` returns
`false`, although the entry is still there. So keys should be immutable (e.g. `string`, `int`, records with init-only properties), and hash codes should
depend only on fields that don't change.

### How does `IReadOnlyList<T>` differ from `ImmutableList<T>`? {mid}

`IReadOnlyList<T>` is just an interface that hides modification methods: the caller can cast it back to `List<T>`, and the owner can still change the data,
which the reader will see. `ImmutableList<T>` really can't change: "modifying" methods return a new collection, and the original stays the same, so it's
safe to share across threads and components.

### When would you use `FrozenDictionary`? {mid}

When a dictionary is built once (e.g. at startup from configuration) and then only read, many times. `ToFrozenDictionary()` spends more time on creation to
analyze the keys and choose an optimized structure, and lookups are faster than in a regular `Dictionary`. It isn't modifiable, so it doesn't suit data that
changes.

### Is `Dictionary<TKey, TValue>` thread-safe? {mid}

Only for concurrent reads without any writes. Concurrent writes (or reading while writing) can corrupt its internal state. For shared, modified
dictionaries use `ConcurrentDictionary`, a `lock`, or an immutable/frozen collection swapped atomically. `ConcurrentDictionary` gives atomic operations like
`GetOrAdd`, `AddOrUpdate` and `TryRemove`.

### Can the factory in `ConcurrentDictionary.GetOrAdd` run more than once? {senior}

Yes. The factory runs outside the lock, so under concurrent access several threads can call it for the same key, and only one result is stored. So it
shouldn't have side effects or be expensive. If it must run exactly once, store `Lazy<T>` values: `dict.GetOrAdd(key, k => new Lazy<T>(() => Create(k))).Value`.

### What is `PriorityQueue<TElement, TPriority>` for? {mid}

It's a min-heap: `Dequeue` always returns the element with the lowest priority, and `Enqueue` and `Dequeue` take O(log n). It's used in scheduling tasks,
Dijkstra's algorithm, merging sorted streams and "top N" problems. It doesn't guarantee order among elements with equal priority, and it doesn't support
changing an element's priority.
