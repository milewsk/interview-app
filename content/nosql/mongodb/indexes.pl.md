# Indeksy w MongoDB {mid}

Indeksy MongoDB to **B-drzewa**, koncepcyjnie podobne do indeksów relacyjnych: bez odpowiedniego indeksu zapytanie przegląda całą kolekcję
(**COLLSCAN**), a z nim przechodzi indeks (**IXSCAN**) i pobiera tylko pasujące dokumenty. `explain('executionStats')` pokazuje, który plan
został użyty oraz ile kluczy i dokumentów sprawdzono, i jest głównym narzędziem strojenia zapytań. Wszystkie liczby poniżej pochodzą z kolekcji
100 000 zamówień w MongoDB 8.0.

## Od COLLSCAN do IXSCAN

| Zapytanie / indeks | Plan | Sprawdzone klucze | Sprawdzone dokumenty | Zwrócone |
|---|---|---|---|---|
| `{ customerId: 42 }`, bez indeksu | COLLSCAN | 0 | **100 000** | 20 |
| to samo, indeks `{ customerId: 1 }` | IXSCAN → FETCH | 20 | **20** | 20 |
| `{ status: 'paid' }` na indeksie `{ status, createdAt, amount }` | IXSCAN (prefiks) | 25 000 | 25 000 | 25 000 |
| `{ createdAt: ... }` na tym samym indeksie | **COLLSCAN** (to nie prefiks) | 0 | 100 000 | 58 626 |

Indeks złożony obsługuje zapytania na swoich **prefiksach** (`status`, `status + createdAt`...), a nie na samych późniejszych polach.

## Indeksy złożone: zasada ESR

Pola układa się w kolejności **Equality, Sort, Range** (równość, sortowanie, zakres). Dla
`find({ status: 'paid', amount: { $gte: 900 } }).sort({ createdAt: 1 })`:

- indeks `{ status, amount, createdAt }` (E, R, S): plan `IXSCAN → SORT → FETCH`, czyli **sortowanie w pamięci** 2500 dokumentów (blokujące
  i ograniczone pamięcią);
- indeks `{ status, createdAt, amount }` (E, S, R): `IXSCAN → FETCH` **bez etapu SORT**, bo indeks już zwraca dokumenty w kolejności `createdAt`
  (sprawdził nieco więcej kluczy, 2866, ale uniknął sortowania).

## Inne możliwości indeksów

- **Zapytania pokryte**: `find({ customerId: 42 }, { _id: 0, customerId: 1 })` wykonało się jako `PROJECTION_COVERED` przy **0 sprawdzonych
  dokumentach**: wszystko pochodziło z indeksu.
- **Indeksy multikey**: indeks na polu tablicowym (`tags`) indeksuje każdy element (`isMultiKey: true`).
- **Indeksy unikalne**: wstawienie zduplikowanego e-maila zakończyło się `E11000 duplicate key error`.
- **Indeksy częściowe**: `{ amount: 1 }` tylko dla `status: 'cancelled'` obsłużył `status: 'cancelled', amount > 990`, sprawdzając 300 kluczy,
  i miał **152 KB** wobec 1,4–1,7 MB pełnych indeksów kolekcji.
- **Regex**: zakotwiczony prefiks z rozróżnianiem wielkości liter `/^user4/` użył indeksu efektywnie (11 112 kluczy dla 11 111 wyników), a
  `/user4/i` przejrzał **wszystkie 100 000 kluczy indeksu**. Do wyszukiwania bez rozróżniania wielkości liter używa się indeksu z collation albo
  znormalizowanego pola, a do wyszukiwania pełnotekstowego Atlas Search albo indeksów tekstowych.
- **Indeksy TTL**: przy `expireAfterSeconds: 5` dokumenty z wartością `Date` w polu zniknęły po około 13 s (monitor w tle usuwa je okresowo,
  więc czas nie jest dokładny), a dokument, którego pole nie było datą, **nigdy nie wygasł**.
- Inne typy: tekstowe, geoprzestrzenne (`2dsphere`), haszowane (do shardingu), wildcard oraz indeksy wyszukiwania wektorowego w Atlasie.

Każdy indeks przyspiesza odczyty, ale kosztuje pamięć, dysk i czas zapisu, więc indeksuje się pod rzeczywiste wzorce zapytań i usuwa nieużywane
(`$indexStats`).

## Źródła

- [Indexes](https://www.mongodb.com/docs/manual/indexes/)
- [Compound indexes and the ESR guideline](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/)
- [Explain results](https://www.mongodb.com/docs/manual/reference/explain-results/)
- [Covered queries](https://www.mongodb.com/docs/manual/core/query-optimization/#covered-query)
- [Partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/)
- [TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)

## Pytania

### Jak sprawdzić, czy zapytanie MongoDB używa indeksu? {junior}

Uruchomić je z `.explain('executionStats')` i spojrzeć na etapy zwycięskiego planu oraz liczniki: `COLLSCAN` oznacza pełne przejście kolekcji, `IXSCAN` przejście indeksu; `totalKeysExamined`
i `totalDocsExamined` powinny być bliskie `nReturned`. W teście zapytanie bez indeksu sprawdziło 100 000 dokumentów, żeby zwrócić 20, a z indeksem 20. W produkcji takie zapytania znajduje profiler
i log wolnych zapytań.

### Czym jest zasada ESR? {mid}

To wskazówka dotycząca kolejności pól w indeksie złożonym: najpierw pola sprawdzane równością (Equality), potem pola sortowania (Sort), potem pola warunków zakresowych (Range). Pozwala indeksowi
filtrować po równości, zwracać dokumenty już posortowane i stosować zakres w tej kolejności. W teście indeks w kolejności równość-zakres-sortowanie wymagał etapu `SORT` w pamięci, a indeks
równość-sortowanie-zakres zwrócił posortowane wyniki bez etapu sortowania.

### Które zapytania mogą użyć indeksu złożonego? {mid}

Zapytania, które filtrują albo sortują po prefiksie jego pól: indeks na `{ status, createdAt, amount }` obsługuje zapytania po `status`, po `status` i `createdAt` oraz po wszystkich trzech.
Zapytanie tylko po `createdAt` nie może go użyć i wraca do przejścia całej kolekcji (jak w teście), chyba że istnieje inny indeks. Znaczenie ma też kierunek sortowania: indeks można przejść
w całości do przodu albo do tyłu.

### Czym jest zapytanie pokryte? {mid}

To zapytanie, w którym filtr i wszystkie zwracane pola są w indeksie, więc MongoDB odpowiada na nie samym indeksem, bez czytania dokumentów: w teście
`find({ customerId: 42 }, { _id: 0, customerId: 1 })` wykonało się jako `PROJECTION_COVERED` przy 0 sprawdzonych dokumentach. `_id` trzeba wykluczyć z projekcji, chyba że jest
częścią indeksu.

### Czym jest indeks multikey? {mid}

To indeks na polu tablicowym, zawierający jeden wpis na element tablicy, więc zapytania dopasowujące elementy (`{ tags: 't3' }`) mogą go używać; MongoDB oznacza go automatycznie (w teście
`isMultiKey: true`). Indeks złożony może zawierać najwyżej jedno pole tablicowe, a indeksy na dużych tablicach szybko rosną, co jest kolejnym powodem, żeby unikać nieograniczonych tablic.

### Jak zapewnić unikalność pola w MongoDB? {junior}

Utworzyć indeks unikalny: `createIndex({ email: 1 }, { unique: true })`. Wstawienie albo aktualizacja do zduplikowanej wartości kończy się wtedy `E11000 duplicate key error`, co pokazał test.
To także zabezpiecza równoległe upserty. Częściowy indeks unikalny może wymuszać unikalność tylko dla dokumentów pasujących do filtra, np. tylko aktywnych kont.

### Do czego przydają się indeksy częściowe? {senior}

Do indeksowania tylko tych dokumentów, na które faktycznie celują zapytania, np. tylko zamówień `cancelled` albo tylko dokumentów, w których pole istnieje. Indeks jest mniejszy i tańszy
w utrzymaniu: w teście indeks częściowy miał 152 KB wobec 1,4–1,7 MB pełnych indeksów i obsłużył pasujące zapytanie, sprawdzając 300 kluczy. Zapytania muszą zawierać warunek filtra, żeby planer
go użył.

### Dlaczego zapytanie z regexem może być wolne mimo indeksu? {mid}

Tylko regex z rozróżnianiem wielkości liter zakotwiczony na początku (`/^user4/`) może użyć indeksu jako przejścia zakresu: w teście sprawdził mniej więcej tyle kluczy, ile zwrócił. Regex
niezakotwiczony albo bez rozróżniania wielkości liter (`/user4/i`) musi sprawdzić każdy klucz indeksu (w teście 100 000) albo każdy dokument. Do dopasowań bez rozróżniania wielkości liter używa
się indeksu z collation albo znormalizowanego pola małymi literami, a do wyszukiwania pełnotekstowego wyszukiwarki albo Atlas Search.

### Jak działają indeksy TTL? {mid}

Indeks TTL na polu daty z `expireAfterSeconds` sprawia, że zadanie w tle usuwa dokumenty po upływie tego czasu. Zadanie działa okresowo, więc usunięcie nie jest natychmiastowe (w teście dokumenty
z TTL 5 sekund zniknęły po około 13 sekundach), a dokumenty, których pole nie jest datą albo go brakuje, nigdy nie wygasają (sprawdzone). Typowe zastosowania: sesje, tokeny, dane tymczasowe i logi.

### Jaki jest koszt dodawania indeksów? {mid}

Każde wstawienie, aktualizacja i usunięcie musi zaktualizować też każdy dotknięty indeks, więc przepustowość zapisów spada wraz z liczbą indeksów; indeksy zajmują też dysk i, żeby były szybkie,
RAM na zbiór roboczy. Nieużywane albo nadmiarowe indeksy (np. `{ a }`, gdy istnieje `{ a, b }`) należy usuwać; `$indexStats` pokazuje, jak często każdy indeks jest używany. Indeksuje się pod
najważniejsze i najczęstsze zapytania, weryfikowane przez `explain`.
