# Funkcje okna (window functions) {mid}

Funkcja okna liczy wartość na **zbiorze wierszy powiązanych z bieżącym wierszem** (oknie), ale w przeciwieństwie do
`GROUP BY` **nie zwija wierszy**: każdy wiersz zachowuje tożsamość i dostaje dodatkową obliczoną kolumnę. Rankingi,
sumy narastające, porównania z „poprzednim wierszem” i „top N w grupie” to domena funkcji okna. Obsługują je
PostgreSQL, SQL Server, MySQL 8+, Oracle i SQLite 3.25+.

## Składnia

```sql
function(...) OVER (
    PARTITION BY region          -- osobne okna per region (opcjonalnie)
    ORDER BY day                 -- kolejność w oknie (potrzebna do rankingów, LAG, sum narastających)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW   -- ramka: które wiersze wchodzą do obliczenia (opcjonalnie)
)
```

```sql
SELECT id, region, amount,
       SUM(amount) OVER (PARTITION BY region)                                  AS region_total,
       ROUND(100.0 * amount / SUM(amount) OVER (PARTITION BY region), 1)       AS pct_of_region
FROM sales;
-- każdy wiersz zostaje: 1 | EU | 100 | 750 | 13.3, 2 | EU | 300 | 750 | 40.0, ...
```

## Rankingi: `ROW_NUMBER`, `RANK`, `DENSE_RANK`

Dla kwot 400, 300, 300, 200:

| Funkcja | Wynik | Remisy |
|---|---|---|
| `ROW_NUMBER()` | 1, 2, 3, 4 | unikalne numery; kolejność wśród remisów jest dowolna, chyba że `ORDER BY` jest unikalne |
| `RANK()` | 1, 2, 2, 4 | ta sama pozycja, potem **luka** |
| `DENSE_RANK()` | 1, 2, 2, 3 | ta sama pozycja, **bez luki** |
| `NTILE(n)` | numer koszyka | dzieli wiersze na n mniej więcej równych grup |

## „Top N w grupie” i deduplikacja

Funkcji okna nie można użyć w `WHERE` (`window functions are not allowed in WHERE`), bo liczą się po nim, więc filtruje
się w zapytaniu zewnętrznym:

```sql
SELECT region, id, amount
FROM (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC, id) AS rn
    FROM sales s
) t
WHERE rn = 1;               -- najlepsza sprzedaż w każdym regionie; RANK() = 1 zachowuje remisy
```

Ten sam wzorzec **usuwa duplikaty**, zostawiając jeden wiersz na klucz (np. najnowszy): `PARTITION BY` po kluczu
duplikatu, `ORDER BY` po tym, co ma wygrać, zostaw `rn = 1`. Niektóre silniki (Snowflake, BigQuery, DuckDB) mają
klauzulę `QUALIFY` do filtrowania bezpośrednio po wynikach funkcji okna; PostgreSQL i SQL Server jej nie mają.

## `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`

```sql
SELECT day, amount,
       LAG(amount) OVER (PARTITION BY region ORDER BY day, id)             AS prev_amount,   -- NULL dla pierwszego wiersza
       amount - LAG(amount, 1, 0) OVER (PARTITION BY region ORDER BY day, id) AS change,     -- domyślnie 0
       LEAD(day) OVER (PARTITION BY region ORDER BY day, id)               AS next_day
FROM sales;
```

`LAG`/`LEAD` porównują wiersz z poprzednim lub następnym bez self-joina: zmiana dzień do dnia, czas między zdarzeniami,
wykrywanie zmian statusu.

## Ramki i pułapka domyślnej ramki

Przy `ORDER BY` w `OVER` domyślna ramka to `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` obejmuje
wszystkie **wiersze równorzędne** (peers, z tą samą wartością `ORDER BY`), co przy remisach daje zaskakujące sumy
narastające:

```sql
SUM(amount) OVER (ORDER BY day)                                              -- 100, 700, 700, 750  (dwa wiersze z 01-02 widzą 700)
SUM(amount) OVER (ORDER BY day, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)   -- 100, 400, 700, 750
```

- Do sum narastających podaje się `ROWS` i unikalną kolejność. SQL Server dodatkowo wydajniej przetwarza ramki `ROWS` niż
  domyślne `RANGE`.
- `LAST_VALUE` z domyślną ramką zwraca **bieżący wiersz** (ramka się na nim kończy), a nie ostatni wiersz partycji.
  Używa się `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` albo `FIRST_VALUE` z odwróconą kolejnością.
- Średnie ruchome używają przesuwnej ramki: `AVG(amount) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`
  to średnia z 7 wierszy.
- Nazwane okno (`WINDOW w AS (PARTITION BY region)`, potem `OVER w`) pozwala nie powtarzać tej samej definicji
  (PostgreSQL, MySQL, SQLite, SQL Server 2022+).

## Gaps and islands

Klasyczna zagadka rekrutacyjna: znaleźć zakresy kolejnych wartości (dni aktywności, kolejne identyfikatory). Odjęcie
`ROW_NUMBER()` od wartości daje stałą dla każdej serii kolejnych wartości, po której potem się grupuje:

```sql
SELECT region, MIN(day) AS start_day, MAX(day) AS end_day, COUNT(*) AS days
FROM (
    SELECT region, day,
           day - CAST(ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) AS int) AS grp   -- arytmetyka dat w PostgreSQL
    FROM (SELECT DISTINCT region, day FROM activity) d
) t
GROUP BY region, grp;
```

## Źródła

- [PostgreSQL: window functions tutorial](https://www.postgresql.org/docs/current/tutorial-window.html)
- [PostgreSQL: window function calls (frames)](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS)
- [SQL Server: OVER clause](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-over-clause-transact-sql)
- [SQLite: window functions](https://www.sqlite.org/windowfunctions.html)

## Pytania

### Czym funkcja okna różni się od `GROUP BY`? {junior}

`GROUP BY` zwija każdą grupę do jednego wiersza, więc traci się pojedyncze wiersze. Funkcja okna liczy agregat lub ranking na zbiorze powiązanych wierszy, ale
zwraca wartość dla każdego wiersza, zachowując je wszystkie. Dzięki temu w jednym zapytaniu można pokazać każdą sprzedaż razem z sumą regionu albo jej
udziałem w niej (`amount / SUM(amount) OVER (PARTITION BY region)`).

### Czym różnią się `ROW_NUMBER`, `RANK` i `DENSE_RANK`? {junior}

Remisami: dla wartości 400, 300, 300, 200 `ROW_NUMBER` daje 1, 2, 3, 4 (unikalne numery, dowolna kolejność wśród remisów), `RANK` daje 1, 2, 2, 4 (równa
pozycja, potem luka), a `DENSE_RANK` daje 1, 2, 2, 3 (równa pozycja, bez luki). Wybiera się zależnie od tego, czy remisy mają dzielić pozycję i czy pozycje
mają być kolejne.

### Jak pobrać N pierwszych wierszy w każdej grupie? {mid}

Ponumerować wiersze w każdej grupie przez `ROW_NUMBER() OVER (PARTITION BY grupa ORDER BY miara DESC)` w podzapytaniu lub CTE i przefiltrować `WHERE rn <= N`
w zapytaniu zewnętrznym, bo funkcji okna nie można użyć w `WHERE`. Jeśli wszystkie remisy mają być uwzględnione, używa się `RANK()` lub `DENSE_RANK()`.
Alternatywą jest `LATERAL`/`APPLY` z `LIMIT`/`TOP`, które przy odpowiednim indeksie bywa szybsze.

### Jak usunąć zduplikowane wiersze, zostawiając po jednym? {mid}

Ponumerować duplikaty przez `ROW_NUMBER() OVER (PARTITION BY <kolumny definiujące duplikat> ORDER BY <który wygrywa, np. created_at DESC>)` i zostawić lub
usunąć na podstawie numeru: `SELECT ... WHERE rn = 1` do odczytu albo `DELETE ... WHERE id IN (SELECT id FROM numbered WHERE rn > 1)` do sprzątania. Dodanie
potem ograniczenia unikalności zapobiega nowym duplikatom.

### Co robią `LAG` i `LEAD`? {junior}

Zwracają wartość z poprzedniego (`LAG`) lub następnego (`LEAD`) wiersza w kolejności okna, bez self-joina. `LAG(amount) OVER (ORDER BY day)` daje kwotę
z poprzedniego dnia, więc `amount - LAG(amount) OVER (...)` to zmiana dzienna. Opcjonalne argumenty ustawiają przesunięcie i wartość domyślną dla wierszy
bez poprzednika (w przeciwnym razie `NULL`).

### Jak policzyć sumę narastającą? {mid}

`SUM(amount) OVER (PARTITION BY account ORDER BY created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. Jawna ramka `ROWS` i unikalne `ORDER BY`
mają znaczenie: przy domyślnej ramce `RANGE` wiersze z tą samą wartością `ORDER BY` są równorzędne i wszystkie dostają tę samą sumę (w teście dwie sprzedaże
z tego samego dnia pokazały 700 zamiast 400 i 700).

### Dlaczego `LAST_VALUE` często zwraca wartość bieżącego wiersza? {senior}

Bo przy `ORDER BY` w `OVER` domyślna ramka biegnie od początku partycji do bieżącego wiersza (i jego wierszy równorzędnych), więc „ostatnią wartością” w ramce
jest bieżący wiersz. Żeby dostać ostatni wiersz całej partycji, ustawia się ramkę jawnie: `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` albo
używa `FIRST_VALUE` z odwróconą kolejnością.

### Czym jest ramka okna? {mid}

To podzbiór wierszy partycji, który funkcja taka jak `SUM` czy `AVG` bierze pod uwagę dla bieżącego wiersza, definiowany przez `ROWS` (fizyczne wiersze),
`RANGE` (zakresy wartości, z wierszami równorzędnymi) albo `GROUPS`, np. `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` dla okna przesuwnego z 3 wierszy. Bez
`ORDER BY` ramką jest cała partycja; z `ORDER BY` domyślnie od początku partycji do bieżącego wiersza, z użyciem `RANGE`.

### Dlaczego nie można użyć funkcji okna w `WHERE`? {mid}

Funkcje okna liczą się po `WHERE`, `GROUP BY` i `HAVING`, w fazie `SELECT`, bo działają na wierszach, które zostały po filtrowaniu i grupowaniu. Dlatego
`WHERE ROW_NUMBER() OVER (...) = 1` to błąd. Funkcję okna liczy się w podzapytaniu lub CTE i filtruje w zapytaniu zewnętrznym; niektóre silniki mają do
tego `QUALIFY`.

### Czym jest problem „gaps and islands” i jak rozwiązują go funkcje okna? {senior}

To znajdowanie serii kolejnych wartości („wysp”) w uporządkowanych danych, np. ciągów kolejnych aktywnych dni albo zakresów kolejnych numerów, i luk między
nimi. Sztuczka: w obrębie serii wartość i `ROW_NUMBER()` rosną o 1, więc `wartość - ROW_NUMBER()` jest dla serii stała. Grupowanie po tej różnicy daje
początek, koniec i długość każdej wyspy przez `MIN`, `MAX` i `COUNT`. Początek nowej wyspy można też wykryć przez `LAG`.
