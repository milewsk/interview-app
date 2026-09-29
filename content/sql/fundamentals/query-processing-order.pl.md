# SELECT i logiczna kolejność przetwarzania zapytania {junior}

`SELECT` pisze się w jednej kolejności, ale **logicznie przetwarza w innej**. Zrozumienie tej kolejności wyjaśnia
większość pytań „dlaczego to nie działa?”: czemu alias nie działa w `WHERE`, czemu agregaty wymagają `HAVING` i czemu
`ORDER BY` widzi to, czego nie widzi `WHERE`.

## Kolejność zapisu a kolejność logiczna

```sql
SELECT   customer, SUM(total) AS revenue      -- 5. oblicz kolumny wyniku
FROM     orders                               -- 1. weź wiersze (ze złączeniami)
WHERE    total >= 100                         -- 2. przefiltruj wiersze
GROUP BY customer                             -- 3. pogrupuj
HAVING   SUM(total) > 300                     -- 4. przefiltruj grupy
ORDER BY revenue DESC                         -- 6. posortuj (aliasy są tu widoczne)
LIMIT    10;                                  -- 7. ogranicz liczbę wierszy
```

Pełna kolejność logiczna (tak jak opisuje ją np. dokumentacja SQL Server): `FROM` → `ON` → `JOIN` → `WHERE` →
`GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `TOP`/`LIMIT`. Każdy krok widzi tylko to, co wytworzyły
poprzednie. Optymalizator może fizycznie wykonać zapytanie w innej kolejności, ale wynik musi być taki, jakby tej
kolejności przestrzegano.

## Konsekwencje

- **Alias z `SELECT` nie jest widoczny w `WHERE`** (oblicza się go później): PostgreSQL zwraca
  `column "gross" does not exist`. Trzeba powtórzyć wyrażenie albo opakować zapytanie w podzapytanie lub CTE. MySQL
  i SQL Server też to odrzucają, ale SQLite przyjmuje, stąd bierze się „u mnie działało”.
- **Alias jest widoczny w `ORDER BY`**, bo sortowanie następuje po `SELECT`.
- W `GROUP BY` alias działa w PostgreSQL, MySQL i SQLite, ale **nie w SQL Server**, który ściśle trzyma się kolejności
  logicznej.
- **Agregatów nie można użyć w `WHERE`** (`aggregate functions are not allowed in WHERE`): `WHERE` filtruje wiersze
  przed grupowaniem, a `HAVING` filtruje grupy po nim. Warunki, które nie potrzebują agregatów, należą do `WHERE`, bo
  zmniejszają liczbę wierszy przed grupowaniem.
- **Każda kolumna w `SELECT` musi być w `GROUP BY` albo wewnątrz agregatu**. PostgreSQL i SQL Server zgłaszają błąd,
  MySQL domyślnie też (`ONLY_FULL_GROUP_BY`), a SQLite po cichu zwraca wartość z dowolnego wiersza grupy.
- Przy `SELECT DISTINCT` `ORDER BY` może używać tylko kolumn z listy wyboru (PostgreSQL:
  `for SELECT DISTINCT, ORDER BY expressions must appear in select list`).

## Sortowanie i ograniczanie

- **Bez `ORDER BY` kolejność wierszy jest nieokreślona**, nawet jeśli wygląda na stabilną. Stronicowanie
  (`LIMIT`/`OFFSET`) zawsze wymaga deterministycznego `ORDER BY`.
- Położenie `NULL` bywa różne: PostgreSQL traktuje `NULL` jako większe od każdej wartości (na końcu przy `ASC`),
  a SQL Server, MySQL i SQLite stawiają `NULL` na początku przy `ASC`. PostgreSQL i SQLite obsługują jawne
  `NULLS FIRST`/`NULLS LAST`.
- Ograniczanie liczby wierszy zależy od dialektu:

| Dialekt | Składnia |
|---|---|
| Standard SQL, PostgreSQL, SQL Server 2012+, Oracle 12c+ | `ORDER BY ... OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY` |
| PostgreSQL, MySQL, SQLite | `LIMIT 5 OFFSET 10` |
| SQL Server | `SELECT TOP (5) ...` |

## Inne podstawy

- `COUNT(*)` liczy wiersze, `COUNT(kolumna)` liczy wartości różne od `NULL`, a `COUNT(DISTINCT kolumna)` liczy różne
  wartości różne od `NULL` (w teście: 5, 3 i 3).
- Porównanie stringów zależy od **collation**: PostgreSQL i SQLite domyślnie rozróżniają wielkość liter
  (`'ada' = 'Ada'` to fałsz), a SQL Server i MySQL zwykle używają collation bez rozróżniania wielkości liter.
- `SELECT *` w kodzie aplikacji jest kruche (nowe kolumny zmieniają wynik, przesyła się więcej danych, nie da się użyć
  indeksów pokrywających): lepiej wymienić kolumny.

## Źródła

- [SELECT (PostgreSQL)](https://www.postgresql.org/docs/current/sql-select.html)
- [Logical processing order of SELECT (SQL Server)](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-transact-sql)
- [MySQL: GROUP BY handling (ONLY_FULL_GROUP_BY)](https://dev.mysql.com/doc/refman/8.4/en/group-by-handling.html)
- [SQLite: SELECT](https://www.sqlite.org/lang_select.html)

## Pytania

### W jakiej logicznej kolejności przetwarzane są klauzule `SELECT`? {junior}

`FROM` (ze złączeniami), potem `WHERE`, `GROUP BY`, `HAVING`, `SELECT`, `DISTINCT`, `ORDER BY`, a na końcu `LIMIT`/`TOP`. Każda klauzula działa na wyniku
poprzednich. To kolejność logiczna, która definiuje wynik: optymalizator może fizycznie wykonać zapytanie inaczej, o ile wynik jest taki sam.

### Dlaczego nie można użyć aliasu kolumny z `SELECT` w `WHERE`? {junior}

Bo `WHERE` jest logicznie przetwarzane przed `SELECT`, więc alias jeszcze nie istnieje. PostgreSQL i SQL Server zgłaszają nieznaną kolumnę. Można
powtórzyć wyrażenie w `WHERE` albo obliczyć je w podzapytaniu lub CTE i filtrować zapytanie zewnętrzne. Alias działa natomiast w `ORDER BY`, które
jest przetwarzane po `SELECT`.

### Czym różni się `WHERE` od `HAVING`? {junior}

`WHERE` filtruje pojedyncze wiersze przed grupowaniem i nie może używać funkcji agregujących. `HAVING` filtruje grupy po `GROUP BY` i może używać agregatów,
np. `HAVING SUM(total) > 300`. Warunki na pojedynczych wierszach powinny trafiać do `WHERE`, bo zmniejszają ilość danych do grupowania i pozwalają bazie
użyć indeksów.

### Co się stanie, gdy wybierzesz kolumnę, której nie ma w `GROUP BY` ani w agregacie? {mid}

W PostgreSQL i SQL Server to błąd, bo jedna grupa może zawierać różne wartości tej kolumny i nie wiadomo, którą zwrócić. MySQL domyślnie to odrzuca
(`ONLY_FULL_GROUP_BY`). SQLite to przyjmuje i zwraca wartość z dowolnego wiersza grupy, co jest częstym źródłem cichych błędów. Wyjątkiem (w PostgreSQL)
jest kolumna funkcyjnie zależna od pogrupowanego klucza głównego.

### Czy kolejność wierszy jest gwarantowana bez `ORDER BY`? {junior}

Nie. Bez `ORDER BY` baza może zwrócić wiersze w dowolnej kolejności, która może się zmienić wraz z planem wykonania, danymi, równoległością czy wersją. Jeśli
kolejność ma znaczenie, także przy stronicowaniu przez `LIMIT`/`OFFSET`, potrzebne jest jawne `ORDER BY`, najlepiej kończące się unikalną kolumną, żeby
kolejność była deterministyczna.

### Czym różnią się `COUNT(*)`, `COUNT(kolumna)` i `COUNT(DISTINCT kolumna)`? {junior}

`COUNT(*)` liczy wszystkie wiersze, także te z `NULL`. `COUNT(kolumna)` liczy tylko wiersze, w których kolumna nie jest `NULL`. `COUNT(DISTINCT kolumna)` liczy
różne wartości różne od `NULL`. Na przykład dla 5 zamówień, z których 3 wysłano, złożonych przez 3 klientów: `COUNT(*) = 5`, `COUNT(shipped_at) = 3`,
`COUNT(DISTINCT customer) = 3`.

### Jak sortowane są wartości `NULL`? {mid}

To zależy od bazy: PostgreSQL traktuje `NULL` jako większe od każdej wartości, więc przy sortowaniu rosnącym jest na końcu, a SQL Server, MySQL i SQLite
traktują je jako najmniejsze, więc jest na początku. PostgreSQL i SQLite (oraz Oracle) obsługują jawne `NULLS FIRST`/`NULLS LAST`; w SQL Server sortuje się
po dodatkowym wyrażeniu, np. `ORDER BY CASE WHEN col IS NULL THEN 1 ELSE 0 END, col`.

### Jak ograniczyć liczbę wierszy w różnych bazach? {junior}

Standardem jest `OFFSET n ROWS FETCH NEXT m ROWS ONLY` (PostgreSQL, SQL Server 2012+, Oracle 12c+). PostgreSQL, MySQL i SQLite mają też
`LIMIT m OFFSET n`, a SQL Server `SELECT TOP (m)`. We wszystkich przypadkach sensowne stronicowanie wymaga `ORDER BY`; w SQL Server `OFFSET`/`FETCH` jest
wręcz składniowo częścią `ORDER BY`.

### Czy `'abc' = 'ABC'` to prawda? {mid}

Zależy od collation. PostgreSQL i SQLite domyślnie rozróżniają wielkość liter, więc to fałsz. SQL Server i MySQL zwykle mają domyślne collation bez
rozróżniania wielkości liter, więc to prawda. Dlatego to samo zapytanie może zwracać różne wyniki w różnych bazach, a testy na innym silniku niż
produkcyjny mogą wprowadzać w błąd. Wyszukiwanie bez rozróżniania wielkości liter można zrobić przez `ILIKE` albo `lower()` (PostgreSQL) lub jawne
collation.

### Dlaczego odradza się `SELECT *` w kodzie aplikacji? {junior}

Zwraca wszystkie kolumny, także te, których kod nie potrzebuje, więc czyta i przesyła się więcej danych, a baza nie może odpowiedzieć z indeksu
pokrywającego. Wynik zmienia się, gdy kolumny zostaną dodane lub przestawione, co może zepsuć kod polegający na pozycjach kolumn. Jawne wymienienie
kolumn dokumentuje, czego zapytanie potrzebuje. `SELECT *` jest w porządku przy doraźnej eksploracji i w `EXISTS (SELECT * ...)`.
