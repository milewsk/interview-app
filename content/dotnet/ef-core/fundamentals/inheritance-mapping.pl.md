# Mapowanie dziedziczenia: TPH, TPT, TPC {senior}

Relacyjne bazy nie mają dziedziczenia, więc EF Core potrzebuje strategii odwzorowania hierarchii klas na tabele. Są
trzy: **TPH** (table per hierarchy, domyślna), **TPT** (table per type) i **TPC** (table per concrete type). Wybór
wpływa na schemat, ograniczenia integralności, a przede wszystkim na SQL każdego zapytania.

```csharp
public abstract class Payment { public int Id { get; set; } public decimal Amount { get; set; } }
public class CardPayment : Payment { public string Last4 { get; set; } = ""; }
public class TransferPayment : Payment { public string Iban { get; set; } = ""; }
```

## TPH: jedna tabela dla całej hierarchii (domyślnie)

```sql
CREATE TABLE [Payments] (
    [Id] int NOT NULL IDENTITY,
    [Amount] decimal(18,2) NOT NULL,
    [Discriminator] nvarchar(21) NOT NULL,
    [Last4] nvarchar(4) NULL,          -- NULL, choć Last4 jest wymagane dla karty
    [Iban] nvarchar(34) NULL,
    ...
```

- Wszystkie typy dzielą jedną tabelę, a kolumna **dyskryminatora** mówi, jaką klasą jest wiersz. Można ją
  skonfigurować: `HasDiscriminator<string>("PaymentType").HasValue<CardPayment>("card")`.
- Zapytania są **najszybsze**: bez złączeń, `OfType<CardPayment>()` to po prostu
  `WHERE [Discriminator] = N'CardPayment'`.
- Wady: kolumny podtypów **muszą być nullowalne**, więc baza nie wymusi dla nich `NOT NULL`. Przy wielu podtypach
  i kolumnach tabela jest szeroka i rzadko wypełniona.

## TPT: tabela na każdy typ

```csharp
modelBuilder.Entity<Payment>().UseTptMappingStrategy();
```

- Tabela bazowa trzyma wspólne kolumny, a każdy podtyp ma własną tabelę z kluczem głównym będącym jednocześnie kluczem
  obcym do tabeli bazowej.
- Schemat jest znormalizowany, a kolumny podtypów mogą być `NOT NULL`.
- Wada: **wydajność**. Zapytanie o typ bazowy złącza tabele wszystkich podtypów
  (`LEFT JOIN CardPayment ... LEFT JOIN TransferPayment ...` z `CASE` wyliczającym typ), a wstawienie jednej encji
  zapisuje do dwóch tabel. Dokumentacja EF zaleca TPT tylko wtedy, gdy wymuszają to czynniki zewnętrzne.

## TPC: tabela na każdy typ konkretny

```csharp
modelBuilder.Entity<Payment>().UseTpcMappingStrategy();
```

- Każdy typ konkretny dostaje pełną tabelę ze wszystkimi kolumnami (wspólnymi i własnymi). Abstrakcyjny typ bazowy nie
  ma tabeli.
- Zapytanie o jeden podtyp jest tak szybkie jak o zwykłą tabelę (bez złączeń i dyskryminatora), a kolumny podtypów
  mogą być `NOT NULL`.
- Zapytanie o typ bazowy używa `UNION ALL` wszystkich tabel.
- Klucze muszą być unikalne **we wszystkich tabelach**, więc zwykłe `IDENTITY` nie działa: EF tworzy wspólną
  **sekwencję** (`DEFAULT (NEXT VALUE FOR [PaymentSequence])`) albo używa się GUID-ów. (Da się użyć kolumn identity
  z innym seedem i tym samym krokiem w każdej tabeli, ale późniejsze dodanie typu jest trudne.)
- Klucze obce do typu bazowego nie są możliwe w bazie, bo nie ma jednej tabeli, do której mogłyby się odwoływać.

## Jak wybrać

| | TPH | TPT | TPC |
|---|---|---|---|
| Tabele | 1 | bazowa + po jednej na typ | po jednej na typ konkretny |
| Zapytanie o typ bazowy | najprostsze | złączenia (wolne) | `UNION ALL` |
| Zapytanie o jeden podtyp | filtr po dyskryminatorze | złączenie z bazową | jedna tabela, najszybsze |
| `NOT NULL` na kolumnach podtypów | nie | tak | tak |
| Generowanie kluczy | dowolne | dowolne | sekwencja / GUID |

Wskazówka z dokumentacji EF: **domyślnie TPH**; TPC, gdy głównie odpytuje się pojedyncze typy liściowe, a benchmarki
pokazują zysk; TPT „tylko jeśli wymuszają to czynniki zewnętrzne”. Zanim w ogóle zmapuje się dziedziczenie, warto
rozważyć, czy prostsza nie byłaby kompozycja albo jedna tabela z kolumną typu: głębokie hierarchie w bazie trudno
rozwijać.

## Źródła

- [Inheritance (EF Core)](https://learn.microsoft.com/en-us/ef/core/modeling/inheritance)
- [Performance: inheritance mapping](https://learn.microsoft.com/en-us/ef/core/performance/modeling-for-performance#inheritance-mapping)

## Pytania

### Jakie strategie mapowania dziedziczenia obsługuje EF Core? {mid}

Trzy: TPH (table per hierarchy), gdzie cała hierarchia jest w jednej tabeli z kolumną dyskryminatora; TPT (table per type), gdzie każdy typ, łącznie
z abstrakcyjnym bazowym, ma własną tabelę łączoną kluczem głównym; i TPC (table per concrete type), gdzie każda klasa konkretna ma pełną tabelę ze
wszystkimi kolumnami. TPH jest domyślna, a pozostałe włącza się przez `UseTptMappingStrategy()` lub `UseTpcMappingStrategy()`.

### Czym jest dyskryminator? {junior}

To kolumna w mapowaniu TPH, która przechowuje, jaką klasę reprezentuje wiersz. Domyślnie nazywa się `Discriminator` i zawiera nazwę klasy, a EF używa
jej do materializacji właściwego typu i filtrowania zapytań o podtyp (`OfType<CardPayment>()` staje się `WHERE [Discriminator] = N'CardPayment'`). Jej
nazwę, typ i wartości konfiguruje się przez `HasDiscriminator(...).HasValue<T>(...)`.

### Jakie są wady TPH? {mid}

Kolumny specyficzne dla podtypów muszą być nullowalne, bo wiersze innych typów nie mają dla nich wartości, więc baza nie wymusi `NOT NULL` ani
niektórych ograniczeń CHECK, a walidacja przechodzi do aplikacji. Przy wielu podtypach tabela staje się szeroka i rzadko wypełniona. Za to zapytania
są proste i szybkie, bo nie potrzebują złączeń.

### Dlaczego TPT bywa najwolniejszą strategią? {mid}

Dane jednej encji są podzielone między tabelę bazową a tabelę podtypu. Zapytanie o typ bazowy musi zrobić `LEFT JOIN` z tabelą każdego podtypu
i wyliczyć typ przez `CASE`, a liczba złączeń rośnie z hierarchią. Wstawianie i aktualizacje też dotykają kilku tabel. Dlatego dokumentacja EF odradza
TPT, o ile znormalizowany schemat nie jest naprawdę konieczny.

### Jak TPC obsługuje klucze główne i dlaczego? {senior}

W TPC każdy typ konkretny ma własną tabelę, ale klucz encji musi być unikalny w całej hierarchii, bo EF identyfikuje encje typu bazowego po kluczu.
Kolumny `IDENTITY` w każdej tabeli dałyby duplikaty, więc EF używa sekwencji bazodanowej wspólnej dla wszystkich tabel (`DEFAULT NEXT VALUE FOR`)
albo wymaga kluczy GUID. Inną konsekwencją jest to, że inna tabela nie może mieć klucza obcego do typu bazowego.

### Kiedy wybrać TPC zamiast TPH? {senior}

Gdy zapytania dotyczą głównie pojedynczych typów konkretnych, a nie całej hierarchii: wtedy TPC czyta z jednej tabeli bez filtra po dyskryminatorze,
a kolumny podtypów mogą być `NOT NULL` z właściwymi ograniczeniami. Zapytania o typ bazowy używają `UNION ALL`, które drożeje wraz z liczbą typów. TPH
pozostaje lepsze, gdy często odpytuje się typ bazowy albo gdy istnieją relacje wskazujące na typ bazowy.

### Jaki SQL generuje EF dla zapytania o typ bazowy w każdej strategii? {senior}

W TPH zwykły `SELECT` z jednej tabeli. W TPT `SELECT` z tabeli bazowej z `LEFT JOIN` do tabeli każdego podtypu i wyrażeniem `CASE` wyliczającym
dyskryminator. W TPC `UNION ALL` zapytań `SELECT` z każdej tabeli konkretnej, z brakującymi kolumnami wypełnionymi `NULL` i dodanym literałem
dyskryminatora. Dlatego strategia mocno wpływa na wydajność zapytań polimorficznych.

### Czy właściwość nawigacyjna może wskazywać abstrakcyjny typ bazowy w TPC? {senior}

Nie jako zwykła relacja bazodanowa. W TPC nie ma tabeli bazowej, więc baza nie ma jednej tabeli, do której mógłby się odwoływać klucz obcy. EF nadal
może zamodelować relację, ale baza nie wymusi dla niej integralności referencyjnej. Jeśli relacje do typu bazowego są ważne, lepiej pasuje TPH albo TPT.

### Jak w EF Core odpytać tylko jeden podtyp? {junior}

Użyć `OfType<T>()` na bazowym `DbSet` (`db.Payments.OfType<CardPayment>()`) albo dodać osobny `DbSet<CardPayment>` do kontekstu. EF tłumaczy to na
filtr po dyskryminatorze w TPH, złączenie z warunkiem `NOT NULL` w TPT albo zapytanie do jednej tabeli w TPC. Sprawdzenia typu w zapytaniach
(`p is CardPayment`) też są tłumaczone.

### Czy zawsze mapować hierarchię klas do bazy? {mid}

Nie. Dziedziczenie w modelu domenowym nie musi oznaczać dziedziczenia w bazie. Często prościej mieć jedną encję z kolumną typu i opcjonalnymi danymi
w typie owned/complex albo kolumnie JSON, albo użyć kompozycji. Mapowanie hierarchii dodaje złożoności zapytaniom i migracjom, więc opłaca się, gdy
podtypy naprawdę mają różne dane i zachowanie oraz są odpytywane polimorficznie.
