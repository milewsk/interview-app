# Projektowanie schematu w MongoDB {mid}

„Bez schematu” nie znaczy „bez projektowania”. W bazie relacyjnej najpierw się normalizuje, a zapytania pisze później; w MongoDB
dokumenty projektuje się wokół **tego, jak aplikacja czyta i zapisuje dane**. Centralna decyzja to **osadzanie czy referencje**,
wynikająca ze wzorców dostępu, liczności relacji, wzrostu danych i potrzeby atomowości.

## Osadzanie a referencje

```js
// osadzone: jeden dokument, jeden odczyt, atomowe aktualizacje
{ _id: 1, customer: { id: 1, name: 'Ann' }, lines: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }] }

// referencje: osobne kolekcje, łączone przez $lookup (albo drugie zapytanie)
orders:      { _id: 1, customerId: 1 }
order_lines: { orderId: 1, sku: 'A', qty: 2 }
```

Sprawdzone: osadzone zamówienie zwróciło swoje 2 pozycje jednym `findOne`; wersja z referencjami potrzebowała agregacji z `$lookup`, żeby
zwrócić te same 2 pozycje.

| Osadzaj, gdy | Używaj referencji, gdy |
|---|---|
| dane czyta się razem (relacje „zawiera”: pozycje zamówienia, adresy) | dane są używane niezależnie albo współdzielone przez wielu rodziców |
| zbiór dzieci jest **ograniczony** i mały | zbiór dzieci rośnie bez limitu (komentarze, zdarzenia, logi) |
| potrzebne są atomowe aktualizacje rodzica i dzieci | dzieci często zmieniają się samodzielnie albo dokument zbliżałby się do 16 MB |

**Denormalizacja** (kopiowanie nazwy klienta do zamówień) przyspiesza odczyty, ale podraża zapisy: zmiana nazwy klienta przez `updateMany`
dotknęła w teście **2** zamówień, a w międzyczasie kopie mogą być nieaktualne. Kopiuje się tylko dane, które rzadko się zmieniają, albo dane,
które powinny zachować wartość historyczną (cena w chwili zamówienia).

## Częste wzorce

- **Subset**: najnowsze N elementów osadzone (np. 10 ostatnich recenzji), a reszta w innej kolekcji.
- **Extended reference**: identyfikator plus kilka pól zawsze wyświetlanych (nazwa klienta), a nie cały dokument.
- **Bucket**: grupowanie szeregów czasowych w dokumenty na okres (jeden dokument na czujnik na godzinę), żeby ograniczyć liczbę i rozmiar
  dokumentów; MongoDB ma też natywne **kolekcje szeregów czasowych**.
- **Computed**: przechowywanie wstępnie obliczonych wartości (sumy, liczniki) aktualizowanych przy zapisie, gdy odczytów jest dużo więcej
  niż zapisów.
- **Polymorphic**: różne kształty w jednej kolekcji z polem `type` (produkty różnego rodzaju).
- Unika się antywzorców **nieograniczonych tablic** i „ogromnej liczby kolekcji”.

## Walidacja schematu

Kolekcja może wymuszać strukturę przez `$jsonSchema`. Sprawdzone: przy `required: ['email', 'name']` wstawienie dokumentu bez `email` zakończyło
się „Document failed validation”, a szczegóły błędu wskazały brakujące pole; po przełączeniu `validationAction` na `warn` ten sam niepoprawny
dokument został wstawiony (logowane jest tylko ostrzeżenie). Walidacja dotyczy wstawień i aktualizacji, więc istniejące niepoprawne dokumenty
zostają, dopóki się ich nie zmieni (`validationLevel`).

## Źródła

- [Data modeling](https://www.mongodb.com/docs/manual/data-modeling/)
- [Embedded data versus references](https://www.mongodb.com/docs/manual/data-modeling/concepts/embedding-vs-references/)
- [Schema design patterns](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/)
- [Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/)
- [$lookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/)

## Pytania

### Czym projektowanie schematu w MongoDB różni się od projektowania relacyjnego? {junior}

Projektowanie relacyjne najpierw normalizuje dane do tabel i polega na złączeniach w czasie zapytań. Projektowanie w MongoDB zaczyna się od wzorców dostępu aplikacji: dane czytane razem zwykle
zapisuje się razem w jednym dokumencie, a duplikacja jest akceptowalna, gdy czyni ważne odczyty tanimi. Schemat nadal istnieje, tylko definiuje go aplikacja (i opcjonalnie wymusza walidacja),
a może ewoluować per dokument.

### Kiedy osadzać dokumenty, a kiedy używać referencji? {mid}

Osadza się, gdy dane są czytane razem, należą do rodzica, mają ograniczony rozmiar i wymagają z nim atomowych aktualizacji (pozycje zamówienia, adresy): jeden odczyt zwraca wszystko. Referencji
używa się, gdy powiązane dane są duże albo nieograniczone, używane samodzielnie, współdzielone przez wielu rodziców albo często i niezależnie aktualizowane (klienci wskazywani z zamówień,
komentarze pod popularnym wpisem). W teście osadzone zamówienie wymagało jednego `findOne`, a wersja z referencjami `$lookup`.

### Na czym polega problem nieograniczonych tablic? {mid}

Tablica rosnąca bez końca (wszystkie komentarze, wszystkie zdarzenia) sprawia, że dokument wciąż rośnie: odczyty i aktualizacje zwalniają, indeksy na tablicy (multikey) się rozrastają, a w końcu
dokument osiąga limit 16 MB i zapisy zawodzą. Takie elementy przechowuje się jako osobne dokumenty wskazujące rodzica albo osadza tylko ograniczony podzbiór (wzorzec subset) lub grupuje w kubełki.

### Jakie są kompromisy denormalizacji w MongoDB? {mid}

Duplikowanie danych (np. nazwy klienta w każdym zamówieniu) unika złączeń i przyspiesza odczyty, ale każda zmiana musi zaktualizować wszystkie kopie: w teście zmiana nazwy klienta dotknęła każdego
zamówienia, które ją zawierało, a do zakończenia aktualizacji kopie są niespójne. Duplikuje się tylko pola, które rzadko się zmieniają albo powinny zachować wartość historyczną (cena produktu
w chwili zamówienia), a źródło prawdy trzyma w jednym miejscu.

### Jak łączyć dane w MongoDB? {junior}

Etapem agregacji `$lookup`, który wykonuje lewe złączenie zewnętrzne z inną kolekcją (i obsługuje pipeline'y dla złożonych warunków), albo drugim zapytaniem z aplikacji. Złączenia są dostępne,
ale nie są darmowe, zwłaszcza między shardami, więc częste złączenia na gorących ścieżkach sugerują, że lepiej pasowałoby osadzenie albo rozszerzona referencja.

### Czym jest walidacja schematu w MongoDB? {mid}

To opcja kolekcji, która sprawdza dokumenty względem reguł, zwykle `$jsonSchema` z wymaganymi polami, typami i ograniczeniami wartości. Przy `validationAction: 'error'` niepoprawne wstawienia
i aktualizacje są odrzucane (w teście „Document failed validation” ze szczegółami niespełnionej reguły); przy `'warn'` są przyjmowane i logowane. Daje gwarancje w stylu relacyjnym dla krytycznych
pól przy zachowaniu elastyczności.

### Czym jest wzorzec bucket? {senior}

To grupowanie wielu małych powiązanych elementów w jeden dokument na zakres, np. jeden dokument na czujnik na godzinę z tablicą odczytów i wstępnie policzonymi statystykami. Zmniejsza liczbę
dokumentów i wpisów w indeksach i usprawnia zapytania zakresowe. Dla szeregów czasowych kolekcje szeregów czasowych MongoDB stosują takie kubełkowanie automatycznie.

### Czym jest wzorzec extended reference? {mid}

To przechowywanie referencji do innego dokumentu razem z kopią kilku pól, które prawie zawsze są z nim potrzebne, np. zamówienie trzyma `customerId` oraz nazwę i adres wysyłki klienta. Większość
odczytów nie wymaga wtedy złączenia, a pełny klient zostaje we własnej kolekcji. Kopiowane pola dobiera się tak, żeby rzadko się zmieniały albo powinny zostać zamrożone w chwili zamówienia.

### Jak rozwijać schemat w MongoDB? {senior}

Dokumenty mogą mieć różne kształty, więc nowe pola można dodawać bez migracji, a kod musi przez pewien czas obsługiwać obie wersje. Częste podejście to pole `schemaVersion` i leniwe migrowanie
dokumentów przy odczycie albo zapisie lub zadaniem w tle, a potem zaostrzenie walidacji i usunięcie obsługi starego kształtu. Duże zmiany nadal wymagają zaplanowanych migracji i wdrożeń zgodnych
wstecz.

### Jak zamodelować relację wiele-do-wielu w MongoDB? {mid}

Zwykle tablicami referencji po jednej albo obu stronach, np. dokument studenta trzyma `courseIds`, a w razie potrzeby kursy trzymają `studentIds`, wybierając stronę, która pozostaje ograniczona
i pasuje do zapytań. Gdy relacja ma własne dane (data zapisu, ocena) albo jest duża, używa się osobnej kolekcji dokumentów łączących, podobnej do tabeli łączącej, z indeksami na obu kluczach.
