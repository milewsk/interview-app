# Agregacja i grupowanie {mid}

Funkcje agregujące (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) zwijają wiele wierszy w jedną wartość. Z `GROUP BY` liczą
jedną wartość na grupę. Na tym opierają się raporty, dashboardy i wiele zadań rekrutacyjnych („przychód per region”,
„klienci z więcej niż 3 zamówieniami”).

## `GROUP BY` i `HAVING`

```sql
SELECT region, product, SUM(qty) AS qty
FROM sales
WHERE status = 'paid'            -- filtruj wiersze przed grupowaniem
GROUP BY region, product         -- jeden wiersz na parę (region, product)
HAVING SUM(qty) >= 2             -- filtruj grupy
ORDER BY region, product;
```

- Każda kolumna w `SELECT` musi być w `GROUP BY` albo wewnątrz agregatu.
- Można grupować po wyrażeniu (`GROUP BY qty % 2`, `GROUP BY date_trunc('month', created_at)`).
- Agregat **bez** `GROUP BY` zawsze zwraca jeden wiersz, nawet dla pustej tabeli: `COUNT(*) = 0`, `SUM` i `MAX` =
  `NULL`. Z `GROUP BY` puste wejście daje **zero** wierszy.

## Agregacja warunkowa

Pivot („opłacone kontra zwrócone per region”) w jednym przejściu po danych:

```sql
SELECT region,
       SUM(CASE WHEN status = 'paid' THEN qty * price ELSE 0 END)     AS paid,
       SUM(CASE WHEN status = 'refunded' THEN qty * price ELSE 0 END) AS refunded,
       COUNT(*) FILTER (WHERE status = 'refunded')                    AS refunds   -- standardowa klauzula FILTER
FROM sales
GROUP BY region;
```

`CASE` wewnątrz agregatu działa wszędzie. Standardową klauzulę `FILTER (WHERE ...)` obsługują PostgreSQL i SQLite, ale
nie SQL Server ani MySQL.

## Sumy częściowe: `ROLLUP`, `CUBE`, `GROUPING SETS`

```sql
SELECT region, product, SUM(qty) FROM sales GROUP BY ROLLUP (region, product);
-- EU | ink | 2,  EU | pen | 4,  EU | NULL | 6 (suma częściowa),  ...,  NULL | NULL | 16 (suma całkowita)
```

- `ROLLUP (a, b)` dodaje sumy częściowe per `a` i sumę całkowitą, `CUBE (a, b)` wszystkie kombinacje, a
  `GROUPING SETS ((a), (b), ())` dokładnie wybrane grupowania.
- W wierszach sum częściowych zgrupowane kolumny mają `NULL`. Funkcja `GROUPING(col)` zwraca w nich 1, co odróżnia je od
  prawdziwych `NULL` w danych.
- Obsługują je PostgreSQL, SQL Server i Oracle (MySQL ma `WITH ROLLUP`, SQLite żadnego z nich).

## Pułapki

- **Dzielenie całkowite i średnie**: `7 / 2` to `3` w PostgreSQL, SQLite i SQL Server. `AVG` kolumny całkowitej zwraca
  wynik ułamkowy w PostgreSQL i SQLite (2,67), ale **całkowity** w SQL Server, więc najpierw rzutuje się typ:
  `AVG(CAST(qty AS decimal(10,2)))`.
- `AVG` i inne agregaty ignorują `NULL` (zob. temat o `NULL`).
- `COUNT(DISTINCT x)` liczy różne wartości różne od `NULL`; dla kilku kolumn liczy się różne kombinacje przez
  podzapytanie.
- Złączenie przed agregacją może **mnożyć wiersze** i zawyżać sumy (zob. temat o złączeniach).

## Sklejanie wartości w grupie

| Baza | Funkcja |
|---|---|
| PostgreSQL | `string_agg(product, ',' ORDER BY product)` |
| SQL Server 2017+ | `STRING_AGG(product, ',') WITHIN GROUP (ORDER BY product)` |
| MySQL | `GROUP_CONCAT(product ORDER BY product SEPARATOR ',')` |
| SQLite | `group_concat(product, ',' ORDER BY product)` (`ORDER BY` w agregatach od 3.44) |

Bez jawnego porządku wewnątrz agregatu kolejność sklejanych wartości jest nieokreślona: w teście SQLite zwrócił
`pen,ink`, a PostgreSQL z `ORDER BY` zwrócił `ink,pen`.

## Źródła

- [PostgreSQL: aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html)
- [PostgreSQL: GROUPING SETS, CUBE and ROLLUP](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUPING-SETS)
- [SQL Server: AVG](https://learn.microsoft.com/en-us/sql/t-sql/functions/avg-transact-sql)
- [SQL Server: GROUP BY (ROLLUP, CUBE, GROUPING SETS)](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-group-by-transact-sql)
- [SQLite: aggregate functions](https://www.sqlite.org/lang_aggfunc.html)

## Pytania

### Co robi `GROUP BY`? {junior}

Dzieli wiersze na grupy o tych samych wartościach wymienionych kolumn lub wyrażeń i zwraca jeden wiersz na grupę, w którym funkcje agregujące (`SUM`,
`COUNT`, `AVG`...) są liczone na wierszach grupy. Na przykład `GROUP BY region` z `SUM(amount)` daje przychód per region. Kolumny na liście wyboru muszą
być zgrupowane albo zagregowane.

### Jak w jednym zapytaniu policzyć kilka różnych rzeczy, np. opłacone i zwrócone zamówienia per region? {mid}

Agregacją warunkową: `SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END)` i drugi `SUM` dla drugiego statusu albo
`COUNT(*) FILTER (WHERE status = 'refunded')` w bazach obsługujących `FILTER`. Liczy to wszystkie wartości w jednym przejściu po danych, zamiast osobnych
zapytań czy self-joinów, i jest standardowym sposobem obracania wierszy w kolumny (pivot).

### Co zwraca agregat na pustym zbiorze? {mid}

Bez `GROUP BY` zapytanie agregujące zawsze zwraca jeden wiersz: `COUNT(*)` daje 0, a `SUM`, `AVG`, `MIN`, `MAX` dają `NULL`. Z `GROUP BY` puste wejście
w ogóle nie daje wierszy, bo nie ma grup. Dlatego raporty używają `COALESCE(SUM(x), 0)`, a „brak wierszy” i „wiersz z zerem” wymagają w kodzie aplikacji
różnej obsługi.

### Czym są `ROLLUP` i `GROUPING SETS`? {mid}

To rozszerzenia `GROUP BY`, które liczą kilka poziomów agregacji w jednym zapytaniu. `ROLLUP (region, product)` zwraca sumy per region i produkt, sumy
częściowe per region i sumę całkowitą. `CUBE` zwraca wszystkie kombinacje, a `GROUPING SETS` dokładnie wymienione grupowania. W wierszach sum częściowych
zgrupowane kolumny mają `NULL`, a `GROUPING(col) = 1` odróżnia je od `NULL` w danych.

### Dlaczego `AVG` może zwrócić nieoczekiwaną wartość dla kolumny całkowitej? {mid}

W SQL Server `AVG` po kolumnie `int` zwraca `int`, więc średnia 2,67 zostaje obcięta do 2. Ten sam efekt daje dzielenie całkowite (`7 / 2 = 3`) w większości
baz. Przed agregacją rzutuje się na typ dziesiętny: `AVG(CAST(qty AS decimal(10,2)))` albo `AVG(qty * 1.0)`. PostgreSQL i SQLite zwracają dla liczb
całkowitych średnią ułamkową, co jest kolejną różnicą między dialektami, którą warto znać.

### Jak znaleźć klientów z więcej niż 3 zamówieniami? {junior}

Pogrupować zamówienia po kliencie i przefiltrować grupy przez `HAVING`:
`SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 3`. Nie da się do tego użyć `WHERE`, bo jest przetwarzane przed
grupowaniem, gdy licznik jeszcze nie istnieje. Żeby dostać też nazwy klientów, łączy się wynik z tabelą klientów albo grupuje po ich kluczu i nazwie.

### Jak skleić wartości z grupy w jeden string? {mid}

Funkcją agregacji stringów, która różni się między bazami: `string_agg(col, ',')` w PostgreSQL, `STRING_AGG(col, ',')` w SQL Server 2017+,
`GROUP_CONCAT(col)` w MySQL i `group_concat(col)` w SQLite. Dla deterministycznego wyniku podaje się kolejność wewnątrz agregatu (`ORDER BY` albo
`WITHIN GROUP (ORDER BY ...)`), bo inaczej jest nieokreślona.

### Czym różni się `COUNT(DISTINCT col)` od `COUNT(col)`? {junior}

`COUNT(col)` liczy wszystkie wartości różne od `NULL`, łącznie z powtórzeniami, a `COUNT(DISTINCT col)` liczy każdą różną wartość raz. Na przykład zamówienia
od 3 klientów, z których jeden zamówił dwa razy: `COUNT(customer_id) = 4`, `COUNT(DISTINCT customer_id) = 3`. Na dużych tabelach `COUNT(DISTINCT)` jest
droższe, bo wymaga sortowania albo haszowania wartości.

### Czy można grupować po wyrażeniu? {junior}

Tak: `GROUP BY date_trunc('month', created_at)` grupuje po miesiącu, `GROUP BY qty % 2` po parzystości,
`GROUP BY CASE WHEN total > 100 THEN 'big' ELSE 'small' END` po kategorii. To samo wyrażenie powtarza się potem w `SELECT` (albo, w PostgreSQL, MySQL
i SQLite, odwołuje przez alias). Grupowanie po funkcji kolumny zwykle uniemożliwia użycie zwykłego indeksu na tej kolumnie.

### Jak znaleźć najlepszy produkt w każdym regionie, a nie tylko maksymalną wartość? {senior}

`MAX(qty)` z `GROUP BY region` daje tylko wartość, a nie wiersz, do którego należy, i nie można po prostu dodać `product` do listy wyboru. Używa się funkcji
okna: numeruje wiersze w każdym regionie przez `ROW_NUMBER() OVER (PARTITION BY region ORDER BY qty DESC)` i zostawia te z numerem 1, albo `LATERAL`/`APPLY`.
Złączenie z powrotem po wartości maksymalnej też działa, ale przy remisach zwraca kilka wierszy.
