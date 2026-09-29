# Transakcje, ACID i poziomy izolacji {mid}

Transakcja grupuje kilka operacji w jedną całość: albo **wszystkie** zostaną zastosowane, albo **żadna**. Poziomy izolacji
określają, jak równoległe transakcje widzą nawzajem swoje zmiany. To jeden z najczęściej pytanych tematów bazodanowych,
bo stąd biorą się błędy poprawności pod obciążeniem.

## ACID

- **Atomowość** (atomicity): wszystko albo nic. W teście przelew, którego drugi `UPDATE` naruszył
  `CHECK (balance >= 0)`, został wycofany w całości, a oba salda pozostały bez zmian (100 i 0).
- **Spójność** (consistency): transakcja przeprowadza bazę z jednego poprawnego stanu w inny, respektując ograniczenia.
- **Izolacja** (isolation): równoległe transakcje nie wpływają na siebie bardziej, niż pozwala poziom izolacji.
- **Trwałość** (durability): zatwierdzone zmiany przetrwają awarię (dzięki dziennikowi zapisu z wyprzedzeniem / dziennikowi
  transakcji).

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;            -- albo ROLLBACK
```

- Bez jawnego `BEGIN` większość baz wykonuje każdą instrukcję we własnej transakcji (**autocommit**).
- **Savepointy** pozwalają na częściowe wycofanie: `SAVEPOINT s1; ...; ROLLBACK TO SAVEPOINT s1;` cofa tylko pracę po
  savepoincie (sprawdzone: saldo wróciło do 90, a nie do 0).
- W PostgreSQL po dowolnym błędzie w transakcji każda kolejna instrukcja kończy się błędem
  `current transaction is aborted, commands ignored until end of transaction block` aż do `ROLLBACK` (albo wycofania do
  savepointu).

## Anomalie współbieżności

| Anomalia | Co się dzieje |
|---|---|
| **Brudny odczyt** (dirty read) | odczyt danych, których inna transakcja nie zatwierdziła (może je jeszcze wycofać) |
| **Niepowtarzalny odczyt** (non-repeatable read) | dwukrotny odczyt tego samego wiersza w jednej transakcji daje różne wartości, bo inna transakcja w międzyczasie zatwierdziła zmianę |
| **Odczyt fantomów** (phantom read) | ponowne wykonanie zapytania zwraca nowe albo brakujące wiersze, bo inna transakcja wstawiła lub usunęła pasujące wiersze |
| **Utracona aktualizacja** (lost update) | dwie transakcje odczytują wartość i obie zapisują wartość z niej wyliczoną; jedna zmiana zostaje nadpisana |
| **Write skew** | dwie transakcje czytają nakładające się dane, podejmują decyzje i zapisują różne wiersze, razem łamiąc regułę (np. obaj lekarze schodzą z dyżuru) |

## Poziomy izolacji (standard SQL)

| Poziom | Brudny odczyt | Niepowtarzalny odczyt | Fantomy |
|---|---|---|---|
| Read uncommitted | możliwy | możliwy | możliwe |
| **Read committed** | wykluczony | możliwy | możliwe |
| Repeatable read | wykluczony | wykluczony | możliwe |
| Serializable | wykluczony | wykluczony | wykluczone (i wszystkie inne anomalie) |

Implementacje różnią się od standardu:

- **PostgreSQL**: domyślnie `READ COMMITTED`; `READ UNCOMMITTED` działa jak `READ COMMITTED` (w ogóle brak brudnych
  odczytów); `REPEATABLE READ` to izolacja migawkowa, która zapobiega też fantomom; `SERIALIZABLE` (SSI) wykrywa anomalie
  i przerywa transakcję z **błędem serializacji**. Gdy dwie transakcje repeatable read aktualizują ten sam wiersz, druga
  kończy się błędem `could not serialize access due to concurrent update`, a aplikacja musi **ponowić** całą transakcję.
- **SQL Server**: domyślnie `READ COMMITTED` z użyciem **blokad współdzielonych** (czytelnicy i pisarze blokują się
  nawzajem), chyba że baza ma włączone `READ_COMMITTED_SNAPSHOT`, które używa wersjonowania wierszy (domyślnie w Azure SQL
  Database). Jest też poziom `SNAPSHOT` (wymaga `ALLOW_SNAPSHOT_ISOLATION`). `READ UNCOMMITTED` to to samo co `NOLOCK`
  i pozwala na brudne odczyty.
- **MySQL InnoDB**: domyślnie `REPEATABLE READ` ze spójnymi migawkami.
- **SQLite**: transakcje są serializowalne; w trybie WAL transakcja odczytu widzi migawkę. W teście z dwoma połączeniami
  czytelnik nie zobaczył niezatwierdzonej zmiany (brak brudnego odczytu), wewnątrz swojej transakcji nadal widział 100
  po tym, jak drugie połączenie zatwierdziło 150, i zobaczył 150 po zatwierdzeniu. Drugi pisarz dostał
  `database is locked`.

## MVCC a blokady

**MVCC** (multi-version concurrency control, używane przez PostgreSQL, Oracle, MySQL InnoDB i SQL Server z opcjami
migawkowymi) przechowuje stare wersje wierszy, więc czytelnicy widzą spójną migawkę, a **czytelnicy nie blokują
pisarzy i pisarze nie blokują czytelników**. Izolacja oparta na blokadach (klasyczne `READ COMMITTED` w SQL Server) każe
czytelnikom czekać na pisarzy. Pisarze modyfikujący ten sam wiersz zawsze wchodzą w konflikt, niezależnie od modelu.

## Utracone aktualizacje w kodzie aplikacji

```text
A: SELECT balance → 100          B: SELECT balance → 100
A: UPDATE SET balance = 110      B: UPDATE SET balance = 120      → wynik 120, +10 od A przepadło (sprawdzone: oczekiwano 130, jest 120)
```

Domyślne `READ COMMITTED` temu nie zapobiega. Rozwiązania:

1. **Atomowa aktualizacja w SQL**: `UPDATE accounts SET balance = balance + 10 WHERE id = 2` (sprawdzone: 130).
2. **Współbieżność optymistyczna**: kolumna wersji, `UPDATE ... SET ..., version = version + 1 WHERE id = 1 AND version = @v`;
   0 zmienionych wierszy oznacza, że ktoś inny zmienił rekord (sprawdzone: druga aktualizacja z nieaktualną wersją
   zmieniła 0 wierszy).
3. **Blokowanie pesymistyczne**: `SELECT ... FOR UPDATE` (PostgreSQL, MySQL) albo `WITH (UPDLOCK)` (SQL Server) przed
   modyfikacją.
4. Wyższy poziom izolacji (`REPEATABLE READ`/`SERIALIZABLE`) plus ponawianie przy błędach serializacji.

## Źródła

- [PostgreSQL: transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL: transactions tutorial (savepoints)](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [SQL Server: SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql)
- [MySQL: InnoDB transaction isolation levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [SQLite: isolation in SQLite](https://www.sqlite.org/isolation.html)

## Pytania

### Co oznacza ACID? {junior}

Atomowość (operacje transakcji działają razem albo wcale), spójność (transakcja zostawia bazę w stanie spełniającym wszystkie ograniczenia), izolacja
(równoległe transakcje nie widzą swoich stanów pośrednich bardziej, niż pozwala poziom izolacji) i trwałość (zatwierdzone zmiany przetrwają awarie dzięki
dziennikowi transakcji). Razem gwarantują, że np. przelew nigdy nie zgubi ani nie stworzy pieniędzy.

### Jakie są standardowe poziomy izolacji i którym anomaliom zapobiegają? {mid}

Read uncommitted pozwala na brudne odczyty; read committed zapobiega brudnym odczytom, ale dopuszcza niepowtarzalne odczyty i fantomy; repeatable read zapobiega
też niepowtarzalnym odczytom; serializable zapobiega wszystkim anomaliom, więc wynik odpowiada jakiemuś szeregowemu wykonaniu transakcji. Wyższe poziomy dają
więcej spójności i mniej współbieżności (więcej blokowania albo więcej błędów serializacji). Bazy implementują je różnie, np. repeatable read w PostgreSQL
zapobiega też fantomom.

### Jaki jest domyślny poziom izolacji w popularnych bazach? {junior}

`READ COMMITTED` w PostgreSQL, SQL Server i Oracle; `REPEATABLE READ` w MySQL InnoDB; transakcje w SQLite są serializowalne. W SQL Server `READ COMMITTED`
domyślnie używa blokad, ale z opcją bazy `READ_COMMITTED_SNAPSHOT` (domyślnie włączoną w Azure SQL Database) używa zamiast tego wersjonowania wierszy, więc
czytelnicy nie blokują pisarzy.

### Czym jest niepowtarzalny odczyt i czym różni się od odczytu fantomów? {mid}

Niepowtarzalny odczyt to sytuacja, gdy ten sam wiersz odczytany dwa razy w jednej transakcji ma różne wartości, bo inna transakcja w międzyczasie go zaktualizowała
i zatwierdziła. Odczyt fantomów to sytuacja, gdy ponowne wykonanie zapytania zwraca inny zbiór wierszy, bo inna transakcja wstawiła albo usunęła wiersze pasujące
do warunku. Pierwsze dotyczy zmian istniejących wierszy, drugie samego zbioru wierszy.

### Czym jest utracona aktualizacja i jak jej zapobiec? {mid}

Dwie transakcje odczytują tę samą wartość, wyliczają nową w aplikacji i zapisują ją z powrotem, więc drugi zapis nadpisuje pierwszy i jedna zmiana przepada (w teście:
oczekiwano 130, jest 120). Zapobiega się temu atomową aktualizacją w SQL (`SET balance = balance + 10`), współbieżnością optymistyczną z kolumną wersji sprawdzaną
w `WHERE`, blokowaniem pesymistycznym przez `SELECT ... FOR UPDATE` albo ostrzejszym poziomem izolacji z ponawianiem.

### Czym jest MVCC? {mid}

Multi-version concurrency control: zamiast nadpisywać wiersze w miejscu, baza przechowuje wiele wersji, a każda transakcja lub instrukcja czyta spójną migawkę
z określonego momentu. Czytelnicy nie blokują pisarzy, a pisarze nie blokują czytelników, co daje wysoką współbieżność przy mieszanym obciążeniu. Kosztem jest
przechowywanie i sprzątanie starych wersji (`VACUUM` w PostgreSQL, version store w `tempdb` w SQL Server).

### Czym jest błąd serializacji i jak aplikacja powinna go obsłużyć? {senior}

Na poziomach `REPEATABLE READ` i `SERIALIZABLE` w PostgreSQL, gdy zmiany transakcji kolidują z równoległą zatwierdzoną transakcją w sposób, który złamałby gwarancje
izolacji, baza przerywa ją błędem takim jak `could not serialize access due to concurrent update`. To nie błąd w kodzie, tylko część kontraktu: aplikacja musi
ponowić całą transakcję od początku, zwykle kilka razy z odstępami. Frameworki i ORM-y często mają do tego polityki ponawiania.

### Co robi `NOLOCK` w SQL Server i dlaczego jest ryzykowny? {mid}

`WITH (NOLOCK)` (odpowiednik `READ UNCOMMITTED`) czyta bez zakładania blokad współdzielonych i bez czekania na pisarzy, więc może zwrócić niezatwierdzone dane,
które potem zostaną wycofane (brudne odczyty), a przy dzieleniu stron może nawet odczytać wiersze dwa razy albo je pominąć. Często dodaje się go „dla wydajności”,
żeby usunąć blokowanie, ale wersjonowanie wierszy (`READ_COMMITTED_SNAPSHOT` albo `SNAPSHOT`) rozwiązuje blokowanie czytelników i pisarzy bez zwracania błędnych
danych.

### Czym jest savepoint? {mid}

To nazwany punkt wewnątrz transakcji, do którego można się wycofać bez przerywania całej transakcji: `SAVEPOINT s1`, a potem `ROLLBACK TO SAVEPOINT s1` cofa tylko
pracę po nim. Używa się go dla opcjonalnych kroków, które mogą się nie powieść, albo do wyjścia z błędu w PostgreSQL, gdzie błąd w przeciwnym razie przerywa całą
transakcję. ORM-y używają savepointów do implementacji transakcji zagnieżdżonych.

### Dlaczego transakcje powinny być krótkie? {junior}

Dopóki transakcja jest otwarta, trzyma blokady na zmodyfikowanych wierszach (a zależnie od poziomu także na odczytanych), nie pozwala sprzątnąć starych wersji wierszy
i zajmuje połączenie. Długie transakcje, zwłaszcza czekające na użytkownika albo na zewnętrzne wywołania HTTP, blokują innych użytkowników, zwiększają ryzyko
zakleszczeń i konfliktów oraz rozdmuchują przechowywanie danych. Najpierw wykonuje się pracę zewnętrzną, potem otwiera transakcję, wykonuje zapisy i zatwierdza.
