# NULL i logika trójwartościowa {mid}

`NULL` oznacza **„nieznane” albo „brak”**, a nie zero czy pusty string. Każde porównanie z `NULL` daje nie `TRUE` ani
`FALSE`, tylko **`UNKNOWN`**. SQL używa **logiki trójwartościowej**, a większość błędów z `NULL` bierze się
z zapomnienia o niej.

## Logika trójwartościowa

| Wyrażenie | Wynik |
|---|---|
| `NULL = NULL`, `NULL <> 1`, `NULL > 0` | `UNKNOWN` |
| `NOT UNKNOWN` | `UNKNOWN` |
| `TRUE OR UNKNOWN` | `TRUE` |
| `FALSE AND UNKNOWN` | `FALSE` |
| `TRUE AND UNKNOWN`, `FALSE OR UNKNOWN` | `UNKNOWN` |

- `WHERE` i `JOIN ... ON` zostawiają tylko wiersze, dla których warunek jest `TRUE`, więc `UNKNOWN` działa tam jak
  `FALSE`.
- Ograniczenia `CHECK` odrzucają tylko `FALSE`, więc `UNKNOWN` przechodzi: `CHECK (bonus >= 0)` przyjmuje `NULL`. Jeśli
  wartość jest wymagana, dodaje się `NOT NULL`.
- `CASE WHEN NULL THEN ...` trafia do `ELSE`.

## Typowe pułapki

```sql
SELECT * FROM emp WHERE manager_id = NULL;    -- 🔴 zawsze 0 wierszy
SELECT * FROM emp WHERE manager_id IS NULL;   -- ✅

SELECT * FROM emp WHERE bonus <> 100;         -- wiersze z bonus = NULL NIE zostaną zwrócone
```

**`NOT IN` z `NULL` w podzapytaniu nic nie zwraca:**

```sql
-- pracownicy, którzy nie są niczyimi przełożonymi
SELECT name FROM emp WHERE id NOT IN (SELECT manager_id FROM emp);   -- 🔴 0 wierszy, bo manager_id zawiera NULL
SELECT name FROM emp e
WHERE NOT EXISTS (SELECT 1 FROM emp s WHERE s.manager_id = e.id);    -- ✅ Cy, Di
```

`id NOT IN (1, 2, NULL)` oznacza `id <> 1 AND id <> 2 AND id <> NULL`, a ostatnia część zawsze daje `UNKNOWN`, więc
żaden wiersz nie przejdzie. Rozwiązaniem jest `NOT EXISTS` (albo odfiltrowanie `NULL` w podzapytaniu). `IN` z `NULL`
na liście działa normalnie, po prostu nigdy nie dopasuje `NULL`.

## Funkcje i operatory

- `COALESCE(a, b, ...)` zwraca pierwszy argument różny od `NULL` (standard). `ISNULL` (SQL Server), `IFNULL` (MySQL,
  SQLite) i `NVL` (Oracle) to warianty dialektów dla dwóch argumentów.
- `NULLIF(a, b)` zwraca `NULL`, gdy `a = b`, co służy do unikania dzielenia przez zero: `total / NULLIF(count, 0)`.
- `a IS DISTINCT FROM b` porównuje, traktując `NULL` jak zwykłą wartość (`NULL IS DISTINCT FROM NULL` to fałsz).
  Obsługują to PostgreSQL, SQLite i SQL Server 2022+; SQLite ma też `IS NOT`, a MySQL operator `<=>` (równość
  bezpieczna dla `NULL`).
- **Arytmetyka i konkatenacja z `NULL` dają `NULL`**: `1 + NULL`, `'a' || NULL`. Funkcja `CONCAT()` ignoruje `NULL`
  (`concat('a', NULL, 'b')` = `'ab'`) w PostgreSQL, SQL Server i MySQL.
- Oracle traktuje pusty string `''` jako `NULL`; inne bazy nie.

## Agregaty, grupowanie i unikalność

- **Agregaty pomijają `NULL`**: dla premii `100, NULL, 50, NULL` `SUM = 150`, `AVG = 75` (średnia z 2 wartości, nie
  z 4) i `COUNT(bonus) = 2`, a `COUNT(*) = 4`. Jeśli brak oznacza zero, używa się `AVG(COALESCE(bonus, 0))` = 37,5.
- `SUM` z samych `NULL` (albo bez wierszy) zwraca `NULL`, a nie 0, dlatego raporty często używają
  `COALESCE(SUM(x), 0)`.
- `GROUP BY` i `DISTINCT` traktują wszystkie `NULL` jako **jedną grupę**.
- Ograniczenie `UNIQUE` dopuszcza **wiele `NULL`** w PostgreSQL, SQLite, MySQL i Oracle (nie są sobie równe), ale
  **tylko jeden** w SQL Server (tam używa się filtrowanego indeksu unikalnego `WHERE col IS NOT NULL`). PostgreSQL 15+ ma
  `UNIQUE NULLS NOT DISTINCT`, żeby dopuścić tylko jeden.

## Źródła

- [PostgreSQL: comparison functions and operators](https://www.postgresql.org/docs/current/functions-comparison.html)
- [PostgreSQL: conditional expressions (COALESCE, NULLIF)](https://www.postgresql.org/docs/current/functions-conditional.html)
- [SQL Server: IS [NOT] DISTINCT FROM](https://learn.microsoft.com/en-us/sql/t-sql/queries/is-distinct-from-transact-sql)
- [SQLite: NULL handling in SQLite versus other database engines](https://www.sqlite.org/nulls.html)

## Pytania

### Co oznacza `NULL` w SQL i co zwraca `NULL = NULL`? {junior}

`NULL` oznacza nieznaną lub brakującą wartość, a nie zero czy pusty string. Porównanie czegokolwiek z `NULL`, także z innym `NULL`, daje `UNKNOWN`, a nie
`TRUE`, bo o dwóch nieznanych wartościach nie da się powiedzieć, że są równe. Dlatego `NULL` sprawdza się przez `IS NULL` / `IS NOT NULL`, a
`WHERE col = NULL` nigdy nie zwraca wierszy.

### Czym jest logika trójwartościowa? {mid}

To logika z trzema wartościami: `TRUE`, `FALSE` i `UNKNOWN`, czyli wynikiem porównań z udziałem `NULL`. `NOT UNKNOWN` to nadal `UNKNOWN`,
`TRUE OR UNKNOWN` to `TRUE`, a `FALSE AND UNKNOWN` to `FALSE`. `WHERE` zostawia tylko wiersze, dla których warunek jest `TRUE`, a ograniczenia `CHECK`
odrzucają tylko `FALSE`, więc `NULL` przechodzi przez warunek w rodzaju `price > 0`.

### Dlaczego `NOT IN` z podzapytaniem może nie zwrócić żadnych wierszy? {mid}

Jeśli podzapytanie zwraca choć jeden `NULL`, `x NOT IN (..., NULL)` rozwija się do `... AND x <> NULL`, co dla każdego wiersza daje `UNKNOWN`, więc nic nie
przechodzi przez `WHERE`. Na przykład szukanie pracowników, którzy nie są niczyimi przełożonymi, przez `id NOT IN (SELECT manager_id FROM emp)` zwraca
0 wierszy, gdy któryś `manager_id` jest `NULL`. Używa się `NOT EXISTS`, na które `NULL` nie wpływa, albo odfiltrowuje je w podzapytaniu.

### Dlaczego `WHERE status <> 'closed'` nie zwraca wierszy, w których `status` jest `NULL`? {junior}

Bo `NULL <> 'closed'` to `UNKNOWN`, a nie `TRUE`, a `WHERE` zostawia tylko `TRUE`. Jeśli wiersze bez statusu mają być uwzględnione, dodaje się to jawnie:
`WHERE status <> 'closed' OR status IS NULL` albo używa `status IS DISTINCT FROM 'closed'`.

### Jak funkcje agregujące traktują `NULL`? {mid}

Ignorują go: `SUM`, `AVG`, `MIN`, `MAX` i `COUNT(kolumna)` biorą pod uwagę tylko wartości różne od `NULL`, a `COUNT(*)` liczy wszystkie wiersze. `AVG` to więc
średnia znanych wartości, a nie wszystkich wierszy, a `SUM` bez żadnych wartości różnych od `NULL` zwraca `NULL`, a nie 0. Jeśli brakujące wartości mają
liczyć się jako zero, używa się `COALESCE` wewnątrz agregatu, a `COALESCE(SUM(x), 0)` dla wyniku.

### Do czego służą `COALESCE` i `NULLIF`? {junior}

`COALESCE(a, b, c)` zwraca pierwszy argument różny od `NULL`, np. wartość domyślną: `COALESCE(nickname, first_name)`. `NULLIF(a, b)` zwraca `NULL`, gdy
argumenty są równe, a w przeciwnym razie `a`; typowe użycie to unikanie dzielenia przez zero: `total / NULLIF(quantity, 0)` daje `NULL` zamiast błędu.

### Jak porównać dwie kolumny, które mogą zawierać `NULL`? {mid}

`a = b` daje `UNKNOWN`, gdy którakolwiek jest `NULL`, więc dwa `NULL` nie są uznawane za równe. Porównanie bezpieczne dla `NULL` to
`a IS NOT DISTINCT FROM b` (PostgreSQL, SQLite, SQL Server 2022+), `a <=> b` w MySQL albo ręcznie: `(a = b OR (a IS NULL AND b IS NULL))`. Ma to znaczenie
np. przy wykrywaniu zmienionych wierszy podczas synchronizacji danych.

### Czy kolumna z ograniczeniem `UNIQUE` może zawierać kilka `NULL`? {mid}

Zależy od bazy. W PostgreSQL, MySQL, SQLite i Oracle tak, bo `NULL` nie są sobie równe. SQL Server dopuszcza tylko jeden `NULL` w ograniczeniu unikalnym,
więc gdy wiele wierszy może nie mieć wartości, używa się filtrowanego indeksu unikalnego (`WHERE col IS NOT NULL`). PostgreSQL 15+ pozwala wybrać
`NULLS NOT DISTINCT`, żeby dopuścić tylko jeden.

### Co zwraca `1 + NULL` albo `'abc' || NULL`? {junior}

`NULL`: prawie każdy operator z argumentem `NULL` zwraca `NULL`, bo wynik jest nieznany. Często zaskakuje to przy konkatenacji, np.
`first_name || ' ' || middle_name` staje się `NULL`, gdy nie ma drugiego imienia. Używa się `COALESCE` dla każdej części albo funkcji `CONCAT()`, która
w PostgreSQL, SQL Server i MySQL traktuje `NULL` jak pusty string.

### Jak `GROUP BY` i `DISTINCT` traktują `NULL`? {mid}

W przeciwieństwie do porównań grupowanie i `DISTINCT` traktują wszystkie `NULL` jako równe, więc tworzą one jedną grupę i liczą się jako jedna różna
wartość. Na przykład `GROUP BY manager_id` zwraca jeden wiersz dla wszystkich pracowników bez przełożonego. To samo dotyczy operacji na zbiorach, jak
`UNION`, który usuwa zduplikowane wiersze zawierające `NULL`.
