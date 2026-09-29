# Ładowanie powiązanych danych i problem N+1 {mid}

EF Core nie ładuje nawigacji (`blog.Posts`, `post.Author`) automatycznie. Są trzy sposoby
ich wczytania oraz czwarty, często najlepszy: **projekcja**.

| Sposób | Jak | Liczba zapytań |
| --- | --- | --- |
| Eager loading | `Include` / `ThenInclude` | 1 (albo kilka przy `AsSplitQuery`) |
| Explicit loading | `Entry(x).Collection(...).LoadAsync()` | 1 na każde wywołanie |
| Lazy loading | proxy lub `ILazyLoader`, dostęp do nawigacji | 1 na każdy pierwszy dostęp |
| Projekcja | `Select(x => new Dto { ... })` | 1, tylko potrzebne kolumny |

## Eager loading: `Include`

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts)
        .ThenInclude(p => p.Author)
    .Include(b => b.Owner)
    .ToListAsync();
```

**Filtered include** pozwala ograniczyć ładowaną kolekcję:

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts.Where(p => p.IsPublished).OrderByDescending(p => p.Date).Take(5))
    .ToListAsync();
```

Uwaga: przy zapytaniach **śledzących** encje wcześniej wczytane do kontekstu też pojawią się
w nawigacji (relationship fixup), nawet jeśli nie spełniają filtra.

## Problem N+1

Jedno zapytanie po listę (1), a potem osobne zapytanie dla **każdego** elementu (N):

```csharp
var blogs = await db.Blogs.ToListAsync();                 // 1 zapytanie
foreach (var blog in blogs)
    await db.Entry(blog).Collection(b => b.Posts).LoadAsync(); // + N zapytań
```

Z **lazy loadingiem** ten sam problem jest niewidoczny w kodzie: zwykłe `blog.Posts.Count`
w pętli (albo w widoku lub serializatorze) wysyła zapytanie przy każdej iteracji. Dla 100 blogów
daje to 101 zapytań zamiast jednego.

**Jak wykryć:** logowanie SQL (`LogTo(Console.WriteLine)`, poziom `Information` dla kategorii
`Microsoft.EntityFrameworkCore.Database.Command`), profiler bazy, APM lub OpenTelemetry.
Sygnałem ostrzegawczym jest wiele identycznych zapytań różniących się tylko parametrem.

**Jak naprawić:** `Include`, projekcja albo wczytanie wszystkich dzieci jednym zapytaniem
(`Where(p => blogIds.Contains(p.BlogId))`).

## Projekcja: najczęściej najlepszy wybór do odczytu

```csharp
var list = await db.Blogs
    .Select(b => new BlogSummary(b.Name, b.Posts.Count, b.Owner.Name))
    .ToListAsync();
```

EF tłumaczy nawigacje wewnątrz `Select` na `JOIN`y lub podzapytania, pobiera **tylko potrzebne
kolumny** i nie tworzy śledzonych encji. `Include` nie jest wtedy potrzebne: jest ignorowane,
gdy wynik nie zawiera encji.

## Lazy loading

Włącza się go przez pakiet `Microsoft.EntityFrameworkCore.Proxies` i `UseLazyLoadingProxies()`
(nawigacje muszą być `virtual`) albo przez wstrzyknięcie `ILazyLoader`. Jest wygodny, ale:

- łatwo o N+1,
- każde ładowanie to synchroniczne zapytanie, bez `await`,
- po zwolnieniu kontekstu dostęp do niewczytanej nawigacji rzuca `InvalidOperationException`
  (ostrzeżenie `LazyLoadOnDisposedContextWarning` jest domyślnie traktowane jako błąd),
- od EF Core 7 działa także dla encji z zapytań `AsNoTracking`, więc wyłączenie śledzenia
  nie chroni przed N+1,
- serializacja encji do JSON może przejść po nawigacjach i wczytać pół bazy (albo zapętlić się).

W aplikacjach webowych zwykle się go unika.

## Eksplozja kartezjańska i `AsSplitQuery`

Kilka `Include` kolekcji na tym samym poziomie w jednym zapytaniu daje `JOIN`y, w których wiersze
się mnożą. 10 postów × 10 tagów oznacza 100 wierszy na blog, a kolumny bloga są powtarzane
w każdym z nich.

```csharp
var blogs = await db.Blogs
    .Include(b => b.Posts)
    .Include(b => b.Tags)
    .AsSplitQuery()        // 3 zapytania: Blogs, Posts, Tags
    .ToListAsync();
```

- **Single query** (domyślnie): jedno zapytanie i spójny odczyt, ale ryzyko eksplozji danych.
- **Split query**: kilka zapytań bez duplikacji, ale więcej round-tripów i **brak gwarancji
  spójności**, jeśli dane zmieniają się między zapytaniami (chyba że w transakcji
  z odpowiednią izolacją). EF Core 10 poprawił spójność sortowania w split queries z `Take`/`Skip`.
- Globalnie: `UseSqlServer(cs, o => o.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery))`,
  a lokalnie `AsSingleQuery()`.
- Gdy EF wykryje kilka kolekcji w jednym zapytaniu, loguje ostrzeżenie `MultipleCollectionIncludeWarning`.

## Relationship fixup

Kontekst automatycznie łączy śledzone encje. Jeśli najpierw wczytasz posty bloga, a potem sam blog,
`blog.Posts` będzie już zawierać te posty, bez `Include`. Bywa to wygodne, ale może też zaskoczyć,
bo nawigacja zawiera tylko to, co akurat jest w kontekście.

## Parametryzowane kolekcje w EF Core 10

`Where(b => ids.Contains(b.Id))` jest w EF Core 10 domyślnie tłumaczone na osobne parametry
`IN (@ids1, @ids2, …)` z „dopełnieniem” liczby parametrów. Plany zapytań lepiej się wtedy
cache'ują, a optymalizator zna liczność kolekcji. Strategię można zmienić globalnie
(`UseParameterizedCollectionMode`) albo lokalnie (`EF.Constant`, `EF.Parameter`).

## Źródła

- [Loading related data](https://learn.microsoft.com/en-us/ef/core/querying/related-data/)
- [Eager loading](https://learn.microsoft.com/en-us/ef/core/querying/related-data/eager)
- [Lazy loading](https://learn.microsoft.com/en-us/ef/core/querying/related-data/lazy)
- [Single vs. split queries](https://learn.microsoft.com/en-us/ef/core/querying/single-split-queries)
- [Efficient querying](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying)

## Pytania

### Czym jest problem N+1 i jak go wykryć w EF Core? {junior}

To sytuacja, w której po jednym zapytaniu o listę (1) wykonujemy osobne zapytanie dla każdego
elementu (N), np. ładując w pętli posty każdego bloga. Najczęściej wynika z lazy loadingu albo
explicit loadingu w pętli. Wykrywa się go, logując SQL (`LogTo`, logi kategorii
`Microsoft.EntityFrameworkCore.Database.Command`), profilerem bazy lub APM. Widać wtedy serię
identycznych zapytań z różnym parametrem.

### Jak naprawić N+1? {mid}

Pobrać dane jednym zapytaniem: `Include`/`ThenInclude`, projekcją `Select` do DTO (EF zrobi `JOIN`
lub podzapytanie) albo zbiorczym zapytaniem o dzieci (`Where(p => ids.Contains(p.BlogId))`)
i złożeniem wyników w pamięci. Lazy loading najlepiej wyłączyć albo pilnować, żeby nie był używany
w pętlach.

### Czym różnią się eager, explicit i lazy loading? {junior}

**Eager** (`Include`) ładuje powiązane dane razem z główną encją, w tym samym zapytaniu (lub
w zapytaniach dzielonych). **Explicit** ładuje je później, na żądanie: `Entry(e).Collection(...).LoadAsync()`
albo `.Reference(...)`. **Lazy** ładuje je automatycznie przy pierwszym dostępie do nawigacji,
przez proxy lub `ILazyLoader`. Jest to wygodne, ale ukrywa zapytania i sprzyja N+1.

### Dlaczego projekcja do DTO jest często lepsza niż `Include`? {mid}

Pobiera tylko potrzebne kolumny, a nie całe encje. Nawigacje w `Select` EF tłumaczy na `JOIN`y lub
podzapytania, a agregaty (`Count`, `Sum`) liczy baza. Wynik nie jest śledzony, więc nie ma kosztu
change trackera. `Include` ma sens, gdy potrzebujemy pełnych encji do modyfikacji i zapisu.

### Czym jest eksplozja kartezjańska i jak jej zapobiec? {mid}

Gdy w jednym zapytaniu dołączamy kilka kolekcji na tym samym poziomie (np. `Include(Posts)`
i `Include(Tags)`), `JOIN` mnoży wiersze: posty × tagi na każdy blog, a kolumny rodzica się powtarzają.
Zapobiega się temu przez `AsSplitQuery()` (osobne zapytanie na każdą kolekcję), projekcję zwracającą
tylko potrzebne dane albo rezygnację z ładowania jednej z kolekcji.

### Jakie są wady `AsSplitQuery()`? {senior}

Więcej round-tripów do bazy. Brak gwarancji spójności: jeśli między zapytaniami ktoś zmieni dane,
wyniki mogą do siebie nie pasować, chyba że wszystko dzieje się w transakcji z odpowiednim poziomem
izolacji (np. snapshot). Przy `Skip`/`Take` potrzebne jest deterministyczne sortowanie. EF Core 10
poprawił spójność `ORDER BY` między zapytaniami dzielonymi.

### Dlaczego lazy loading bywa niebezpieczny w aplikacjach webowych? {mid}

Zapytania są ukryte za zwykłym dostępem do właściwości, więc łatwo o N+1 w pętli, widoku albo podczas
serializacji do JSON (serializator przechodzi po nawigacjach i może wczytać ogromny graf lub się
zapętlić). Zapytania lazy loadingu są synchroniczne. Od EF Core 7 działa też dla encji `AsNoTracking`,
więc wyłączenie śledzenia nie chroni przed N+1. Po zwolnieniu kontekstu dostęp do niewczytanej
nawigacji rzuca `InvalidOperationException` (`LazyLoadOnDisposedContextWarning`).

### Czym jest filtered include? {mid}

To `Include` z operatorami na kolekcji: `Where`, `OrderBy`, `Skip`, `Take`, np.
`Include(b => b.Posts.Where(p => p.IsPublished).Take(5))`. Ładuje tylko wybrane elementy. W zapytaniach
śledzących nawigacja może jednak zawierać też inne encje, które były już wcześniej wczytane do
kontekstu (relationship fixup).

### Czym jest relationship fixup? {mid}

Kontekst automatycznie uzupełnia nawigacje między śledzonymi encjami na podstawie kluczy obcych. Jeśli
posty bloga zostały wczytane wcześniej, to po wczytaniu bloga `blog.Posts` będzie je zawierać bez
`Include`. Nawigacja odzwierciedla więc stan kontekstu, a nie pełen stan bazy.

### Jak EF Core 10 tłumaczy `ids.Contains(x.Id)` i dlaczego to ważne? {senior}

Domyślnie na listę osobnych parametrów `IN (@ids1, @ids2, …)`, dopełnianą do stałych rozmiarów.
Wcześniej wartości były wstawiane jako stałe (każda lista to nowe zapytanie i nowy plan) albo, od
EF 8, przekazywane jako jeden parametr JSON (`OPENJSON`), przez co optymalizator nie znał liczności.
Nowe podejście ogranicza liczbę planów i daje optymalizatorowi informację o rozmiarze. W razie potrzeby
strategię zmienia się przez `UseParameterizedCollectionMode`, `EF.Constant` lub `EF.Parameter`.
