# Widoki, procedury składowane, funkcje i triggery {mid}

Poza tabelami baza może przechowywać **logikę**: nazwane zapytania (widoki), kod wykonywany na żądanie (procedury
i funkcje) i kod wykonywany automatycznie przy zmianach danych (triggery). Rozmowy sprawdzają, do czego służy każdy
z nich, jakie ma pułapki, i zadają klasyczne pytanie: czy logika biznesowa powinna żyć w bazie?

## Widoki

```sql
CREATE VIEW active_accounts AS
SELECT id, owner, balance FROM accounts WHERE active
WITH CHECK OPTION;
```

- Widok to **zapisane zapytanie**, a nie zapisane dane: przy każdym odpytaniu wykonuje się zapytanie bazowe na aktualnych
  danych. W teście zmiana salda w tabeli była od razu widoczna przez widok.
- Zastosowania: uproszczenie złożonych złączeń, stabilny interfejs dla raportów lub innych zespołów, udostępnienie tylko
  części kolumn lub wierszy (bezpieczeństwo).
- **Proste widoki** (jedna tabela, bez agregatów i `DISTINCT`) są aktualizowalne w PostgreSQL, SQL Server i MySQL:
  `UPDATE` przez widok zmienia tabelę bazową. `WITH CHECK OPTION` odrzuca zmiany, po których wiersz przestałby być
  widoczny przez widok (w teście: `new row violates check option`).
- Widoki na widokach na widokach ukrywają prawdziwy koszt zapytań i utrudniają optymalizację.

## Widoki zmaterializowane

```sql
CREATE MATERIALIZED VIEW totals AS SELECT SUM(balance) AS total FROM accounts;
REFRESH MATERIALIZED VIEW totals;          -- PostgreSQL: przelicz (CONCURRENTLY nie blokuje czytelników, wymaga indeksu unikalnego)
```

Widok zmaterializowany **przechowuje wynik** jak tabela, więc odczyt jest szybki, ale pokazuje migawkę: w teście
zwracał starą sumę aż do `REFRESH`. Używa się go do kosztownych raportów i agregatów, które mogą być lekko nieaktualne.
PostgreSQL i Oracle mają widoki zmaterializowane; SQL Server ma **widoki indeksowane**, które silnik utrzymuje
automatycznie przy każdej zmianie (z wieloma ograniczeniami), a MySQL nie ma żadnego z nich.

## Funkcje i procedury składowane

```sql
CREATE FUNCTION balance_of(p_id int) RETURNS numeric LANGUAGE sql STABLE
AS $$ SELECT balance FROM accounts WHERE id = p_id $$;

CREATE PROCEDURE transfer(p_from int, p_to int, p_amount numeric) LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT balance FROM accounts WHERE id = p_from) < p_amount THEN
        RAISE EXCEPTION 'insufficient funds';
    END IF;
    UPDATE accounts SET balance = balance - p_amount WHERE id = p_from;
    UPDATE accounts SET balance = balance + p_amount WHERE id = p_to;
END $$;

CALL transfer(1, 2, 30);
```

| | Funkcja | Procedura składowana |
|---|---|---|
| Wywołanie | wewnątrz zapytań (`SELECT balance_of(2)`) | jako instrukcja (`CALL`, `EXEC`) |
| Zwraca | wartość albo tabelę | nic albo parametry wyjściowe / zbiory wyników |
| Efekty uboczne | w SQL Server nie może modyfikować danych; w PostgreSQL może | dozwolone |
| Sterowanie transakcją | nie | procedury w PostgreSQL 11+ i SQL Server mogą zatwierdzać i wycofywać |

Zalety procedur: mniej wywołań przy operacjach wieloetapowych, logika blisko danych, granica uprawnień (nadanie
`EXECUTE` bez dostępu do tabel), ponowne użycie planów. Wady: logika podzielona na dwa miejsca, trudniejsze testowanie,
wersjonowanie i debugowanie, języki specyficzne dla dostawcy (T-SQL, PL/pgSQL), które wiążą z jedną bazą, i baza
jako trudniej skalowalne wąskie gardło. Nowoczesne aplikacje zwykle trzymają logikę biznesową w aplikacji, a procedur
używają wybiórczo (operacje wsadowe na dużych danych, integracja ze starszymi systemami).

## Triggery

```sql
CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_touch BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch();
```

- Triggery `BEFORE` mogą zmienić albo odrzucić wiersz (ustawić `updated_at`, walidować); triggery `AFTER` reagują na
  zakończone zmiany (audyt, zdenormalizowane liczniki).
- **Na wiersz czy na instrukcję**: PostgreSQL obsługuje oba (`FOR EACH ROW` / `FOR EACH STATEMENT`), MySQL i SQLite tylko
  na wiersz. **Triggery w SQL Server uruchamiają się raz na instrukcję**, ze wszystkimi zmienionymi wierszami
  w pseudotabelach `inserted` i `deleted`, więc trigger napisany jak dla jednego wiersza to klasyczny błąd.
- Trigger działa **w tej samej transakcji** co instrukcja: jeśli się nie powiedzie, zmiana jest wycofywana, a każdy zapis
  zwalnia. W teście jeden `UPDATE` 4 wierszy uruchomił trigger audytu 4 razy.
- Wady: „niewidoczna” logika zaskakująca programistów, kaskady triggerów, trudniejsze debugowanie i operacje hurtowe.
  Dobre zastosowania: ślad audytowy, utrzymywanie `updated_at`, wymuszanie reguł, które muszą obowiązywać niezależnie od
  tego, która aplikacja zapisuje dane.

## Źródła

- [PostgreSQL: CREATE VIEW (updatable views)](https://www.postgresql.org/docs/current/sql-createview.html)
- [PostgreSQL: materialized views](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [PostgreSQL: CREATE PROCEDURE](https://www.postgresql.org/docs/current/sql-createprocedure.html)
- [PostgreSQL: triggers](https://www.postgresql.org/docs/current/trigger-definition.html)
- [SQL Server: CREATE TRIGGER (DML triggers)](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-trigger-transact-sql)
- [SQL Server: indexed views](https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views)

## Pytania

### Czym jest widok i czy przechowuje dane? {junior}

Widok to nazwany, zapisany `SELECT`, który można odpytywać jak tabelę. Nie przechowuje danych: każde zapytanie do widoku wykonuje jego zapytanie bazowe na
aktualnych danych tabel. Widoki upraszczają złożone zapytania, dają stabilny interfejs i mogą ograniczać, jakie wiersze i kolumny widzą użytkownicy.
Wyjątkiem są widoki zmaterializowane, które przechowują wynik.

### Czym widok różni się od widoku zmaterializowanego? {mid}

Zwykły widok to tylko definicja zapytania, więc zawsze pokazuje aktualne dane, ale za każdym razem kosztuje tyle co zapytanie. Widok zmaterializowany
fizycznie przechowuje wynik, więc odczyty są szybkie, ale dane są migawką, którą trzeba odświeżać (`REFRESH MATERIALIZED VIEW` w PostgreSQL), i w międzyczasie
mogą być nieaktualne. Widoki indeksowane w SQL Server też są zmaterializowane, ale aktualizują się automatycznie przy każdej zmianie tabel bazowych.

### Czy można modyfikować dane przez widok? {mid}

Tak, jeśli to prosty widok: oparty na jednej tabeli, bez agregatów, `GROUP BY`, `DISTINCT` czy operacji na zbiorach. Wtedy `INSERT`, `UPDATE` i `DELETE`
na widoku zmieniają tabelę bazową. `WITH CHECK OPTION` odrzuca zmiany, które dałyby wiersze niewidoczne przez widok. Bardziej złożone widoki można uczynić
zapisywalnymi triggerami `INSTEAD OF`.

### Czym różni się procedura składowana od funkcji? {mid}

Funkcja zwraca wartość (albo tabelę) i jest wywoływana wewnątrz zapytań, np. w `SELECT` czy `WHERE`; w SQL Server nie może modyfikować danych. Procedura jest
wywoływana jako osobna instrukcja (`CALL` / `EXEC`), może modyfikować dane, zwracać zbiory wyników lub parametry wyjściowe, a w PostgreSQL 11+ i SQL Server może
sterować transakcjami. Funkcje służą do obliczeń używanych w zapytaniach, procedury do operacji.

### Czy logika biznesowa powinna żyć w procedurach składowanych? {senior}

Zwykle nie jako wybór domyślny. Logikę w aplikacji łatwiej testować, wersjonować, debugować, wdrażać i skalować, a do tego nie jest związana z językiem jednego
dostawcy. Procedury mają sens przy operacjach intensywnie przetwarzających dane, gdzie przenoszenie danych do aplikacji jest kosztowne, przy wymuszaniu reguł
w bazach współdzielonych przez wiele aplikacji, jako granica uprawnień albo w istniejących systemach zbudowanych w ten sposób. Kluczowa jest spójność, żeby
logika nie była rozrzucona między dwie warstwy.

### Czym jest trigger i do czego służy? {junior}

To kod, który baza uruchamia automatycznie przed lub po `INSERT`, `UPDATE` albo `DELETE` na tabeli. Typowe zastosowania to logi audytowe (zapis starych i nowych
wartości), utrzymywanie `updated_at`, wymuszanie złożonych reguł integralności i synchronizacja danych zdenormalizowanych (liczniki, podsumowania). Działa
w tej samej transakcji co instrukcja, która go wywołała.

### Jakie są wady triggerów? {mid}

Są niewidoczne z poziomu kodu aplikacji, więc programistów zaskakują efekty uboczne; spowalniają każdy zapis, bo działają wewnątrz transakcji (trigger
wierszowy uruchamia się dla każdego zmienionego wiersza); mogą kaskadowo wywoływać inne triggery; utrudniają operacje hurtowe, migracje i debugowanie.
Powinny być małe, szybkie i udokumentowane oraz używane tylko tam, gdzie wymuszanie na poziomie bazy jest naprawdę potrzebne.

### Czym triggery w SQL Server różnią się od tych w PostgreSQL czy MySQL? {senior}

Triggery DML w SQL Server uruchamiają się raz na instrukcję, a nie raz na wiersz: wszystkie zmienione wiersze są dostępne w pseudotabelach `inserted`
i `deleted`. Trigger, który odczytuje pojedynczą wartość (`SELECT @id = id FROM inserted`), działa dla jednego wiersza i po cichu źle obsługuje aktualizacje
wielu wierszy. PostgreSQL oferuje i `FOR EACH ROW`, i `FOR EACH STATEMENT` (z tabelami przejściowymi), a MySQL i SQLite mają tylko triggery wierszowe
z `OLD`/`NEW`.

### Czym różnią się triggery `BEFORE` i `AFTER`? {mid}

Trigger `BEFORE` działa przed zapisaniem wiersza, więc może zmodyfikować nowe wartości (np. ustawić `updated_at`, znormalizować tekst) albo odrzucić
operację. Trigger `AFTER` działa po zastosowaniu zmiany, więc widzi stan końcowy i służy do akcji od niego zależnych, jak zapis do tabeli audytowej. SQL Server
ma triggery `AFTER` i `INSTEAD OF`, ale nie `BEFORE`.

### Jakie zalety mają procedury składowane dla bezpieczeństwa i wydajności? {mid}

Bezpieczeństwo: można nadać `EXECUTE` na procedurę bez dostępu do tabel pod spodem, więc użytkownicy wykonują tylko zdefiniowane operacje, a parametry chronią
przed SQL injection. Wydajność: operacja wieloetapowa wykonuje się w jednym wywołaniu, blisko danych, a jej plan wykonania może być cache'owany. Te same
korzyści często da się osiągnąć sparametryzowanymi zapytaniami i transakcjami w aplikacji, więc same w sobie nie są powodem.
