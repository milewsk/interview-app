# Dokumenty i CRUD w MongoDB {junior}

MongoDB to **baza dokumentowa**: dane są przechowywane jako **dokumenty BSON** (binarny JSON z dodatkowymi typami, jak `ObjectId`,
`Date`, `Decimal128`) w **kolekcjach**, bez stałego schematu tabeli. Dokument może zawierać zagnieżdżone obiekty i tablice, więc
zamówienie z pozycjami to jeden dokument zamiast wierszy w dwóch tabelach. Przykłady uruchamiałem na MongoDB 8.0 (obraz `mongo:8.0`,
`mongosh`); najnowsza linia wydań to 8.3.

## Dokumenty i `_id`

```js
db.products.insertOne({ name: 'Pen', price: 10, tags: ['office', 'blue'], stock: { qty: 5, warehouse: 'A' } })
```

- Każdy dokument ma unikalne `_id`; jeśli się go nie poda, sterownik generuje **`ObjectId`**, który zawiera znacznik czasu utworzenia
  (`getTimestamp()` zwróciło dzisiejszą datę).
- Dokumenty w jednej kolekcji mogą mieć **różne kształty**: `Mug` z polem `color` i bez `tags` leżał obok produktów z `tags` i `stock`.
  Walidacja schematu (`$jsonSchema`) może wymusić strukturę, gdy jest potrzebna.
- Dokument ma limit **16 MB**: sprawdzone, dokument 15,9 MB został wstawiony, a 16,5 MB odrzucony („BSONObj size ... Size must be between
  0 and 16809984(16MB)”).

## Zapytania

| Zapytanie | Wynik w teście |
|---|---|
| `{ price: { $gt: 12 } }` | Notebook, Mug, Lamp |
| `{ 'stock.qty': 0 }` (notacja kropkowa w zagnieżdżonych dokumentach) | Notebook |
| `{ tags: 'blue' }` (wartość skalarna pasuje do **dowolnego elementu tablicy**) | Pen, Lamp |
| `{ tags: { $in: ['home', 'garden'] } }` | Lamp |
| `{ discontinued: null }` | 4 dokumenty: `null` **albo brak pola**; `{ $exists: true }` znalazło tylko 1 |
| `{ v: { $gt: 0 } }` na `1`, `'1'`, `2` | 2: porównania uwzględniają typ, napis nie pasował |

**Pułapka `$elemMatch`**: dla zamówień z pozycjami `[{sku:'A',qty:1},{sku:'B',qty:5}]` i `[{sku:'A',qty:5}]` zapytanie
`{ 'lines.sku': 'A', 'lines.qty': { $gte: 5 } }` zwróciło **oba** zamówienia, bo każdy warunek może spełnić *inny* element;
`{ lines: { $elemMatch: { sku: 'A', qty: { $gte: 5 } } } }` zwróciło tylko zamówienie 2.

Projekcje (`{ _id: 0, name: 1 }`) zwracają wybrane pola; `sort`, `skip` i `limit` stronicują wyniki (`sort({price:-1}).skip(1).limit(2)`
zwróciło Lamp:50, Notebook:20). `countDocuments(filter)` liczy dokładnie; `estimatedDocumentCount()` czyta metadane kolekcji, jest szybkie,
ale ignoruje filtry.

## Aktualizacje

- Aktualizacje używają **operatorów**: `$set`, `$inc`, `$push`, `$pull`, `$unset`... Sprawdzone:
  `{ $inc: { price: 2 }, $push: { tags: 'sale' }, $set: { 'stock.qty': 4 } }` zmieniło tylko te pola. Przekazanie zwykłego dokumentu do
  `updateOne` zakończyło się błędem „Update document requires atomic operators”.
- `replaceOne` zastępuje **cały** dokument: po zastąpieniu `Mug` bez `color` pole zniknęło.
- `upsert: true` wstawia dokument, gdy nic nie pasuje (`upsertedCount` 1).
- `findOneAndUpdate(..., { returnDocument: 'after' })` atomowo aktualizuje i zwraca nową wersję, co przydaje się przy licznikach i kolejkach.
- `deleteOne`/`deleteMany` usuwają dokumenty (`deleteMany({ price: { $gte: 100 } })` usunęło 1).
- Zapis pojedynczego dokumentu jest **atomowy**, łącznie ze zmianami zagnieżdżonych pól i tablic.

## Źródła

- [Documents](https://www.mongodb.com/docs/manual/core/document/)
- [MongoDB CRUD operations](https://www.mongodb.com/docs/manual/crud/)
- [Query an array of embedded documents ($elemMatch)](https://www.mongodb.com/docs/manual/tutorial/query-array-of-documents/)
- [Query for null or missing fields](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/)
- [Update operators](https://www.mongodb.com/docs/manual/reference/operator/update/)
- [MongoDB limits and thresholds](https://www.mongodb.com/docs/manual/reference/limits/)

## Pytania

### Czym jest baza dokumentowa? {junior}

To baza, która przechowuje dane jako samoopisujące się dokumenty (w MongoDB BSON) pogrupowane w kolekcje zamiast wierszy w tabelach o stałym schemacie. Dokument może zawierać zagnieżdżone
obiekty i tablice, więc dane używane razem (zamówienie z pozycjami, użytkownik z adresami) można zapisać i odczytać jako jedną całość, a dokumenty w tej samej kolekcji mogą mieć różne pola.

### Czym jest `_id` i czym jest `ObjectId`? {junior}

`_id` to wymagany klucz główny każdego dokumentu, unikalny w kolekcji i automatycznie indeksowany. Jeśli się go nie ustawi, sterownik generuje `ObjectId`: 12-bajtową wartość zawierającą znacznik
czasu, wartość losową i licznik, więc jest unikalna bez koordynacji i w przybliżeniu sortowalna po czasie utworzenia (w teście `getTimestamp()` zwróciło datę wstawienia). Można używać własnych
wartości, np. klucza naturalnego albo GUID.

### Jak odpytywać zagnieżdżone pola i tablice? {junior}

Dla zagnieżdżonych dokumentów używa się notacji kropkowej (`{ 'stock.qty': 0 }`), a dla tablic warunek skalarny pasuje do dokumentów, w których dowolny element jest mu równy (`{ tags: 'blue' }`
dopasowało każdy produkt, który miał „blue” wśród tagów). Operatory takie jak `$in`, `$all`, `$size` i `$elemMatch` wyrażają dokładniejsze warunki na tablicach.

### Kiedy potrzebne jest `$elemMatch`? {mid}

Gdy kilka warunków musi być spełnionych przez ten sam element tablicy. Bez niego każdy warunek może spełnić inny element: w teście `{ 'lines.sku': 'A', 'lines.qty': { $gte: 5 } }` dopasowało
zamówienie, w którym pozycja `A` miała ilość 1, a pozycja `B` ilość 5. `{ lines: { $elemMatch: { sku: 'A', qty: { $gte: 5 } } } }` zwróciło tylko zamówienie, w którym jedna pozycja spełniała
oba warunki.

### Co dopasowuje `{ pole: null }`? {mid}

Dokumenty, w których pole ma wartość `null`, oraz dokumenty, w których pola w ogóle nie ma: w teście dopasowało 4 dokumenty, a `{ pole: { $exists: true } }` tylko ten jeden, który miał pole
(ustawione na null). Żeby znaleźć tylko jawne null, używa się `{ pole: { $type: 'null' } }`, a brakujące pola `{ pole: { $exists: false } }`.

### Czym różni się `updateOne` od `replaceOne`? {junior}

`updateOne` stosuje operatory aktualizacji (`$set`, `$inc`, `$push`...) i zmienia tylko wskazane pola; przekazanie zwykłego dokumentu jest odrzucane („Update document requires atomic
operators”). `replaceOne` zastępuje cały dokument poza `_id`, więc pola nieobecne w zamienniku są usuwane: w teście pole `color` zniknęło po `replaceOne`. Do częściowych zmian używa się
aktualizacji, żeby nie nadpisać równoległych zmian innych pól.

### Czym jest upsert? {junior}

To aktualizacja z `upsert: true`, która wstawia nowy dokument, gdy żaden dokument nie pasuje do filtra, łącząc pola równości z filtra z aktualizacją. Przydaje się w logice „utwórz albo zaktualizuj”,
np. przy licznikach albo synchronizacji rekordów po zewnętrznym kluczu. Równoległe upserty dla tego samego klucza mogą utworzyć duplikaty, chyba że na tym kluczu jest unikalny indeks.

### Czy zapisy w MongoDB są atomowe? {mid}

Zapis do pojedynczego dokumentu jest atomowy, nawet gdy zmienia kilka pól, zagnieżdżone dokumenty i tablice, więc osadzenie powiązanych danych w jednym dokumencie daje atomowe aktualizacje bez
transakcji. Operacje dotykające wielu dokumentów (`updateMany`, kilka zapisów) są atomowe per dokument, ale nie jako całość, chyba że użyje się transakcji wielodokumentowej.

### Jaki jest maksymalny rozmiar dokumentu i co z tego wynika? {mid}

16 MB BSON: w teście dokument 15,9 MB został wstawiony, a 16,5 MB odrzucony z „Size must be between 0 and 16809984(16MB)”. Limit zapobiega nieograniczonym dokumentom, np. tablicy rosnącej z każdym
komentarzem albo zdarzeniem. Takie dane należą do osobnych dokumentów; duże pliki trafiają do GridFS albo magazynu obiektów.

### Czym różnią się `countDocuments` i `estimatedDocumentCount`? {mid}

`countDocuments(filter)` wykonuje agregację, która dokładnie liczy pasujące dokumenty i może używać indeksów, ale na dużych kolekcjach zajmuje czas. `estimatedDocumentCount()` czyta metadane
kolekcji, więc działa natychmiast, ale nie przyjmuje filtra i może być niedokładne po nieczystym wyłączeniu albo w klastrach shardowanych z osieroconymi dokumentami. Szacunku używa się
w dashboardach, a dokładnego liczenia, gdy liczy się poprawność.
