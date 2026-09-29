# Normalizacja i denormalizacja {mid}

Normalizacja to takie uporządkowanie tabel, żeby **każdy fakt był zapisany dokładnie w jednym miejscu**. Zapobiega
niespójnym danym (anomaliom) i jest domyślnym podejściem w bazach transakcyjnych (OLTP). **Denormalizacja** celowo
duplikuje dane, żeby przyspieszyć odczyty, kosztem utrzymywania spójności kopii.

## Anomalie w nieznormalizowanej tabeli

```sql
CREATE TABLE orders_flat (order_id int PRIMARY KEY, customer_email text, customer_city text, product text, price numeric);
-- 1 | ada@x.io | Krakow | Pen | 2
-- 2 | ada@x.io | Krakow | Ink | 5
-- 3 | bob@x.io | Gdansk | Pen | 2
```

- **Anomalia aktualizacji**: miasto Ady jest zapisane w dwóch wierszach; aktualizacja tylko jednego zostawia ją z dwoma
  miastami (sprawdzone: `COUNT(DISTINCT customer_city) = 2`).
- **Anomalia usunięcia**: usunięcie jedynego zamówienia Boba usuwa też jedyną informację o Bobie.
- **Anomalia wstawienia**: nie da się zapisać nowego klienta (albo produktu), dopóki nie ma zamówienia.

## Postacie normalne

| Postać | Reguła | Przykład naruszenia |
|---|---|---|
| **1NF** | wartości atomowe, bez powtarzających się grup; każdy wiersz identyfikowany kluczem | kolumna `phones` z `"123, 456"` albo kolumny `phone1`, `phone2`, `phone3` |
| **2NF** | 1NF + każda kolumna niekluczowa zależy od **całego** klucza (ważne przy kluczach złożonych) | `order_lines(order_id, product_id, qty, product_name)`: `product_name` zależy tylko od `product_id` |
| **3NF** | 2NF + brak zależności **przechodnich**: kolumny niekluczowe zależą od klucza i tylko od klucza | `orders(id, customer_id, customer_city)`: miasto zależy od klienta, nie od zamówienia |
| **BCNF** | każdy wyznacznik jest kluczem kandydującym (ostrzejsza 3NF) | rzadkie przypadki z nakładającymi się kluczami kandydującymi |

Klasyczne podsumowanie 3NF: każdy atrybut niekluczowy zależy „od klucza, całego klucza i tylko od klucza”. W praktyce
celem dla systemów OLTP jest projekt w 3NF (lub BCNF); wyższe postacie (4NF, 5NF) dotyczą zależności wielowartościowych
i rzadko pojawiają się na rozmowach.

## Wersja znormalizowana

```sql
customers  (id PK, email UNIQUE, city)
products   (id PK, name UNIQUE, price)
orders     (id PK, customer_id FK -> customers, created_at)
order_lines(order_id FK -> orders, product_id FK -> products, qty, unit_price, PK (order_id, product_id))
```

Miasto klienta zmienia się teraz w jednym wierszu i widzi to każde zamówienie. Zwróć uwagę na `order_lines.unit_price`:
wygląda jak duplikat `products.price`, ale to **inny fakt**, cena w chwili zamówienia. W teście podniesienie ceny
produktu do 3 nie zmieniło historycznej ceny pozycji wynoszącej 2. Kopiowanie wartości, które muszą zostać zamrożone
w danym momencie (ceny, adresy na fakturach, kursy walut), to nie denormalizacja.

## Denormalizacja

Celowe przechowywanie nadmiarowych danych, żeby uniknąć kosztownych złączeń lub agregacji:

- liczniki i sumy (`orders_count` u klienta, `total` w zamówieniu),
- skopiowane dane do wyświetlania (nazwa autora w komentarzu),
- modele odczytu i tabele raportowe, widoki zmaterializowane, indeksy wyszukiwania,
- hurtownie danych i analityka (schemat gwiazdy: tabela faktów plus zdenormalizowane wymiary).

Koszty: każdą kopię trzeba synchronizować (w tej samej transakcji, triggerami albo z opóźnieniem przez zdarzenia), zapisy
stają się bardziej złożone, a błędy powodują niespójności. Najpierw się normalizuje, mierzy, a denormalizuje konkretne
gorące ścieżki, gdy jest prawdziwy problem z wydajnością.

## Źródła

- [Database normalization description (Microsoft)](https://learn.microsoft.com/en-us/office/troubleshoot/access/database-normalization-description)
- [PostgreSQL: constraints (keys that enforce the design)](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [SQL Server: materialized data with indexed views](https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views)

## Pytania

### Czym jest normalizacja i po co się ją stosuje? {junior}

To projektowanie tabel tak, żeby każdy fakt był zapisany raz, przez podział danych na powiązane tabele połączone kluczami. Zapobiega anomaliom aktualizacji,
wstawienia i usunięcia, czyli niespójnym kopiom tej samej informacji, zmniejsza nadmiarowość i ułatwia wymuszanie integralności ograniczeniami. To
standardowe podejście w bazach transakcyjnych.

### Czym są anomalie aktualizacji, wstawienia i usunięcia? {junior}

To problemy wynikające z nadmiarowości. Anomalia aktualizacji: ten sam fakt zapisany w kilku wierszach zostaje zaktualizowany tylko w części z nich (klient
ma nagle dwa adresy). Anomalia wstawienia: nie da się zapisać faktu bez niepowiązanych danych (klient bez zamówienia). Anomalia usunięcia: usunięcie wiersza
usuwa też inne informacje (usunięcie ostatniego zamówienia usuwa klienta). Normalizacja je eliminuje.

### Czego wymaga pierwsza postać normalna (1NF)? {junior}

Wartości atomowych w każdej kolumnie i braku powtarzających się grup: żadnych list w kolumnie (`"123, 456"`) i numerowanych kolumn (`phone1`, `phone2`), które
powinny stać się wierszami w osobnej tabeli. Każdy wiersz musi być identyfikowalny kluczem. Nowoczesne bazy z typami tablicowymi czy JSON zacierają tę regułę,
ale odpytywanie i ograniczanie takich danych jest trudniejsze, więc używa się ich świadomie.

### Czym różnią się druga i trzecia postać normalna? {mid}

2NF dotyczy częściowych zależności od klucza złożonego: każda kolumna niekluczowa musi zależeć od całego klucza, np. `product_name`
w `order_lines(order_id, product_id)` zależy tylko od `product_id`, więc należy do `products`. 3NF dotyczy zależności przechodnich: kolumna niekluczowa nie może
zależeć od innej kolumny niekluczowej, np. `customer_city` w `orders` zależy od `customer_id`, więc należy do `customers`.

### Czy zapisanie ceny produktu w pozycji zamówienia narusza normalizację? {mid}

Nie, jeśli reprezentuje cenę w chwili sprzedaży. To inny fakt niż bieżąca cena produktu: gdy cena się zmieni, historyczne zamówienia muszą zachować to, co klient
faktycznie zapłacił. To samo dotyczy adresów rozliczeniowych na fakturach czy kursów walut w transakcjach. Duplikacja jest problemem tylko wtedy, gdy dwie
kolumny reprezentują ten sam fakt, który powinien pozostać zsynchronizowany.

### Czym jest denormalizacja i kiedy jest uzasadniona? {mid}

To celowe przechowywanie nadmiarowych lub wyliczonych danych, żeby przyspieszyć odczyty, np. licznik zamówień u klienta, zapamiętana suma zamówienia, tabela
raportowa albo widok zmaterializowany. Jest uzasadniona, gdy pomiary pokazują, że złączenia lub agregacje na gorącej ścieżce są zbyt kosztowne, a zespół
akceptuje koszt utrzymywania spójności kopii (w tej samej transakcji, triggerami albo asynchronicznie). To norma w hurtowniach danych i modelach odczytu.

### Jak utrzymać spójność zdenormalizowanych danych? {senior}

Opcje, od najsilniejszej do najsłabszej spójności: aktualizacja kopii w tej samej transakcji co źródło, trigger, widok zmaterializowany odświeżany przez bazę
albo asynchroniczna propagacja zmian przez zdarzenia lub change data capture, z akceptacją spójności ostatecznej. Niezależnie od mechanizmu warto mieć sposób
na przeliczenie kopii ze źródła (zadanie uzgadniające), bo błędy w synchronizacji się zdarzą.

### Czym jest BCNF? {senior}

Postać normalna Boyce'a–Codda to ostrzejsza wersja 3NF: dla każdej zależności funkcyjnej X → Y, X musi być kluczem kandydującym. 3NF dopuszcza wyjątek, gdy Y jest
częścią klucza kandydującego, co może zostawić anomalie w tabelach z kilkoma nakładającymi się kluczami kandydującymi. W praktyce większość projektów w 3NF
jest też w BCNF, a na rozmowach oczekuje się głównie wiedzy, że istnieje i że to „3NF bez wyjątku”.

### Dlaczego hurtownie danych są zwykle zdenormalizowane? {mid}

Są zoptymalizowane pod odczyt i agregację dużych ilości danych historycznych, a nie pod wiele małych równoczesnych aktualizacji. Schemat gwiazdy ma centralną
tabelę faktów (np. sprzedaż) i zdenormalizowane tabele wymiarów (produkt, klient, data) z atrybutami opisowymi, co oznacza mniej złączeń w zapytaniach
analitycznych, prostsze zapytania dla analityków i lepszą wydajność silników kolumnowych. Dane są ładowane wsadowo przez ETL, więc anomalie aktualizacji
kontroluje proces ładowania.

### Jak zamodelować relację wiele-do-wielu w schemacie relacyjnym? {junior}

Tabelą łączącą (asocjacyjną) zawierającą klucze obce do obu tabel, zwykle ze złożonym kluczem głównym na nich, np. `student_courses(student_id, course_id)`.
Atrybuty samej relacji (data zapisu, ocena) przechowuje się w tabeli łączącej. Zapisanie listy identyfikatorów w jednej kolumnie łamie 1NF i uniemożliwia
złączenia, ograniczenia i indeksowanie.
