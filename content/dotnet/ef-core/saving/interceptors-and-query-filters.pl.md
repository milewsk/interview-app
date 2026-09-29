# Globalne filtry zapytań, interceptory i zdarzenia {senior}

Zagadnienia przekrojowe, takie jak **soft delete**, **wielodostępność** (multi-tenancy) i **audyt**, nie powinny być
powtarzane w każdym zapytaniu i każdym zapisie. EF Core daje dwa mechanizmy: **globalne filtry zapytań**, dodawane
automatycznie do zapytań, oraz **interceptory i zdarzenia**, które podpinają się pod zapis, polecenia i połączenia.

## Globalne filtry zapytań

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Post>().HasQueryFilter("SoftDelete", p => !p.IsDeleted);
    modelBuilder.Entity<Blog>().HasQueryFilter("Tenant", b => b.TenantId == TenantId);   // właściwość kontekstu
}

db.Posts.ToList();                                        // WHERE NOT IsDeleted
db.Posts.IgnoreQueryFilters().ToList();                  // wszystkie filtry wyłączone
db.Posts.IgnoreQueryFilters(["SoftDelete"]).ToList();    // wyłączony tylko nazwany filtr (EF Core 10)
```

- Filtr jest dodawany do **każdego** zapytania o dany typ encji, także przy `Include` nawigacji (w teście blog
  przyszedł z 1 z 2 postów), `Any`, `Count`, a także `ExecuteUpdate`/`ExecuteDelete`.
- Filtr odwołujący się do właściwości kontekstu (`TenantId`) jest tłumaczony jako **parametr**
  (`@ef_filter__TenantId`) i obliczany dla każdej instancji kontekstu, więc jeden zapamiętany model obsługuje
  wszystkich tenantów. W teście dwa konteksty z różnym `TenantId` widziały różne blogi.
- Od **EF Core 10** encja może mieć kilka **nazwanych filtrów**, a `IgnoreQueryFilters(["SoftDelete"])` wyłącza tylko
  jeden. Wcześniej był jeden filtr na encję, a jego zignorowanie wyłączało wszystko, łącznie z izolacją tenantów.
- Pułapka: jeśli **wymagana** encja główna zostanie odfiltrowana, znikać mogą też wskazujące na nią encje zależne,
  dlatego EF ostrzega przed filtrami po stronie głównej wymaganych relacji.
- Filtry to wygoda, a nie samodzielna granica bezpieczeństwa: omijają je `IgnoreQueryFilters`, surowy SQL i inne
  konteksty. Izolacja tenantów może dodatkowo korzystać z mechanizmów bazy (np. row-level security).

## Interceptory

Interceptory pozwalają podejrzeć lub zmienić operacje EF. Rejestruje się je w opcjach:

```csharp
builder.Services.AddScoped<AuditInterceptor>();
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
    options.UseSqlServer(connectionString)
           .AddInterceptors(sp.GetRequiredService<AuditInterceptor>()));
```

| Interceptor | Podpina się pod |
|---|---|
| `SaveChangesInterceptor` | przed/po `SaveChanges`: audyt, soft delete, zdarzenia domenowe |
| `DbCommandInterceptor` | każde polecenie SQL: logowanie, wskazówki, zmiana SQL, cache, symulowanie spowolnień w testach |
| `DbConnectionInterceptor` | otwieranie połączeń: np. ustawienie tokenu dostępu albo kontekstu sesji |
| `DbTransactionInterceptor` | rozpoczęcie, zatwierdzenie i wycofanie transakcji |
| `IMaterializationInterceptor` | tworzenie instancji encji z wyników zapytań |

```csharp
public class AuditInterceptor(TimeProvider clock) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
    {
        foreach (var entry in eventData.Context!.ChangeTracker.Entries<IAuditable>())
        {
            if (entry.State == EntityState.Added) entry.Entity.CreatedAt = clock.GetUtcNow();
            if (entry.State == EntityState.Modified) entry.Entity.UpdatedAt = clock.GetUtcNow();
        }
        foreach (var entry in eventData.Context.ChangeTracker.Entries<ISoftDeletable>()
                     .Where(e => e.State == EntityState.Deleted))
        {
            entry.State = EntityState.Modified;          // DELETE zamienia się w UPDATE
            entry.Entity.IsDeleted = true;
        }
        return ValueTask.FromResult(result);
    }
}
```

W teście `db.Remove(post)` + `SaveChanges` z takim interceptorem zostawiło wiersz w bazie z `IsDeleted = true`, a filtr
zapytań go ukrył.

- Nadpisuje się **obie** metody, synchroniczną i asynchroniczną (`SavingChanges` i `SavingChangesAsync`), jeśli
  aplikacja używa obu.
- Instancja interceptora zarejestrowana raz jest współdzielona, więc powinna być bezstanowa albo pobierana z właściwym
  czasem życia.
- Interceptory `SaveChanges` **nie działają** dla `ExecuteUpdate`/`ExecuteDelete` ani surowego SQL, bo te nie
  przechodzą przez `SaveChanges`. `DbCommandInterceptor` widzi każde polecenie.

## Zdarzenia

Prostsze punkty zaczepienia bez rejestracji: `context.SavingChanges`, `SavedChanges`, `SaveChangesFailed`, a na change
trackerze `Tracked` i `StateChanged`. Przydają się w kodzie wewnątrz kontekstu (np. ustawianie znaczników czasu),
a interceptory lepiej pasują do zachowań wielokrotnego użytku konfigurowanych przez DI.

## Źródła

- [Global query filters](https://learn.microsoft.com/en-us/ef/core/querying/filters)
- [Interceptors](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/interceptors)
- [.NET events in EF Core](https://learn.microsoft.com/en-us/ef/core/logging-events-diagnostics/events)
- [Multi-tenancy](https://learn.microsoft.com/en-us/ef/core/miscellaneous/multitenancy)
- [What's new in EF Core 10](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/whatsnew)

## Pytania

### Czym jest globalny filtr zapytań i do czego służy? {mid}

To predykat LINQ skonfigurowany na typie encji przez `HasQueryFilter`, który EF automatycznie dodaje do każdego zapytania o ten typ, także do nawigacji
wczytywanych przez `Include`. Typowe zastosowania to soft delete (`!e.IsDeleted`) i wielodostępność (`e.TenantId == CurrentTenantId`). Usuwa ryzyko
zapomnienia warunku w jednym z wielu zapytań. Dla konkretnego zapytania można go wyłączyć przez `IgnoreQueryFilters()`.

### Jak zaimplementować soft delete w EF Core? {mid}

Dodać kolumnę `IsDeleted` (i opcjonalnie `DeletedAt`), globalny filtr zapytań `!e.IsDeleted` ukrywający usunięte wiersze oraz interceptor `SaveChanges`,
który zamienia encje w stanie `Deleted` na `Modified` z `IsDeleted = true`. Trzeba pamiętać, że `ExecuteDelete` i surowy SQL omijają interceptor, indeksy
unikalne zwykle filtruje się do nieusuniętych wierszy, a kaskady musi obsłużyć ta sama logika.

### Skąd filtr zapytań dla wielodostępności wie, kto jest bieżącym tenantem? {senior}

Filtr odwołuje się do właściwości lub pola kontekstu (`b.TenantId == TenantId`), ustawianego dla każdej instancji kontekstu, np. z serwisu tenanta
o zasięgu scoped wstrzykniętego do kontekstu. EF tłumaczy to na parametr obliczany przy każdym wykonaniu zapytania, więc model buduje się raz, a każdy
kontekst filtruje po swoim tenancie. Przy puli kontekstów tenanta trzeba ustawiać przy każdym wydaniu kontekstu, bo konstruktor wykonuje się tylko raz.

### Czym są nazwane filtry zapytań w EF Core 10? {mid}

Przed EF Core 10 encja mogła mieć tylko jeden filtr, a `IgnoreQueryFilters()` wyłączało go w całości. Teraz można zdefiniować kilka filtrów z nazwami, np.
`HasQueryFilter("SoftDelete", ...)` i `HasQueryFilter("Tenant", ...)`, i wyłączać tylko wybrane: `IgnoreQueryFilters(["SoftDelete"])` pokazuje usunięte
rekordy, zachowując izolację tenantów. Wcześniej wymagało to ręcznego łączenia warunków.

### Czy globalne filtry zapytań są mechanizmem bezpieczeństwa? {senior}

Nie same w sobie. Chronią przed zapomnieniem warunku w zapytaniach LINQ, ale omija je `IgnoreQueryFilters`, surowy SQL, inne aplikacje korzystające z tej
samej bazy i błędy w ustawieniu tenanta. Przy silnej izolacji tenantów dodaje się kolejne warstwy ochrony: testy sprawdzające izolację, row-level
security w bazie albo osobne schematy czy bazy na tenanta.

### Czym jest interceptor w EF Core i jakie są rodzaje? {mid}

To obiekt rejestrowany przez `AddInterceptors`, wywoływany przed i po operacjach EF, który może je podejrzeć, zmienić albo pominąć. Rodzaje to m.in.
`SaveChangesInterceptor` (zapis), `DbCommandInterceptor` (każde polecenie SQL), `DbConnectionInterceptor` (otwieranie połączeń),
`DbTransactionInterceptor` (transakcje) i `IMaterializationInterceptor` (tworzenie instancji encji). Typowe zastosowania: audyt, soft delete, logowanie
i ustawianie kontekstu połączenia.

### Jak automatycznie uzupełniać kolumny `CreatedAt`/`UpdatedAt`? {mid}

W `SaveChangesInterceptor` (albo nadpisanym `SaveChanges`) przejść po `ChangeTracker.Entries<IAuditable>()` i ustawić `CreatedAt` dla encji `Added`
oraz `UpdatedAt` dla `Modified`, używając wstrzykniętego `TimeProvider`, żeby dało się to testować. Alternatywnie wartość może generować baza
(`HasDefaultValueSql`), ale tylko przy wstawianiu. Nie obejmuje to `ExecuteUpdate`, gdzie kolumnę trzeba ustawić jawnie.

### Czy interceptory `SaveChanges` działają przy `ExecuteUpdate` i `ExecuteDelete`? {senior}

Nie. Te metody wysyłają SQL od razu, bez change trackera i `SaveChanges`, więc audyt, soft delete czy zdarzenia domenowe zaimplementowane
w `SaveChangesInterceptor` są po cichu pomijane. Te polecenia widzi tylko `DbCommandInterceptor`. Jeśli aplikacja polega na takiej logice, operacje
hurtowe muszą ją powielać (np. ustawiać `UpdatedAt` w `SetProperty`) albo być ograniczone.

### Dlaczego interceptory powinny być bezstanowe? {senior}

Instancja interceptora dodana do opcji jest często współdzielona przez wiele instancji kontekstu i może być używana równolegle przez różne żądania.
Stan trzymany w polach (np. bieżący użytkownik albo lista zmian) przeciekałby między żądaniami albo powodował wyścigi. Interceptory trzyma się
bezstanowe, dane żądania przekazuje przez `DbContext` (dostępny jako `eventData.Context`) albo rejestruje je z właściwym czasem życia w DI i pobiera przy
konfiguracji kontekstu.

### Czym różnią się zdarzenia EF Core od interceptorów? {mid}

Zdarzenia (`SavingChanges`, `SavedChanges`, `SaveChangesFailed`, `ChangeTracker.Tracked` i `StateChanged`) to zwykłe zdarzenia .NET na instancji kontekstu:
łatwo je subskrybować wewnątrz kontekstu, a handlery mogą modyfikować śledzone encje (np. ustawiać znaczniki czasu), ale nie mogą przerwać operacji ani
podmienić jej wyniku. Interceptory rejestruje się w opcjach, można je pobierać z DI i używać w wielu kontekstach, a do tego mogą zmieniać wyniki albo
pomijać operacje. Do przekrojowych zachowań wielokrotnego użytku lepiej pasują interceptory.
