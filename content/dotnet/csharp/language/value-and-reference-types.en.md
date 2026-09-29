# Value types and reference types {junior}

Every C# type is either a **value type** or a **reference type**. The difference is **what gets
copied** on assignment and when passing to a method.

- **Value types**: `struct` (including `int`, `double`, `bool`, `DateTime`, `decimal`), `enum`,
  `record struct`, tuples `(int, string)`, `Nullable<T>`. The variable **contains the data**.
- **Reference types**: `class`, `record` (`record class`), `interface`, `delegate`, arrays,
  `string`, `object`. The variable contains a **reference** to an object on the heap.

```csharp
var s1 = new PointStruct { X = 1 };
var s2 = s1;       // copies the whole value
s2.X = 10;         // s1.X == 1

var c1 = new PointClass { X = 1 };
var c2 = c1;       // copies the reference, same object
c2.X = 10;         // c1.X == 10

struct PointStruct { public int X; }
class PointClass { public int X; }
```

## Stack and heap: a simplification worth refining

The popular claim "value types live on the stack" is inaccurate. A value type is stored **where it
is declared**:

- a local variable or parameter: usually on the stack (or in a register),
- a class field: **inside the object on the heap**,
- an `int[]` element: in the array's contiguous block on the heap,
- a local captured by a lambda or used in an `async` method or iterator: it becomes a field of a
  generated class, so it ends up on the heap.

Objects of reference types always live on the managed heap and are reclaimed by the garbage
collector. **Copy semantics** matter more than the memory location.

## Passing arguments: by value, `ref`, `out`, `in`

By default C# passes arguments **by value**. For a reference type the **reference** is copied, so a
method can change the object's state but can't swap the object for the caller:

```csharp
static void Mutate(PointClass p) => p.X = 99;                 // caller sees 99
static void Reassign(PointClass p) => p = new PointClass();   // caller sees no change
static void ReassignRef(ref PointClass p) => p = new PointClass(); // caller sees the new object
```

- `ref`: pass by reference, the variable must be initialized.
- `out`: the method must assign a value (e.g. `int.TryParse(s, out var n)`).
- `in` / `ref readonly`: pass by read-only reference, which avoids copying large structs.

## Boxing and unboxing

**Boxing** wraps a value in a heap object when a value type is used where `object` or an interface
is expected. **Unboxing** is an explicit extraction that must target **exactly the same type**.

```csharp
object o = 42;          // boxing: heap allocation
int i = (int)o;         // unboxing
long l = (long)o;       // InvalidCastException: the box holds an int, not a long

var p = new PointStruct { X = 1 };
object boxed = p;       // the box holds a COPY
p.X = 2;                // ((PointStruct)boxed).X is still 1
```

Boxing costs an allocation and GC work. It happens implicitly, e.g. with old collections
(`ArrayList`), calling an interface method on a struct through an interface-typed variable,
`string.Format` with `object` arguments, or comparing via `object.Equals`. Generics (`List<int>`)
eliminate it.

## Equality

- **Classes**: `==` and the default `Equals` compare **references** (identity) unless the type
  overrides them.
- **Structs**: the default `ValueType.Equals` compares fields (it may use reflection, so it's slow).
  The `==` operator doesn't exist until you define it.
- **`record` / `record struct`**: the compiler generates **value equality** (`Equals`, `==`,
  `GetHashCode`) and the `with` expression for creating a modified copy.
- **`string`** is a reference type with value semantics: it is immutable, and `==` compares
  contents.

```csharp
new Person("Alice") == new Person("Alice"); // True: record
object a = 1; object b = 1;
a == b;                                    // False: compares references of two boxes
a.Equals(b);                               // True

string t1 = "abc", t2 = new string("abc".ToCharArray());
t1 == t2;                                  // True: string's overloaded operator
(object)t1 == (object)t2;                  // False: different objects

record Person(string Name);
```

## Mutable struct pitfalls

Because structs are copied, a change often lands on **a copy**:

```csharp
var list = new List<PointStruct> { new() { X = 1 } };
list[0].X = 5;          // compile error CS1612: the indexer returns a copy
var item = list[0];
item.X = 99;            // list[0].X is still 1
```

Recommendation: design structs as **immutable** (`readonly struct`, `record struct` with `init`).
Choose a struct for small, short-lived values without identity (coordinates, an amount with a
currency). .NET design guidelines suggest a size of about 16 bytes or less.

## Nullable types

- `Nullable<T>` (`int?`) is a struct with `HasValue` and `Value`. Boxing an `int?` without a value
  yields `null`, and with a value it boxes the underlying value (`GetType()` returns `Int32`).
- **Nullable reference types** (`string?`, `#nullable enable`) are purely **compiler analysis**.
  At runtime `string` and `string?` are the same type, and the warnings are not a guarantee.

## Default values

`default` for a value type is the zeroed fields (`0`, `false`, a struct full of zeros), and for a
reference type it's `null`. A struct always has an "all zeros" state even if it defines a
constructor, e.g. in `new PointStruct[10]` or `default(PointStruct)`.

## Sources

- [Value types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/value-types)
- [Reference types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/reference-types)
- [Boxing and unboxing](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/types/boxing-and-unboxing)
- [Records](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)
- [Choosing between class and struct](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/choosing-between-class-and-struct)

## Questions

### What's the difference between a value type and a reference type? {junior}

A value-type variable **contains the data**, so assignment and passing to a method copy the whole
value. A reference-type variable contains a **reference** to a heap object, so the reference is
copied and both variables point to the same object. Value types are `struct`, `enum`, numeric types,
`bool`, `record struct`. Reference types are `class`, `record`, `interface`, `delegate`, arrays,
`string`.

### Are value types always stored on the stack? {mid}

No. A value type is stored where it's declared. A local variable usually lives on the stack, but a
class field is part of a heap object, an array element lives in the heap array, and a local captured
by a lambda or used in an `async` method becomes a field of a compiler-generated class. The real
difference is copy semantics, not the memory location.

### A method receives a class instance, changes one of its fields, then assigns a new object to the parameter. What does the caller see? {junior}

The caller sees the field change but not the new object. The parameter is a **copy of the
reference**: it can modify the shared object, but `p = new ...` only changes the local copy. To
replace the caller's object you need `ref`.

### What is boxing and why avoid it? {junior}

It wraps a value type in a heap object when it's treated as `object` or an interface. Every boxing
is an allocation, which means extra garbage collector work. The box holds a **copy**, so later
changes to the original don't affect it. Unboxing requires exactly the same type:
`(long)(object)42` throws `InvalidCastException`. Generics (`List<int>` instead of `ArrayList`) and
overloads that take concrete types avoid it.

### Why does `object a = 1; object b = 1; a == b` return `false`? {mid}

Both values were boxed into **separate** objects, and `==` for the static type `object` compares
references. `a.Equals(b)` returns `true` because it calls `Int32.Equals`, which compares values.

### When should you choose `struct` over `class`? {mid}

Choose `struct` for small (roughly up to 16 bytes), immutable values without identity that are
created often and live briefly, such as coordinates or an amount with a currency. This avoids heap
allocations. `class` is right for objects with identity, large or mutable objects, inheritance, and
cases where the object is passed around a lot. A large struct copied on every call can be slower
than a class.

### What do `ref`, `out` and `in` do when passing arguments? {mid}

All three pass a reference to the caller's variable instead of a copy. `ref` lets the method read and modify the variable (it must be initialized before the call). `out`
requires the method to assign it and is used to return extra values, as in `int.TryParse("42", out var n)`. `in` passes a read-only reference, which avoids copying large
structs while guaranteeing the method can't modify them. For reference types, `ref` matters only when the method assigns a new object to the parameter.

### Why doesn't `list[0].X = 5` compile for a `List<struct>`? {mid}

`List<T>`'s indexer returns a **copy** of the element. Changing a field of the copy would have no
effect, so the compiler reports error CS1612. Get the copy, change it and assign it back
(`var p = list[0]; p.X = 5; list[0] = p;`), or make the struct immutable. Arrays (`arr[0].X = 5`)
behave differently, because their indexer returns a reference to the element.

### How is `int?` different from `string?`? {mid}

`int?` is `Nullable<int>`, a genuinely different runtime type: a struct with `HasValue` and `Value`.
`string?` is a **nullable reference types** annotation used only by the compiler's static analysis.
At runtime it's still a plain `string`, and the warnings don't guarantee the absence of `null`.

### Is `string` a value type? {junior}

No, `string` is a reference type. It does behave "like a value": it's **immutable** (every "change"
creates a new object), and `==` and `Equals` compare contents. That's why concatenating in a loop
creates many objects, and `StringBuilder` is used for building large text.
