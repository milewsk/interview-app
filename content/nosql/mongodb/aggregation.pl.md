# Pipeline agregacji {mid}

**Pipeline agregacji** to sposób MongoDB na przekształcanie i analizowanie danych na serwerze: dokumenty przepływają przez **etapy**
(`$match`, `$group`, `$sort`, `$project`, `$lookup`...), z których każdy tworzy wejście dla następnego. Obejmuje to, co SQL robi przez `WHERE`,
`GROUP BY`, `JOIN`, funkcje okna i `INSERT ... SELECT`. Wszystkie wyniki poniżej pochodzą ze 100 000 zamówień w MongoDB 8.0.

## Typowy pipeline

```js
db.orders.aggregate([
  { $match: { status: 'paid' } },                                    // najpierw filtr (może użyć indeksu)
  { $group: { _id: '$customerId', total: { $sum: '$amount' }, orders: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 3 }
])
```

Zwróciło to trzech najlepszych klientów według sumy opłaconych zamówień w 54 ms.

## Etapy warte znajomości (sprawdzone)

- **`$match` na początku**: pipeline zaczynający się od `$match { customerId: 42 }` wykonał się jako `IXSCAN → FETCH`. Nawet z `$addFields` na
  początku optymalizator przeniósł `$match` przed niego i użył indeksu; mimo to lepiej pisać filtry na początku, niż polegać na przestawianiu.
- **`$unwind`** zamienia elementy tablicy w osobne dokumenty (zliczanie tagów dało 24 286 na tag).
- **`$lookup`** łączy z inną kolekcją (zamówienie dostało nazwę klienta `Ann`).
- **`$facet`** uruchamia kilka podpipeline'ów na tym samym wejściu: liczby na status (po 25 000) oraz średnią i maksimum kwoty (499,5 / 999)
  w jednym zapytaniu.
- **`$bucket`** grupuje po zakresach (`[0, 250)`: 25 000, `[250, 500)`: 25 000, `[500, 1000)`: 50 000).
- **Grupowanie po dacie**: `$dateToString` po miesiącu dało przychód na miesiąc (`2026-01`: 4 238 825).
- **`$setWindowFields`** oblicza funkcje okna, np. sumy narastające (554, 1108, 1662).
- **`$merge`/`$out`** zapisują wyniki do kolekcji (`$merge` zapisał 4 dokumenty podsumowania), co przydaje się przy widokach
  zmaterializowanych i raportach.

## Limity i wydajność

- Każdy etap ma **limit 100 MB pamięci** dla operacji blokujących, jak `$sort` i `$group`. Sprawdzone: sortowanie około 156 MB dokumentów
  z `allowDiskUse: false` zakończyło się `QueryExceededMemoryLimitNoDiskUseAllowed` („Sort exceeded memory limit of 104857600 bytes”); z domyślnymi
  opcjami powiodło się w 404 ms, bo od MongoDB 6.0 `allowDiskUseByDefault` ma wartość `true` (sprawdzone), a etap zapisuje dane do plików
  tymczasowych.
- Optymalizator przenosi tylko potrzebne pola: to samo sortowanie zakończone `$count` potrzebowało tylko klucza sortowania i zmieściło się
  w limicie nawet z `allowDiskUse: false`.
- Wyniki są zwracane kursorem, ale pojedynczy dokument wyjściowy nadal ma limit 16 MB (np. `$push` całej grupy do jednej tablicy).

## Źródła

- [Aggregation operations](https://www.mongodb.com/docs/manual/aggregation/)
- [Aggregation pipeline stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/)
- [Aggregation pipeline optimization](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/)
- [Aggregation pipeline limits](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/)
- [SQL to aggregation mapping chart](https://www.mongodb.com/docs/manual/reference/sql-aggregation-comparison/)

## Pytania

### Czym jest pipeline agregacji? {junior}

To sekwencja etapów przetwarzających dokumenty na serwerze, w której wyjście jednego etapu jest wejściem następnego: filtrowanie (`$match`), zmiana kształtu (`$project`, `$addFields`),
grupowanie (`$group`), sortowanie, złączenia (`$lookup`), rozwijanie tablic i zapis wyników (`$merge`, `$out`). To odpowiednik `WHERE`, `GROUP BY`, `JOIN` i funkcji okna z SQL.

### Dlaczego `$match` powinien być jak najwcześniej? {junior}

`$match` na początku pipeline'u może używać indeksów i zmniejsza liczbę dokumentów, które musi przetworzyć każdy kolejny etap; w teście początkowy `$match` wykonał się jako przejście indeksu.
Optymalizator potrafi automatycznie przesunąć niektóre `$match` wcześniej (zrobił to przed `$addFields`), ale nie przez etapy zmieniające dopasowywane pola, więc pisanie filtrów na początku
jest niezawodnym podejściem.

### Jak zrobić w MongoDB odpowiednik `GROUP BY` z SQL? {junior}

Przez `$group`, w którym `_id` to klucz grupowania (pole, wyrażenie albo obiekt z kilkoma polami), a pozostałe pola używają akumulatorów, takich jak `$sum`, `$avg`, `$min`, `$max`, `$push`,
`$first`: `{ $group: { _id: '$customerId', total: { $sum: '$amount' }, orders: { $sum: 1 } } }`. `$match` po `$group` działa jak `HAVING`.

### Co robi `$unwind` i na co uważać? {mid}

Zwraca jeden dokument na każdy element pola tablicowego, więc elementy tablicy można osobno grupować, filtrować albo łączyć (np. zliczanie zamówień na tag). Mnoży liczbę dokumentów, co przy
dużych tablicach kosztuje pamięć i czas, a domyślnie pomija dokumenty z brakującą albo pustą tablicą, chyba że ustawi się `preserveNullAndEmptyArrays: true`.

### Jak łączyć kolekcje w agregacji? {mid}

Przez `$lookup`, który dodaje tablicę pasujących dokumentów z innej kolekcji (lewe złączenie zewnętrzne), po równości `localField`/`foreignField` albo z podpipeline'em dla złożonych warunków;
potem spłaszcza się ją przez `$unwind` albo `$first`. W teście zamówienie dostało w ten sposób nazwę klienta. Pole obce powinno być zaindeksowane, a złączenia na gorących ścieżkach mogą
sugerować, że lepiej pasowałoby osadzenie albo rozszerzona referencja.

### Jakie limity pamięci dotyczą agregacji? {senior}

Etapy blokujące, takie jak `$sort` i `$group`, mogą używać po 100 MB RAM. Powyżej tego muszą zapisywać dane na dysk: w teście sortowanie około 156 MB dokumentów zakończyło się
`QueryExceededMemoryLimitNoDiskUseAllowed` przy `allowDiskUse: false`, a powiodło się z domyślnymi opcjami, bo od MongoDB 6.0 `allowDiskUseByDefault` ma wartość true. Zapis na dysk jest
wolniejszy, więc duże sortowania powinny być obsługiwane przez indeksy albo wcześnie redukowane przez `$match` i `$project`.

### Do czego służą `$facet` i `$bucket`? {mid}

`$facet` uruchamia kilka niezależnych podpipeline'ów na tym samym wejściu i zwraca ich wyniki w jednym dokumencie, co pasuje do stron wyszukiwania z wieloma fasetami (liczby na kategorię,
zakresy cen, statystyki) liczonymi w jednym zapytaniu. `$bucket` grupuje dokumenty w zakresy zdefiniowane granicami (np. przedziały cenowe), a `$bucketAuto` dobiera granice automatycznie.

### Jak obliczać sumy narastające albo rankingi? {senior}

Przez `$setWindowFields`, czyli funkcje okna MongoDB: dzieli i sortuje dokumenty i oblicza wartości w oknie, np. sumę narastającą z `window: { documents: ['unbounded', 'current'] }` (w teście:
554, 1108, 1662), średnie kroczące, `$rank` albo `$denseRank`, bez zwijania dokumentów, jak robi to `$group`.

### Czym różni się `$out` od `$merge`? {mid}

Oba zapisują wyniki pipeline'u do kolekcji. `$out` zastępuje całą kolekcję docelową wynikami. `$merge` scala je z istniejącą kolekcją: dla każdego wyniku może wstawić, zastąpić, zaktualizować
(scalić pola) albo zachować istniejące dokumenty według klucza, więc może przyrostowo utrzymywać widoki zmaterializowane albo kolekcje podsumowań (w teście zapisał liczby na status do kolekcji
podsumowania).

### Kiedy używać agregacji zamiast przetwarzania danych w aplikacji? {mid}

Gdy obliczenie redukuje dużą ilość danych do mniejszego wyniku (sumy, liczby, top N, raporty): zrobienie tego na serwerze unika przesyłania wszystkich dokumentów i korzysta z indeksów.
Przetwarzanie w aplikacji wystarcza przy małych zbiorach wyników albo złożonej logice biznesowej, która nie pasuje do pipeline'u. Przy ciężkiej analityce na danych operacyjnych rozważa się
podsumowania oparte na `$merge`, odczyty z węzła drugorzędnego albo osobny magazyn analityczny.
