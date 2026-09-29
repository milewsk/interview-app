# Współbieżność i transakcje w EF Core {mid}

Dwa powiązane problemy: jak zapisać kilka zmian **atomowo** (transakcje) i jak nie nadpisać
cudzych zmian, gdy dwie osoby edytują te same dane (**kontrola współbieżności**).

## Transakcje

**`SaveChanges` jest atomowe.** Wszystkie zmiany z jednego wywołania trafiają do bazy w transakcji:
albo zapisze się wszystko, albo nic. W większości przypadków to wystarcza.

Jawna transakcja jest potrzebna, gdy **kilka operacji** musi stanowić całość: wiele wywołań
`SaveChanges`, `ExecuteUpdate`/`ExecuteDelete`, surowy SQL czy zapytania, które mają widzieć
spójny stan.

```csharp
await using var tx = await db.Database.BeginTransactionAsync();

db.Orders.Add(order);
await db.SaveChangesAsync();

await db.Products
    .Where(p => p.Id == order.ProductId)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - order.Quantity));

await tx.CommitAsync(); // bez Commit transakcja zostanie wycofana przy Dispose
```

- **Savepointy.** Gdy `SaveChanges` działa wewnątrz istniejącej transakcji, EF automatycznie tworzy
  savepoint i w razie błędu cofa się do niego, więc transakcja pozostaje używalna. Można je też
  tworzyć ręcznie: `CreateSavepointAsync("x")` / `RollbackToSavepointAsync("x")`. W SQL Server nie
  działają przy włączonym MARS.
- **Poziom izolacji:** `BeginTransactionAsync(IsolationLevel.Serializable)`.
- **Współdzielenie transakcji** między kontekstami lub z ADO.NET/Dapperem: wspólne `DbConnection`
  i `Database.UseTransaction(...)`.
- `TransactionScope` (transakcja „otoczenia”) w kodzie async wymaga
  `TransactionScopeAsyncFlowOption.Enabled`.

### Transakcje a ponawianie (execution strategy)

Przy `EnableRetryOnFailure` (typowe dla Azure SQL) każda operacja EF jest ponawiana osobno. Własna
transakcja łączy kilka operacji, więc EF nie może powtórzyć tylko jednej i rzuca
`InvalidOperationException`. Rozwiązanie: wykonać **całą** transakcję jako jedną ponawialną jednostkę.

```csharp
var strategy = db.Database.CreateExecutionStrategy();
await strategy.ExecuteAsync(async () =>
{
    await using var tx = await db.Database.BeginTransactionAsync();
    // ... operacje ...
    await tx.CommitAsync();
});
```

Jeśli połączenie zerwie się **w trakcie commitu**, wynik jest nieznany. Ponowienie może zdublować
dane, dlatego operacje warto projektować jako idempotentne (np. klucze GUID generowane po stronie
klienta) albo weryfikować wynik przez `ExecuteInTransactionAsync(..., verifySucceeded: ...)`.

## Poziomy izolacji w pigułce

| Poziom | Dirty read | Non-repeatable read | Phantom read |
| --- | --- | --- | --- |
| Read uncommitted | możliwy | możliwy | możliwy |
| Read committed | nie | możliwy | możliwy |
| Repeatable read | nie | nie | możliwy |
| Serializable | nie | nie | nie |
| Snapshot (SQL Server) | nie | nie | nie, ale możliwe konflikty zapisu |

Domyślnie SQL Server i PostgreSQL używają **Read committed**. W SQL Server włączenie
`READ_COMMITTED_SNAPSHOT` (domyślnie włączone w Azure SQL Database) sprawia, że odczyty korzystają
z wersjonowania wierszy zamiast blokad. Wyższa izolacja to mniej anomalii, ale więcej blokad
i deadlocków.

## Problem: utracona aktualizacja (lost update)

1. Ala i Olek otwierają ten sam produkt (cena 100).
2. Ala zmienia cenę na 90 i zapisuje.
3. Olek zmienia stan magazynowy i zapisuje obiekt, w którym nadal jest cena 100.
4. Zmiana Ali znika bez śladu.

## Optymistyczna współbieżność (domyślne podejście w EF)

Zakładamy, że konflikty są rzadkie. Nie blokujemy danych, tylko **wykrywamy konflikt przy zapisie**.
EF dodaje do `UPDATE`/`DELETE` warunek na **token współbieżności**. Jeśli nikt nie zmienił wiersza,
aktualizacja trafi w 1 wiersz. Jeśli trafi w 0, EF rzuca `DbUpdateConcurrencyException`.

```sql
UPDATE "Products" SET "Price" = @p0, "Version" = @p1
WHERE "Id" = @p2 AND "Version" = @p3
```

Konfiguracja tokenu:

```csharp
// SQL Server: rowversion, zmieniany automatycznie przez bazę przy każdym UPDATE
public class Product
{
    public int Id { get; set; }
    [Timestamp] public byte[] Version { get; set; } = null!; // albo .IsRowVersion()
}

// Dowolna baza: token zarządzany przez aplikację
public class Product
{
    public int Id { get; set; }
    [ConcurrencyCheck] public Guid Version { get; set; } // albo .IsConcurrencyToken()
    // Version = Guid.NewGuid() przy każdej zmianie (np. w override SaveChanges)
}
```

### Rozwiązywanie konfliktu

```csharp
try
{
    await db.SaveChangesAsync();
}
catch (DbUpdateConcurrencyException ex)
{
    var entry = ex.Entries.Single();
    var databaseValues = await entry.GetDatabaseValuesAsync();
    if (databaseValues is null) { /* wiersz został usunięty */ }

    // „klient wygrywa”: zaakceptuj bieżący stan bazy jako oryginał i zapisz ponownie
    entry.OriginalValues.SetValues(databaseValues!);
    await db.SaveChangesAsync();
    // „baza wygrywa”: await entry.ReloadAsync();
    // merge: porównaj entry.CurrentValues, OriginalValues i databaseValues pole po polu
}
```

W API najczęściej odsyła się **409 Conflict**, a klient pobiera świeże dane i decyduje. Token przesyła
się w DTO (albo nagłówkach `ETag`/`If-Match`). Przy zapisie encji odłączonej trzeba ustawić
**oryginalną** wartość tokenu na tę od klienta:
`db.Entry(product).Property(p => p.Version).OriginalValue = dto.Version`.

`ExecuteUpdate`/`ExecuteDelete` nie sprawdzają tokenu automatycznie. Warunek dodaje się ręcznie
i sprawdza liczbę zmienionych wierszy:

```csharp
var rows = await db.Products
    .Where(p => p.Id == id && p.Version == dto.Version)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - 1));
if (rows == 0) return Results.Conflict();
```

## Pesymistyczna współbieżność

Blokujemy wiersz **na czas transakcji**, żeby nikt inny go nie zmienił. EF Core nie ma do tego API,
więc używa się surowego SQL wewnątrz transakcji:

```csharp
await using var tx = await db.Database.BeginTransactionAsync();
var product = await db.Products
    .FromSql($"SELECT * FROM Products WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}") // SQL Server
    // PostgreSQL: SELECT * FROM products WHERE id = {id} FOR UPDATE
    .SingleAsync();
product.Stock -= 1;
await db.SaveChangesAsync();
await tx.CommitAsync();
```

Kosztem są blokady, oczekiwanie i ryzyko deadlocków. Stosuje się ją przy wysokim ryzyku konfliktu
i krótkich operacjach (np. rezerwacja ostatniej sztuki). Alternatywą bywa atomowa aktualizacja
warunkowa: `UPDATE ... SET Stock = Stock - 1 WHERE Id = @id AND Stock > 0`.

## Źródła

- [Transactions](https://learn.microsoft.com/en-us/ef/core/saving/transactions)
- [Handling concurrency conflicts](https://learn.microsoft.com/en-us/ef/core/saving/concurrency)
- [Connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency)
- [ExecuteUpdate and ExecuteDelete: concurrency control](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)
- [SET TRANSACTION ISOLATION LEVEL (T-SQL)](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql)

## Pytania

### Czy `SaveChanges` jest transakcyjne? Kiedy potrzebna jest jawna transakcja? {junior}

Tak. Wszystkie zmiany z jednego wywołania `SaveChanges` są zapisywane atomowo, jeśli provider obsługuje
transakcje. Jawna transakcja (`BeginTransactionAsync`) jest potrzebna, gdy kilka operacji musi się
powieść razem: wiele `SaveChanges`, `ExecuteUpdate`/`ExecuteDelete`, które same nie dołączają do
żadnej transakcji, surowy SQL albo odczyty, które mają widzieć spójny stan.

### Czym jest optymistyczna kontrola współbieżności i jak działa w EF Core? {mid}

To podejście, w którym nie blokujemy danych, tylko wykrywamy konflikt przy zapisie. Encja ma token
współbieżności (`rowversion` w SQL Server lub pole oznaczone `[ConcurrencyCheck]`). EF dodaje do
`WHERE` w `UPDATE`/`DELETE` warunek na oryginalną wartość tokenu. Jeśli w międzyczasie ktoś zmienił
wiersz, polecenie nie trafi w żaden wiersz i EF rzuci `DbUpdateConcurrencyException`.

### Czym różni się `[Timestamp]` od `[ConcurrencyCheck]`? {mid}

`[Timestamp]` (`IsRowVersion()`) mapuje właściwość `byte[]` na kolumnę `rowversion` w SQL Server, którą
**baza** automatycznie zmienia przy każdej aktualizacji wiersza. `[ConcurrencyCheck]`
(`IsConcurrencyToken()`) oznacza dowolną właściwość jako token, ale jej zmianą musi zająć się
**aplikacja** (np. nowy `Guid` przy każdym zapisie). Działa to w każdej bazie. Można też oznaczyć
nim zwykłe pole biznesowe, żeby wykrywać konflikty tylko na nim.

### Jak rozwiązać `DbUpdateConcurrencyException`? {mid}

Wyjątek zawiera `Entries` ze skonfliktowanymi encjami. Dla każdej można pobrać aktualne wartości z bazy
(`GetDatabaseValuesAsync`, które zwraca `null`, jeśli wiersz usunięto) i wybrać strategię:
**baza wygrywa** (`ReloadAsync`, porzucenie zmian), **klient wygrywa** (`OriginalValues.SetValues(dbValues)`
i ponowny zapis) albo **merge** pole po polu. W API zwykle zwraca się 409 Conflict i pozwala użytkownikowi
zdecydować.

### Jak obsłużyć współbieżność, gdy encja przychodzi z API (scenariusz odłączony)? {senior}

Klient musi dostać token razem z danymi (w DTO albo jako `ETag`) i odesłać go przy zapisie (np.
`If-Match`). Przed `SaveChanges` ustawia się **oryginalną** wartość tokenu na tę od klienta:
`db.Entry(entity).Property(e => e.Version).OriginalValue = dto.Version`. Samo przypisanie
`entity.Version = dto.Version` na świeżo pobranej encji nie wystarczy, bo EF porównuje z wartością
oryginalną z chwili pobrania.

### Czym różni się blokowanie optymistyczne od pesymistycznego i kiedy które stosować? {mid}

Optymistyczne nie blokuje danych i wykrywa konflikt przy zapisie. Jest tanie i skalowalne, sprawdza się
przy rzadkich konfliktach i długich interakcjach (formularze). Pesymistyczne blokuje wiersz na czas
transakcji (`UPDLOCK`, `SELECT ... FOR UPDATE`) i zapobiega konfliktom, ale kosztem oczekiwania,
mniejszej przepustowości i ryzyka deadlocków. Stosuje się je przy krótkich operacjach z wysokim
ryzykiem kolizji. EF Core nie ma na nie API, więc potrzebny jest surowy SQL.

### Dlaczego własna transakcja nie działa z `EnableRetryOnFailure` i jak to naprawić? {senior}

Strategia ponawiania powtarza pojedyncze operacje EF. Jawna transakcja grupuje kilka operacji, więc po
błędzie przejściowym trzeba by powtórzyć całą grupę, a EF tego sam nie wie. Rzuca więc
`InvalidOperationException`. Rozwiązanie: `db.Database.CreateExecutionStrategy().ExecuteAsync(...)`
z całą transakcją, od `BeginTransaction` do `Commit`, wewnątrz delegata, który może zostać wykonany
ponownie.

### Czym są savepointy i jak EF Core ich używa? {senior}

To punkty wewnątrz transakcji, do których można się wycofać bez anulowania całej transakcji. Gdy
`SaveChanges` działa w już rozpoczętej transakcji, EF automatycznie tworzy savepoint i przy błędzie cofa
się do niego, więc transakcja pozostaje używalna, np. do ponowienia po konflikcie współbieżności. Można
je też tworzyć ręcznie (`CreateSavepointAsync`, `RollbackToSavepointAsync`). W SQL Server nie działają
przy włączonym MARS.

### Jak ustawić poziom izolacji transakcji w EF Core? {mid}

Przekazać go przy rozpoczynaniu transakcji: `await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);` (z `System.Data.IsolationLevel`) albo
użyć `TransactionScope` z `TransactionOptions`. Bez tego obowiązuje domyślny poziom bazy (read committed w SQL Server i PostgreSQL). Dostawcy mapują poziomy na to, co
obsługuje baza: w teście na SQLite żądany `RepeatableRead` stał się `Serializable`. `Snapshot` w SQL Server wymaga też włączenia izolacji snapshot w bazie.

### Jak bezpiecznie zmniejszyć stan magazynowy przy wielu równoczesnych zamówieniach? {mid}

Najprościej atomową aktualizacją warunkową w bazie:
`ExecuteUpdateAsync` z `Where(p => p.Id == id && p.Stock >= qty)` i `SetProperty(p => p.Stock, p => p.Stock - qty)`,
a następnie sprawdzić, czy zmieniono 1 wiersz. Alternatywy: optymistyczny token z ponowieniem przy
konflikcie albo blokada pesymistyczna w krótkiej transakcji. Wzorzec „odczytaj, sprawdź, zapisz” bez
żadnej z tych technik prowadzi do sprzedaży ponad stan.
