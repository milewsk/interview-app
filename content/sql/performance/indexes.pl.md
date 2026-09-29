# Indeksy {mid}

Indeks to dodatkowa struktura danych, która pozwala bazie znaleźć wiersze **bez czytania całej tabeli**, podobnie jak
indeks na końcu książki. Większość problemów z wydajnością SQL sprowadza się do brakującego, nieużywanego albo źle
zaprojektowanego indeksu, co czyni to jednym z najważniejszych tematów na rozmowach.

## Jak działa indeks B-drzewo

Domyślnym typem indeksu w każdej dużej bazie jest **B-drzewo** (zrównoważone drzewo): wartości są posortowane,
a znalezienie wartości wymaga kilku odczytów stron (O(log n)) zamiast skanowania wszystkich wierszy. Ponieważ dane są
posortowane, B-drzewo obsługuje równość (`=`), zakresy (`<`, `BETWEEN`), prefiksowe `LIKE 'abc%'`, `ORDER BY`
i `MIN`/`MAX`.

Na tabeli z 100 000 wierszy w PostgreSQL:

```sql
SELECT * FROM users WHERE score = 5;               -- bez indeksu: Seq Scan, ~14,5 ms
SELECT * FROM users WHERE email = 'user42@x.io';   -- indeks: Index Scan using ix_email, ~0,9 ms
SELECT id FROM users ORDER BY email LIMIT 10;      -- Index Scan + Limit: bez sortowania 100 000 wierszy
```

**Koszt**: każde `INSERT`, `UPDATE` indeksowanej kolumny i `DELETE` musi zaktualizować każdy indeks, a indeksy zajmują
miejsce na dysku i w pamięci. Indeksy dobiera się pod rzeczywiste zapytania, a nieużywane usuwa.

## Klastrowy a nieklastrowy

- Indeks **klastrowy** wyznacza fizyczną kolejność wierszy tabeli: tabela *jest* indeksem (liście zawierają całe wiersze),
  więc jest tylko jeden. W SQL Server klucz główny jest domyślnie klastrowy, a w MySQL InnoDB tabela zawsze jest
  klastrowana po kluczu głównym.
- Indeks **nieklastrowy** (wtórny) zawiera wartości klucza i wskaźnik do wiersza (w SQL Server/InnoDB: klucz klastrowy),
  więc po znalezieniu wpisu baza wykonuje **lookup** do tabeli.
- PostgreSQL przechowuje tabele jako nieuporządkowane sterty (heap), więc wszystkie indeksy są wtórne (`CLUSTER`
  jednorazowo przestawia tabelę, ale nie utrzymuje kolejności).
- Szeroki lub losowy klucz klastrowy (np. losowy UUID) powiększa każdy indeks wtórny i powoduje dzielenie stron przy
  wstawianiu.

## Indeksy złożone i kolejność kolumn

Indeks na `(country, created_at)` jest posortowany najpierw po `country`, a w obrębie kraju po `created_at`, jak książka
telefoniczna posortowana po nazwisku, a potem po imieniu.

- Obsługuje `WHERE country = ?`, `WHERE country = ? AND created_at >= ?` i `ORDER BY country, created_at`.
- Klasycznie **nie** pomaga przy warunku tylko na `created_at` (reguła **lewego prefiksu**): SQLite przeszedł wtedy na
  pełne `SCAN`. PostgreSQL 18 dodał **skip scan**, który mimo to może użyć indeksu, gdy pierwsza kolumna ma mało różnych
  wartości (w teście: `Index Searches: 6`); SQL Server tego nie robi.
- Reguła kciuka: najpierw kolumny używane z równością, na końcu kolumna do zakresu lub sortowania.

## Kiedy indeksu nie da się użyć („sargowalność”)

Warunek jest *sargowalny* (search-argument-able), gdy baza może go wyszukać w indeksie. Te nie są:

| Niesargowalne | Sargowalna alternatywa |
|---|---|
| `WHERE lower(email) = 'x'` (Seq Scan) | indeks wyrażeniowy `CREATE INDEX ... ON users (lower(email))` albo collation bez rozróżniania wielkości liter |
| `WHERE email LIKE '%42@x.io'` | prefiks `LIKE 'user42%'` (użył zakresu indeksu) albo indeks pełnotekstowy / trigramowy |
| `WHERE YEAR(created_at) = 2026` | `WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'` |
| `WHERE id::text = '42'` (niejawne lub jawne rzutowanie kolumny) | porównanie z wartością typu kolumny |
| `WHERE price * 1.23 > 100` | `WHERE price > 100 / 1.23` |

Funkcje lub rzutowania na **kolumnie** blokują indeks; obliczenia po stronie **stałej** są w porządku.

## Selektywność

Indeks opłaca się, gdy warunek wybiera niewielką część wierszy. Dla `status = 'active'` (99% wierszy) PostgreSQL wybrał
Seq Scan, choć indeks istniał, a dla `status = 'banned'` (1%) Index Scan. Czytanie większości tabeli przez indeks oznacza
losowy dostęp do prawie każdej strony, co jest wolniejsze niż skan sekwencyjny. Optymalizator decyduje na podstawie
**statystyk**, więc nieaktualne statystyki prowadzą do złych planów.

## Indeksy pokrywające, częściowe i inne

- **Indeks pokrywający** (covering): zawiera wszystkie kolumny potrzebne zapytaniu, więc tabela w ogóle nie jest
  czytana (w PostgreSQL `Index Only Scan`). Dodatkowe kolumny niekluczowe dodaje się przez `INCLUDE (score)`
  (PostgreSQL, SQL Server).
- **Indeks częściowy / filtrowany**: indeksuje tylko część wierszy, np. `CREATE INDEX ... WHERE status = 'pending'`,
  mniejszy i szybszy dla zapytań o ten podzbiór; używany też do unikalności wśród nieusuniętych wierszy.
- **Indeks unikalny**: wymusza unikalność (tworzony automatycznie dla `PRIMARY KEY` i `UNIQUE`).
- Inne typy: **hash** (tylko równość), **GIN** (PostgreSQL: tablice, JSONB, pełny tekst), **GiST** (geometria, zakresy),
  **BRIN** (ogromne, naturalnie uporządkowane tabele, np. logi), **columnstore** (analityka w SQL Server).

## Źródła

- [PostgreSQL: indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL: multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [PostgreSQL 18 release notes (skip scan)](https://www.postgresql.org/docs/release/18.0/)
- [SQL Server: clustered and nonclustered indexes](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/clustered-and-nonclustered-indexes-described)
- [SQLite: query planning](https://www.sqlite.org/queryplanner.html)
- [Use The Index, Luke (Markus Winand)](https://use-the-index-luke.com/)

## Pytania

### Czym jest indeks i ile kosztuje? {junior}

To dodatkowa struktura (zwykle B-drzewo), która trzyma wybrane wartości kolumn posortowane ze wskaźnikami do wierszy, więc baza może znaleźć wiersze bez
skanowania całej tabeli: w teście wyszukanie po zaindeksowanym e-mailu zajęło ~0,9 ms wobec ~14,5 ms przy pełnym skanie. Kosztem są wolniejsze zapisy (każdy
indeks trzeba aktualizować przy `INSERT`, `DELETE` i `UPDATE` indeksowanych kolumn), miejsce na dysku i pamięć. Indeksy powinny odpowiadać rzeczywistym
zapytaniom.

### Czym indeks klastrowy różni się od nieklastrowego? {mid}

Indeks klastrowy wyznacza fizyczną kolejność wierszy: jego poziom liści zawiera całe wiersze, więc tabela może mieć tylko jeden (w SQL Server domyślnie PK,
w MySQL InnoDB zawsze PK). Indeks nieklastrowy to osobna struktura z wartościami klucza i odwołaniem do wiersza, co wymaga dodatkowego lookupu, żeby pobrać inne
kolumny. PostgreSQL nie ma utrzymywanych indeksów klastrowych: tabele to sterty, a wszystkie indeksy są wtórne.

### Dlaczego kolejność kolumn w indeksie złożonym ma znaczenie? {mid}

Złożone B-drzewo jest posortowane po pierwszej kolumnie, w jej obrębie po drugiej i tak dalej. Jest wydajne dla warunków na lewym prefiksie kolumn:
`(country, created_at)` pomaga przy `WHERE country = ?` i `WHERE country = ? AND created_at > ?`, ale klasycznie nie przy samym `WHERE created_at > ?`. Kolumny
z równością idą pierwsze, kolumny zakresu lub sortowania ostatnie. Skip scan w PostgreSQL 18 łagodzi tę regułę, gdy pierwsza kolumna ma mało różnych wartości.

### Dlaczego indeks nie jest używany dla `WHERE lower(email) = ?`? {mid}

Indeks przechowuje wartości `email`, a nie `lower(email)`, więc baza nie może wyszukać wyniku funkcji zastosowanej do kolumny i musi przeskanować tabelę
(sprawdzone: Seq Scan). Rozwiązania: indeks wyrażeniowy na `lower(email)` (po jego utworzeniu plan zmienił się na Index Scan), collation bez rozróżniania
wielkości liter albo typ `citext`, albo przechowywanie znormalizowanej wartości. To samo dotyczy `YEAR(data)`, rzutowań i arytmetyki na kolumnie.

### Co oznacza „sargowalny”? {mid}

To warunek, który baza może obliczyć przez wyszukanie w indeksie: indeksowana kolumna występuje sama po jednej stronie porównania, np.
`created_at >= '2026-01-01'`. Opakowanie kolumny w funkcję, rzutowanie jej, arytmetyka na niej albo `LIKE` z `%` na początku czynią warunek niesargowalnym,
więc indeksu nie da się użyć do wyszukiwania. Zwykle pomaga przepisanie warunku tak, żeby kolumna pozostała „goła”.

### Dlaczego baza może zignorować istniejący indeks? {mid}

Bo warunek nie jest wystarczająco selektywny: gdy pasuje duża część tabeli (np. `status = 'active'` dla 99% wierszy), czytanie przez indeks z losowym dostępem do
stron jest wolniejsze niż skan sekwencyjny, więc optymalizator wybiera skan. Inne powody: niesargowalny warunek, niezgodność typu kolumny i parametru,
nieaktualne statystyki albo indeks złożony, którego pierwszej kolumny nie ma w warunku.

### Czym jest indeks pokrywający? {mid}

To indeks zawierający wszystkie kolumny, które czyta zapytanie, więc wynik powstaje z samego indeksu, bez dostępu do tabeli (`Index Only Scan` w PostgreSQL,
sprawdzony dla `INCLUDE (score)`). Kolumny niekluczowe można dodać przez `INCLUDE`, co trzyma je poza kluczem sortowania. To silna optymalizacja dla częstych,
wąskich zapytań, kosztem większego indeksu.

### Czym jest indeks częściowy (filtrowany)? {mid}

To indeks zbudowany tylko na wierszach spełniających warunek, np. `CREATE INDEX ix_pending ON orders (created_at) WHERE status = 'pending'`. Jest mniejszy
i tańszy w utrzymaniu i obsługuje zapytania o ten podzbiór, np. przetwarzanie kolejki oczekujących zamówień. Częściowy indeks unikalny wymusza unikalność tylko
wśród części wierszy, np. unikalne e-maile wśród nieusuniętych użytkowników (w SQL Server nazywa się to indeksem filtrowanym).

### Czy można mieć za dużo indeksów? {junior}

Tak. Każdy indeks spowalnia każdy zapis, bo trzeba go aktualizować, zajmuje miejsce na dysku i w pamięci (konkurując z danymi o cache) i daje optymalizatorowi
więcej opcji do rozważenia. Nakładające się indeksy (np. `(a)` i `(a, b)`) często są zbędne. Bazy raportują statystyki użycia indeksów (np.
`pg_stat_user_indexes`, widoki DMV w SQL Server), a nieużywane indeksy powinno się usuwać.

### Jakie typy indeksów istnieją poza B-drzewem? {senior}

Hash (tylko równość, w PostgreSQL rzadko lepszy od B-drzewa), GIN (indeks odwrócony dla tablic, JSONB i wyszukiwania pełnotekstowego w PostgreSQL), GiST
i SP-GiST (dane geometryczne, zakresy, najbliżsi sąsiedzi), BRIN (malutkie podsumowania zakresów bloków dla ogromnych tabel naturalnie uporządkowanych po
kolumnie, jak logi czasowe), indeksy pełnotekstowe i indeksy columnstore w SQL Server do skanów analitycznych. Wybór zależy od operatorów używanych w zapytaniach.
