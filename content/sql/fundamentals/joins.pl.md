# Złączenia (JOIN) {mid}

Złączenie łączy wiersze dwóch tabel na podstawie warunku. Rozmowy sprawdzają nie tylko rodzaje złączeń, ale przede
wszystkim ich **efekty uboczne**: które wiersze znikają, gdzie pojawiają się `NULL` i kiedy wiersze się **mnożą**.

Przykładowe dane: klienci Ada (zamówienia 10, 11), Bob (zamówienie 12), Cy (bez zamówień) i zamówienie 13 wskazujące
nieistniejącego klienta 99.

## Rodzaje złączeń

| Złączenie | Wynik |
|---|---|
| `INNER JOIN` | tylko pary spełniające warunek: Ada-10, Ada-11, Bob-12 |
| `LEFT [OUTER] JOIN` | wszystkie wiersze lewej tabeli + dopasowania, `NULL` gdy ich brak: także Cy-`NULL` |
| `RIGHT [OUTER] JOIN` | wszystkie wiersze prawej tabeli: także `NULL`-13 |
| `FULL [OUTER] JOIN` | wszystkie wiersze z obu stron: Cy-`NULL` i `NULL`-13 |
| `CROSS JOIN` | iloczyn kartezjański: każdy wiersz z każdym (3 × 4 = 12) |

`RIGHT JOIN` rzadko stosuje się w praktyce (zamienia się tabele i używa `LEFT`). `FULL OUTER JOIN` nie jest obsługiwany
przez MySQL (emuluje się go przez `UNION` dwóch złączeń zewnętrznych), a SQLite ma `RIGHT` i `FULL` od wersji 3.39.

## `ON` a `WHERE` w złączeniu zewnętrznym

```sql
-- wszyscy klienci z ich opłaconymi zamówieniami (jeśli są)
SELECT c.name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid';     -- Ada-10, Bob-12, Cy-NULL

-- 🔴 filtr w WHERE usuwa wiersze z NULL: LEFT JOIN zamienił się w INNER JOIN
SELECT c.name, o.id FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid';                                              -- Ada-10, Bob-12 (Cy zniknął)
```

Przy `INNER JOIN` nie ma znaczenia, gdzie jest warunek. Przy złączeniu zewnętrznym warunek na tabeli opcjonalnej
należy do `ON`, bo `WHERE` działa po złączeniu i odrzuca wiersze, w których kolumny tej tabeli są `NULL`.

## Semi-join i anti-join

```sql
-- anti-join: klienci bez zamówień
SELECT c.name FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;                                                   -- Cy

-- albo, często czytelniej:
SELECT c.name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);

-- semi-join: klienci, którzy mają opłacone zamówienie, każdy raz
SELECT c.name FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'paid');
```

Użycie `JOIN` tylko po to, żeby sprawdzić, czy powiązany wiersz istnieje, **duplikuje** wiersze lewej tabeli (Ada
pojawia się dwa razy, raz na zamówienie), co potem „naprawia się” przez `DISTINCT`. `EXISTS` wyraża intencję wprost
i niczego nie duplikuje.

## Mnożenie wierszy (fan-out)

```sql
-- 🔴 zamówienie 10 ma dwie płatności, więc liczy się dwa razy: Ada = 400 zamiast 300
SELECT c.name, SUM(o.total)
FROM customers c
JOIN orders o ON o.customer_id = c.id
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY c.name;

-- ✅ najpierw zagreguj stronę „wiele”, potem dołącz jeden wiersz na zamówienie
SELECT c.name, SUM(o.total) AS order_total, SUM(pp.paid) AS paid
FROM customers c
JOIN orders o ON o.customer_id = c.id
LEFT JOIN (SELECT order_id, SUM(amount) AS paid FROM payments GROUP BY order_id) pp ON pp.order_id = o.id
GROUP BY c.name;                                                      -- Ada 300 | 100
```

Gdy zapytanie łączy dwie niezależne relacje jeden-do-wielu (zamówienia i płatności albo pozycje i wysyłki), a potem
agreguje, sumy się mnożą. Każdą gałąź agreguje się osobno w podzapytaniu lub CTE, a dopiero potem łączy wyniki.

## Inne przydatne formy

- **Self-join**: tabela złączona sama ze sobą, np. pracownicy z przełożonymi
  (`emp e LEFT JOIN emp m ON m.id = e.manager_id`).
- **`LATERAL`** (PostgreSQL, MySQL 8.0.14+) / **`CROSS APPLY`, `OUTER APPLY`** (SQL Server): podzapytanie, które może
  odwoływać się do kolumn poprzedniej tabeli, np. ostatnie zamówienie każdego klienta
  (`LEFT JOIN LATERAL (... ORDER BY id DESC LIMIT 1) ON true`).
- `USING (col)` i `NATURAL JOIN` łączą po kolumnach o tych samych nazwach. `NATURAL JOIN` jest ryzykowny, bo dodanie
  kolumny o pasującej nazwie po cichu zmienia warunek złączenia.
- Wiersze z `NULL` w kluczu złączenia **nigdy się nie dopasowują** (`NULL = NULL` jest nieznane), nawet z innym `NULL`.

## Źródła

- [PostgreSQL: joins between tables](https://www.postgresql.org/docs/current/tutorial-join.html)
- [PostgreSQL: table expressions (joined tables, LATERAL)](https://www.postgresql.org/docs/current/queries-table-expressions.html)
- [SQL Server: joins](https://learn.microsoft.com/en-us/sql/relational-databases/performance/joins)
- [SQLite: SELECT (join operators)](https://www.sqlite.org/lang_select.html)

## Pytania

### Czym różni się `INNER JOIN` od `LEFT JOIN`? {junior}

`INNER JOIN` zwraca tylko wiersze, które mają dopasowanie w obu tabelach. `LEFT JOIN` zwraca wszystkie wiersze lewej tabeli, a dla tych bez dopasowania
wypełnia kolumny prawej tabeli wartościami `NULL`. Na przykład klienci `LEFT JOIN` zamówienia zwraca też klientów, którzy nigdy nic nie zamówili, z `NULL`
w kolumnach zamówienia.

### Czym jest `FULL OUTER JOIN` i kiedy się przydaje? {mid}

Zwraca wszystkie wiersze obu tabel: dopasowane pary, lewe wiersze bez dopasowania (z `NULL` po prawej) i prawe bez dopasowania (z `NULL` po lewej).
Przydaje się do porównywania dwóch zbiorów danych, np. uzgadniania rekordów z dwóch systemów i szukania, czego brakuje po którejkolwiek stronie. MySQL go
nie obsługuje bezpośrednio; emuluje się go przez `UNION` złączeń `LEFT` i `RIGHT`.

### Czy ma znaczenie, czy warunek trafi do `ON`, czy do `WHERE`? {mid}

Przy `INNER JOIN` nie. Przy złączeniu zewnętrznym tak: warunek w `ON` decyduje, które wiersze tabeli opcjonalnej zostaną dołączone, a tabela zachowywana
zatrzymuje wszystkie wiersze. Ten sam warunek w `WHERE` działa po złączeniu, odrzuca wiersze z `NULL` w kolumnach tabeli opcjonalnej i w praktyce zamienia
`LEFT JOIN` w `INNER JOIN`. Warunki na tabeli opcjonalnej należą do `ON`.

### Jak znaleźć wiersze, które nie mają dopasowania w innej tabeli? {junior}

Anti-joinem: albo `LEFT JOIN` i `WHERE right.id IS NULL`, albo `WHERE NOT EXISTS (SELECT 1 FROM right WHERE right.fk = left.id)`. Oba zwracają np. klientów
bez zamówień. `NOT IN (SELECT fk FROM right)` też działa, ale nie zwraca żadnych wierszy, jeśli podzapytanie zawiera `NULL`, więc `NOT EXISTS` jest
bezpieczniejszym wyborem domyślnym.

### Dlaczego sumy mogą być za duże po złączeniu kilku tabel? {mid}

Bo każde złączenie z tabelą jeden-do-wielu mnoży wiersze: jeśli zamówienie ma dwie płatności, pojawia się dwa razy, a `SUM(order.total)` liczy je dwukrotnie.
Dzieje się tak zwłaszcza przy łączeniu dwóch niezależnych relacji „wiele” tego samego rodzica. Rozwiązaniem jest najpierw zagregowanie każdej tabeli
podrzędnej w podzapytaniu lub CTE (jeden wiersz na rodzica), a dopiero potem złączenie wyników.

### Czym semi-join przez `EXISTS` różni się od `JOIN`? {mid}

`JOIN` zwraca jeden wiersz na każde dopasowanie, więc klient z trzema zamówieniami pojawi się trzy razy i trzeba deduplikować przez `DISTINCT`. `EXISTS`
tylko sprawdza, czy istnieje przynajmniej jeden pasujący wiersz, zwraca każdy lewy wiersz najwyżej raz i pozwala bazie przerwać szukanie na pierwszym
dopasowaniu. Wyraża wprost „ma przynajmniej jeden”.

### Czym jest `CROSS JOIN`? {junior}

To iloczyn kartezjański: każdy wiersz pierwszej tabeli połączony z każdym wierszem drugiej, bez warunku, więc 3 × 4 wiersze dają 12. Używa się go celowo do
generowania kombinacji, np. każdego produktu z każdym rozmiarem albo każdego dnia kalendarza z każdym sklepem, przed `LEFT JOIN` z rzeczywistymi danymi.
Przypadkowe pominięcie warunku złączenia daje ten sam efekt.

### Czym jest self-join? {junior}

To złączenie tabeli z samą sobą przy użyciu dwóch aliasów, stosowane dla wierszy hierarchicznych lub powiązanych w tej samej tabeli. Klasyczny przykład to
pracownicy i przełożeni: `FROM emp e LEFT JOIN emp m ON m.id = e.manager_id` zwraca każdego pracownika z nazwiskiem przełożonego (i `NULL` dla szefa
najwyższego szczebla). Głębsze hierarchie wymagają rekurencyjnego CTE.

### Do czego służą `LATERAL` i `CROSS APPLY`? {senior}

Pozwalają podzapytaniu w `FROM` odwoływać się do kolumn wcześniejszych tabel, więc jest ono obliczane dla każdego wiersza. Typowe zastosowanie to „top N
w grupie”: ostatnie zamówienie każdego klienta,
`LEFT JOIN LATERAL (SELECT ... WHERE o.customer_id = c.id ORDER BY created_at DESC LIMIT 1) ON true` w PostgreSQL albo `OUTER APPLY` z `TOP (1)`
w SQL Server. Alternatywą jest funkcja okna (`ROW_NUMBER()`) z filtrowaniem.

### Czy wiersze z `NULL` w kolumnie złączenia kiedykolwiek się dopasowują? {mid}

Nie. Warunek złączenia `a.k = b.k` jest `UNKNOWN`, gdy którakolwiek strona jest `NULL`, nawet gdy obie są `NULL`, a złączenia zostawiają tylko wyniki `TRUE`.
Wiersze z brakującym kluczem obcym są więc odrzucane przez `INNER JOIN` i pojawiają się z `NULL` w złączeniu zewnętrznym. Jeśli `NULL` mają się ze sobą
dopasowywać, w warunku używa się `IS NOT DISTINCT FROM`, co zwykle uniemożliwia użycie indeksów.
