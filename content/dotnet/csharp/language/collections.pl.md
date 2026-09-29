# Kolekcje w .NET {mid}

Wybór kolekcji zależy od operacji, które będą najczęstsze: dostęp po indeksie, wyszukiwanie po kluczu, unikalność,
kolejność, dostęp współbieżny. Rozmowy sprawdzają złożoność podstawowych operacji, hierarchię interfejsów i typowe
pułapki.

## Najważniejsze kolekcje

| Kolekcja | Struktura | Kluczowe operacje |
|---|---|---|
| `T[]` | ciągła tablica, stały rozmiar | indeks O(1) |
| `List<T>` | tablica dynamiczna | indeks O(1), `Add` zamortyzowane O(1), `Insert`/`Remove` O(n), `Contains` O(n) |
| `Dictionary<TKey, TValue>` | tablica haszująca | wyszukiwanie/wstawianie/usuwanie średnio O(1) |
| `HashSet<T>` | tablica haszująca bez wartości | `Add`/`Contains`/`Remove` O(1), operacje na zbiorach |
| `SortedDictionary<TKey, TValue>` | drzewo czerwono-czarne | O(log n), klucze w kolejności |
| `SortedList<TKey, TValue>` | dwie posortowane tablice | wyszukiwanie O(log n), wstawianie O(n), mniej pamięci |
| `Queue<T>` / `Stack<T>` | bufor cykliczny / tablica | FIFO / LIFO w O(1) |
| `PriorityQueue<TElement, TPriority>` | kopiec binarny | `Enqueue`/`Dequeue` O(log n), najpierw najniższy priorytet |
| `LinkedList<T>` | lista dwukierunkowa | wstawianie/usuwanie przy znanym węźle O(1), brak indeksu |

`List<T>` podwaja **pojemność** (capacity), gdy zabraknie miejsca (4, 8, 16, 32…), kopiując elementy do nowej
tablicy. Jeśli rozmiar jest znany, podaje się go w konstruktorze (`new List<int>(1000)`), żeby uniknąć powiększania.

## Hierarchia interfejsów

```
IEnumerable<T>              — da się iterować (foreach, LINQ)
├── IReadOnlyCollection<T>  — + Count
│   └── IReadOnlyList<T>    — + indeksator tylko do odczytu
└── ICollection<T>          — + Add, Remove, Clear, Contains
    └── IList<T>            — + indeksator, Insert, RemoveAt
```

Zasada: **przyjmuj najogólniejszy typ**, którego potrzebujesz (`IEnumerable<T>`, jeśli tylko iterujesz), a **zwracaj
konkretny lub tylko do odczytu** (`IReadOnlyList<T>`, `List<T>`). Parametr `IEnumerable<T>` może być leniwym
zapytaniem LINQ, które wykona się od nowa przy każdej iteracji.

## Tylko do odczytu, niemutowalne i zamrożone

- **`IReadOnlyList<T>`** to tylko widok przez interfejs: wywołujący może rzutować z powrotem na `List<T>`, a właściciel
  nadal może zmieniać dane.
- **`ReadOnlyCollection<T>`** (`list.AsReadOnly()`) to opakowanie blokujące modyfikacje przez siebie, ale zmiany
  w liście źródłowej są widoczne.
- **`ImmutableList<T>`, `ImmutableDictionary<TKey, TValue>`** (`System.Collections.Immutable`): każda „zmiana” zwraca
  nową kolekcję, a oryginał pozostaje bez zmian. Są bezpieczne wątkowo przy odczycie i dobre do współdzielonego stanu,
  ale wolniejsze od zwykłych kolekcji.
- **`FrozenDictionary<TKey, TValue>` / `FrozenSet<T>`** (.NET 8+): tworzone raz (`ToFrozenDictionary()`)
  i zoptymalizowane pod bardzo szybki odczyt. Idealne do konfiguracji i tablic przeglądowych budowanych przy starcie.

## Pułapki

```csharp
foreach (var item in list)
    if (item.IsExpired) list.Remove(item);     // 🔴 InvalidOperationException: kolekcja została zmodyfikowana

list.RemoveAll(item => item.IsExpired);         // ✅
```

- **Modyfikacja kolekcji podczas `foreach`** rzuca `InvalidOperationException`. Używa się `RemoveAll`, pętli `for`
  od końca albo iteracji po kopii.
- **Dictionary**: indeksator rzuca `KeyNotFoundException` dla brakującego klucza, więc używa się `TryGetValue` lub
  `GetValueOrDefault`. `Add` rzuca dla istniejącego klucza, a `dict[key] = value` go nadpisuje.
- **Mutowalność kluczy**: jeśli `GetHashCode` obiektu zależy od pola, które zmieni się po dodaniu do `HashSet` lub
  użyciu jako klucza `Dictionary`, kolekcja przestanie go znajdować. Klucze powinny być niemutowalne.
- **Porównywarki**: `new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)` daje klucze bez rozróżniania
  wielkości liter.
- **Kolejność iteracji** `Dictionary` i `HashSet` nie jest gwarantowana. Gdy kolejność ma znaczenie, używa się
  `SortedDictionary` albo sortowania.

## Kolekcje współbieżne

Zwykłe kolekcje nie są bezpieczne wątkowo przy zapisach. `System.Collections.Concurrent` dostarcza
`ConcurrentDictionary`, `ConcurrentQueue`, `ConcurrentStack`, `ConcurrentBag` i `BlockingCollection`.
W `ConcurrentDictionary.GetOrAdd(key, factory)` **fabryka może wykonać się więcej niż raz** dla tego samego klucza
przy dostępie współbieżnym (zapisany zostanie tylko jeden wynik), więc nie powinna mieć efektów ubocznych. Jeśli musi
wykonać się dokładnie raz, przechowuje się `Lazy<T>`.

## Wyrażenia kolekcji (C# 12)

```csharp
int[] numbers = [1, 2, 3];
List<int> more = [.. numbers, 4, 5];     // spread
ReadOnlySpan<char> vowels = ['a', 'e', 'i'];
```

Jedna składnia działa dla tablic, list, spanów i kolekcji niemutowalnych, a kompilator wybiera wydajny sposób ich
budowania.

## Źródła

- [Collections (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/collections)
- [Selecting a collection class](https://learn.microsoft.com/en-us/dotnet/standard/collections/selecting-a-collection-class)
- [Thread-safe collections](https://learn.microsoft.com/en-us/dotnet/standard/collections/thread-safe/)
- [System.Collections.Frozen namespace](https://learn.microsoft.com/en-us/dotnet/api/system.collections.frozen)
- [Collection expressions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/collection-expressions)

## Pytania

### Czym różni się `List<T>` od tablicy? {junior}

Tablica ma stały rozmiar ustalony przy tworzeniu, a `List<T>` rośnie dynamicznie: pod spodem ma tablicę, którą zastępuje dwa razy większą, gdy
zabraknie pojemności. Oba dają dostęp po indeksie w O(1). Tablice pasują do danych o znanym rozmiarze i kodu krytycznego wydajnościowo, a
`List<T>` do kolekcji, które rosną lub maleją.

### Jaka jest złożoność wyszukiwania w `List<T>` i w `Dictionary<TKey, TValue>`? {junior}

`List<T>.Contains` i `IndexOf` przeglądają elementy, więc to O(n). Wyszukiwanie po kluczu w `Dictionary` używa tablicy haszującej, więc to
średnio O(1) (O(n) w najgorszym przypadku, przy wielu kolizjach). Dlatego gdy często szuka się po kluczu albo sprawdza przynależność,
`Dictionary` lub `HashSet` są dużo szybsze od listy.

### Czym różni się `IEnumerable<T>` od `IList<T>` i co powinna przyjmować metoda? {mid}

`IEnumerable<T>` pozwala tylko iterować, a `IList<T>` dodaje `Count`, indeksator i modyfikację. Metoda powinna przyjmować najogólniejszy typ,
którego potrzebuje: `IEnumerable<T>`, jeśli tylko iteruje, a `IReadOnlyList<T>`, jeśli potrzebuje `Count` lub dostępu po indeksie. Trzeba
pamiętać, że `IEnumerable<T>` może być leniwym zapytaniem, które wykona się od nowa przy każdej iteracji, więc przy wielokrotnym przejściu
materializuje się je (`ToList()`).

### Dlaczego usuwanie elementów z listy wewnątrz `foreach` rzuca wyjątek? {junior}

Enumerator sprawdza wersję kolekcji przy każdym kroku, a każda modyfikacja sprawia, że rzuca `InvalidOperationException` („Collection was
modified”), bo dalsza iteracja dałaby nieprzewidywalne wyniki. Rozwiązania: `list.RemoveAll(predykat)`, pętla `for` od końca albo iteracja po
kopii (`foreach (var x in list.ToList())`).

### Co się stanie, gdy obiekt użyty jako klucz `Dictionary` się zmieni? {mid}

Jeśli zmiana wpływa na `GetHashCode` lub `Equals`, słownik szuka obiektu w innym kubełku i go nie znajduje: `ContainsKey` zwraca `false`, choć
wpis nadal tam jest. Dlatego klucze powinny być niemutowalne (np. `string`, `int`, rekordy z właściwościami init-only), a hash powinien
zależeć tylko od pól, które się nie zmieniają.

### Czym różni się `IReadOnlyList<T>` od `ImmutableList<T>`? {mid}

`IReadOnlyList<T>` to tylko interfejs ukrywający metody modyfikujące: wywołujący może rzutować z powrotem na `List<T>`, a właściciel nadal może
zmieniać dane, co czytający zobaczy. `ImmutableList<T>` naprawdę nie może się zmienić: metody „modyfikujące” zwracają nową kolekcję, a oryginał
pozostaje taki sam, więc bezpiecznie współdzieli się ją między wątkami i komponentami.

### Kiedy użyć `FrozenDictionary`? {mid}

Gdy słownik jest budowany raz (np. przy starcie z konfiguracji), a potem tylko wielokrotnie odczytywany. `ToFrozenDictionary()` poświęca więcej
czasu na utworzenie, żeby przeanalizować klucze i wybrać zoptymalizowaną strukturę, a wyszukiwania są szybsze niż w zwykłym `Dictionary`. Nie
da się go modyfikować, więc nie pasuje do danych, które się zmieniają.

### Czy `Dictionary<TKey, TValue>` jest bezpieczny wątkowo? {mid}

Tylko przy równoczesnych odczytach bez żadnych zapisów. Równoczesne zapisy (lub odczyt w trakcie zapisu) mogą uszkodzić jego stan wewnętrzny.
Do współdzielonych, modyfikowanych słowników używa się `ConcurrentDictionary`, `lock` albo kolekcji niemutowalnej/zamrożonej podmienianej
atomowo. `ConcurrentDictionary` daje atomowe operacje, jak `GetOrAdd`, `AddOrUpdate` i `TryRemove`.

### Czy fabryka w `ConcurrentDictionary.GetOrAdd` może wykonać się więcej niż raz? {senior}

Tak. Fabryka wykonuje się poza blokadą, więc przy dostępie współbieżnym kilka wątków może wywołać ją dla tego samego klucza, a zapisany zostanie
tylko jeden wynik. Dlatego nie powinna mieć efektów ubocznych ani być kosztowna. Jeśli musi wykonać się dokładnie raz, przechowuje się wartości
`Lazy<T>`: `dict.GetOrAdd(key, k => new Lazy<T>(() => Create(k))).Value`.

### Do czego służy `PriorityQueue<TElement, TPriority>`? {mid}

To kopiec minimalny: `Dequeue` zawsze zwraca element o najniższym priorytecie, a `Enqueue` i `Dequeue` zajmują O(log n). Używa się go
w szeregowaniu zadań, algorytmie Dijkstry, scalaniu posortowanych strumieni i problemach „top N”. Nie gwarantuje kolejności elementów o równym
priorytecie i nie obsługuje zmiany priorytetu elementu.
