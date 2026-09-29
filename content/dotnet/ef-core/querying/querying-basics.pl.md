# Zapytania: tłumaczenie LINQ, IQueryable i paginacja {mid}

EF Core tłumaczy zapytania LINQ na `DbSet<T>` na SQL. Wiedza o tym, **co zostanie przetłumaczone, kiedy zapytanie się
wykona i gdzie odbywa się filtrowanie** (w bazie czy w pamięci aplikacji), to podstawa wydajnego dostępu do danych
i częste źródło pytań na rozmowach.

## `IQueryable` a `IEnumerable`

```csharp
IQueryable<Order> query = db.Orders.Where(o => o.Total > 400);   // drzewo wyrażeń, jeszcze bez SQL
var list = await query.ToListAsync();                             // SQL: ... WHERE [o].[Total] > 400.0

var bad = db.Orders.AsEnumerable().Where(o => o.Total > 400).ToList();   // 🔴 SELECT wszystkich wierszy, filtr w pamięci
```

- `IQueryable<T>` buduje **drzewo wyrażeń**, które dostawca tłumaczy na SQL. Każdy operator dodany przed wykonaniem
  (`Where`, `OrderBy`, `Select`, `Skip`, `Take`) staje się częścią SQL.
- Po `AsEnumerable()`, `ToList()` albo gdy metoda przyjmuje parametr `IEnumerable<T>`, kolejne operatory działają
  **w pamięci** na już wczytanych wierszach. W teście `AsEnumerable().Where(...)` wysłało SQL bez `WHERE` i pobrało
  wszystkie 50 wierszy, żeby odfiltrować 10.
- Metoda repozytorium zwracająca `IEnumerable<T>` zbudowane z `DbSet` ukrywa tę pułapkę: wywołujący myślą, że filtrują
  w bazie.

## Wykonanie odroczone

Zdefiniowanie zapytania go nie uruchamia. SQL wykonuje się przy **iterowaniu** po wynikach: `ToList/ToListAsync`,
`ToArray`, `First`, `Single`, `Count`, `Any`, `Sum`, `foreach`. Dwukrotne przejście po tym samym `IQueryable` uruchamia
**dwa** zapytania (w teście `Count()` i `ToList()` dały 2 wywołania bazy). W aplikacjach webowych używa się wersji
asynchronicznych (`ToListAsync`, `FirstOrDefaultAsync`), żeby wątki nie były blokowane na I/O.

## Tłumaczenie i ewaluacja po stronie klienta

```csharp
db.Orders.Where(o => Helpers.IsBig(o.Total)).ToList();
// InvalidOperationException: The LINQ expression '...Where(o => Helpers.IsBig(o.Total))' could not be translated.

db.Orders.Select(o => new { o.Id, Big = Helpers.IsBig(o.Total) }).ToList();   // ✅ dozwolone: obliczane po stronie klienta w końcowej projekcji
```

- EF tłumaczy znane operatory i wiele metod .NET: `string.Contains/StartsWith` → `LIKE`, `ToLower/ToUpper` →
  `LOWER/UPPER`, `Math.*`, części dat, `EF.Functions.Like`, `EF.Functions.DateDiffDay` i inne.
- Od EF Core 3.0 **nieprzetłumaczalne** wyrażenie w `Where`, `OrderBy` czy złączeniach rzuca wyjątek, zamiast po cichu
  pobierać całą tabelę. Tylko **końcowy `Select`** może zawierać kod wykonywany po stronie klienta.
- Rozwiązaniem jest zapisanie warunku w przetłumaczalnej formie, zmapowanie funkcji na SQL (`HasDbFunction`) albo
  świadome przejście do przetwarzania w pamięci (`AsEnumerable()`) po zawężeniu danych w bazie.

## Wybrane tłumaczenia

| LINQ | SQL (SQL Server) |
|---|---|
| `First()` / `FirstOrDefault()` | `TOP(1)` |
| `Single()` / `SingleOrDefault()` | `TOP(2)`, żeby wykryć więcej niż jeden wiersz |
| `Any(...)` | `EXISTS (SELECT 1 ...)` |
| `Skip(20).Take(10)` | `OFFSET @p ROWS FETCH NEXT @p1 ROWS ONLY` |
| `GroupBy(...).Select(g => new { g.Key, Count = g.Count() })` | `GROUP BY` z `COUNT(*)` |
| `Contains(term)` na stringu | `LIKE @term_contains ESCAPE N'\'` (znaki specjalne escapowane) |
| `o.Note == note` dla kolumn nullowalnych | semantyka C#: `IS NULL` dla `null`, `<> ... OR ... IS NULL` dla `!=` |

- `Single` rzuca wyjątek, gdy wierszy jest więcej niż jeden („Sequence contains more than one element”), a `First`
  zwraca pierwszy, więc `First` bez `OrderBy` daje przypadkowy wiersz.
- EF zachowuje **semantykę null z C#**: porównanie z kolumną nullowalną dodaje sprawdzenia `IS NULL`, więc wyniki są
  takie, jakie dałoby to samo wyrażenie w pamięci.
- Przechwycone zmienne stają się **parametrami**, więc baza może ponownie użyć planu zapytania, a literały w zapytaniu
  są wstawiane jako stałe.

## Paginacja

```csharp
// offset: prosta, ale zwalnia na dalekich stronach (baza i tak czyta pominięte wiersze)
var page = await db.Orders.OrderBy(o => o.Id).Skip((pageNo - 1) * size).Take(size).ToListAsync();

// keyset (seek): szybka na każdej stronie, stabilna przy wstawianiu wierszy
var next = await db.Orders.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(size).ToListAsync();
```

Paginacja zawsze wymaga **deterministycznego `OrderBy`** (najlepiej kończącego się unikalną kolumną), inaczej strony
mogą się nakładać albo gubić wiersze. Paginacja offsetowa sprawdza się przy małych tabelach i UI z numerami stron,
a keyset przy nieskończonym przewijaniu, API i dużych tabelach.

## Źródła

- [How queries work](https://learn.microsoft.com/en-us/ef/core/querying/how-query-works)
- [Client vs. server evaluation](https://learn.microsoft.com/en-us/ef/core/querying/client-eval)
- [Pagination](https://learn.microsoft.com/en-us/ef/core/querying/pagination)
- [Complex query operators](https://learn.microsoft.com/en-us/ef/core/querying/complex-query-operators)
- [Comparisons with null values](https://learn.microsoft.com/en-us/ef/core/querying/null-comparisons)

## Pytania

### Czym różni się `IQueryable<T>` od `IEnumerable<T>` w EF Core? {junior}

`IQueryable<T>` reprezentuje zapytanie jako drzewo wyrażeń, które dostawca tłumaczy na SQL, więc filtrowanie, sortowanie i paginacja odbywają się
w bazie. `IEnumerable<T>` działa na obiektach w pamięci: po `AsEnumerable()` czy `ToList()` kolejne `Where` filtrują już pobrane dane. Zbyt wczesne
potraktowanie `DbSet` jako `IEnumerable` pobiera całą tabelę i filtruje ją w aplikacji.

### Kiedy zapytanie EF Core faktycznie się wykonuje? {junior}

Gdy iteruje się po wynikach: `ToList`/`ToListAsync`, `ToArray`, `First`, `Single`, `Count`, `Any`, agregaty albo `foreach`. Samo zbudowanie zapytania
przez `Where` i `OrderBy` nie dotyka bazy (wykonanie odroczone). Każda iteracja po tym samym `IQueryable` uruchamia nowe zapytanie, więc wyniki używane
kilka razy materializuje się raz.

### Co oznacza błąd „could not be translated”? {mid}

EF nie potrafił przetłumaczyć części zapytania na SQL, np. wywołania własnej metody C# w `Where`. Od EF Core 3.0 rzuca wyjątek zamiast po cichu obliczać
po stronie klienta, co kiedyś pobierało całe tabele. Naprawia się to, zapisując warunek przetłumaczalnymi operacjami, mapując funkcję bazodanową
(`HasDbFunction`) albo, jeśli danych jest mało, zawężając je najpierw w SQL i kontynuując w pamięci po `AsEnumerable()`.

### Gdzie ewaluacja po stronie klienta jest nadal dozwolona? {mid}

W końcowej projekcji (najwyższym `Select`): EF wykonuje przetłumaczalną część w SQL, a resztę (np. formatowanie metodą C#) na wczytanych wierszach. To
bezpieczne, bo nie zmienia, które wiersze są pobierane. Kod klienta w `Where`, `OrderBy`, `GroupBy` czy złączeniach wymagałby pobrania wszystkich
danych, więc EF go odrzuca.

### Czym różnią się `First`, `Single` i ich warianty `OrDefault`? {junior}

`First` zwraca pierwszy pasujący wiersz i rzuca wyjątek, gdy go nie ma, a `FirstOrDefault` zwraca `null`/wartość domyślną. `Single` dodatkowo sprawdza,
że pasuje dokładnie jeden wiersz, i rzuca „Sequence contains more than one element”, gdy jest ich więcej, dlatego generuje `TOP(2)`. `Single` służy do
zapytań po unikalnym kluczu, a `First` łączy się z `OrderBy`, bo bez niego „pierwszy” wiersz jest przypadkowy.

### Dlaczego `Any()` jest lepsze niż `Count() > 0`? {junior}

`Any()` tłumaczy się na `EXISTS`, co pozwala bazie zatrzymać się na pierwszym pasującym wierszu. `Count() > 0` musi najpierw policzyć wszystkie pasujące
wiersze. Przy dużych tabelach i mało selektywnych warunkach różnica bywa znacząca, a `Any()` lepiej wyraża intencję.

### Czym różni się paginacja offsetowa od keyset? {mid}

Paginacja offsetowa (`Skip`/`Take` → `OFFSET ... FETCH`) jest prosta i pozwala skoczyć na dowolny numer strony, ale baza musi przeczytać i odrzucić
wszystkie pominięte wiersze, więc dalekie strony są wolne, a wstawienia między żądaniami przesuwają wyniki. Paginacja keyset filtruje po ostatnio
widzianym kluczu (`WHERE Id > @lastId ORDER BY Id`), korzysta bezpośrednio z indeksu i jest szybka oraz stabilna na każdej stronie, ale pozwala tylko na
nawigację „następna/poprzednia”.

### Dlaczego zapytania z paginacją muszą mieć `OrderBy`? {junior}

Bez jawnego sortowania baza zwraca wiersze w nieokreślonej kolejności, która może się różnić między wykonaniami. Wtedy `Skip`/`Take` może zwracać
duplikaty albo gubić wiersze między stronami. Sortowanie powinno być deterministyczne, więc kończy się unikalną kolumną (np.
`OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)`). EF ostrzega też, gdy `Skip`/`Take` jest użyte bez `OrderBy`.

### Jak EF Core obsługuje porównania z `null`? {mid}

Zachowuje semantykę C#, choć w SQL `NULL = NULL` daje wynik nieokreślony. `o.Note == null` staje się `IS NULL`, `o.Note != "x"` staje się
`[Note] <> N'x' OR [Note] IS NULL`, a porównanie ze zmienną, która może być `null`, dodaje odpowiednie sprawdzenia. Dzięki temu zapytanie zwraca te
same wiersze co to samo wyrażenie LINQ wykonane na obiektach w pamięci, kosztem nieco bardziej złożonego SQL.

### Dlaczego ma znaczenie, czy wartość w zapytaniu jest zmienną, czy stałą? {senior}

Przechwycona zmienna staje się parametrem SQL (`@lastId`), więc tekst zapytania pozostaje ten sam dla różnych wartości, a zarówno cache zapytań EF, jak
i cache planów wykonania bazy mogą go ponownie użyć. Stała (literał w kodzie) jest wstawiana do SQL. Dynamiczne budowanie zapytań ze stałymi, np. przez
API wyrażeń, daje inny tekst SQL dla każdej wartości, co zaśmieca cache i wymusza ponowną kompilację.
