# Wydajność zapytań w EF Core {senior}

Większość problemów z wydajnością EF Core nie wynika z samego EF, tylko z tego, **o co zapytania proszą bazę**: za dużo
wierszy, za dużo kolumn, za dużo wywołań albo brak indeksów. Podejście jest zawsze takie samo: **najpierw zmierz**,
znajdź kosztowne zapytanie, popraw jego kształt i zmierz ponownie.

## 1. Zmierz i znajdź winowajcę

- Loguj SQL z czasami (`LogTo` albo kategoria `Microsoft.EntityFrameworkCore.Database.Command`): każde polecenie jest
  logowane z czasem wykonania, np. `Executed DbCommand (58ms)`.
- `TagWith("Dashboard: top orders")` dodaje komentarz (`-- Dashboard: top orders`) do SQL, więc zapytanie da się
  odnaleźć w narzędziach monitorujących bazę i w logach.
- Sprawdź **plan wykonania** w bazie (SQL Server: rzeczywisty plan wykonania, Query Store; PostgreSQL:
  `EXPLAIN ANALYZE`), żeby zobaczyć skany tabel i brakujące indeksy.
- Metryki i zdarzenia EF Core (`dotnet-counters`, OpenTelemetry) pokazują liczbę zapytań, współczynnik trafień cache
  zapytań i częstotliwość `SaveChanges`.

## 2. Pobieraj tylko to, czego potrzebujesz

W teście na 50 000 wierszy (SQLite, średnia z 3 przebiegów):

| Zapytanie | Czas | Zaalokowano |
|---|---|---|
| `db.Orders.ToListAsync()` (encje śledzone) | ~294 ms | ~69 MB |
| `AsNoTracking()` | ~95 ms | ~37 MB |
| `Select(o => new { o.Id, o.Total })` | ~46 ms | ~16 MB |

- **Projekcje** (`Select` do DTO) czytają tylko potrzebne kolumny i nie są śledzone, więc to najlepszy wybór dla widoków
  tylko do odczytu i API.
- **`AsNoTracking()`** przy zapytaniach tylko do odczytu pomija tworzenie wpisów change trackera i migawek.
- `AsNoTracking` nie rozwiązuje tożsamości, więc ten sam powiązany wiersz wczytany kilka razy daje **osobne instancje**
  (w teście dwa zamówienia jednego klienta miały dwa różne obiekty `Customer`). `AsNoTrackingWithIdentityResolution()`
  usuwa duplikaty bez śledzenia.
- Filtruj i stronicuj w bazie (`Where`, `Skip`/`Take`), nigdy po `ToList()`.

## 3. Mniej wywołań bazy

- Unikaj **N+1**: wczytuj dane powiązane przez `Include` lub projekcje zamiast lazy loadingu w pętlach (zob. temat
  o wczytywaniu danych powiązanych).
- Uważaj na **eksplozję kartezjańską** przy kilku `Include` kolekcji: używaj `AsSplitQuery()` albo projekcji.
- `SaveChanges` **grupuje** wstawienia i aktualizacje w niewielką liczbę poleceń, a `ExecuteUpdate`/`ExecuteDelete`
  zmieniają wiele wierszy jedną instrukcją bez ich wczytywania.

## 4. Indeksy i kształt zapytania

EF nie tworzy indeksów pod twoje filtry (tylko dla kluczy obcych i skonfigurowanych indeksów). `Where` albo `OrderBy`
na nieindeksowanej kolumnie skanuje całą tabelę. Indeksy dodaje się przez `HasIndex` na podstawie rzeczywistych
zapytań, a unika wyrażeń uniemożliwiających użycie indeksu, jak funkcja na kolumnie (`LOWER(Name) = ...`) czy
`LIKE '%tekst%'`.

## 5. Duże zbiory wyników: buforowanie a strumieniowanie

`ToListAsync()` wczytuje wszystkie wiersze do pamięci przed zwróceniem wyniku. `AsAsyncEnumerable()` (albo `foreach`
po zapytaniu) **strumieniuje** wiersze jeden po drugim, więc przetwarzanie zaczyna się od pierwszego wiersza, a zużycie
pamięci pozostaje niskie. W teście przetwarzanie zaczęło się, zanim wczytano wszystkie 50 000 wierszy. Strumieniowanie
dłużej trzyma otwarte połączenie, więc nie wykonuje się przy nim wolnej pracy na każdym wierszu.

## 6. Narzut EF w gorących ścieżkach

Zwykle pomijalny w porównaniu z I/O, ale przy bardzo dużej przepustowości:

- **Zapytania kompilowane** (`EF.CompileAsyncQuery`) pomijają wyszukiwanie zapytania w cache EF, budując delegat raz.
- **Parametry, nie stałe**: dynamicznie budowane zapytania ze stałymi dają inny SQL dla każdej wartości i niweczą
  zarówno cache zapytań EF, jak i cache planów bazy.
- **Pula kontekstów** zmniejsza koszt przygotowania kontekstu.
- **Modele skompilowane** (`dotnet ef dbcontext optimize`) skracają start przy bardzo dużych modelach (setki encji), ale
  mają ograniczenia (np. brak globalnych filtrów zapytań).

## Źródła

- [Performance diagnosis](https://learn.microsoft.com/en-us/ef/core/performance/performance-diagnosis)
- [Efficient querying](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying)
- [Advanced performance topics](https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics)
- [Tracking vs. no-tracking queries](https://learn.microsoft.com/en-us/ef/core/querying/tracking)
- [Query tags](https://learn.microsoft.com/en-us/ef/core/querying/tags)

## Pytania

### Jak znaleźć wolne zapytanie w aplikacji z EF Core? {mid}

Włączyć logowanie SQL z czasami (`LogTo` albo kategoria logowania `Database.Command`), gdzie każde polecenie pokazuje czas wykonania, i dodać `TagWith` do
ważnych zapytań, żeby dało się je znaleźć w narzędziach bazy. Potem przeanalizować plan wykonania w bazie (Query Store w SQL Server, `EXPLAIN ANALYZE`
w PostgreSQL) pod kątem skanów tabel i brakujących indeksów. Narzędzia APM i metryki EF pokazują, które zapytania wykonują się najczęściej lub najdłużej.

### Dlaczego `AsNoTracking()` jest szybsze? {junior}

Zapytanie śledzące tworzy wpis change trackera dla każdej encji, zapisuje migawkę jej oryginalnych wartości i wykonuje rozwiązywanie tożsamości.
`AsNoTracking` pomija to wszystko, więc zużywa mniej pamięci i CPU: w teście na 50 000 wierszy było około 3 razy szybsze i alokowało o połowę mniej. Służy
do danych, które nie będą modyfikowane w tym samym kontekście, np. list i szczegółów zwracanych przez API.

### Czym różni się `AsNoTracking` od `AsNoTrackingWithIdentityResolution`? {senior}

`AsNoTracking` tworzy nowy obiekt dla każdego wiersza, więc ta sama powiązana encja wczytana kilka razy (np. jeden klient wielu zamówień przy `Include`)
daje osobne instancje ze zduplikowanymi danymi. `AsNoTrackingWithIdentityResolution` używa podczas zapytania tymczasowej mapy tożsamości, więc ten sam
klucz daje tę samą instancję, ale potem nadal nie śledzi encji. Kosztuje nieco więcej niż zwykłe `AsNoTracking`.

### Dlaczego projekcja do DTO to zwykle najszybszy sposób odczytu danych? {mid}

Projekcja czyta tylko wskazane kolumny, więc mniej danych jest przesyłanych i materializowanych, a baza czasem może użyć indeksu pokrywającego. Wyniki
nie są encjami, więc nigdy nie są śledzone, a dane powiązane można spłaszczyć w tym samym zapytaniu zamiast używać `Include`. W teście projekcja
2 kolumn na 50 000 wierszy była dwa razy szybsza niż `AsNoTracking` na całych encjach.

### Kiedy strumieniować wyniki przez `AsAsyncEnumerable()` zamiast `ToListAsync()`? {mid}

Gdy zbiór wyników jest duży i da się go przetwarzać wiersz po wierszu, np. eksport do pliku albo wysyłka do kolejki. Strumieniowanie nie trzyma wszystkich
wierszy w pamięci i pozwala zacząć przetwarzanie od pierwszego wiersza. Wady: połączenie i czytnik pozostają otwarte podczas przetwarzania, a na tym samym
kontekście nie da się w tym czasie wykonać innych zapytań, więc należy unikać wolnej pracy na każdym wierszu.

### Czym są zapytania kompilowane i kiedy się opłacają? {senior}

`EF.CompileAsyncQuery` raz zamienia zapytanie LINQ w delegat, więc kolejne wykonania pomijają analizę drzewa wyrażeń i wyszukiwanie go w cache zapytań EF.
Zysk jest mały w wartościach bezwzględnych (mikrosekundy na zapytanie), więc ma znaczenie tylko dla bardzo gorących zapytań w serwisach o dużej
przepustowości. Wymagają prostych parametrów skalarnych i jednego modelu i nie działają z dynamicznie budowanymi zapytaniami.

### Dlaczego dynamicznie budowane zapytania ze stałymi szkodzą wydajności? {senior}

EF cache'uje przetłumaczone zapytania według kształtu drzewa wyrażeń. Jeśli wartość jest wstawiona jako stała (np. `Expression.Constant(url)`), każda
wartość tworzy nowe drzewo i nowy tekst SQL, więc EF za każdym razem kompiluje zapytanie od nowa, a baza tworzy osobny plan wykonania dla każdego wariantu,
co zaśmieca oba cache. Wartości powinny być przechwytywane jako parametry, co daje jedno zapytanie w cache i jeden plan.

### Czy EF Core tworzy indeksy dla kolumn używanych w `Where`? {junior}

Nie. Zgodnie z konwencją EF tworzy indeksy tylko dla kluczy obcych, a pozostałe trzeba skonfigurować jawnie przez `HasIndex` (lub `[Index]`) i dodać
migracją. Bez indeksu filtrowanie lub sortowanie po kolumnie wymaga przeskanowania całej tabeli. Indeksy dobiera się na podstawie rzeczywistych zapytań
i planów wykonania, bo każdy z nich spowalnia też zapisy.

### Co robi `TagWith`? {junior}

Dodaje komentarz do generowanego SQL (`-- Dashboard: top orders`), który pojawia się w logach, profilerach bazy i Query Store. Dzięki temu, gdy DBA albo
narzędzie monitorujące znajdzie wolną instrukcję, wiadomo, która część kodu ją wygenerowała. Nie zmienia wyników zapytania ani jego planu.

### Jakie optymalizacje na poziomie EF istnieją dla bardzo dużej przepustowości? {senior}

Pula kontekstów (niższy koszt przygotowania na żądanie), zapytania kompilowane dla gorących ścieżek, modele skompilowane dla dużych modeli z wolnym
startem oraz wyłączenie sprawdzania bezpieczeństwa wątkowego (`EnableThreadSafetyChecks(false)`) po dokładnym przetestowaniu. Dają zyski rzędu
mikrosekund, więc mają znaczenie dopiero wtedy, gdy same zapytania są optymalne: mniej wywołań, projekcje, odczyty bez śledzenia i właściwe indeksy dają
dużo większą poprawę.
