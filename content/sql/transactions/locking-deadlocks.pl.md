# Blokady, blokowanie i zakleszczenia {senior}

Poziomy izolacji opisują, **co** mogą widzieć równoległe transakcje; **blokady** (locks) to jeden z głównych
mechanizmów, które to wymuszają. Blokady powodują **blokowanie** (jedna transakcja czeka na inną), a czasem
**zakleszczenia** (deadlocki: transakcje czekają na siebie w nieskończoność). Na rozmowach oczekuje się wyjaśnienia
obu zjawisk, wiedzy, jak bazy rozwiązują zakleszczenia, i umiejętności pisania kodu, który ich unika.

## Blokady w pigułce

- Blokady **współdzielone (S)** do odczytu są ze sobą zgodne; blokady **wyłączne (X)** do zapisu nie są zgodne z niczym.
  SQL Server ma też blokady **aktualizacji (U)** (czytam teraz, zamierzam zapisać, co zapobiega częstemu wzorcowi
  zakleszczenia) i blokady **intencyjne** na wyższych poziomach (IS, IX), sygnalizujące blokady niżej.
- **Ziarnistość**: wiersz, strona, tabela (oraz zakresy kluczy indeksu przy `SERIALIZABLE`). SQL Server może
  **eskalować** wiele blokad wierszy do blokady tabeli, żeby oszczędzić pamięć, co może nagle zablokować niezwiązaną pracę.
  PostgreSQL zapisuje blokady wierszy w samych wierszach i ich nie eskaluje.
- **Pisarz zawsze zakłada blokadę wyłączną na modyfikowanych wierszach i trzyma ją do końca transakcji**, niezależnie od
  poziomu izolacji. Przy MVCC (PostgreSQL, SQL Server z wersjonowaniem wierszy) czytelnicy nie czekają na te blokady; przy
  `READ COMMITTED` opartym na blokadach (domyślnym w SQL Server) czekają.
- SQLite blokuje **całą bazę** przy zapisie: drugi pisarz dostał w teście `database is locked`.

## Jawne blokowanie wierszy

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- zablokuj wiersz do COMMIT: blokowanie pesymistyczne
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
COMMIT;
```

| Klauzula | Zachowanie |
|---|---|
| `FOR UPDATE` (PostgreSQL, MySQL, Oracle) / `WITH (UPDLOCK, ROWLOCK)` (SQL Server) | blokuje wybrane wiersze do modyfikacji |
| `FOR SHARE` | blokuje modyfikacje przez innych, dopuszcza inne blokady współdzielone |
| `NOWAIT` | od razu zgłasza błąd zamiast czekać, jeśli wiersz jest zablokowany |
| `SKIP LOCKED` (PostgreSQL, MySQL 8, Oracle; `READPAST` w SQL Server) | pomija zablokowane wiersze zamiast czekać |

`SKIP LOCKED` to standardowy sposób budowy **kolejki zadań** w tabeli: każdy worker wykonuje
`SELECT ... WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`, więc równoległe workery biorą różne
zadania, nie blokując się nawzajem.

**Blokady doradcze** (advisory locks: `pg_advisory_lock` w PostgreSQL, `sp_getapplock` w SQL Server) to blokady
definiowane przez aplikację na dowolnych kluczach, np. „tylko jedna instancja uruchamia nocne zadanie” albo „jedna
migracja naraz”.

## Blokowanie

Blokowanie jest normalne i zwykle krótkie. Staje się problemem, gdy transakcja długo trzyma blokady: długo trwające
transakcje, czekanie na użytkownika lub wywołanie HTTP wewnątrz transakcji, brakujące indeksy (`UPDATE ... WHERE` bez
indeksu skanuje i blokuje wiele wierszy) albo eskalacja blokad. Diagnozuje się to przez `pg_stat_activity` / `pg_locks`
w PostgreSQL oraz `sys.dm_exec_requests` / `sys.dm_tran_locks` w SQL Server. Timeouty blokad (`lock_timeout`,
`SET LOCK_TIMEOUT`) sprawiają, że żądania szybko kończą się błędem zamiast wisieć.

## Zakleszczenia

```text
T1: UPDATE accounts ... WHERE id = 1   (blokuje wiersz 1)
T2: UPDATE accounts ... WHERE id = 2   (blokuje wiersz 2)
T1: UPDATE accounts ... WHERE id = 2   → czeka na T2
T2: UPDATE accounts ... WHERE id = 1   → czeka na T1   ⇒ zakleszczenie
```

- Bazy automatycznie **wykrywają** zakleszczenia i **przerywają jedną transakcję** (ofiarę), żeby pozostałe mogły
  kontynuować. SQL Server zwraca ofierze **błąd 1205** i domyślnie wybiera transakcję najtańszą do wycofania (chyba że
  `SET DEADLOCK_PRIORITY` mówi inaczej); PostgreSQL zgłasza `deadlock detected`.
- Praca ofiary zostaje wycofana, więc aplikacja musi **złapać błąd i ponowić** transakcję.

Jak je ograniczać (zgodnie z zaleceniami PostgreSQL i SQL Server):

1. **Sięgać do obiektów i wierszy w tej samej kolejności** wszędzie, np. aktualizować konta w przelewie w rosnącej
   kolejności id.
2. **Krótkie transakcje**, bez interakcji z użytkownikiem ani zewnętrznych wywołań w środku.
3. **Indeksy** na kolumnach używanych w `WHERE` aktualizacji i usunięć, żeby blokować mniej wierszy.
4. **Najniższy odpowiedni poziom izolacji** i wersjonowanie wierszy (`READ_COMMITTED_SNAPSHOT`, izolacja migawkowa), żeby
   uniknąć zakleszczeń czytelnik–pisarz.
5. Blokowanie od razu tego, co będzie aktualizowane (`FOR UPDATE` / `UPDLOCK`), zamiast czytania z blokadami
   współdzielonymi i późniejszego ich podnoszenia.

## Źródła

- [PostgreSQL: explicit locking (row locks, deadlocks, advisory locks)](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL: SELECT (the locking clause)](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [SQL Server: deadlocks guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide)
- [SQL Server: transaction locking and row versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide)
- [SQLite: file locking and concurrency](https://www.sqlite.org/lockingv3.html)

## Pytania

### Czym jest zakleszczenie (deadlock)? {junior}

To sytuacja, w której dwie lub więcej transakcji trzyma blokadę potrzebną drugiej i czekają na siebie nawzajem, więc żadna nie może ruszyć dalej. Klasyczny
przykład: T1 blokuje wiersz 1 i chce wiersza 2, a T2 blokuje wiersz 2 i chce wiersza 1. Bez interwencji czekałyby w nieskończoność, więc baza wykrywa cykl
i przerywa jedną z nich.

### Jak bazy rozwiązują zakleszczenia? {mid}

Detektor zakleszczeń okresowo szuka cykli w grafie oczekiwań transakcji. Gdy go znajdzie, wybiera ofiarę, wycofuje jej transakcję i zwraca błąd (1205 w SQL Server,
`deadlock detected` w PostgreSQL), co zwalnia jej blokady i pozwala pozostałym kontynuować. SQL Server wybiera transakcję najtańszą do wycofania, chyba że ustawiono
`DEADLOCK_PRIORITY`. Aplikacja musi złapać błąd i ponowić operację.

### Jak zapobiegać zakleszczeniom? {mid}

Sięgać do tabel i wierszy w spójnej kolejności we wszystkich ścieżkach kodu, utrzymywać transakcje krótkie i bez interakcji z użytkownikiem czy wywołań zewnętrznych,
indeksować kolumny używane do znajdowania wierszy do aktualizacji, żeby blokować mniej wierszy, używać najniższego poprawnego poziomu izolacji i wersjonowania
wierszy tam, gdzie się da, oraz od razu blokować wiersze, które będą modyfikowane, zamiast podnosić blokady współdzielone. Część zakleszczeń i tak się zdarzy, więc
kod musi ponawiać przy błędzie zakleszczenia.

### Czym blokowanie różni się od zakleszczenia? {junior}

Blokowanie to czekanie jednej transakcji na blokadę trzymaną przez inną; kończy się, gdy właściciel zatwierdzi lub wycofa zmiany, więc jest normalne, choć długie
oczekiwanie szkodzi wydajności. Zakleszczenie to cykl transakcji czekających na siebie nawzajem, który nigdy nie rozwiąże się sam, więc baza musi przerwać jedną
z nich. Łańcuchy blokowania mogą być długie, nie będąc zakleszczeniami.

### Co robi `SELECT ... FOR UPDATE`? {mid}

Odczytuje wiersze i blokuje je do końca transakcji, jakby miały zaraz zostać zaktualizowane, więc inne transakcje nie mogą ich zmodyfikować, usunąć ani zablokować
do aktualizacji aż do zatwierdzenia. To blokowanie pesymistyczne: stosuje się je przy sekwencjach odczyt–modyfikacja–zapis, które nie mogą się przeplatać, np.
sprawdzenie salda, a potem wypłata. `NOWAIT` sprawia, że zamiast czekać zgłasza błąd, a `SKIP LOCKED` pomija już zablokowane wiersze.

### Jak zaimplementować kolejkę zadań w relacyjnej bazie? {senior}

Trzymać zadania w tabeli i pozwolić każdemu workerowi brać jedno wewnątrz transakcji przez `SELECT ... WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
zaktualizować jego status (albo je usunąć) i zatwierdzić. `SKIP LOCKED` sprawia, że równoległe workery pomijają zadania wzięte przez innych zamiast czekać, więc się
nie blokują. Dodaje się indeks na kolumnach statusu i kolejności, obsługę workerów, które padły (timeout albo kolumna „zablokowane do”), a transakcję pobierającą
utrzymuje się krótką.

### Czym jest eskalacja blokad w SQL Server? {senior}

Gdy transakcja zakłada bardzo wiele blokad wierszy lub stron w jednej tabeli, SQL Server może zastąpić je jedną blokadą tabeli, żeby oszczędzić pamięć. Dla samej
transakcji to wydajniejsze, ale blokuje cały inny dostęp do tabeli, więc duża aktualizacja wsadowa może nagle zablokować niezwiązane zapytania. Środki zaradcze:
przetwarzanie mniejszymi porcjami, indeksy, żeby blokować mniej wierszy, albo konfiguracja eskalacji per tabela. PostgreSQL nie eskaluje blokad wierszy.

### Dlaczego brakujący indeks może powodować blokowanie? {mid}

Żeby znaleźć wiersze dla `UPDATE ... WHERE email = ?` bez indeksu, baza skanuje tabelę i, zależnie od silnika i poziomu izolacji, może zablokować albo przynajmniej
przejrzeć dużo więcej wierszy, niż zmienia. Wydłuża to czas trzymania blokad i zwiększa liczbę zablokowanych wierszy, więc równoległe transakcje częściej się
zderzają, a zakleszczenia stają się bardziej prawdopodobne. Indeks pozwala instrukcji dotknąć tylko docelowych wierszy.

### Czym są blokady doradcze (advisory locks)? {senior}

To blokady na kluczach wybranych przez aplikację, a nie na wierszach czy tabelach, dostępne w PostgreSQL (`pg_advisory_lock`, `pg_try_advisory_lock`) i SQL Server
(`sp_getapplock`). Baza nie wiąże ich z danymi, więc ich znaczenie definiuje aplikacja. Używa się ich do koordynacji procesów, np. żeby tylko jedna instancja
zadania harmonogramu albo migracji działała w danym czasie, bez tworzenia tabeli blokad.

### Dlaczego SQLite ma problem z wieloma równoczesnymi pisarzami? {mid}

SQLite pozwala tylko na jednego pisarza naraz dla całego pliku bazy: transakcja zapisu zakłada blokadę na poziomie bazy, a kolejny pisarz dostaje `SQLITE_BUSY`
(„database is locked”) albo czeka do upływu busy timeout. Tryb WAL pozwala czytelnikom pracować równolegle z jedynym pisarzem, ale zapisy nadal są szeregowane.
To w porządku przy zastosowaniach wbudowanych i małej liczbie zapisów, ale nie przy aplikacjach z wieloma równoczesnymi pisarzami.
