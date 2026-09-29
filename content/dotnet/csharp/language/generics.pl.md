# Typy generyczne w C# {mid}

Typy generyczne pozwalają pisać typy i metody sparametryzowane typem: `List<T>`, `Dictionary<TKey, TValue>`,
`Task<T>`. Korzyści to **bezpieczeństwo typów** sprawdzane przez kompilator, **brak boxingu** dla typów
wartościowych i jedna implementacja dla wielu typów.

```csharp
public class Repository<T> where T : class, IEntity
{
    private readonly List<T> _items = [];
    public void Add(T entity) => _items.Add(entity);
    public T? Find(int id) => _items.FirstOrDefault(x => x.Id == id);
}

static T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;
Max(3, 7);        // argument typu jest wywnioskowany: Max<int>
```

Przed typami generycznymi był `ArrayList`, który przechowywał `object`: każdy `int` był opakowywany, a odczyt
wymagał rzutowania, które mogło zawieść dopiero w czasie wykonania.

## Ograniczenia (constraints)

| Ograniczenie | Znaczenie |
|---|---|
| `where T : class` | typ referencyjny (`class?` dopuszcza nullowalne) |
| `where T : struct` | nienullowalny typ wartościowy |
| `where T : notnull` | dowolny typ nienullowalny |
| `where T : unmanaged` | typ wartościowy bez referencji (np. do `stackalloc`, wskaźników) |
| `where T : new()` | ma publiczny konstruktor bezparametrowy |
| `where T : BaseClass` / `IInterface` | dziedziczy po klasie / implementuje interfejs |
| `where T : U` | `T` jest typem `U` lub z niego dziedziczy (inny parametr typu) |
| `where T : allows ref struct` | (C# 13) `T` może być `ref struct`, np. `Span<T>` |

Ograniczenia dają dostęp do składowych (`T : IComparable<T>` pozwala wywołać `CompareTo`), a kompilator sprawdza
argumenty typu: `F<string>` przy `where T : struct` to błąd kompilacji (CS0453).

## Reifikacja i wydajność

W przeciwieństwie do Javy (wymazywanie typów) typy generyczne .NET istnieją w czasie wykonania: `typeof(List<int>)`
to osobny typ niż `List<string>`, a argument typu można sprawdzić refleksją. JIT generuje **wyspecjalizowany kod
dla każdego typu wartościowego** (`List<int>` przechowuje prawdziwe `int` bez boxingu) i **współdzieli jedną
implementację** dla wszystkich typów referencyjnych.

Każdy zamknięty typ ma **własne pola statyczne**: `Counter<int>.Count` i `Counter<string>.Count` to różne zmienne.
Wykorzystuje się to np. do cache'y per typ (`EqualityComparer<T>.Default`).

## `default(T)`

`default` daje `0` dla liczb, `null` dla typów referencyjnych i wyzerowaną strukturę dla typów wartościowych.
W generycznej metodzie bez ograniczeń `T?` nie oznacza `Nullable<T>`: dla typów wartościowych to po prostu `T`,
więc `default` zwraca `0`, a nie `null`.

## Wariancja: `out` i `in`

```csharp
IEnumerable<object> objects = new List<string>();      // ✅ kowariancja: IEnumerable<out T>
Action<string> printString = (object o) => Console.WriteLine(o);   // ✅ kontrawariancja: Action<in T>
List<object> list = new List<string>();                // 🔴 CS0029: List<T> jest inwariantna
```

- **Kowariancja (`out T`)**: `T` występuje tylko na pozycjach wyjściowych (wartości zwracane). Można użyć typu
  bardziej pochodnego tam, gdzie oczekiwany jest ogólniejszy: `IEnumerable<T>`, `IReadOnlyList<T>`,
  `Func<out TResult>`. `Task<T>` nie jest kowariantny, bo to klasa.
- **Kontrawariancja (`in T`)**: `T` występuje tylko na pozycjach wejściowych (parametry). `Action<in T>`,
  `IComparer<in T>`, `IEqualityComparer<in T>`.
- **Inwariancja**: `List<T>` ma i `Add(T)`, i indeksator zwracający `T`, więc nie może być żadnym z powyższych.
- Wariancja działa tylko dla **interfejsów i delegatów** i tylko dla **typów referencyjnych**: `IEnumerable<int>`
  nie jest `IEnumerable<object>`.
- **Tablice są kowariantne** z powodów historycznych, i to niebezpiecznie: `object[] arr = new string[1]; arr[0] = 42;`
  kompiluje się, ale rzuca `ArrayTypeMismatchException`.

## Generyczna matematyka

Od .NET 7 (C# 11) interfejsy ze statycznymi abstrakcyjnymi składowymi pozwalają napisać algorytm matematyczny raz
dla wszystkich typów liczbowych:

```csharp
static T Sum<T>(IEnumerable<T> items) where T : IAdditionOperators<T, T, T>, IAdditiveIdentity<T, T>
{
    var total = T.AdditiveIdentity;
    foreach (var item in items) total += item;
    return total;
}

Sum([1, 2, 3]);         // 6
Sum([0.1m, 0.2m]);      // 0.3
```

`INumber<T>` łączy większość tych interfejsów.

## Źródła

- [Generic type parameters (C# guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/generic-type-parameters)
- [Constraints on type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/constraints-on-type-parameters)
- [Covariance and contravariance in generics](https://learn.microsoft.com/en-us/dotnet/standard/generics/covariance-and-contravariance)
- [Generic math](https://learn.microsoft.com/en-us/dotnet/standard/generics/math)

## Pytania

### Do czego służą typy generyczne i co dają w porównaniu z `object`? {junior}

Pozwalają napisać jeden typ lub metodę dla wielu typów przy zachowaniu bezpieczeństwa typów. W porównaniu z przechowywaniem `object`
(np. `ArrayList`) dają sprawdzanie podczas kompilacji zamiast `InvalidCastException` w czasie wykonania, brak rzutowań w kodzie i brak
boxingu typów wartościowych, bo `List<int>` przechowuje `int` bezpośrednio.

### Jakie są ograniczenia typów generycznych i po co się je stosuje? {mid}

`class`, `struct`, `notnull`, `unmanaged`, `new()`, klasa bazowa, interfejs, inny parametr typu i (C# 13) `allows ref struct`. Ograniczają,
jakie typy można przekazać jako argument, a w zamian pozwalają używać ich składowych w kodzie generycznym, np. `where T : IComparable<T>`
umożliwia wywołanie `CompareTo`, a `new()` pozwala na `new T()`. Kompilator zgłasza błąd, gdy argument nie spełnia ograniczenia.

### Czym typy generyczne w .NET różnią się od tych w Javie? {mid}

W .NET są reifikowane: informacja o typie istnieje w czasie wykonania, `List<int>` i `List<string>` to osobne typy, a `typeof(T)` można
sprawdzić. Dla typów wartościowych JIT generuje wyspecjalizowany kod bez boxingu. Java stosuje wymazywanie typów: po kompilacji zostaje tylko
`List<Object>`, typy prymitywne muszą być opakowane (`Integer`), a argumentu typu nie da się sprawdzić w czasie wykonania.

### Czym jest kowariancja i kontrawariancja? {mid}

Kowariancja (`out T`) pozwala użyć typu bardziej pochodnego zamiast ogólniejszego tam, gdzie `T` jest tylko zwracany: `IEnumerable<string>`
można przypisać do `IEnumerable<object>`. Kontrawariancja (`in T`) działa odwrotnie tam, gdzie `T` jest tylko przyjmowany: `Action<object>`
można użyć jako `Action<string>`. Dotyczy to tylko generycznych interfejsów i delegatów i tylko typów referencyjnych.

### Dlaczego nie można przypisać `List<string>` do `List<object>`? {mid}

`List<T>` jest inwariantna, bo `T` występuje i na pozycjach wejściowych, i wyjściowych. Gdyby przypisanie było dozwolone, można by przez
`List<object>` wywołać `list.Add(42)` i włożyć `int` do listy stringów. Gdy wystarczy odczyt, używa się kowariantnego interfejsu:
`IEnumerable<object>` albo `IReadOnlyList<object>`.

### Dlaczego kowariancja tablic uchodzi za błąd projektowy? {senior}

`object[] arr = new string[1]` się kompiluje, więc kompilator nie może zagwarantować bezpieczeństwa zapisów: `arr[0] = 42` rzuca
`ArrayTypeMismatchException` dopiero w czasie wykonania. Żeby to wymusić, środowisko musi sprawdzać typ przy każdym zapisie do elementu
tablicy typu referencyjnego, co kosztuje wydajność. Przeniesiono to dla zgodności z Javą, a generyczne interfejsy mają zamiast tego
bezpieczną, deklarowaną wariancję.

### Czy pole statyczne w klasie generycznej jest wspólne dla `Foo<int>` i `Foo<string>`? {mid}

Nie. Każdy zamknięty typ generyczny to osobny typ z własnymi polami statycznymi, więc `Foo<int>.Count` i `Foo<string>.Count` są niezależne.
Wykorzystuje się to do cache'y per typ, np. `EqualityComparer<T>.Default` czy zapamiętany delegat dla typu, a pułapką bywa, gdy ktoś
oczekuje jednego wspólnego licznika.

### Co zwraca `default(T)` i co oznacza `T?` dla `T` bez ograniczeń? {senior}

`default(T)` zwraca `null` dla typów referencyjnych, `0` dla liczb i wyzerowaną strukturę dla pozostałych typów wartościowych. W generycznej
metodzie bez ograniczeń `T?` oznacza „`T`, być może null dla typów referencyjnych”: dla typów wartościowych to zwykłe `T`, a nie `Nullable<T>`,
więc `default` zwraca `0`, a nie `null`. Żeby dostać `Nullable<T>`, potrzebne jest ograniczenie `where T : struct`.

### Czym jest generyczna matematyka w .NET? {senior}

Od .NET 7 typy liczbowe implementują interfejsy ze statycznymi abstrakcyjnymi składowymi, jak `INumber<T>`, `IAdditionOperators<T, T, T>`
i `IAdditiveIdentity<T, T>`. Metoda generyczna z takimi ograniczeniami może używać operatorów i stałych (`T.Zero`, `+`) na `T`, więc jedna
metoda `Sum<T>` czy `Average<T>` działa dla `int`, `double`, `decimal` i własnych typów liczbowych, bez duplikowania kodu i boxingu.

### Czy JIT generuje osobny kod dla każdego argumentu typu? {senior}

Dla każdego typu wartościowego tak: `List<int>` i `List<double>` dostają wyspecjalizowany kod maszynowy, co pozwala na pełną optymalizację bez
boxingu. Dla wszystkich typów referencyjnych JIT współdzieli jedną implementację (referencje mają ten sam rozmiar), a informacja o typie
przekazywana jest ukrytym parametrem. Dlatego typy generyczne nad typami wartościowymi są szybkie, a kosztem wielu instancji jest większy
rozmiar kodu.
