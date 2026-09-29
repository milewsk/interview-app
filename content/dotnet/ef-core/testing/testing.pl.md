# Testowanie kodu korzystającego z EF Core {mid}

Kluczowa decyzja to to, czy testy działają na **prawdziwym silniku bazy** (np. SQL Server w kontenerze), czy na
**dublerze testowym** (dostawca InMemory, SQLite w pamięci, mockowany `DbSet`, zaślepione repozytorium). Zalecenie
zespołu EF Core jest jasne: mieć dobre pokrycie testami na prawdziwej bazie, a jeśli potrzebne są dublery, zaślepiać
na poziomie **repozytorium**, a nie podrabiać dostawcy.

## Dlaczego podróbki kłamią

Zapytanie LINQ tłumaczy na SQL dostawca, więc jego zachowanie zależy od bazy. Podróbka wykonuje je inaczej. W teście
tego samego modelu:

| Zachowanie | Dostawca InMemory | SQLite w pamięci | SQL Server |
|---|---|---|---|
| Klucz obcy do nieistniejącego rodzica | zapisane bez błędu | `FOREIGN KEY constraint failed` | błąd |
| Duplikat w indeksie unikalnym | zapisane bez błędu | `UNIQUE constraint failed` | błąd |
| `BeginTransaction()` | błąd (transakcje ignorowane, ostrzeżenie domyślnie rzuca wyjątek) | działa | działa |
| `FromSql` | nieobsługiwane | działa, jeśli SQL jest zgodny | działa |
| `Url == "hello"` dla `"Hello"` | brak dopasowania (wielkość liter) | brak dopasowania (wielkość liter) | dopasowanie (domyślna collation nie rozróżnia wielkości liter) |

Ostatni wiersz to klasyczna pułapka: test przechodzi na podróbce, a zapytanie na produkcji zachowuje się inaczej, albo
odwrotnie. Funkcji specyficznych dla dostawcy (`EF.Functions.DateDiffDay` dla SQL Server) na podróbce w ogóle nie da
się przetestować.

- **Dostawca InMemory** nie jest relacyjną bazą: nie ma ograniczeń, transakcji ani surowego SQL i obsługuje mniej
  zapytań. Dokumentacja **zdecydowanie odradza** używanie go w testach.
- **SQLite w pamięci** to lepsza podróbka (prawdziwy SQL, ograniczenia, transakcje), ale wciąż inna baza z innym
  dialektem SQL i systemem typów.
- **Mockowanie `DbSet`** dla zapytań zamienia LINQ w LINQ w pamięci na liście, z tymi samymi problemami co dostawca
  InMemory.

## Testowanie na prawdziwej bazie

Jest łatwiejsze i szybsze, niż się wydaje: lokalna baza albo kontener działają szybko, a sam EF Core uruchamia
dziesiątki tysięcy testów na SQL Server.

- **Testcontainers** (`Testcontainers.MsSql`, `Testcontainers.PostgreSql`) uruchamia jednorazowy kontener z bazą na czas
  testów, z tym samym silnikiem i wersją co produkcja. Na Windows opcją jest też LocalDB.
- Schemat tworzy się raz na przebieg (`EnsureCreated` albo zastosowanie migracji, co przy okazji je testuje).
- **Izolacja między testami**:
  - każdy test w transakcji wycofywanej na końcu (w teście: 1 wiersz przed, 2 wewnątrz transakcji, 1 po wycofaniu);
  - albo reset danych między testami (np. biblioteka Respawn);
  - albo osobna baza dla każdej klasy testów.
- W testach integracyjnych ASP.NET Core `WebApplicationFactory<Program>` pozwala podmienić connection string albo
  rejestrację `DbContext` na bazę testową.

```csharp
public class OrderTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task Creates_order()
    {
        await using var db = fixture.CreateContext();
        await using var tx = await db.Database.BeginTransactionAsync();   // wycofana przy zwolnieniu

        var service = new OrderService(db);
        await service.PlaceAsync(customerId: 1, sku: "PEN");

        db.ChangeTracker.Clear();                                          // czytaj z bazy, nie z trackera
        Assert.Equal(1, await db.Orders.CountAsync());
    }
}
```

Wyczyszczenie change trackera (albo drugi kontekst) przed asercjami ma znaczenie: inaczej sprawdza się obiekty nadal
trzymane w pamięci, a nie to, co faktycznie zapisano.

## Dublery testowe: kiedy i jak

- **Testy jednostkowe logiki biznesowej** w ogóle nie potrzebują bazy: logikę trzyma się w klasach domenowych
  i serwisach przyjmujących dane na wejściu.
- Jeśli kod zależy od dostępu do danych, niezawodnym sposobem jego zaślepienia jest **repozytorium** zwracające
  zmaterializowane wyniki (`IEnumerable`, DTO), nigdy `IQueryable`, bo zaślepka nie odtworzy tłumaczenia na SQL. Kosztem
  jest dodatkowa warstwa do utrzymania, a zapytania repozytorium i tak wymagają testów na bazie.
- Dublery są też konieczne do symulowania awarii (np. timeoutu albo zerwanego połączenia), co łatwiej zrobić
  interceptorem niż prawdziwą bazą.

## Źródła

- [Testing overview](https://learn.microsoft.com/en-us/ef/core/testing/)
- [Choosing a testing strategy](https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy)
- [Testing against your production database system](https://learn.microsoft.com/en-us/ef/core/testing/testing-with-the-database)
- [Testing without your production database system](https://learn.microsoft.com/en-us/ef/core/testing/testing-without-the-database)
- [Testcontainers for .NET](https://dotnet.testcontainers.org/)

## Pytania

### Dlaczego dostawca InMemory nie jest zalecany w testach? {mid}

Nie jest relacyjną bazą: nie wymusza kluczy obcych ani indeksów unikalnych, nie obsługuje transakcji ani surowego SQL, obsługuje mniej zapytań
i porównuje stringi inaczej niż np. SQL Server. Testy mogą więc przechodzić, podczas gdy ten sam kod zawiedzie na produkcji, albo padać z powodów,
które na produkcji nie występują. Dokumentacja EF Core wprost go odradza i utrzymuje tylko dla starszych aplikacji.

### Czy SQLite w pamięci to dobry zamiennik SQL Server w testach? {mid}

Jest lepszy od dostawcy InMemory, bo to prawdziwa relacyjna baza z ograniczeniami, transakcjami i SQL. Ale to wciąż inny silnik: SQLite porównuje
stringi z rozróżnianiem wielkości liter, a domyślna collation SQL Server nie, niektóre zapytania i typy zachowują się inaczej, a funkcje specyficzne
dla SQL Server i surowy SQL mogą nie działać. To rozsądny kompromis, gdy prawdziwa baza jest niedostępna, a nie gwarancja.

### Jak testować na prawdziwej bazie bez wolnych i niestabilnych testów? {mid}

Uruchomić ten sam silnik lokalnie albo w kontenerze (Testcontainers, LocalDB), utworzyć schemat raz na przebieg testów i izolować testy: transakcja
wycofywana po każdym teście, reset danych między testami (np. Respawn) albo osobna baza na klasę testów. Przy małym, lokalnym zbiorze danych takie
testy trwają milisekundy, a równoległe klasy testów sobie nie przeszkadzają.

### Czym jest Testcontainers? {junior}

To biblioteka, która z kodu testów uruchamia jednorazowe kontenery Dockera, np. bazę SQL Server czy PostgreSQL w tej samej wersji co produkcja,
i usuwa je po testach. Daje każdemu przebiegowi testów czystą, prawdziwą bazę bez ręcznej konfiguracji, zarówno na maszynie programisty, jak i w CI.
Wymaga dostępnego Dockera.

### Jak izolować testy korzystające z jednej bazy? {mid}

Najczęstsze techniki to: rozpoczęcie transakcji na początku każdego testu i wycofanie jej na końcu, żeby nic nie zostało; przywracanie znanego stanu
przed każdym testem przez usuwanie danych (np. Respawn); albo osobna baza lub schemat na klasę testów. Podejście z transakcją słabo działa, gdy
testowany kod otwiera własne transakcje albo używa kilku połączeń.

### Po co czyścić change tracker przed asercją w teście? {mid}

Po `SaveChanges` encje pozostają śledzone, więc zapytanie w tym samym kontekście może zwrócić instancje z pamięci dzięki rozwiązywaniu tożsamości
zamiast wartości faktycznie zapisanych w bazie. Test mógłby wtedy przejść, choć kolumna nie została poprawnie zapisana. `ChangeTracker.Clear()` albo
nowa instancja kontekstu wymusza odczyt prawdziwych danych.

### Czy można mockować `DbSet`, żeby testować zapytania? {mid}

Nie w sensowny sposób. Operatory LINQ to statyczne metody rozszerzające na `IQueryable`, więc „zmockowany” `DbSet` to w rzeczywistości lista
przetwarzana LINQ w pamięci, która ignoruje tłumaczenie na SQL: wielkość liter, semantyka null, nieprzetłumaczalne wyrażenia i funkcje dostawcy
zachowują się inaczej. Mockowanie kontekstu jest do przyjęcia przy sprawdzaniu wywołań takich jak `Add` czy `SaveChanges`, ale nie przy logice
zapytań.

### Jak wzorzec repozytorium pomaga w testowaniu? {senior}

Repozytorium zamyka każde zapytanie w metodzie zwracającej zmaterializowane dane (`IEnumerable`, DTO), więc w testach jednostkowych można bezpośrednio
zaślepić wyniki bez uruchamiania LINQ, co jest jedynym niezawodnym sposobem usunięcia EF z testów jednostkowych. Kosztem jest dodatkowa warstwa kodu
do utrzymania, a własne zapytania repozytorium i tak wymagają testów na bazie. Nie powinno ono udostępniać `IQueryable`, bo tego nie da się
zaślepić.

### Czy w ogóle potrzebne jest repozytorium nad EF Core? {senior}

Niekoniecznie. `DbContext` już implementuje wzorzec jednostki pracy, a `DbSet` wzorzec repozytorium, więc generyczne repozytorium, które je opakowuje,
często tylko ukrywa możliwości (`Include`, projekcje, `AsNoTracking`) i dodaje kod. Konkretne repozytoria albo obiekty zapytań mają sens, gdy wyrażają
operacje domeny, centralizują złożone zapytania albo są potrzebne do zaślepienia dostępu do danych w testach. Wiele zespołów używa `DbContext`
bezpośrednio w warstwie aplikacji i testuje go na prawdziwej bazie.

### Jak testować migracje? {senior}

W CI zastosować wszystkie migracje na pustej bazie produkcyjnego silnika (np. w kontenerze) i uruchomić testy na powstałym schemacie, zamiast tworzyć
go przez `EnsureCreated`, które pomija migracje. Dodatkowo wygenerować skrypt SQL (`dotnet ef migrations script --idempotent`) i go przejrzeć,
a migracje przekształcające istniejące dane testować na kopii danych produkcyjnych. Od EF Core 9 `Migrate()` zgłasza też błąd, jeśli model ma zmiany
nieobjęte migracją.
