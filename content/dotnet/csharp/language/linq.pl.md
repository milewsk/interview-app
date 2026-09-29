# LINQ {mid}

LINQ (Language Integrated Query) to zestaw operatorów (`Where`, `Select`, `OrderBy`, `GroupBy`…)
do przetwarzania sekwencji w jednolity sposób, niezależnie od źródła: kolekcji w pamięci, bazy
danych przez EF Core czy XML.

```csharp
var adults = people
    .Where(p => p.Age >= 18)
    .OrderBy(p => p.LastName)
    .Select(p => new { p.FirstName, p.LastName });
```

Ta sama kwerenda w składni zapytań (query syntax), którą kompilator tłumaczy na te same metody:

```csharp
var adults = from p in people
             where p.Age >= 18
             orderby p.LastName
             select new { p.FirstName, p.LastName };
```

## Wykonanie odroczone (deferred execution)

Większość operatorów **nie wykonuje się w chwili zdefiniowania zapytania**. Zapytanie to przepis,
który uruchamia się dopiero przy iteracji (`foreach`, `ToList()`, `Count()`, `First()`…).

```csharp
var numbers = new List<int> { 1, 2, 3 };
var threshold = 1;
var query = numbers.Where(n => n > threshold);

threshold = 2;     // lambda przechwytuje zmienną, a nie wartość
numbers.Add(4);    // zmiana źródła też jest widoczna

Console.WriteLine(string.Join(",", query)); // 3,4
```

Konsekwencje:

- **Wielokrotne wyliczanie.** Każde `Count()`, `Sum()` czy `foreach` na tym samym zapytaniu
  wykonuje je od nowa, łącznie z efektami ubocznymi i kosztownymi operacjami. Jeśli wynik jest
  potrzebny kilka razy, zmaterializuj go (`ToList()`, `ToArray()`).
- **Wyjątki pojawiają się późno**, dopiero przy iteracji, a nie w linii z `Where`/`Select`.
- Operatory **natychmiastowe** (`ToList`, `ToArray`, `ToDictionary`, `ToLookup`, `Count`, `Sum`,
  `First`, `Any`…) wykonują zapytanie od razu.

## Strumieniowanie i buforowanie

Operatory odroczone dzielą się na:

- **strumieniujące** (`Where`, `Select`, `Take`, `Skip`): przetwarzają element po elemencie.
  `First()` po `Where` zatrzyma się na pierwszym pasującym elemencie,
- **buforujące** (`OrderBy`, `GroupBy`, `Reverse`, `Distinct` w części przypadków): muszą
  odczytać **całe** źródło, zanim zwrócą pierwszy element.

```csharp
source.Where(x => x > 2).First();            // odczyta 3 elementy
source.Where(x => x > 2).OrderBy(x => x).First(); // odczyta całe źródło
```

## `IEnumerable<T>` kontra `IQueryable<T>`

| | `IEnumerable<T>` (LINQ to Objects) | `IQueryable<T>` (np. EF Core) |
| --- | --- | --- |
| Operatory przyjmują | delegaty `Func<T, bool>` | drzewa wyrażeń `Expression<Func<T, bool>>` |
| Wykonanie | kod .NET w pamięci | provider tłumaczy wyrażenie, np. na SQL |
| Filtrowanie | po pobraniu danych | w bazie |

Pułapka: przejście na `IEnumerable` (przez `AsEnumerable()`, `ToList()` albo parametr metody typu
`IEnumerable<T>`) sprawia, że **dalsze operatory działają w pamięci**:

```csharp
// 🔴 pobiera WSZYSTKIE zamówienia, a filtruje w aplikacji
IEnumerable<Order> orders = db.Orders;
var recent = orders.Where(o => o.Date > since).ToList();

// ✅ WHERE trafia do SQL
var recent = await db.Orders.Where(o => o.Date > since).ToListAsync();
```

## Najczęściej mylone operatory

- **`First` / `FirstOrDefault` / `Single` / `SingleOrDefault`**: `First` bierze pierwszy
  i rzuca wyjątek dla pustej sekwencji. `Single` wymaga **dokładnie jednego** elementu i rzuca
  wyjątek, gdy jest ich więcej. Wersje `OrDefault` zwracają `default`, a od .NET 6 można podać
  własną wartość domyślną: `FirstOrDefault(-1)`.
- **`Any()` zamiast `Count() > 0`**: `Any` kończy na pierwszym elemencie, a `Count()` na
  zwykłym `IEnumerable` przechodzi całość.
- **`Select` a `SelectMany`**: `Select` mapuje 1:1 (z kolekcji kolekcji zostaje kolekcja
  kolekcji). `SelectMany` spłaszcza.
- **`GroupBy` a `ToLookup`**: `GroupBy` jest odroczony, a `ToLookup` natychmiastowy i daje
  słownik wielowartościowy. Dla nieistniejącego klucza `lookup[key]` zwraca pustą sekwencję.

## Nowsze operatory

- .NET 6: `Chunk`, `DistinctBy`, `MaxBy`/`MinBy`, `ExceptBy`, `IntersectBy`, `UnionBy`.
- .NET 9: `CountBy`, `AggregateBy`, `Index`.
- .NET 10: `LeftJoin` i `RightJoin`, obsługiwane też przez EF Core 10 (tłumaczone na
  `LEFT/RIGHT JOIN`).

```csharp
var words = new[] { "apple", "avocado", "banana", "blueberry", "cherry" };
words.CountBy(w => w[0]);                 // a=2, b=2, c=1
words.AggregateBy(w => w[0], 0, (sum, w) => sum + w.Length); // a=12, b=15, c=6
foreach (var (i, w) in words.Index()) { } // (0, "apple"), (1, "avocado")…

people.LeftJoin(departments,
    p => p.DeptId, d => d.Id,
    (p, d) => $"{p.Name} - {d?.Name ?? "[brak]"}");
```

## Własny operator: `yield return`

Operatory LINQ to zwykłe metody rozszerzające na `IEnumerable<T>`. Iterator z `yield return`
jest automatycznie odroczony i strumieniujący:

```csharp
public static IEnumerable<T> WhereNot<T>(this IEnumerable<T> source, Func<T, bool> predicate)
{
    foreach (var item in source)
        if (!predicate(item))
            yield return item;
}
```

## Źródła

- [Language Integrated Query (LINQ)](https://learn.microsoft.com/en-us/dotnet/csharp/linq/)
- [Deferred execution and lazy evaluation](https://learn.microsoft.com/en-us/dotnet/standard/linq/deferred-execution-lazy-evaluation)
- [Introduction to LINQ queries (deferred and immediate execution)](https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries)
- [Standard query operators overview](https://learn.microsoft.com/en-us/dotnet/csharp/linq/standard-query-operators/)
- [What's new in EF Core 10: LeftJoin and RightJoin](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/whatsnew)

## Pytania

### Czym jest wykonanie odroczone w LINQ? {junior}

Zapytanie złożone z operatorów takich jak `Where` czy `Select` to tylko opis. Wykonuje się dopiero
przy iteracji (`foreach`, `ToList()`, `Count()`…). Dlatego wynik uwzględnia zmiany źródła i wartości
zmiennych przechwyconych w lambdach, dokonane po zdefiniowaniu zapytania. Wyjątki również pojawiają
się dopiero przy iteracji.

### Co wypisze kod, w którym po zdefiniowaniu `numbers.Where(n => n > threshold)` zmieniamy `threshold` z 1 na 2 i dodajemy do listy 4? {mid}

Dla listy `1, 2, 3` wynik to `3, 4`. Zapytanie wykonuje się dopiero przy iteracji, lambda
przechwytuje **zmienną** `threshold` (w tym momencie równą 2), a lista zawiera już element 4.

### Dlaczego wielokrotne wyliczanie `IEnumerable` bywa problemem? {mid}

Każda iteracja wykonuje całe zapytanie od nowa: ponownie wywołuje lambdy (z efektami ubocznymi),
ponownie czyta plik i, w przypadku `IQueryable`, ponownie wysyła zapytanie do bazy. Jeśli wynik jest
potrzebny kilka razy, należy go raz zmaterializować (`ToList()`, `ToArray()`). Analizatory i ReSharper
ostrzegają przed „possible multiple enumeration”.

### Czym różni się `IEnumerable<T>` od `IQueryable<T>`? {mid}

Operatory na `IEnumerable<T>` przyjmują delegaty i wykonują się w pamięci. Operatory na `IQueryable<T>`
przyjmują drzewa wyrażeń, które provider (np. EF Core) tłumaczy na inny język, np. SQL, i wykonuje po
stronie źródła. Rzutowanie `IQueryable` na `IEnumerable` (np. `AsEnumerable()` albo parametr metody)
przenosi dalsze filtrowanie do pamięci, co może oznaczać pobranie całej tabeli.

### Czym różnią się `First`, `FirstOrDefault`, `Single` i `SingleOrDefault`? {junior}

`First` zwraca pierwszy element i rzuca `InvalidOperationException` dla pustej sekwencji. `Single`
zwraca jedyny element i rzuca wyjątek, gdy elementów jest zero albo więcej niż jeden, więc służy do
wymuszenia unikalności. Wersje `OrDefault` zamiast wyjątku dla pustej sekwencji zwracają `default`
(lub podaną wartość), ale `SingleOrDefault` nadal rzuca wyjątek przy wielu elementach. W bazie
`Single` generuje `TOP(2)` (SQL Server) lub `LIMIT 2` (SQLite, PostgreSQL), żeby wykryć duplikat.

### Dlaczego `Any()` jest lepsze niż `Count() > 0`? {junior}

`Any()` kończy działanie na pierwszym znalezionym elemencie. `Count()` na zwykłym `IEnumerable` musi
przejść całą sekwencję. Dla kolekcji implementujących `ICollection<T>` `Count()` jest szybkie, ale
`Any()` wyraża intencję czytelniej. W EF Core `Any()` tłumaczy się na `EXISTS`, które baza może
przerwać wcześniej.

### Czym różni się `Select` od `SelectMany`? {junior}

`Select` mapuje każdy element na dokładnie jeden wynik, więc z listy list powstaje lista list.
`SelectMany` mapuje każdy element na sekwencję i **spłaszcza** wyniki do jednej sekwencji, np.
wszystkie zamówienia wszystkich klientów: `customers.SelectMany(c => c.Orders)`.

### Które operatory LINQ wykonują się natychmiast, a które są odroczone? {mid}

Natychmiast wykonują się operatory zwracające pojedynczą wartość lub zmaterializowaną kolekcję:
`ToList`, `ToArray`, `ToDictionary`, `ToLookup`, `Count`, `Sum`, `Max`, `First`, `Single`, `Any`,
`All`. Odroczone są te zwracające `IEnumerable<T>`/`IQueryable<T>`: `Where`, `Select`, `OrderBy`,
`GroupBy`, `Skip`, `Take`, `Join`. Wśród odroczonych część strumieniuje (`Where`, `Select`), a część
buforuje całe źródło przy pierwszym odczycie (`OrderBy`, `GroupBy`).

### Jak napisać własny operator LINQ? {mid}

Jako metodę rozszerzającą na `IEnumerable<T>` z iteratorem `yield return`. Taki iterator jest
automatycznie odroczony i strumieniujący. Walidację argumentów warto wydzielić do metody
nie-iteratorowej, bo w iteratorze wyjątek pojawiłby się dopiero przy pierwszej iteracji, a nie przy
wywołaniu.

### Jak w LINQ zrobić left join? {mid}

Od .NET 10 służy do tego operator `LeftJoin(inner, outerKey, innerKey, resultSelector)`, w którym
brakujący element po prawej stronie ma wartość `null`. EF Core 10 tłumaczy go na `LEFT JOIN`.
Wcześniej stosowano kombinację `GroupJoin` + `SelectMany` + `DefaultIfEmpty()`. Składnia zapytań
(`from … join …`) nie ma jeszcze dedykowanej formy left join.
