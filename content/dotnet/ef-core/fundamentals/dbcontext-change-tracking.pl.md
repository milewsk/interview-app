# DbContext i śledzenie zmian {mid}

`DbContext` to centralny obiekt EF Core. Łączy kilka ról:

- **Unit of Work**: zbiera zmiany i zapisuje je razem w `SaveChanges`,
- **Identity Map**: pilnuje, żeby jeden wiersz (ten sam klucz) był reprezentowany przez
  **jedną instancję** encji w danym kontekście,
- punkt wejścia do zapytań (`DbSet<T>`) i konfiguracji modelu (`OnModelCreating`).

Instancja `DbContext` jest przeznaczona do **jednej jednostki pracy**, więc powinna żyć krótko.

## Czas życia i DI

- `AddDbContext` rejestruje kontekst jako **scoped**: w ASP.NET Core jeden na żądanie HTTP.
- **`DbContext` nie jest thread-safe.** Nie można uruchamiać na nim równolegle kilku operacji
  (np. `Task.WhenAll` dwóch zapytań). EF często to wykrywa i rzuca `InvalidOperationException`:
  „A second operation started on this context before a previous operation completed”.
  Każdą operację async należy od razu awaitować.
- `AddDbContextFactory` / `IDbContextFactory<T>`: gdy zakres DI nie pasuje do jednostki pracy
  (Blazor Server, zadania w tle, praca równoległa). Kontekst tworzony z fabryki trzeba samemu
  zwolnić przez `using`.
- `AddDbContextPool`: ponowne użycie instancji kontekstu, co zmniejsza narzut tworzenia
  w aplikacjach o dużym ruchu.
- **Nie rejestruj `DbContext` jako singletona** i nie wstrzykuj scoped kontekstu do singletona:
  rosnący change tracker, problemy z wątkami i przestarzałe dane.

## Stany encji

| Stan | Znaczenie | Co zrobi `SaveChanges` |
| --- | --- | --- |
| `Detached` | kontekst nie śledzi encji | nic |
| `Added` | nowa encja | `INSERT` |
| `Unchanged` | pobrana, bez zmian | nic |
| `Modified` | zmieniono co najmniej jedną właściwość | `UPDATE` tylko zmienionych kolumn |
| `Deleted` | oznaczona do usunięcia | `DELETE` |

```csharp
var blog = await db.Blogs.FirstAsync();   // Unchanged
blog.Name = "Nowa nazwa";                 // po wykryciu zmian: Modified
db.Blogs.Add(new Blog { Name = "X" });    // Added
db.Remove(post);                          // Deleted
await db.SaveChangesAsync();              // INSERT, UPDATE, DELETE w jednej transakcji
// po zapisie: encje Unchanged, klucze generowane przez bazę uzupełnione
```

## Jak EF wykrywa zmiany

Domyślnie EF robi **migawkę** (snapshot) wartości w chwili pobrania encji. `DetectChanges`
porównuje bieżące wartości z migawką. EF wywołuje je automatycznie m.in. w `SaveChanges`,
`Entry()` i `ChangeTracker.Entries()`. Dlatego zwykłe przypisanie do właściwości wystarcza.
Przy tysiącach śledzonych encji wykrywanie zmian kosztuje, a alternatywą są encje z powiadomieniami
(`INotifyPropertyChanged`) lub proxy śledzące.

## Identity resolution

W obrębie jednego kontekstu dwa zapytania zwracające ten sam wiersz dadzą **tę samą instancję**.
Drugie zapytanie **nie nadpisze** niezapisanych zmian:

```csharp
var a = await db.Blogs.FirstAsync(b => b.Id == 1);
a.Name = "Zmieniona";
var b = await db.Blogs.FirstAsync(b => b.Id == 1); // ReferenceEquals(a, b) == true
// b.Name == "Zmieniona", mimo że w bazie jest stara wartość
```

`Find(id)` najpierw sprawdza change tracker i gdy encja jest już śledzona, **nie wysyła
zapytania** do bazy.

## Zapytania bez śledzenia

Dla danych tylko do odczytu (listy, raporty, API GET) śledzenie to zbędny koszt pamięci i czasu:

```csharp
var blogs = await db.Blogs.AsNoTracking().ToListAsync();          // stan Detached
var dtos = await db.Blogs.Select(b => new BlogDto(b.Id, b.Name)).ToListAsync(); // projekcja: nie śledzona
```

- `AsNoTracking()` wyłącza też identity resolution. Ten sam wiersz występujący wielokrotnie
  w wyniku (np. przez `Include`) da **osobne instancje**.
- `AsNoTrackingWithIdentityResolution()` nie śledzi encji, ale deduplikuje instancje w obrębie
  zapytania.
- Globalnie: `UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)`.
- **Projekcja do DTO** (`Select`) jest zwykle najlepsza dla odczytu, bo pobiera tylko potrzebne
  kolumny i nie tworzy śledzonych encji.

## Encje odłączone (disconnected)

W API encja często przychodzi z zewnątrz (np. zdeserializowana z JSON-a), więc kontekst jej nie zna.

- `Update(entity)` oznacza encję jako `Modified` i **wszystkie jej właściwości** jako zmienione.
  `UPDATE` ustawi każdą kolumnę, nadpisując też to, czego klient nie wysłał.
- `Attach(entity)` dołącza encję jako `Unchanged`. Potem można oznaczyć konkretne właściwości:
  `db.Entry(entity).Property(e => e.Name).IsModified = true`.
- Bezpieczniejszy wzorzec: **pobierz encję, przepisz dozwolone pola z DTO, zapisz**. Działa
  wtedy wykrywanie zmian i w `UPDATE` trafiają tylko faktycznie zmienione kolumny.

## `ExecuteUpdate` / `ExecuteDelete`

Operacje masowe wykonywane **od razu** jednym poleceniem SQL, bez ładowania encji:

```csharp
await db.Blogs.Where(b => b.Rating < 3).ExecuteDeleteAsync();
await db.Blogs.Where(b => b.IsArchived)
    .ExecuteUpdateAsync(s => s.SetProperty(b => b.Rating, b => b.Rating + 1));
```

- **Omijają change tracker.** Śledzone instancje nie widzą zmian, a późniejsze `SaveChanges`
  może je nadpisać. Nie należy mieszać obu podejść na tych samych danych.
- Nie są automatycznie objęte wspólną transakcją. Każde wywołanie to osobne polecenie, a kilka
  operacji łączy się jawną transakcją.
- Nie sprawdzają automatycznie tokenów współbieżności: warunek na token trzeba dodać w `Where`
  i sprawdzić liczbę zmienionych wierszy.
- EF Core 10: `ExecuteUpdateAsync` przyjmuje zwykłą lambdę (nie tylko drzewo wyrażeń), więc
  można warunkowo dodawać `SetProperty`.

## Źródła

- [DbContext lifetime, configuration, and initialization](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)
- [Change tracking in EF Core](https://learn.microsoft.com/en-us/ef/core/change-tracking/)
- [Tracking vs. no-tracking queries](https://learn.microsoft.com/en-us/ef/core/querying/tracking)
- [Disconnected entities](https://learn.microsoft.com/en-us/ef/core/saving/disconnected-entities)
- [ExecuteUpdate and ExecuteDelete](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)

## Pytania

### Jakie wzorce realizuje `DbContext`? {mid}

**Unit of Work**, bo zbiera zmiany wielu encji i zapisuje je razem w `SaveChanges` (domyślnie
w jednej transakcji), oraz **Identity Map**, bo w obrębie kontekstu każdy wiersz jest reprezentowany
przez jedną instancję. `DbSet<T>` bywa porównywany do repozytorium, dlatego dokładanie własnego
generycznego repozytorium nad EF Core często niczego nie wnosi.

### Jaki czas życia powinien mieć `DbContext` w ASP.NET Core i dlaczego? {mid}

**Scoped**, czyli jeden na żądanie HTTP (domyślnie przez `AddDbContext`). Kontekst jest lekki,
przeznaczony do jednej jednostki pracy i nie jest thread-safe. Singleton kumulowałby śledzone encje,
zwracał przestarzałe dane i był używany współbieżnie z wielu żądań. Do pracy w tle albo równoległej
używa się `IDbContextFactory<T>` i tworzy osobny kontekst na każdą jednostkę pracy.

### Czy można wykonać dwa zapytania równolegle na jednym `DbContext`? {mid}

Nie. EF Core nie obsługuje wielu równoległych operacji na jednej instancji. Często to wykrywa i rzuca
`InvalidOperationException` („A second operation started on this context…”), a gdy nie wykryje,
skutki są niezdefiniowane. Każde wywołanie async trzeba od razu awaitować, a do równoległości użyć
osobnych kontekstów (np. z `IDbContextFactory`).

### Jakie stany może mieć encja i jak przekładają się na SQL? {junior}

`Detached` (niewidoczna dla kontekstu), `Unchanged` (bez zmian, brak SQL), `Added` (`INSERT`),
`Modified` (`UPDATE`) i `Deleted` (`DELETE`). Po udanym `SaveChanges` zapisane encje przechodzą w stan
`Unchanged`, a klucze generowane przez bazę zostają uzupełnione.

### Skąd EF wie, że encja została zmieniona, skoro to zwykły obiekt? {mid}

Przy pobraniu robi migawkę oryginalnych wartości. `DetectChanges` porównuje bieżące wartości
z migawką i ustawia stany. Jest wywoływane automatycznie m.in. przez `SaveChanges`, `Entry()`
i `ChangeTracker.Entries()`. Przy bardzo dużej liczbie śledzonych encji to kosztowne, więc można
ograniczyć śledzenie (`AsNoTracking`) albo użyć encji z powiadomieniami o zmianach.

### Kiedy i po co używać `AsNoTracking()`? {junior}

Przy zapytaniach tylko do odczytu, gdy wyników nie będziemy modyfikować i zapisywać. Oszczędza pamięć
i czas, bo nie ma migawek ani wpisów w change trackerze. Encje są `Detached`, a ten sam wiersz może
dać kilka instancji. Temu zapobiega `AsNoTrackingWithIdentityResolution()`. Jeszcze lepsza bywa
projekcja do DTO, która pobiera tylko potrzebne kolumny.

### Czym różni się `Find` od `FirstOrDefault(x => x.Id == id)`? {junior}

`Find` szuka najpierw w change trackerze. Jeśli encja o tym kluczu jest już śledzona, zwraca ją
**bez zapytania do bazy**. `FirstOrDefault` zawsze
wysyła zapytanie, choć dzięki identity resolution zwróci tę samą śledzoną instancję. `Find` działa
tylko po kluczu głównym.

### Co robi `Update()` z encją odłączoną i jakie jest ryzyko? {mid}

Dołącza encję w stanie `Modified` i oznacza **wszystkie** właściwości jako zmienione, więc `UPDATE`
ustawia każdą kolumnę. Jeśli obiekt przyszedł z API i nie zawiera wszystkich pól, brakujące wartości
(np. `null`, `0`) nadpiszą dane w bazie. Bezpieczniej jest pobrać encję, skopiować z DTO tylko
dozwolone pola i wywołać `SaveChanges`, które zaktualizuje wyłącznie zmienione kolumny.

### Czym `ExecuteUpdate`/`ExecuteDelete` różnią się od zmian przez `SaveChanges`? {mid}

Wykonują jedno polecenie SQL od razu, bez ładowania encji do pamięci, więc są znacznie wydajniejsze
przy operacjach masowych. Omijają jednak change tracker: śledzone instancje nie widzą zmian, a
późniejsze `SaveChanges` może je nadpisać. Nie tworzą wspólnej transakcji z innymi operacjami ani nie
sprawdzają automatycznie tokenów współbieżności. Zwracają za to liczbę zmienionych wierszy.

### Czym jest identity resolution i jakie ma skutki uboczne? {senior}

To gwarancja, że w obrębie kontekstu jeden wiersz odpowiada jednej instancji encji. Skutek uboczny:
ponowne zapytanie o ten sam wiersz **nie odświeży** danych ze zmianami innych użytkowników, jeśli encja
jest już śledzona. Zwróci istniejącą instancję. Aby pobrać świeże dane, trzeba użyć nowego kontekstu,
`AsNoTracking()` albo `db.Entry(entity).Reload()`.
