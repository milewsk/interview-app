# Migracje {mid}

Migracje to sposób na **wersjonowanie schematu bazy razem z kodem**. EF porównuje aktualny model
(encje i konfigurację) z zapisanym stanem i generuje klasę migracji z metodami `Up` (wprowadź zmiany)
i `Down` (cofnij).

```bash
dotnet tool install --global dotnet-ef               # narzędzie CLI
dotnet add package Microsoft.EntityFrameworkCore.Design

dotnet ef migrations add AddCustomerEmail            # nowa migracja
dotnet ef database update                            # zastosuj na lokalnej bazie
dotnet ef migrations remove                          # usuń ostatnią (niezastosowaną) migrację
dotnet ef migrations list                            # lista, z oznaczeniem (Pending)
dotnet ef migrations has-pending-model-changes       # czy model ma zmiany bez migracji (CI)
```

## Co powstaje w projekcie

- `20260925_AddCustomerEmail.cs`: operacje `Up`/`Down` (`CreateTable`, `AddColumn`, `RenameColumn`…),
- `...Designer.cs`: metadane migracji,
- `AppDbModelSnapshot.cs`: **migawka całego modelu** po ostatniej migracji. Z nią porównywany jest
  model przy dodawaniu kolejnej migracji, więc musi być w repozytorium.

W bazie tabela `__EFMigrationsHistory` przechowuje identyfikatory zastosowanych migracji. Dzięki
niej `database update` stosuje tylko brakujące.

## Przeglądaj każdą migrację

Migracja jest generowana heurystycznie. Zmiana nazwy właściwości zwykle daje `RenameColumn`, ale
dokumentacja ostrzega, że migracja **może usunąć kolumnę, gdy intencją była zmiana nazwy**, co oznacza
utratę danych. Przed zatwierdzeniem trzeba przeczytać wygenerowany kod. Migracje można edytować ręcznie:

```csharp
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddColumn<string>("Email", "Customers", nullable: true);
    // migracja danych, której EF sam nie wygeneruje
    migrationBuilder.Sql("UPDATE Customers SET Email = LegacyEmail");
    migrationBuilder.DropColumn("LegacyEmail", "Customers");
}
```

## Wdrażanie na produkcję

| Strategia | Kiedy |
| --- | --- |
| **Skrypt SQL** (`dotnet ef migrations script --idempotent -o migrations.sql`) | gdy SQL ma przejrzeć DBA lub proces wymaga akceptacji |
| **Bundle** (`dotnet ef migrations bundle`) | zalecany do automatycznych wdrożeń (CI/CD) |
| `dotnet ef database update` | lokalny development i testy |
| `Database.MigrateAsync()` przy starcie aplikacji | proste wdrożenia, które akceptują kompromisy |

- **Skrypt idempotentny** sprawdza `__EFMigrationsHistory` i stosuje tylko brakujące migracje, więc
  nadaje się do baz w różnych stanach. Zależy od providera: SQLite go nie obsługuje.
- **Bundle** to pojedynczy plik wykonywalny (`efbundle`) budowany w CI. Nie wymaga SDK ani kodu
  źródłowego, stosuje blokadę migracji i uruchamia seeding. Connection string podaje się przez
  `--connection` z magazynu sekretów.
- **Migracje w runtime** mają wady: aplikacja potrzebuje uprawnień do zmiany schematu, SQL nie
  jest przeglądany, a wycofanie jest trudniejsze. Od EF Core 9 chroni przed tym **blokada migracji**
  (wiele instancji nie zastosuje migracji równocześnie).
- Do zmiany schematu używa się osobnej tożsamości z uprawnieniami DDL, a aplikacja działa na
  koncie z uprawnieniami tylko do danych.

## Zmiany w EF Core 9 i 10

- **Oczekujące zmiany modelu = wyjątek.** `Migrate()` i `database update` rzucają wyjątek, jeśli
  model zmienił się od ostatniej migracji (`PendingModelChangesWarning`). Częsta przyczyna to
  niedeterministyczny model, np. `HasData` z `DateTime.Now` lub `Guid.NewGuid()`.
- **Blokada migracji**: `Migrate`/`MigrateAsync`, bundle i `database update` zakładają blokadę
  na bazie. Opakowanie `MigrateAsync` we własną transakcję rzuca wyjątek
  (`MigrationsUserTransactionWarning`).
- W EF Core 9 wszystkie oczekujące migracje szły w jednej transakcji, a **EF Core 10 wrócił do
  osobnej transakcji na każdą migrację**.
- **Seeding**: `UseSeeding` / `UseAsyncSeeding` (od EF 9) to zalecany sposób na dane początkowe
  zależne od logiki. `HasData` nadaje się tylko do statycznych danych.

## Praca w zespole

- Dwie gałęzie z nowymi migracjami powodują konflikt w **snapshocie modelu**. Po scaleniu trzeba
  rozwiązać konflikt w snapshocie (a czasem usunąć własną migrację i wygenerować ją ponownie na
  bazie scalonego kodu), sprawdzając kolejność migracji.
- Nie edytuje się migracji już zastosowanych na współdzielonych środowiskach. Zmiany wprowadza
  się nową migracją.
- `migrations remove` usuwa tylko ostatnią migrację, i to dopóki nie została zastosowana.
- Nie mieszaj `EnsureCreated()` z migracjami: tworzy schemat z pominięciem migracji, a potem
  `Migrate()` zawodzi.

## Zmiany bez przestojów (expand/contract)

Przy wdrożeniach bez przestojów stara i nowa wersja aplikacji działają jednocześnie, więc zmiany
niszczące rozkłada się na etapy:

1. **Expand**: dodaj nową kolumnę (nullable), aplikacja zapisuje do obu, dane przenosi migracja lub job.
2. Przełącz odczyt na nową kolumnę.
3. **Contract**: w kolejnym wydaniu usuń starą kolumnę.

## Źródła

- [Migrations overview](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [Managing migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/managing)
- [Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)
- [Migrations in team environments](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams)
- [Breaking changes in EF Core 9](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-9.0/breaking-changes)

## Pytania

### Czym są migracje EF Core i z czego się składają? {junior}

To wersjonowany opis zmian schematu bazy, generowany z różnicy między modelem a ostatnim stanem.
Każda migracja to klasa z metodami `Up` i `Down` oraz plik `Designer`. Projekt zawiera też
`ModelSnapshot`, czyli migawkę modelu po ostatniej migracji. W bazie tabela `__EFMigrationsHistory`
zapamiętuje, które migracje zostały zastosowane.

### Do czego służy plik `ModelSnapshot` i dlaczego jest ważny? {mid}

To pełny opis modelu po ostatniej migracji. Przy `migrations add` EF porównuje z nim bieżący model,
a nie bazę danych, i generuje różnicę. Musi być wersjonowany w repozytorium. Konflikty w nim przy
scalaniu gałęzi to sygnał, że dwie migracje powstały równolegle i trzeba je uzgodnić. Brak lub
nieaktualny snapshot sprawia, że kolejna migracja zawiera złe operacje.

### Jak wdrażać migracje na produkcję? {mid}

Najczęściej przez **bundle** (`dotnet ef migrations bundle`) uruchamiany w CI/CD jako jednorazowy
krok wdrożenia, albo przez **skrypt SQL** (`migrations script --idempotent`), gdy SQL musi przejrzeć
DBA. `dotnet ef database update` służy do developmentu. Wywołanie `MigrateAsync()` przy starcie
aplikacji jest możliwe, ale wymaga, by aplikacja miała uprawnienia DDL, utrudnia przegląd i wycofanie
zmian, a przy wielu instancjach polega na blokadzie migracji (EF 9+).

### Czym jest skrypt idempotentny? {mid}

To skrypt SQL, który przed każdą migracją sprawdza w `__EFMigrationsHistory`, czy została już
zastosowana, i wykonuje tylko brakujące. Można go uruchomić na bazach w różnych stanach (np. na kilku
środowiskach) bez znajomości ostatniej zastosowanej migracji. Wsparcie zależy od providera, np. SQLite
go nie obsługuje.

### Co się stanie, gdy zmienisz nazwę właściwości encji i wygenerujesz migrację? {mid}

EF próbuje wykryć zmianę nazwy i zwykle generuje `RenameColumn`, ale to heurystyka. Przy bardziej
złożonych zmianach może wygenerować `DropColumn` + `AddColumn`, co oznacza **utratę danych**. Dlatego
każdą migrację trzeba przejrzeć przed zatwierdzeniem, a w razie potrzeby ręcznie zamienić operacje na
`RenameColumn` albo dodać `migrationBuilder.Sql(...)` przenoszące dane.

### Dlaczego od EF Core 9 `Migrate()` może rzucić wyjątek o „pending model changes”? {mid}

EF sprawdza, czy model aplikacji odpowiada ostatniej migracji. Jeśli ktoś zmienił encję i zapomniał
dodać migrację, dostaje wyjątek `PendingModelChangesWarning` zamiast bazy niezgodnej z kodem. Częste
przyczyny to brak migracji po zmianie, brak snapshotu albo niedeterministyczny model (np. `HasData`
z `DateTime.Now`). W CI można to wykrywać przez `dotnet ef migrations has-pending-model-changes`.

### Jak kilka instancji aplikacji może bezpiecznie stosować migracje przy starcie? {senior}

Od EF Core 9 `Migrate`/`MigrateAsync` zakładają blokadę na poziomie bazy, więc tylko jedna instancja
stosuje migracje, a pozostałe czekają. Nie wolno opakowywać tego we własną transakcję, bo EF rzuci
wyjątek. Mimo blokady lepszą praktyką jest osobny krok wdrożenia (bundle jako job), który uruchamia się
raz, przed nową wersją aplikacji, z osobnymi uprawnieniami. Na SQLite porzucona blokada może zablokować
kolejne migracje.

### Jak rozwiązać konflikt migracji między dwiema gałęziami? {senior}

Konflikt zwykle pojawia się w `ModelSnapshot`. Najprostsza droga: przyjąć migracje z gałęzi docelowej,
usunąć własną niezastosowaną migrację (`migrations remove` lub ręcznie, łącznie z przywróceniem
snapshotu), zastosować zmiany i wygenerować ją ponownie na scalonym kodzie. Jeśli migracje są
niezależne, wystarczy poprawnie scalić snapshot i sprawdzić, czy `has-pending-model-changes` nie zgłasza
różnic.

### Jak wprowadzić zmianę niszczącą (np. zmianę nazwy kolumny) bez przestoju? {senior}

Wzorcem expand/contract w kilku wydaniach. Najpierw dodaje się nową kolumnę i zapisuje do obu, a dane
przenosi migracja lub zadanie w tle. Następnie odczyt przełącza się na nową kolumnę. Dopiero w kolejnym
wydaniu, gdy żadna działająca wersja nie używa starej kolumny, usuwa się ją. Pojedyncza migracja z
`RenameColumn` zepsułaby instancje starej wersji działające podczas wdrożenia.

### Czym różni się `HasData` od `UseSeeding` / `UseAsyncSeeding`? {mid}

`HasData` definiuje statyczne dane w modelu. Stają się częścią migracji (`InsertData`), wymagają podania
kluczy i muszą być deterministyczne, więc np. `DateTime.Now` wywoła wyjątek o zmianach modelu.
`UseSeeding`/`UseAsyncSeeding` (EF 9+) to kod uruchamiany po `Migrate`/`EnsureCreated`, który może
sprawdzać istniejące dane i używać dowolnej logiki. To zalecany sposób dla danych innych niż prosta,
stała tabela słownikowa.
