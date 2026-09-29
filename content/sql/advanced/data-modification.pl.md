# Modyfikacja danych: INSERT, UPDATE, DELETE, upsert {mid}

Instrukcje modyfikujące dane (DML) wyglądają prosto, ale rozmowy sprawdzają szczegóły: aktualizację na podstawie
innej tabeli, **upsert** („wstaw albo zaktualizuj”), zwracanie zmienionych wierszy, różnicę między `DELETE`
a `TRUNCATE` i pułapki współbieżności.

## `INSERT`

```sql
INSERT INTO products (sku, name, price) VALUES ('A', 'Pen', 2), ('B', 'Ink', 5);   -- wiele wierszy naraz
INSERT INTO products (sku, name, price)
SELECT u.sku, 'New', u.new_price FROM price_updates u
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = u.sku);                    -- INSERT ... SELECT
```

Zawsze wymienia się kolumny docelowe: instrukcja nie zależy wtedy od kolejności kolumn, a pominięte kolumny dostają
wartości `DEFAULT`.

## `UPDATE` i `DELETE` na podstawie innej tabeli

| Baza | Aktualizacja ze złączeniem |
|---|---|
| PostgreSQL, SQLite 3.33+ | `UPDATE products SET price = u.new_price FROM price_updates u WHERE u.sku = products.sku` |
| SQL Server | `UPDATE p SET price = u.new_price FROM products p JOIN price_updates u ON u.sku = p.sku` |
| MySQL | `UPDATE products p JOIN price_updates u ON u.sku = p.sku SET p.price = u.new_price` |
| standard | `UPDATE products SET price = (SELECT ...) WHERE EXISTS (SELECT ...)` albo `MERGE` |

- W standardowym SQL (oraz PostgreSQL, SQLite, SQL Server) wszystkie wyrażenia po prawej stronie `SET` używają **starych**
  wartości, więc `SET a = b, b = a` zamienia dwie kolumny (sprawdzone: 10, 20 → 20, 10). **MySQL wykonuje przypisania
  w aktualizacji jednej tabeli od lewej do prawej**, więc ta sama instrukcja ustawia obie na 20.
- `UPDATE` albo `DELETE` **bez `WHERE`** zmienia każdy wiersz. Bezpieczny nawyk: najpierw uruchomić `SELECT` z tym samym
  `WHERE`, a zmiany wykonywać w transakcji.
- Duże aktualizacje i usunięcia często wykonuje się porcjami (np. po 5000 wierszy), żeby ograniczyć blokady, rozrost
  dziennika transakcji i opóźnienie replikacji.

## Zwracanie zmienionych wierszy

- PostgreSQL i SQLite 3.35+: `... RETURNING id, price` po `INSERT`, `UPDATE`, `DELETE` (i `MERGE` w PostgreSQL).
- SQL Server: `OUTPUT inserted.id, deleted.price` (pseudotabele `inserted` i `deleted` zawierają nowe i stare wartości).
- MySQL nie ma `RETURNING`; wygenerowany klucz odczytuje się przez `LAST_INSERT_ID()`.

Pozwala to zwrócić wygenerowane klucze i obliczone wartości bez drugiego zapytania.

## Upsert: wstaw albo zaktualizuj

```sql
-- PostgreSQL, SQLite
INSERT INTO products (sku, name, price, stock) VALUES ('A', 'Pen v2', 2.75, 10)
ON CONFLICT (sku) DO UPDATE
SET price = excluded.price,                     -- excluded = wiersz, który próbowano wstawić
    stock = products.stock + excluded.stock;

INSERT INTO products (sku, name, price) VALUES ('B', 'dup', 0) ON CONFLICT DO NOTHING;
```

| Baza | Składnia |
|---|---|
| PostgreSQL, SQLite | `INSERT ... ON CONFLICT (klucz) DO UPDATE / DO NOTHING` |
| MySQL | `INSERT ... ON DUPLICATE KEY UPDATE col = VALUES(col)` (albo alias wiersza w 8.0.19+) |
| SQL Server, Oracle, PostgreSQL 15+ | `MERGE INTO target USING source ON ... WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT ...` |

- `ON CONFLICT` wymaga **ograniczenia lub indeksu unikalnego** na kolumnach konfliktu i jest atomowe: dwa równoczesne
  upserty tego samego klucza nie wstawią obu wierszy.
- Wzorzec „sprawdź, potem wstaw” w kodzie aplikacji (`SELECT`, a jeśli brak, `INSERT`) to **wyścig**: dwa żądania mogą
  jednocześnie nie znaleźć wiersza i oba go wstawić, co daje duplikat albo błąd klucza unikalnego. Używa się upsertu
  bazy albo przynajmniej ograniczenia unikalnego z ponowieniem.
- `MERGE` w SQL Server jako upsert przy współbieżności wymaga wskazówki `HOLDLOCK` (serializable), żeby uniknąć naruszeń
  klucza unikalnego, a dokumentacja Microsoftu ostrzega, że przy dużej skali `MERGE` może wprowadzać skomplikowane
  problemy ze współbieżnością. Częstą alternatywą są osobne `UPDATE`, a potem `INSERT` w transakcji.

## `DELETE` a `TRUNCATE`

| | `DELETE` | `TRUNCATE` |
|---|---|---|
| `WHERE` | tak | nie, zawsze cała tabela |
| Szybkość na dużych tabelach | usuwa wiersz po wierszu, loguje każdy wiersz | zwalnia strony danych, bardzo szybkie |
| Triggery | triggery `DELETE` się uruchamiają | triggery wierszowe się nie uruchamiają |
| Identity / sekwencja | kontynuuje | zwykle resetuje (SQL Server; w PostgreSQL z `RESTART IDENTITY`) |
| Wycofanie | tak | tak w PostgreSQL i SQL Server (sprawdzone w PostgreSQL); w MySQL powoduje niejawny commit |
| Klucze obce | sprawdzane dla każdego wiersza | niedozwolone, gdy tabela jest referencjonowana (chyba że `CASCADE` w PostgreSQL) |

SQLite nie ma `TRUNCATE` (zamiast tego optymalizuje `DELETE FROM t` bez `WHERE`).

## Źródła

- [PostgreSQL: INSERT (ON CONFLICT)](https://www.postgresql.org/docs/current/sql-insert.html)
- [PostgreSQL: MERGE](https://www.postgresql.org/docs/current/sql-merge.html)
- [SQL Server: MERGE](https://learn.microsoft.com/en-us/sql/t-sql/statements/merge-transact-sql)
- [SQL Server: OUTPUT clause](https://learn.microsoft.com/en-us/sql/t-sql/queries/output-clause-transact-sql)
- [MySQL: UPDATE](https://dev.mysql.com/doc/refman/8.4/en/update.html)
- [SQLite: UPSERT](https://www.sqlite.org/lang_upsert.html)

## Pytania

### Jak zaktualizować wiersze na podstawie danych z innej tabeli? {mid}

Złączeniem w `UPDATE`, którego składnia różni się między bazami: `UPDATE t SET ... FROM other WHERE other.key = t.key` w PostgreSQL i SQLite,
`UPDATE t SET ... FROM t JOIN other ON ...` w SQL Server, `UPDATE t JOIN other ON ... SET ...` w MySQL. Przenośna forma używa skorelowanego podzapytania w `SET`
z `WHERE EXISTS` albo `MERGE`. Zawsze trzeba sprawdzić, czy złączenie nie dopasowuje kilku wierszy źródłowych do jednego docelowego, bo wtedy wynik jest
niejednoznaczny.

### Czym jest upsert i jak zrobić go bezpiecznie? {mid}

„Wstaw, a jeśli już istnieje, zaktualizuj”. Bezpiecznie znaczy atomowo, w bazie: `INSERT ... ON CONFLICT (klucz) DO UPDATE` w PostgreSQL i SQLite,
`INSERT ... ON DUPLICATE KEY UPDATE` w MySQL, `MERGE` (z `HOLDLOCK`) w SQL Server. Wymaga ograniczenia unikalnego na kluczu. `SELECT`, a potem `INSERT`
w kodzie aplikacji to wyścig: dwa równoczesne żądania mogą oba zdecydować o wstawieniu.

### Co oznacza `excluded` w `ON CONFLICT DO UPDATE`? {mid}

To pseudotabela zawierająca wiersz, który próbowano wstawić, ale który spowodował konflikt. `SET price = excluded.price` bierze więc nową wartość, a
`products.stock + excluded.stock` łączy istniejącą i nową wartość, np. żeby dodać stan magazynowy. Do istniejącego wiersza odwołuje się przez nazwę tabeli
(lub alias). Odpowiednikiem w MySQL jest `VALUES(col)` albo alias wiersza.

### Jak pobrać identyfikator nowo wstawionego wiersza? {junior}

Bez drugiego zapytania: `INSERT ... RETURNING id` w PostgreSQL i SQLite 3.35+, `OUTPUT inserted.id` w SQL Server i `LAST_INSERT_ID()` w MySQL. Należy unikać
`SELECT MAX(id)` po wstawieniu, bo inna sesja może coś wstawić w międzyczasie, a w SQL Server lepiej użyć `SCOPE_IDENTITY()` albo `OUTPUT` niż `@@IDENTITY`,
które może zwrócić klucz wygenerowany przez trigger.

### Czym różni się `DELETE` od `TRUNCATE`? {mid}

`DELETE` usuwa wiersze pojedynczo, może mieć `WHERE`, uruchamia triggery i loguje każdy wiersz. `TRUNCATE` zawsze opróżnia całą tabelę przez zwolnienie jej
stron, więc jest dużo szybsze, nie uruchamia triggerów wierszowych, zwykle resetuje liczniki identity i nie można go użyć na tabeli referencjonowanej przez
klucze obce. Da się je wycofać w PostgreSQL i SQL Server, ale w MySQL powoduje niejawny commit.

### Co robi `UPDATE t SET a = b, b = a`? {senior}

W standardowym SQL, PostgreSQL, SQL Server i SQLite każde wyrażenie po prawej stronie `SET` widzi wartości sprzed aktualizacji, więc kolumny zostają
zamienione. MySQL wykonuje przypisania w aktualizacji jednej tabeli od lewej do prawej, więc `a` najpierw dostaje wartość `b`, a potem `b` dostaje nowe `a`,
i obie kończą równe. To dobry przykład różnic między dialektami, na które może trafić kod polegający na „standardowym zachowaniu”.

### Dlaczego „sprawdź, czy istnieje, potem wstaw” to błąd? {mid}

Między `SELECT`, który nic nie znalazł, a `INSERT` inna transakcja może wstawić ten sam klucz, bo zwykły odczyt nie blokuje nieistniejącego wiersza (przy
domyślnych poziomach izolacji). Wynikiem pod obciążeniem jest duplikat albo naruszenie klucza unikalnego. Rozwiązaniem jest ograniczenie unikalne plus
atomowy upsert bazy albo złapanie naruszenia unikalności i ponowienie lub aktualizacja.

### Jak bezpiecznie usunąć lub zaktualizować miliony wierszy? {senior}

Porcjami: wielokrotnie usuwać lub aktualizować ograniczoną liczbę wierszy (`DELETE ... WHERE id IN (SELECT id ... LIMIT 5000)`, `DELETE TOP (5000)` w SQL
Server) w osobnych transakcjach, aż nic nie zostanie. Jedna ogromna instrukcja długo trzyma blokady, rozdmuchuje dziennik transakcji, może blokować innych
użytkowników i replikację, a błąd wycofuje wszystko. Jeśli znika cała tabela, szybsze jest `TRUNCATE` albo usunięcie partycji.

### Co robi `MERGE`? {mid}

Łączy tabelę docelową ze źródłem (tabelą, podzapytaniem albo listą wartości) i w jednej instrukcji wykonuje różne akcje zależnie od tego, czy wiersze się
dopasowały: `WHEN MATCHED THEN UPDATE` albo `DELETE`, `WHEN NOT MATCHED THEN INSERT`, a w SQL Server także `WHEN NOT MATCHED BY SOURCE`. Służy do
synchronizacji tabel i upsertów. Jest dostępny w SQL Server, Oracle i PostgreSQL 15+; w SQL Server wymaga ostrożności przy współbieżności (`HOLDLOCK`).

### Jak zabezpieczyć się przed `UPDATE` bez `WHERE`? {junior}

Najpierw napisać i uruchomić odpowiadający `SELECT` z tym samym `WHERE`, sprawdzić liczbę wierszy i wykonać zmianę w jawnej transakcji, żeby dało się ją
wycofać, jeśli liczba zmienionych wierszy jest zła. Pomagają też narzędzia i ustawienia: `sql_safe_updates` w MySQL, przegląd kodu skryptów migracyjnych
i ograniczony dostęp do produkcji. Ostatnią linią obrony są kopie zapasowe i odtwarzanie do punktu w czasie.
