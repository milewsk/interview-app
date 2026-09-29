# Konfiguracja DbContext, DI i czas życia {mid}

`DbContext` to **lekki, krótko żyjący** obiekt: jeden na jednostkę pracy (w aplikacji webowej jeden na żądanie).
Poprawna rejestracja we wstrzykiwaniu zależności i wybór między zwykłym kontekstem, **pulą** a **fabryką** to częsty
temat rozmów, bo błędy w tym miejscu dają problemy widoczne dopiero pod obciążeniem.

## Rejestracja w ASP.NET Core

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default"))
           .EnableDetailedErrors(builder.Environment.IsDevelopment()));

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();
}
```

- `AddDbContext` domyślnie rejestruje kontekst jako **scoped**: jedna instancja na żądanie (na zakres DI), współdzielona
  przez wszystkie serwisy tego żądania i zwalniana na końcu zakresu. Test potwierdził: ta sama instancja w obrębie
  zakresu, różne między zakresami.
- Pobranie kontekstu scoped z głównego providera (np. w singletonie) kończy się błędem przy włączonej walidacji zakresów
  (`InvalidOperationException`), a bez walidacji tworzy kontekst żyjący tak długo jak aplikacja, co jest poważnym błędem.
- Connection string pochodzi z konfiguracji (`appsettings.json`, zmienne środowiskowe, magazyn sekretów), nigdy nie jest
  zapisany w kodzie.

## `DbContext` nie jest bezpieczny wątkowo

Jednego kontekstu nie mogą używać dwie operacje naraz. Gdy dwa zapytania się nakładają (np.
`Task.WhenAll(db.A.ToListAsync(), db.B.ToListAsync())`), EF rzuca `InvalidOperationException: A second operation was
started on this context instance before a previous operation completed`. Każdą operację trzeba zakończyć (`await`)
przed następną, a do pracy równoległej używać osobnych kontekstów.

## Pula kontekstów (pooling)

```csharp
builder.Services.AddDbContextPool<AppDbContext>(o => o.UseSqlServer(connectionString), poolSize: 1024);
```

Zamiast tworzyć nowy kontekst przy każdym żądaniu, pula **ponownie używa instancji**: na końcu zakresu EF resetuje stan
kontekstu (czyści change tracker), a kontekst wraca do puli. W teście ta sama instancja wróciła w kolejnym zakresie
z 0 śledzonych encji. Zmniejsza to koszt przygotowania kontekstu w aplikacjach o bardzo dużej przepustowości (domyślny
rozmiar puli to 1024, a ponad nim EF tworzy konteksty normalnie). Konsekwencja: kontekst z puli zachowuje się jak
**singleton używany przez kolejne żądania**. `OnConfiguring` i konstruktor wykonują się tylko raz, więc nie da się tam
ustawić stanu zależnego od żądania (np. identyfikatora tenanta). Trzeba go przypisywać przy każdym wydaniu kontekstu,
np. przez fabrykę scoped opakowującą `AddPooledDbContextFactory`. EF nie resetuje też stanu, który sam zmieniłeś na
bazowym `DbConnection`.

## Fabryka kontekstów

```csharp
builder.Services.AddDbContextFactory<AppDbContext>(o => o.UseSqlServer(connectionString));

public class ReportJob(IDbContextFactory<AppDbContext> factory)
{
    public async Task RunAsync(CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);   // jesteś właścicielem, więc zwalniasz
        ...
    }
}
```

Fabryka jest rejestrowana jako **singleton** i tworzy nowy kontekst na żądanie. Używa się jej tam, gdzie nie ma
naturalnego zakresu żądania albo potrzeba kilku kontekstów naraz: w `BackgroundService`, Blazor Server (zakres żyje
tak długo jak połączenie użytkownika), przetwarzaniu równoległym (kontekst na zadanie) i w singletonach.
`AddPooledDbContextFactory` łączy fabrykę z pulą.

## Inne opcje

- **Logowanie SQL**: `LogTo(Console.WriteLine, LogLevel.Information)` albo standardowy `ILogger` (kategoria
  `Microsoft.EntityFrameworkCore.Database.Command`). Wartości parametrów są ukryte (`@name='?'`), chyba że włączy się
  `EnableSensitiveDataLogging()`, co powinno być używane **tylko w developmencie**, bo zapisuje dane do logów.
- `EnableDetailedErrors()`: dokładniejsze komunikaty błędów (np. której kolumny nie udało się odczytać), kosztem
  niewielkiego spadku wydajności.
- **Odporność połączeń**: `UseSqlServer(cs, o => o.EnableRetryOnFailure())` automatycznie ponawia operacje po
  przejściowych błędach (np. w Azure SQL). Przy ręcznych transakcjach wymaga strategii wykonania (zob. temat
  o transakcjach).
- `UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)` zmienia domyślne zachowanie dla kontekstu nastawionego
  na odczyt.
- **Kilka kontekstów** w jednej aplikacji (np. per bounded context albo per baza) jest w porządku: każdy ma własne
  opcje i migracje.

## Źródła

- [DbContext lifetime, configuration, and initialization](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)
- [Advanced performance topics: DbContext pooling](https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics)
- [Simple logging](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/simple-logging)
- [Connection resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency)

## Pytania

### Jaki czas życia daje kontekstowi `AddDbContext` i dlaczego? {junior}

Scoped: jedna instancja na zakres DI, co w ASP.NET Core oznacza jedną na żądanie HTTP. Wszystkie serwisy obsługujące żądanie współdzielą ten sam
kontekst, więc biorą udział w jednej jednostce pracy (jednym `SaveChanges`), a kontekst jest zwalniany po zakończeniu żądania. Kontekst powinien
żyć krótko, bo change tracker rośnie z każdą wczytaną encją.

### Dlaczego nie rejestrować `DbContext` jako singletonu? {mid}

Kontekst nie jest bezpieczny wątkowo, więc równoległe żądania korzystające z niego rzucałyby wyjątki albo psuły jego stan. Do tego change tracker
rósłby bez końca, trzymając wszystkie kiedykolwiek wczytane encje (wyciek pamięci i nieaktualne dane), a jeden nieudany `SaveChanges` zostawiłby
zepsuty stan dla wszystkich. Kontekst powinien żyć krótko: na żądanie albo na jednostkę pracy.

### Co się stanie, gdy uruchomisz dwa zapytania na tym samym `DbContext` jednocześnie? {mid}

EF Core to wykryje i rzuci `InvalidOperationException` („A second operation was started on this context instance before a previous operation
completed”). Kontekst nie jest bezpieczny wątkowo i ma jedno połączenie oraz jeden change tracker. Każdą operację trzeba zakończyć przed
rozpoczęciem następnej, a do prawdziwej równoległości każde zadanie potrzebuje własnego kontekstu, np. z `IDbContextFactory`.

### Jak używać `DbContext` w `BackgroundService`? {mid}

Hosted service to singleton, więc nie można wstrzyknąć do niego kontekstu scoped. Można wstrzyknąć `IDbContextFactory<T>` i tworzyć kontekst na
każdą jednostkę pracy (`await using var db = await factory.CreateDbContextAsync()`) albo wstrzyknąć `IServiceScopeFactory`, tworzyć zakres dla
każdej iteracji i pobierać z niego kontekst. W obu przypadkach kontekst żyje krótko i jest zwalniany po każdej jednostce pracy.

### Czym jest pula kontekstów (DbContext pooling) i jakie ma ograniczenia? {mid}

`AddDbContextPool` ponownie używa instancji kontekstu: po zakończeniu zakresu stan kontekstu jest resetowany, a on wraca do puli, co pozwala
uniknąć kosztu tworzenia i konfigurowania kontekstu przy każdym żądaniu. Pomaga w aplikacjach o bardzo dużej przepustowości. Ograniczenie polega na
tym, że instancje są używane przez kolejne żądania jak singleton: konstruktor i `OnConfiguring` wykonują się tylko raz, więc stan zależny od
żądania (np. identyfikator tenanta dla filtrów zapytań) trzeba ustawiać przy każdym wydaniu kontekstu, np. przez własną fabrykę scoped. Domyślny
rozmiar puli to 1024.

### Kiedy użyć `IDbContextFactory`? {mid}

Gdy nie ma zakresu żądania albo zakres żyje zbyt długo: w `BackgroundService` i innych singletonach, w Blazor Server (zakres trwa tak długo jak
połączenie użytkownika), w aplikacjach desktopowych i przy przetwarzaniu równoległym, gdzie każde zadanie potrzebuje własnego kontekstu. Fabryka
jest singletonem, a za zwolnienie kontekstu odpowiada kod, który go utworzył.

### Jak zobaczyć SQL generowany przez EF Core? {junior}

Włączyć logowanie: `LogTo(Console.WriteLine, LogLevel.Information)` w opcjach albo skonfigurować kategorię
`Microsoft.EntityFrameworkCore.Database.Command` na poziomie `Information` w standardowym loggerze. `ToQueryString()` na zapytaniu zwraca SQL bez
wykonywania. Wartości parametrów są w logach ukryte, chyba że włączy się `EnableSensitiveDataLogging()`, co robi się tylko w developmencie.

### Dlaczego nie włączać `EnableSensitiveDataLogging` na produkcji? {mid}

Zapisuje wartości parametrów i dane encji do logów i komunikatów wyjątków, np. e-maile, dane osobowe, hasła czy tokeny. Logi są często
przechowywane dłużej, szerzej udostępniane i słabiej chronione niż baza, więc może to spowodować wyciek danych i naruszenie RODO. Bez tej opcji
parametry pojawiają się jako `'?'`. Włącza się ją tylko lokalnie albo tymczasowo w kontrolowanym środowisku.

### Czym jest odporność połączeń (connection resiliency) w EF Core? {mid}

To strategia wykonania, która automatycznie ponawia operacje bazodanowe po przejściowych błędach, takich jak zerwane połączenie czy przełączenie
awaryjne bazy w chmurze. Włącza się ją przez `EnableRetryOnFailure()` w konfiguracji dostawcy (np. SQL Server). Przy jawnych transakcjach cały blok
transakcyjny trzeba uruchomić przez `Database.CreateExecutionStrategy().ExecuteAsync(...)`, żeby dało się go ponowić jako całość.

### Czy jedna aplikacja może mieć kilka klas `DbContext`? {mid}

Tak. Często spotyka się osobne konteksty dla różnych baz, dla różnych bounded contextów w modularnym monolicie albo kontekst tylko do odczytu
skonfigurowany z `NoTracking`. Każdy kontekst ma własne opcje, model i migracje (z `--context` w narzędziach CLI) i nie współdzielą change trackera
ani transakcji, chyba że jawnie współdzieli się połączenie i transakcję.
