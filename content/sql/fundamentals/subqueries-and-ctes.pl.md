# Podzapytania, CTE i operacje na zbiorach {mid}

Podzapytania i **CTE** (common table expressions, `WITH`) pozwalają budować zapytanie z kroków: coś obliczyć, a potem
użyć wyniku. **Rekurencyjne CTE** obsługują hierarchie i grafy, a **operacje na zbiorach** (`UNION`, `INTERSECT`,
`EXCEPT`) łączą wyniki całych zapytań.

## Rodzaje podzapytań

```sql
-- skalarne: zwraca jedną wartość
SELECT name FROM emp WHERE salary > (SELECT AVG(salary) FROM emp);

-- skorelowane: odwołuje się do wiersza zewnętrznego, logicznie liczone dla każdego wiersza
SELECT e.name FROM emp e
WHERE e.salary > (SELECT AVG(x.salary) FROM emp x WHERE x.dept = e.dept);   -- powyżej średniej swojego działu

-- tabela pochodna: podzapytanie w FROM, musi mieć alias
SELECT d.dept, d.avg_sal
FROM (SELECT dept, AVG(salary) AS avg_sal FROM emp GROUP BY dept) d
WHERE d.avg_sal > 150;

-- IN / EXISTS: przynależność
SELECT name FROM emp e WHERE EXISTS (SELECT 1 FROM emp s WHERE s.manager_id = e.id);
```

- Podzapytanie skalarne zwracające **więcej niż jeden wiersz** to błąd w PostgreSQL (`more than one row returned by
  a subquery used as an expression`) i SQL Server, ale **SQLite po cichu bierze pierwszy wiersz**.
- Podzapytanie skorelowane nie musi być wolne: optymalizatory często przepisują je na złączenie. Ale gdy wykonuje się
  dla każdego wiersza dużej tabeli, zwykle lepsze jest złączenie z wcześniej zagregowaną tabelą pochodną albo funkcja
  okna.
- `IN (podzapytanie)` i `EXISTS` zwykle dają ten sam plan; różnica, która ma znaczenie, to `NOT IN` z `NULL` (zob. temat
  o `NULL`).

## CTE: `WITH`

```sql
WITH dept_avg AS (
    SELECT dept, AVG(salary) AS avg_sal FROM emp GROUP BY dept
)
SELECT e.name, e.salary, d.avg_sal
FROM emp e JOIN dept_avg d ON d.dept = e.dept
WHERE e.salary > d.avg_sal;
```

- CTE to nazwane podzapytanie widoczne w reszcie instrukcji. Poprawia czytelność, dzieląc zapytanie na nazwane kroki,
  i można się do niego odwołać kilka razy.
- To nie jest tabela tymczasowa: zwykle optymalizator wstawia je jak podzapytanie. W PostgreSQL 12+ CTE użyte raz jest
  wstawiane w zapytanie, a oba zachowania można wymusić przez `AS MATERIALIZED` / `AS NOT MATERIALIZED`. (Przed
  PostgreSQL 12 CTE zawsze były materializowane, co działało jak „bariera optymalizacyjna”).
- W PostgreSQL CTE może też zawierać `INSERT`/`UPDATE`/`DELETE ... RETURNING` (CTE modyfikujące dane).

## Rekurencyjne CTE

```sql
WITH RECURSIVE sub AS (
    SELECT id, name, 0 AS depth FROM emp WHERE name = 'Ann'        -- kotwica: wiersze startowe
    UNION ALL
    SELECT e.id, e.name, s.depth + 1                               -- część rekurencyjna: łączy się z poprzednim poziomem
    FROM emp e JOIN sub s ON e.manager_id = s.id
)
SELECT name, depth FROM sub;      -- Ann 0, Eve 1, Joe 2
```

- Składa się z **kotwicy** i **części rekurencyjnej** połączonych `UNION ALL`. Część rekurencyjna wykonuje się
  wielokrotnie na wierszach wytworzonych w poprzednim kroku, dopóki nie przestanie zwracać nowych wierszy.
- Zastosowania: struktury organizacyjne, drzewa kategorii, zestawienia materiałowe, ścieżki w grafach, generowanie serii
  liczb lub dat (PostgreSQL ma też `generate_series`).
- **Cykle** w danych powodują nieskończoną rekurencję. Chroni się przed nimi limitem głębokości (`WHERE s.depth < 10`),
  śledzeniem odwiedzonej ścieżki, standardową klauzulą `CYCLE` (PostgreSQL 14+: `CYCLE id SET is_cycle USING path`) albo
  opcją `OPTION (MAXRECURSION n)` w SQL Server (domyślny limit to 100).
- Dialekty: PostgreSQL, MySQL i SQLite wymagają `WITH RECURSIVE`; SQL Server i Oracle używają samego `WITH`.

## Operacje na zbiorach

| Operacja | Wynik |
|---|---|
| `UNION` | wiersze z obu zapytań, **bez duplikatów** (wymaga sortowania lub haszowania) |
| `UNION ALL` | wszystkie wiersze, z duplikatami, szybciej |
| `INTERSECT` | wiersze obecne w obu wynikach |
| `EXCEPT` (`MINUS` w Oracle) | wiersze z pierwszego wyniku, których nie ma w drugim |

Zapytania muszą zwracać tyle samo kolumn o zgodnych typach. Nazwy kolumn pochodzą z pierwszego zapytania, a `ORDER BY`
dotyczy całego wyniku na końcu. Używa się `UNION ALL`, chyba że deduplikacja jest naprawdę potrzebna: `UNION` po cichu
dodaje krok sortowania lub haszowania. (W teście: 3 różne działy z `UNION`, 12 wierszy z `UNION ALL`).

## Źródła

- [PostgreSQL: WITH queries (CTEs)](https://www.postgresql.org/docs/current/queries-with.html)
- [PostgreSQL: subquery expressions](https://www.postgresql.org/docs/current/functions-subquery.html)
- [PostgreSQL: combining queries (UNION, INTERSECT, EXCEPT)](https://www.postgresql.org/docs/current/queries-union.html)
- [SQL Server: WITH common_table_expression](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql)
- [SQLite: WITH clause](https://www.sqlite.org/lang_with.html)

## Pytania

### Czym jest podzapytanie skorelowane? {junior}

To podzapytanie odwołujące się do kolumn zapytania zewnętrznego, więc logicznie liczone osobno dla każdego wiersza zewnętrznego. Na przykład
`WHERE e.salary > (SELECT AVG(x.salary) FROM emp x WHERE x.dept = e.dept)` porównuje każdego pracownika ze średnią jego działu. Optymalizatory często
zamieniają je na złączenie, ale przy dużych zbiorach danych warto sprawdzić plan albo przepisać je na złączenie z wcześniejszą agregacją lub funkcję okna.

### Co się dzieje, gdy podzapytanie skalarne zwróci więcej niż jeden wiersz? {mid}

W PostgreSQL, SQL Server i większości baz to błąd w czasie wykonania („more than one row returned by a subquery used as an expression” / „Subquery returned
more than 1 value”). SQLite się nie skarży i po cichu używa pierwszego wiersza, co może ukryć błąd. Rozwiązaniem jest zagwarantowanie jednego wiersza
(filtr po unikalnym kluczu, agregacja albo `LIMIT 1` z jawnym `ORDER BY`, gdy naprawdę chodzi o „dowolny jeden”).

### Czym CTE różni się od podzapytania? {mid}

Funkcjonalnie nierekurencyjne CTE to nazwane podzapytanie: daje te same wyniki. Różnice to czytelność (zapytanie zbudowane z nazwanych kroków czytanych od
góry do dołu), możliwość wielokrotnego odwołania i rekurencja, którą obsługują tylko CTE. Wydajność zależy od bazy: nowoczesne optymalizatory zwykle
wstawiają CTE w zapytanie, a PostgreSQL pozwala tym sterować przez `MATERIALIZED` / `NOT MATERIALIZED`.

### Czy CTE to tabela tymczasowa? {mid}

Nie. Istnieje tylko przez czas jednej instrukcji i zwykle w ogóle nie jest zapisywane: optymalizator scala je z głównym zapytaniem. Niektóre bazy mogą je
materializować (PostgreSQL przed wersją 12 robił to zawsze, a teraz robi to, gdy CTE jest używane kilka razy lub oznaczone `MATERIALIZED`). Gdy wynik
pośredni jest potrzebny kilku instrukcjom albo powinien mieć własne indeksy, właściwym narzędziem jest tabela tymczasowa.

### Jak działa rekurencyjne CTE? {mid}

Składa się z zapytania kotwicy zwracającego wiersze startowe i zapytania rekurencyjnego, które odwołuje się do samego CTE, połączonych `UNION ALL`. Baza
wykonuje kotwicę, a potem wielokrotnie część rekurencyjną na wierszach wytworzonych w poprzedniej iteracji, aż iteracja nie zwróci żadnych wierszy.
Typowe użycie to przechodzenie hierarchii, np. wszyscy podwładni kierownika z głębokością albo ścieżka od pracownika do szczytu.

### Jak zabezpieczyć rekurencyjne CTE przed cyklami w danych? {senior}

Dane cykliczne (A zarządza B, B zarządza A) sprawiają, że rekurencja jest nieskończona. Zabezpieczenia: licznik głębokości z limitem (`WHERE depth < 20`),
śledzenie odwiedzonej ścieżki (tablica lub string) i zatrzymanie, gdy identyfikator się powtórzy, standardowa klauzula `CYCLE` (PostgreSQL 14+) albo opcja
`MAXRECURSION` w SQL Server, która domyślnie przerywa po 100 poziomach z błędem. Użycie `UNION` zamiast `UNION ALL` pomaga tylko wtedy, gdy powtarzające się
wiersze są w pełni identyczne.

### Czym różni się `UNION` od `UNION ALL`? {junior}

`UNION` łączy wyniki i usuwa zduplikowane wiersze, co wymaga dodatkowej operacji sortowania lub haszowania. `UNION ALL` po prostu dokleja wyniki, łącznie
z duplikatami, więc jest szybsze. Domyślnie używa się `UNION ALL`, a `UNION` tylko wtedy, gdy duplikaty trzeba usunąć i faktycznie mogą wystąpić.

### Co robią `INTERSECT` i `EXCEPT`? {junior}

`INTERSECT` zwraca wiersze obecne w wynikach obu zapytań, a `EXCEPT` (w Oracle `MINUS`) zwraca wiersze z pierwszego zapytania, których nie ma w drugim. Oba
usuwają duplikaty i porównują całe wiersze, traktując `NULL` jako równe. Przydają się np. do porównywania dwóch zbiorów danych albo szukania identyfikatorów
obecnych na jednej liście, a nieobecnych na drugiej.

### Kiedy używać `EXISTS` zamiast `IN`? {mid}

Przy testach przynależności (`IN`) zwykle dają ten sam plan. `EXISTS` jest lepsze przy negacji, bo `NOT IN` nie zwraca wierszy, gdy podzapytanie zawiera
`NULL`, a `NOT EXISTS` zachowuje się zgodnie z oczekiwaniem. `EXISTS` naturalnie wyraża też skorelowane warunki na kilku kolumnach i zatrzymuje się na
pierwszym dopasowaniu. `IN` z krótką listą stałych jest najczytelniejsze przy prostych filtrach.

### Jak przepisać wolne podzapytanie skorelowane? {senior}

Obliczyć skorelowaną wartość dla wszystkich grup naraz i dołączyć ją: np. zastąpić `WHERE salary > (SELECT AVG(salary) ... WHERE dept = e.dept)` złączeniem
z `(SELECT dept, AVG(salary) FROM emp GROUP BY dept)` albo użyć funkcji okna: `AVG(salary) OVER (PARTITION BY dept)` w podzapytaniu i filtrować na zewnątrz.
Wtedy dane są czytane raz, a nie raz na wiersz. Zawsze porównuje się plany wykonania, bo optymalizatory często same robią takie przepisanie.
