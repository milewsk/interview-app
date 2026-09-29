# Repozytorium i jednostka pracy (repository, unit of work) {mid}

**Repozytorium** pośredniczy między domeną a warstwą mapowania danych i działa **jak kolekcja obiektów domenowych w pamięci**:
`Add`, `GetById`, `Find(...)`, bez ujawniania SQL ani szczegółów ORM. **Jednostka pracy** śledzi wszystko, co zmieniło się
w trakcie transakcji biznesowej, i **zapisuje to naraz**, w jednej transakcji. Oba wzorce pochodzą z *Patterns of Enterprise
Application Architecture* Martina Fowlera, a w .NET są przedmiotem długiej debaty, bo **`DbContext` z EF Core już implementuje
oba**: dokumentacja API EF Core mówi, że „DbContext is a combination of the Unit Of Work and Repository patterns”.

## DbContext jako jednostka pracy

```csharp
public class OrderRepository(ShopDb db)
{
    public void Add(Order o) => db.Orders.Add(o);
    public Task<Order?> GetByIdAsync(int id) => db.Orders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id);
    public Task<List<Order>> ListAsync(Specification<Order> spec) => db.Orders.Where(spec.ToExpression()).ToListAsync();
}

public class UnitOfWork(ShopDb db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => db.SaveChangesAsync(ct);
}
```

Repozytoria współdzielą jeden `DbContext` o zasięgu scoped, więc współdzielą jego change tracker. Sprawdzone: dodanie klienta
przez jedno repozytorium i trzech zamówień przez drugie, a potem jednokrotne `SaveChangesAsync`, zapisało 4 wiersze. Gdy jedna ze
zmian naruszała klucz obcy, `SaveChanges` się nie powiodło i **nic** nie zostało zapisane, nawet poprawny klient, bo
`SaveChanges` opakowuje wszystkie swoje polecenia w transakcję.

## Kiedy repozytorium pomaga, a kiedy szkodzi

Repozytorium wnosi wartość, gdy:

- wyraża **intencję domenową** (`GetOverdueInvoices()`, `GetWithLines(id)`) i trzyma szczegóły zapytań, `Include` i wybór
  śledzenia w jednym miejscu;
- działa per **korzeń agregatu** w DDD, wczytując i zapisując agregat w całości, żeby nie dało się ominąć niezmienników;
- ukrywa przed domeną technologię utrwalania (np. Dapper dla części agregatów, EF dla innych albo dokumentowa baza danych).

Szkodzi, gdy jest **generycznym opakowaniem `IRepository<T>`** na `DbSet<T>`, które tylko ponownie udostępnia `Add`, `Remove`,
`GetAll`:

- Zwracanie `IEnumerable<T>` odbiera składalność. Sprawdzone: filtrowanie wyniku `IEnumerable<Order> GetAll()` przez `Where`
  wczytało całą tabelę, a wygenerowany SQL **nie miał `WHERE`**; ten sam filtr przez specyfikację dał SQL z `WHERE`.
- Zwracanie `IQueryable<T>` zachowuje wydajność zapytań, ale **przecieka** ORM: wywołujący składają zapytania specyficzne dla EF,
  a abstrakcja niczego nie ukrywa.
- Blokuje funkcje EF (projekcje, `AsNoTracking`, `Include`, `ExecuteUpdate`, zapytania dzielone), chyba że każdą z nich się
  ponownie udostępni.
- Często uzasadnia się je testowalnością, ale mockowanie repozytorium ukrywa błędy translacji zapytań; dokumentacja EF Core
  zaleca testy na prawdziwej bazie albo świadome użycie repozytorium jako dublera testowego i odradza dostawcę in-memory.

Częste pragmatyczne podejście: `DbContext` bezpośrednio w handlerach zapytań (strona odczytu, projekcje do DTO), a repozytoria
dla konkretnych agregatów tylko po stronie zapisu.

## Źródła

- [Repository (Martin Fowler, PoEAA)](https://martinfowler.com/eaaCatalog/repository.html)
- [Unit of Work (Martin Fowler, PoEAA)](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [DbContext class: remarks](https://learn.microsoft.com/en-us/dotnet/api/microsoft.entityframeworkcore.dbcontext)
- [Designing the infrastructure persistence layer (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
- [Choosing a testing strategy (EF Core)](https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy)
- [Transactions (EF Core)](https://learn.microsoft.com/en-us/ef/core/saving/transactions)

## Pytania

### Czym jest wzorzec repozytorium? {junior}

To wzorzec, który umieszcza dostęp do danych za interfejsem wyglądającym jak kolekcja obiektów domenowych: dodaje się, usuwa, pobiera po identyfikatorze i odpytuje obiekty bez
pisania SQL i bez wiedzy, jak są przechowywane. Oddziela logikę domenową i aplikacyjną od szczegółów utrwalania, nadaje zapytaniom znaczące nazwy i trzyma kod dostępu do danych
w jednym miejscu.

### Czym jest wzorzec jednostki pracy? {junior}

To wzorzec, który śledzi wszystkie obiekty dodane, zmienione i usunięte w trakcie operacji biznesowej i na końcu zatwierdza zmiany razem, jako jedną transakcję. Unika wielu małych
wywołań bazy i gwarantuje, że albo zapisane zostaną wszystkie zmiany operacji, albo żadna. Change tracker i `SaveChanges` w EF Core to jednostka pracy.

### Dlaczego `DbContext` uważa się za repozytorium i jednostkę pracy? {mid}

`DbSet<T>` zachowuje się jak repozytorium: dodaje się i usuwa encje oraz odpytuje je LINQ bez pisania SQL. `DbContext` śledzi zmiany wszystkich wczytanych i dodanych encji,
a `SaveChanges` zapisuje je w jednej transakcji, co jest jednostką pracy. Dokumentacja API EF Core wprost mówi, że `DbContext` łączy wzorce Unit Of Work i Repository.

### Czy warto kłaść generyczne repozytorium na EF Core? {mid}

Zwykle nie. Generyczne `IRepository<T>` z `GetAll`, `Add` i `Remove` powiela to, co już robi `DbSet<T>`, i albo ukrywa potrzebne funkcje EF (projekcje, `AsNoTracking`, `Include`,
aktualizacje masowe), albo przecieka je, zwracając `IQueryable<T>`. Konkretne repozytoria per agregat, wyrażające operacje domenowe, mogą być warte zachodu; cienkie generyczne
opakowanie głównie dodaje kod, nie dodając abstrakcji.

### Co jest nie tak z repozytorium zwracającym `IEnumerable<T>` z `GetAll()`? {mid}

Zapytanie wykonuje się, gdy wywołujący je wylicza, ale kolejne wywołania `Where`, `OrderBy` czy `Take` na `IEnumerable<T>` działają w pamięci, więc najpierw wczytywana jest cała
tabela. W teście filtrowanie `GetAll()` przez `Where` dało SQL bez klauzuli `WHERE`. Filtry trzeba stosować wewnątrz repozytorium (parametry metod, specyfikacje) albo metoda musi
zwracać `IQueryable<T>`.

### Jakie są zalety i wady zwracania `IQueryable<T>` z repozytorium? {senior}

Zaleta: wywołujący mogą składać filtry, sortowanie, stronicowanie i projekcje tłumaczone na SQL, więc zapytania pozostają wydajne. Wada: repozytorium przestaje hermetyzować dostęp do
danych: logika zapytań rozchodzi się po wywołujących, zależą oni od translacji LINQ w ORM (zapytanie może zawieść w czasie wykonania, jeśli nie da się go przetłumaczyć), a czas życia
kontekstu musi być dłuższy niż zapytania. Wiele zespołów tego unika i używa specyfikacji albo dedykowanych metod zapytań.

### Jak repozytoria i jednostka pracy współpracują w jednej operacji? {mid}

Kilka repozytoriów współdzieli jedną jednostkę pracy, w EF Core jeden `DbContext` o zasięgu scoped na żądanie, więc wszystkie ich zmiany są śledzone razem. Serwis aplikacyjny wczytuje
agregaty przez repozytoria, wywołuje metody domenowe i na końcu raz wywołuje `SaveChanges` na jednostce pracy. W teście klient dodany przez jedno repozytorium i zamówienia przez drugie
zostały zapisane razem, a gdy jedna zmiana naruszyła ograniczenie, nie zapisała się żadna.

### Dlaczego w DDD repozytoria działają per korzeń agregatu? {senior}

Agregat to granica spójności: jego niezmienników pilnuje korzeń, a wczytuje się go i zapisuje w całości. Repozytorium per korzeń agregatu (a nie per tabelę) uniemożliwia wczytanie
albo zmianę wewnętrznej encji bezpośrednio z pominięciem reguł korzenia i określa dokładnie, co jest wczytywane (korzeń z dziećmi). Do innych agregatów odwołuje się przez identyfikator
i wczytuje przez ich własne repozytoria.

### Czy repozytoria ułatwiają testowanie? {mid}

Ułatwiają zastąpienie dostępu do danych atrapą w testach jednostkowych logiki biznesowej, co jest ich główną praktyczną korzyścią. Mockowane repozytorium nie testuje jednak
prawdziwych zapytań, więc błędy translacji LINQ, mapowań czy ograniczeń umykają. Dokumentacja EF Core zaleca testy integracyjne na prawdziwym silniku bazy (np. w kontenerze)
i przedstawia repozytorium jako jeden ze sposobów tworzenia dublera testowego, odradzając dostawcę in-memory.

### Jak zaprojektować dostęp do danych w aplikacji CQRS? {senior}

Rozdzielić obie strony: po stronie zapisu używać repozytoriów agregatów i jednostki pracy (`DbContext`), żeby wczytywać agregaty, pilnować niezmienników i atomowo zapisywać zmiany. Po
stronie odczytu pominąć repozytoria i odpytywać bezpośrednio projekcjami z `DbContext` (`Select` do DTO, `AsNoTracking`), Dapperem albo widokami bazy, zoptymalizowanymi pod każdy
ekran. Chroni to logikę domenową, a odczyty pozostają proste i szybkie.
