# Klucze, ograniczenia i typy danych {mid}

Ograniczenia (constraints) to reguły, które baza wymusza przy **każdym** zapisie, niezależnie od tego, która aplikacja
czy skrypt go wykonuje. To ostatnia linia obrony integralności danych: walidację w aplikacji da się ominąć, ograniczenia
nie. Do tego samego tematu należy dobór odpowiednich typów danych.

## Klucze

- **Klucz główny (PK)**: jednoznacznie identyfikuje wiersz; oznacza `NOT NULL` i `UNIQUE`, a baza tworzy dla niego indeks
  (w SQL Server domyślnie klastrowy).
- **Klucz kandydujący / naturalny**: inny unikalny atrybut z domeny (e-mail, ISBN, NIP), chroniony ograniczeniem `UNIQUE`.
- **Klucz sztuczny** (surrogate): sztuczny identyfikator bez znaczenia biznesowego (`int`/`bigint` identity, UUID). Nigdy
  się nie zmienia, jest zwarty i łatwy do referencjonowania, więc to zwykły wybór na PK, a klucze naturalne dostają
  ograniczenia `UNIQUE`.
- **Klucz złożony**: kilka kolumn razem, typowy dla tabel łączących (`PRIMARY KEY (order_id, product_id)`).
- **Klucz obcy (FK)**: kolumna (lub kolumny), która musi odpowiadać kluczowi w innej tabeli albo być `NULL`.

## Generowanie kluczy

| Baza | Klucz autoinkrementowany |
|---|---|
| PostgreSQL | `id int GENERATED ALWAYS AS IDENTITY` (standard; `serial` to starsza forma) |
| SQL Server | `id int IDENTITY(1,1)` albo `SEQUENCE` |
| MySQL | `id int AUTO_INCREMENT` |
| SQLite | `id INTEGER PRIMARY KEY` (alias rowid) |

`GENERATED ALWAYS` odrzuca jawnie podane wartości (`cannot insert a non-DEFAULT value into column "id"`), a `BY DEFAULT`
je dopuszcza. Wartości identity mogą mieć **luki** (wycofane transakcje, wartości w cache), więc nigdy nie używa się ich
jako ciągłej numeracji, np. numerów faktur. **UUID** pozwalają generować klucze w aplikacji i między systemami, ale losowe
UUID (v4) fragmentują indeksy B-drzewa; UUID uporządkowane czasowo (v7) tego unikają.

## Akcje kluczy obcych

```sql
CREATE TABLE orders (
    id          int PRIMARY KEY,
    customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    total       numeric(12,2) NOT NULL CHECK (total >= 0)
);
```

| `ON DELETE` | Gdy rodzic zostanie usunięty |
|---|---|
| `NO ACTION` / `RESTRICT` (domyślnie) | usunięcie się nie powiedzie, dopóki istnieją dzieci |
| `CASCADE` | dzieci też zostaną usunięte |
| `SET NULL` | klucz obcy w dzieciach zostanie ustawiony na `NULL` |
| `SET DEFAULT` | klucz obcy dostanie wartość domyślną |

Kaskady są wygodne dla danych ściśle należących do rodzica (pozycje zamówienia), ale niebezpieczne dla danych o własnym
znaczeniu (faktury), gdzie bezpieczniejsze jest `RESTRICT` plus soft delete.

**Klucze obce nie są indeksowane automatycznie** w PostgreSQL i SQL Server (indeksy dostają tylko PK i ograniczenia
`UNIQUE`; w teście PostgreSQL nie utworzył indeksu dla `ord.cu_id`). Bez indeksu na kolumnie FK złączenia są wolniejsze,
a usunięcie rodzica wymaga przeskanowania tabeli dzieci. InnoDB w MySQL tworzy taki indeks automatycznie.

## Inne ograniczenia

- `NOT NULL`: najważniejsze i najtańsze ograniczenie; kolumny nullowalne robi się tylko wtedy, gdy „nieznane” to
  prawdziwy stan.
- `UNIQUE`: brak duplikatów (zachowanie wobec `NULL` zob. w temacie o `NULL`).
- `CHECK (total >= 0)`: warunek, który musi spełnić każdy wiersz; `NULL` przez niego przechodzi.
- `DEFAULT`: wartość użyta, gdy kolumna zostanie pominięta.
- **Ograniczenia odraczane** (PostgreSQL, Oracle): `DEFERRABLE INITIALLY DEFERRED` sprawdza ograniczenie przy `COMMIT`
  zamiast po każdej instrukcji, co pozwala np. wstawić w jednej transakcji dwa wiersze wskazujące na siebie nawzajem.

## Typy danych, które mają znaczenie

- **Pieniądze**: `decimal`/`numeric` z jawną precyzją, nigdy `float`: `0.1 + 0.2 = 0.3` to prawda dla `numeric` i fałsz
  dla `double precision`.
- **Czas**: momenty zapisuje się jako `timestamptz` (PostgreSQL) / `datetimeoffset` (SQL Server) albo w UTC;
  `timestamp without time zone` nie wie, w jakiej jest strefie.
- **Tekst**: `varchar(n)` wymusza maksimum (`value too long for type character varying(3)`); w PostgreSQL `text`
  i `varchar` działają tak samo wydajnie.
- **SQLite jest typowany dynamicznie**: w zwykłej tabeli kolumna `int` przyjęła `'abc'` i zapisała jako tekst. Tabele
  `STRICT` (3.37+) wymuszają typy, a **klucze obce są domyślnie wyłączone**, chyba że wykona się
  `PRAGMA foreign_keys = ON` (wiele sterowników, np. `node:sqlite` w Node, włącza to samo; po wyłączeniu osierocony wiersz
  został przyjęty).

## Źródła

- [PostgreSQL: constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL: identity columns](https://www.postgresql.org/docs/current/ddl-identity-columns.html)
- [SQL Server: primary and foreign key constraints](https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints)
- [SQLite: foreign key support](https://www.sqlite.org/foreignkeys.html)
- [SQLite: STRICT tables](https://www.sqlite.org/stricttables.html)

## Pytania

### Czym różni się klucz główny od ograniczenia unikalnego? {junior}

Oba gwarantują unikalność i tworzą indeks. Tabela ma tylko jeden klucz główny, który nie może zawierać `NULL` i służy jako główny identyfikator wiersza,
do którego odwołują się klucze obce. Tabela może mieć wiele ograniczeń unikalnych, które mogą dopuszczać `NULL` (z różnicami między dialektami) i służą do
alternatywnych kluczy, jak e-mail czy kod produktu.

### Klucz sztuczny czy naturalny? {mid}

Klucz naturalny (e-mail, ISBN, NIP) ma znaczenie biznesowe, ale może się zmienić, bywa długi lub złożony, a jego format może się zmienić wraz z regułami
biznesowymi, co wtedy kaskadowo dotyka każdej tabeli, która się do niego odwołuje. Klucz sztuczny (identity lub UUID) jest stabilny, zwarty i bez znaczenia.
Częstą praktyką jest sztuczny klucz główny plus ograniczenie `UNIQUE` na kluczu naturalnym, co daje stabilne referencje i nadal zapobiega duplikatom.

### Co się stanie, gdy usuniesz wiersz, do którego odwołują się inne wiersze? {junior}

Zależy od akcji `ON DELETE` klucza obcego. Domyślnie (`NO ACTION`/`RESTRICT`) usunięcie się nie powiedzie, dopóki istnieją wiersze odwołujące się.
`CASCADE` usuwa też wiersze odwołujące się, `SET NULL` ustawia ich klucz obcy na `NULL`, a `SET DEFAULT` na wartość domyślną. Akcja powinna odzwierciedlać
domenę: pozycje zamówienia mogą kaskadowo zniknąć z zamówieniem, faktury nie powinny znikać razem z klientem.

### Czy kolumny kluczy obcych są indeksowane automatycznie? {mid}

Nie w PostgreSQL i SQL Server: automatycznie indeksy dostają tylko klucze główne i ograniczenia unikalne, więc kolumnie klucza obcego trzeba jawnie utworzyć
indeks. Bez niego złączenia po tej kolumnie oraz usuwanie lub aktualizacja rodzica (która musi sprawdzić tabelę dzieci) wymagają przeskanowania tabeli dzieci
i mogą powodować problemy z blokadami. InnoDB w MySQL tworzy indeks dla kluczy obcych automatycznie.

### Dlaczego nie przechowywać pieniędzy jako `float`? {junior}

`float`/`double` to binarne typy zmiennoprzecinkowe, które nie potrafią dokładnie reprezentować większości ułamków dziesiętnych, więc `0.1 + 0.2` nie jest
dokładnie `0.3`, a błędy zaokrągleń kumulują się w sumach. Pieniądze przechowuje się jako `decimal`/`numeric` z jawną precyzją (np. `numeric(19,4)`) albo jako
liczbę całkowitą najmniejszych jednostek (groszy), razem z walutą.

### Czy wartości identity mogą mieć luki? {mid}

Tak. Wartość pobrana przez transakcję, która zostanie wycofana, nie jest ponownie używana, wartości mogą być trzymane w cache i tracone przy restarcie,
a usunięte wiersze zostawiają dziury. To zamierzone, bo ciągły licznik wymagałby szeregowania wszystkich wstawień. Kolumny identity to więc tylko
identyfikatory; gdy biznes wymaga kolejnych numerów (faktury), generuje się je osobno, np. licznikiem w wierszu aktualizowanym pod blokadą.

### Co robi ograniczenie `CHECK` i jakie ma ograniczenia? {junior}

Odrzuca wiersze, dla których warunek jest fałszywy, np. `CHECK (total >= 0)` albo `CHECK (end_date > start_date)`. `NULL` przechodzi, bo warunek jest wtedy
nieznany, więc w razie potrzeby łączy się go z `NOT NULL`. `CHECK` może patrzeć tylko na bieżący wiersz (w większości baz), a nie na inne wiersze czy tabele;
reguły obejmujące wiele wierszy wymagają ograniczeń unikalnych, kluczy obcych, triggerów albo logiki aplikacji.

### Czym jest ograniczenie odraczane (deferrable)? {senior}

To ograniczenie (zwykle klucz obcy lub unikalne) oznaczone jako `DEFERRABLE`, którego sprawdzenie można odłożyć do końca transakcji (`INITIALLY DEFERRED`
albo `SET CONSTRAINTS ... DEFERRED`). Pozwala na tymczasowo niespójne stany w transakcji, np. wstawienie dwóch wierszy wskazujących na siebie nawzajem albo
zamianę unikalnych wartości między wierszami. Obsługują je PostgreSQL i Oracle, ale nie SQL Server ani MySQL.

### Dlaczego trzeba uważać na klucze obce w SQLite? {mid}

SQLite parsuje definicje kluczy obcych, ale ich nie wymusza, dopóki połączenie nie wykona `PRAGMA foreign_keys = ON`, a ustawienie działa per połączenie.
Niektóre sterowniki włączają je domyślnie (np. `node:sqlite` w Node, dostawca SQLite w EF Core), inne nie. SQLite używa też elastycznego typowania, więc
kolumna zadeklarowana jako `int` może przechowywać tekst, chyba że tabela jest zadeklarowana jako `STRICT`.

### Jak poprawnie przechowywać daty i czas? {mid}

Momenty (kiedy coś się wydarzyło) zapisuje się w typie świadomym strefy czasowej (`timestamptz` w PostgreSQL, `datetimeoffset` w SQL Server) albo konsekwentnie
w UTC, a na czas lokalny przelicza tylko przy wyświetlaniu. `timestamp without time zone` przechowuje wskazanie zegara bez wiedzy o strefie, co psuje się między
strefami i przy zmianie czasu. Daty bez czasu (urodziny) używają typu `date`.
