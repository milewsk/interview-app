# Optymalizacja zapytań i plany wykonania {senior}

SQL jest deklaratywny: mówisz, **co** chcesz dostać, a **optymalizator zapytań** decyduje, **jak** to zrobić, wybierając
metody dostępu, kolejność złączeń i algorytmy złączeń na podstawie statystyk i szacunków kosztów. Optymalizacja
zapytania oznacza czytanie jego **planu wykonania**, znalezienie miejsca, gdzie idzie czas lub I/O, i zmianę zapytania,
indeksów albo statystyk.

## Czytanie planu wykonania

| Baza | Plan szacowany | Plan rzeczywisty (zapytanie jest wykonywane) |
|---|---|---|
| PostgreSQL | `EXPLAIN` | `EXPLAIN (ANALYZE, BUFFERS)` |
| SQL Server | „Display Estimated Execution Plan”, `SET SHOWPLAN_XML ON` | „Include Actual Execution Plan”, `SET STATISTICS IO, TIME ON` |
| MySQL | `EXPLAIN` | `EXPLAIN ANALYZE` (8.0.18+) |
| SQLite | `EXPLAIN QUERY PLAN` | — |

Na co patrzeć:

- **Skany dużych tabel** tam, gdzie spodziewano się wyszukania w indeksie (`Seq Scan`, `Table Scan`,
  `Clustered Index Scan`).
- **Szacowane a rzeczywiste wiersze**: duża różnica oznacza, że optymalizator pracuje na błędnych informacjach i może
  wybrać zły plan. W teście przed zebraniem statystyk PostgreSQL szacował 1000 wierszy dla `total = 7`; po `ANALYZE`
  szacował 397, a faktycznie było 400.
- **„Rows removed by filter”**: wiele wierszy przeczytanych i odrzuconych (199 600 z 200 000) sugeruje brakujący albo
  nieużyteczny indeks.
- Kosztowne sortowania, operacje haszujące wylewające się na dysk, lookupy powtarzane tysiące razy i liczba
  **przeczytanych buforów/stron** (logiczne I/O bywa lepszą miarą niż czas).

## Algorytmy złączeń

| Algorytm | Kiedy jest dobry | Widziany w teście |
|---|---|---|
| **Nested loop** | małe wejście zewnętrzne i indeks na kolumnie złączenia po stronie wewnętrznej | jeden klient złączony z jego zamówieniami |
| **Hash join** | duże, nieposortowane wejścia, złączenie po równości; buduje tablicę haszującą z mniejszego | wszyscy klienci × wszystkie zamówienia, agregacja po kraju |
| **Merge join** | oba wejścia posortowane po kluczu złączenia (np. przez indeksy) | `customers.id = orders.id` z oboma kluczami głównymi |

Algorytm wybiera optymalizator; zły wybór zwykle wynika z błędnych szacunków liczby wierszy (nested loop po czymś, co
miało mieć 10 wierszy, a miało 100 000).

## Statystyki i cache planów

- Optymalizator opiera się na **statystykach** (liczba wierszy, rozkłady wartości, histogramy). Po dużych załadunkach lub
  zmianach mogą być nieaktualne: PostgreSQL odświeża je przez autovacuum/`ANALYZE`, SQL Server przez automatyczną
  aktualizację statystyk albo `UPDATE STATISTICS`.
- Bazy cache'ują plany sparametryzowanych zapytań. W SQL Server **parameter sniffing** oznacza, że plan jest kompilowany
  dla pierwszych wartości parametrów; jeśli dane są nierównomierne (jeden klient z milionem zamówień, większość z kilkoma),
  zapamiętany plan może być fatalny dla innych wartości. Środki zaradcze: `OPTION (RECOMPILE)`, `OPTIMIZE FOR`, wymuszenie
  planu w Query Store albo przebudowa zapytania.

## Typowe poprawki

- **Dodanie lub dopasowanie indeksu** dla selektywnych filtrów, złączeń i `ORDER BY ... LIMIT` (zob. temat o indeksach).
- **Sargowalne warunki**: bez funkcji i rzutowań na indeksowanych kolumnach, zakresy dat zamiast `YEAR(...)`, typy
  parametrów zgodne z typami kolumn (parametr `nvarchar` porównywany z kolumną `varchar` w SQL Server powoduje niejawną
  konwersję i skan).
- **Czytanie mniej**: tylko potrzebne kolumny, wczesne filtrowanie, indeksy pokrywające.
- **Paginacja keyset zamiast dużego `OFFSET`**: w teście strona 1 z `OFFSET 0` zajęła ~1,3 ms, `OFFSET 190000` ~46 ms
  (plan pokazuje 190 020 przeczytanych wierszy, żeby zwrócić 20), a `WHERE id > 190000 ORDER BY id LIMIT 20` ~1 ms.
- **Unikanie N+1** z aplikacji: jedno zapytanie ze złączeniem lub `IN` zamiast zapytania na każdy wiersz.
- **`OR` na różnych kolumnach**: PostgreSQL potrafi połączyć dwa indeksy (`BitmapOr`, sprawdzone), ale niektóre
  optymalizatory wracają do skanu, gdzie pomaga przepisanie na `UNION ALL` dwóch zapytań korzystających z indeksów.
- **`EXISTS` zamiast `COUNT(*) > 0`**, `UNION ALL` zamiast `UNION`, gdy duplikaty są niemożliwe, agregacja przed
  złączeniami.
- **Zapisy porcjami** i krótkie transakcje, żeby blokady trwały krótko.

Zawsze mierzy się przed i po, na realistycznych ilościach danych: plan dla 100 wierszy w developmencie może być zupełnie
inny niż dla 100 milionów na produkcji.

## Źródła

- [PostgreSQL: using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [PostgreSQL: statistics used by the planner](https://www.postgresql.org/docs/current/planner-stats.html)
- [SQL Server: execution plans](https://learn.microsoft.com/en-us/sql/relational-databases/performance/execution-plans)
- [SQL Server: parameter sensitive plan optimization](https://learn.microsoft.com/en-us/sql/relational-databases/performance/parameter-sensitive-plan-optimization)
- [MySQL: EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html)

## Pytania

### Jak podejść do wolnego zapytania? {mid}

Odtworzyć je z realistycznymi danymi i parametrami, a potem obejrzeć jego rzeczywisty plan wykonania (`EXPLAIN ANALYZE`, plan rzeczywisty w SQL Server).
Znaleźć kosztowne operatory: skany dużych tabel, duże różnice między szacowaną a rzeczywistą liczbą wierszy, kosztowne sortowania albo wiele powtarzanych
lookupów. Potem usunąć przyczynę: brakujący lub nieużywany indeks, niesargowalny warunek, nieaktualne statystyki albo zapytanie, które czyta za dużo. Po każdej
zmianie mierzyć ponownie.

### Czym jest plan wykonania? {junior}

To drzewo fizycznych operacji, których baza używa do wykonania zapytania: które tabele są czytane i jak (pełny skan czy wyszukanie w indeksie), w jakiej
kolejności są łączone i jakim algorytmem, gdzie odbywa się sortowanie i agregacja. Optymalizator buduje go z deklaratywnego SQL na podstawie statystyk
i szacunków kosztów. `EXPLAIN` pokazuje plan szacowany, a `EXPLAIN ANALYZE` (albo plan rzeczywisty) wykonuje zapytanie i dodaje rzeczywiste liczby wierszy
i czasy.

### Po co porównywać szacowaną i rzeczywistą liczbę wierszy? {mid}

Optymalizator wybiera algorytmy złączeń, ich kolejność i użycie indeksów na podstawie szacowanej liczby wierszy. Jeśli spodziewa się 10 wierszy, a dostaje
100 000, może wybrać nested loop ze 100 000 lookupów zamiast hash joina. Duże błędy szacunków wskazują na nieaktualne lub niewystarczające statystyki,
skorelowane kolumny albo niesargowalne wyrażenia, a poprawienie szacunku często poprawia plan.

### Jakich algorytmów złączeń używają bazy? {mid}

Nested loop (dla każdego wiersza zewnętrznego wyszukaj pasujące wiersze wewnętrzne, idealny dla małego wejścia zewnętrznego z indeksem po stronie
wewnętrznej), hash join (zbuduj tablicę haszującą z mniejszego wejścia i odpytuj ją większym, dobry dla dużych nieposortowanych wejść z warunkami równości)
i merge join (przechodź równolegle przez dwa wejścia posortowane po kluczu złączenia). Optymalizator wybiera jeden dla każdego złączenia na podstawie
szacowanych rozmiarów i dostępnych indeksów.

### Dlaczego statystyki mają znaczenie i kiedy mogą być nieaktualne? {mid}

Statystyki opisują liczbę wierszy i rozkłady wartości, a optymalizator używa ich do szacowania, ile wierszy wytworzy każdy krok. Po masowym załadunku, dużym
usunięciu albo zmianie rozkładu danych mogą być nieaktualne do następnej automatycznej aktualizacji, co prowadzi do błędnych szacunków i złych planów.
Odświeża się je przez `ANALYZE` (PostgreSQL) albo `UPDATE STATISTICS` (SQL Server), np. zaraz po załadowaniu danych.

### Czym jest parameter sniffing? {senior}

W SQL Server sparametryzowane zapytanie albo procedura jest kompilowana dla wartości parametrów z pierwszego wykonania, a plan jest cache'owany i ponownie
używany. Jeśli dane są nierównomierne, plan świetny dla rzadkiej wartości (wyszukanie w indeksie) może być fatalny dla częstej (miliony lookupów) albo
odwrotnie, więc wydajność zależy od tego, które wywołanie przyszło pierwsze. Rozwiązania to `OPTION (RECOMPILE)`, `OPTIMIZE FOR`, wymuszenie planu przez
Query Store albo, w SQL Server 2022, parameter sensitive plan optimization.

### Dlaczego paginacja przez `OFFSET` jest wolna na dalekich stronach? {mid}

Żeby zwrócić wiersze 190 001–190 020, baza i tak musi wytworzyć i odrzucić pierwsze 190 000 wierszy w kolejności: w teście plan pokazał 190 020 przeczytanych
wierszy, a zapytanie zajęło ~46 ms wobec ~1 ms dla pierwszej strony. Paginacja keyset (seek) filtruje po ostatnio widzianym kluczu
(`WHERE id > @last ORDER BY id LIMIT 20`) i używa indeksu, żeby od razu tam skoczyć, więc każda strona kosztuje tyle samo. Jej ograniczeniem jest brak skoku
na dowolny numer strony.

### Czym jest problem N+1 zapytań? {junior}

To wykonanie jednego zapytania po listę, a potem jeszcze jednego dla każdego elementu (np. wczytanie 100 zamówień, a potem klienta każdego z nich osobno), więc
N elementów kosztuje N+1 wywołań bazy. Opóźnienia się sumują, nawet jeśli każde zapytanie jest szybkie. Rozwiązaniem jest pobranie powiązanych danych jednym
zapytaniem ze złączeniem, listą `IN (...)` albo ładowaniem wsadowym, a ORM-y dają do tego eager loading.

### Jak niezgodność typów danych może spowolnić zapytanie? {senior}

Jeśli typ parametru różni się od typu kolumny, baza może konwertować wartość kolumny w każdym wierszu, żeby je porównać, co czyni warunek niesargowalnym
i zamienia wyszukanie w indeksie na skan. Klasyczny przypadek w SQL Server to parametr `nvarchar` (domyślny dla stringów w .NET) porównywany z kolumną `varchar`.
Naprawia się to, dopasowując typy parametrów do typów kolumn (np. ustawiając `DbType` parametru albo typ kolumny w mapowaniu ORM).

### Dlaczego zapytanie może być szybkie w developmencie i wolne na produkcji? {mid}

Plany zależą od ilości i rozkładu danych: przy 100 wierszach pełny skan jest natychmiastowy, a optymalizator może ignorować indeksy, podczas gdy przy 100 milionach
to samo zapytanie potrzebuje zupełnie innego planu. Produkcja ma też współbieżność (blokady, rywalizacja), inne statystyki, plany zapamiętane dla innych wartości
parametrów oraz inny sprzęt lub konfigurację. Dlatego testy wydajności robi się na realistycznych ilościach danych, a plany, gdy to możliwe, porównuje z bazy
produkcyjnej.
