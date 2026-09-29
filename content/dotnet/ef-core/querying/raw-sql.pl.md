# Surowy SQL, widoki i procedury składowane w EF Core {mid}

LINQ pokrywa większość zapytań, ale czasem potrzebny jest bezpośredni SQL: funkcje specyficzne dla bazy (funkcje okna,
wyszukiwanie pełnotekstowe, wskazówki), procedura składowana, ręcznie zoptymalizowane zapytanie albo operacja hurtowa.
EF Core na to pozwala, zachowując **parametryzację** i tam, gdzie się da, mapowanie wyników na encje.

## `FromSql`: SQL zwracający encje

```csharp
var name = "Ada";
var orders = await db.Orders
    .FromSql($"SELECT * FROM Orders WHERE CustomerName = {name}")   // {name} staje się DbParameter, nie tekstem
    .Where(o => o.Total > 8)                                        // dalszy LINQ składa się na wierzchu
    .OrderBy(o => o.Id)
    .ToListAsync();
// SELECT ... FROM ( SELECT * FROM Orders WHERE CustomerName = @p0 ) AS "o" WHERE ... ORDER BY ...
```

- `FromSql` przyjmuje `FormattableString`: interpolowane wartości zamieniają się w **parametry**, więc zapytanie jest
  odporne na SQL injection, choć wygląda jak interpolacja stringa.
- Wynik musi zawierać **wszystkie kolumny** encji o zgodnych nazwach, inaczej EF rzuca wyjątek („The required column
  'Total' was not present...”).
- Gdy SQL da się złożyć (zwykły `SELECT`), EF opakowuje go w podzapytanie i dokłada `Where`, `OrderBy`, `Include` itd.
  Wywołań procedur składowanych nie da się składać, więc kontynuuje się przez `AsEnumerable()` albo kończy `ToList()`.
- Wyniki są **śledzone** jak zwykłe wyniki zapytań, chyba że doda się `AsNoTracking()`.

## `FromSqlRaw` i SQL injection

```csharp
var evil = "x' OR '1'='1";
db.Orders.FromSqlRaw("SELECT * FROM Orders WHERE CustomerName = '" + evil + "'");   // 🔴 zwraca wszystkie wiersze
db.Orders.FromSqlRaw("SELECT * FROM Orders WHERE CustomerName = {0}", evil);        // ✅ {0} to parametr
db.Orders.FromSql($"SELECT * FROM Orders WHERE CustomerName = {evil}");            // ✅ parametr
```

W teście wersja z konkatenacją zwróciła wszystkie 3 wiersze (injection), a obie sparametryzowane 0. Analizator EF
zgłasza konkatenację w `FromSqlRaw` jako ostrzeżenie **EF1003**. `FromSqlRaw` służy do **dynamicznej struktury SQL**
(np. nazwy kolumny lub tabeli wybieranej w czasie wykonania), a takie identyfikatory trzeba sprawdzać z listą
dozwolonych, bo nie da się ich sparametryzować.

## `SqlQuery<T>`: wyniki, które nie są encjami

```csharp
var totals = await db.Database
    .SqlQuery<CustomerSum>($"SELECT CustomerName, SUM(Total) AS Total FROM Orders GROUP BY CustomerName")
    .ToListAsync();                                          // dowolna klasa, bez DbSet i konfiguracji (EF Core 8+)

var ids = await db.Database.SqlQuery<int>($"SELECT Id AS Value FROM Orders").Where(v => v > 1).ToListAsync();
```

Dla typów skalarnych kolumna musi nazywać się `Value`, jeśli chce się składać na niej LINQ. Wyniki `SqlQuery` nigdy nie
są śledzone.

## `ExecuteSql`: polecenia bez wyników

```csharp
int affected = await db.Database.ExecuteSqlAsync($"UPDATE Orders SET Total = Total + 1 WHERE CustomerName = {name}");
```

Zwraca liczbę zmienionych wierszy i omija change tracker: już wczytane encje nie zobaczą zmiany. Do typowych
aktualizacji hurtowych wygodniejsze są oparte na LINQ `ExecuteUpdate`/`ExecuteDelete` (zob. temat o zapisie).

## Widoki, encje bez klucza i funkcje

```csharp
modelBuilder.Entity<CustomerTotal>().HasNoKey().ToView("CustomerTotals");
var report = await db.CustomerTotals.OrderBy(c => c.CustomerName).ToListAsync();
```

- **Typ encji bez klucza** (`HasNoKey`) mapuje się na widok, zapytanie albo tabelę bez klucza. Można go odpytywać LINQ,
  ale nigdy nie jest śledzony i nie da się go wstawić ani zaktualizować.
- `ToSqlQuery("SELECT ...")` mapuje encję na definiujące zapytanie SQL, a `HasDbFunction` mapuje metodę C# na skalarną
  lub tabelaryczną funkcję bazodanową, której można używać w LINQ.

## Kiedy używać surowego SQL

- Funkcje specyficzne dla bazy, których EF nie tłumaczy, zapytania krytyczne wydajnościowo strojone ręcznie, raporty.
- To kompromis: SQL w stringach nie jest sprawdzany przez kompilator, nie jest przenośny między dostawcami i nie podąża
  za zmianami nazw w modelu. Wiele zespołów zostawia EF do zapisów i prostych odczytów, a do złożonych modeli odczytu
  używa surowego SQL albo Dappera.

## Źródła

- [SQL queries](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries)
- [Keyless entity types](https://learn.microsoft.com/en-us/ef/core/modeling/keyless-entity-types)
- [User-defined function mapping](https://learn.microsoft.com/en-us/ef/core/querying/user-defined-function-mapping)
- [Passing parameters and SQL injection](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries#passing-parameters)

## Pytania

### Czy `FromSql($"... {value}")` jest podatne na SQL injection? {mid}

Nie. `FromSql` (i `FromSqlInterpolated`) przyjmuje `FormattableString`, a EF zamienia każdą interpolowaną wartość w `DbParameter`, więc wartość nigdy
nie trafia do tekstu SQL. Wygląda to jak interpolacja stringa, ale nią nie jest. Niebezpieczne jest wcześniejsze samodzielne zbudowanie stringa
(`var sql = $"..."`, a potem `FromSqlRaw(sql)`), bo wtedy interpolacja dzieje się, zanim EF go zobaczy.

### Czym różni się `FromSql` od `FromSqlRaw`? {mid}

`FromSql` przyjmuje string interpolowany i automatycznie parametryzuje wartości. `FromSqlRaw` przyjmuje zwykły string z opcjonalnymi znacznikami `{0}`
albo obiektami `DbParameter`: znaczniki są parametryzowane, ale nic, co doklejono do stringa, już nie. `FromSqlRaw` jest potrzebny tylko przy dynamicznej
strukturze SQL, np. nazwie tabeli lub kolumny, a takie fragmenty trzeba sprawdzać z listą dozwolonych. Analizator EF ostrzega przed konkatenacją
(EF1003).

### Czy do zapytania `FromSql` można dołożyć operatory LINQ? {mid}

Tak, jeśli SQL da się złożyć, np. zwykły `SELECT`: EF opakowuje go w podzapytanie i dodaje `Where`, `OrderBy`, `Skip`/`Take` czy `Include` w zapytaniu
zewnętrznym. Wywołań procedur składowanych i niektórych instrukcji nie da się opakować w podzapytanie, więc po nich materializuje się wyniki
(`ToListAsync`) albo przechodzi do `AsEnumerable()`.

### Jakie wymagania musi spełnić SQL przekazany do `FromSql`? {mid}

Musi zwracać wszystkie kolumny zmapowane na encję, z nazwami zgodnymi z nazwami kolumn w modelu (inaczej zapytanie rzuci „The required column ... was
not present”), i nie może bezpośrednio zwracać danych powiązanych. Typy muszą być zgodne z mapowaniem. Jeśli potrzebny jest inny kształt, używa się
`Database.SqlQuery<T>` z DTO zamiast encji.

### Jak odczytać wyniki, które nie pasują do żadnej encji? {mid}

Od EF Core 8 przez `Database.SqlQuery<T>($"...")` z dowolną klasą, której właściwości odpowiadają kolumnom wyniku, bez rejestrowania jej w modelu.
Dla typów skalarnych, np. `SqlQuery<int>`, kolumnę nazywa się `Value`, żeby móc składać LINQ. Wyniki nie są śledzone. Wcześniejsze wersje wymagały
typu encji bez klucza zarejestrowanego w modelu.

### Czym jest typ encji bez klucza (keyless entity type)? {mid}

To encja skonfigurowana przez `HasNoKey()`, zwykle mapowana na widok (`ToView`), zapytanie SQL (`ToSqlQuery`) albo tabelę bez klucza głównego. Można ją
odpytywać LINQ jak inne encje, ale skoro nie ma klucza, nie jest śledzona, nie da się jej wstawić, zaktualizować ani usunąć przez `SaveChanges` i nie
może być stroną główną relacji. Służy do raportów i modeli odczytu.

### Jak wywołać procedurę składowaną z EF Core? {mid}

Jeśli zwraca wiersze encji: `db.Orders.FromSql($"EXEC GetOrders {customerId}").ToListAsync()` (nie da się jej złożyć, więc bez dalszego LINQ w SQL).
Jeśli zwraca inny kształt: `Database.SqlQuery<Dto>($"EXEC ...")`. Jeśli nie zwraca wierszy: `Database.ExecuteSqlAsync($"EXEC ...")`, które zwraca liczbę
zmienionych wierszy. Parametry przekazuje się przez interpolację, więc są sparametryzowane.

### Czy `ExecuteSql` aktualizuje encje już wczytane do kontekstu? {mid}

Nie. `ExecuteSql` wysyła polecenie bezpośrednio do bazy i nie dotyka change trackera, więc śledzone instancje zachowują stare wartości, a późniejszy
`SaveChanges` może nawet nadpisać zmianę. Po takim poleceniu przeładowuje się dotknięte encje (`Entry(e).ReloadAsync()`), używa nowego kontekstu albo
czyści tracker (`ChangeTracker.Clear()`).

### Jak bezpiecznie zbudować SQL z dynamiczną nazwą kolumny? {senior}

Identyfikatory nie mogą być parametrami, więc trzeba je wstawić do tekstu SQL, co wymaga `FromSqlRaw`. Nigdy nie przyjmuje się ich bezpośrednio od
użytkownika: dane wejściowe mapuje się na listę dozwolonych nazw kolumn (np. `switch` lub słownik), a wartości przekazuje jako parametry (znaczniki
`{0}`). Często prościej uniknąć surowego SQL i wybrać wyrażenie `OrderBy` w LINQ na podstawie danych wejściowych.

### Kiedy rozsądnie jest użyć surowego SQL zamiast LINQ? {mid}

Gdy potrzebne są funkcje bazy, których EF nie tłumaczy (funkcje okna, wskazówki, wyszukiwanie pełnotekstowe, `MERGE`), gdy ręcznie strojone zapytanie
jest dużo szybsze, przy raportach i złożonych modelach odczytu oraz przy procedurach składowanych. Kosztem jest brak sprawdzania przez kompilator,
związanie z dostawcą i SQL, który nie podąża za zmianami nazw w modelu. Częste podejście to EF do zapisów i typowych odczytów, a surowy SQL lub Dapper
tylko tam, gdzie wyraźnie się to opłaca.
