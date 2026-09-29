# Zapisywanie danych i operacje hurtowe {mid}

`SaveChanges` to **jednostka pracy** (unit of work) EF Core: wprowadzasz zmiany w śledzonych encjach, a jedno wywołanie
utrwala je wszystkie. Do operacji na wielu wierszach EF Core 7+ ma też `ExecuteUpdate` i `ExecuteDelete`, które działają
bezpośrednio w bazie bez wczytywania danych.

## Co robi `SaveChanges`

1. Wywołuje `DetectChanges`, porównując śledzone encje z migawkami.
2. Porządkuje polecenia tak, żeby klucze obce były spełnione (encje główne przed zależnymi).
3. Otwiera **transakcję** (jeśli jeszcze jej nie ma) i wykonuje polecenia, **grupując** je (batching), gdy dostawca
   na to pozwala.
4. Odczytuje wartości wygenerowane przez bazę (klucze identity, wartości domyślne, tokeny współbieżności) i ustawia je
   w encjach.
5. Oznacza encje jako `Unchanged` (a usunięte jako `Detached`).

```csharp
var products = Enumerable.Range(1, 100).Select(i => new Product { Sku = $"S{i}", Price = i }).ToList();
db.Products.AddRange(products);        // Id = 0: jeszcze nieznane
await db.SaveChangesAsync();           // Id = 1..100: uzupełnione z bazy
```

- Jest **atomowe**: w teście jedno z trzech wstawień naruszyło indeks unikalny i żaden wiersz nie został zapisany.
- `UPDATE` ustawia **tylko zmienione kolumny**: po zmianie ceny SQL wyglądał tak:
  `UPDATE "Products" SET "Price" = @p0 WHERE ...`.
- **Batching**: SQL Server domyślnie wysyła do 42 instrukcji w jednym wywołaniu (konfigurowalne przez
  `MaxBatchSize`/`MinBatchSize`). SQLite wykonał 100 wstawień jako 100 osobnych poleceń, bo jego dostawca nie grupuje
  (to baza działająca w procesie, więc wywołania są tanie).
- `SaveChanges` wywołuje się **raz na jednostkę pracy** (np. na żądanie), a nie po każdym `Add` w pętli.

## Odłączone grafy: `Add`, `Attach`, `Update`

Gdy encje przychodzą z zewnątrz (np. z API), EF ustala stan każdej encji na podstawie klucza:

| Metoda | Encja z ustawionym kluczem | Encja z domyślnym kluczem (`0`) |
|---|---|---|
| `Add` | `Added` | `Added` |
| `Attach` | `Unchanged` | `Added` |
| `Update` | `Modified` (wszystkie kolumny) | `Added` |

W teście `Attach` zamówienia z `Id = 7` zawierającego nową pozycję (`Id = 0`) i istniejącą pozycję (`Id = 5`) dało
`Unchanged`, `Added`, `Unchanged`, a `Update` dało `Modified`, `Added`, `Modified`. `Update` zapisuje **wszystkie**
kolumny zmodyfikowanych encji, co może nadpisać równoległe zmiany, więc przy aktualizacjach z API często bezpieczniej
wczytać encję i skopiować tylko dozwolone pola.

## `ExecuteUpdate` i `ExecuteDelete`

```csharp
var raised = await db.Products
    .Where(p => p.Price < 10)
    .ExecuteUpdateAsync(s => s
        .SetProperty(p => p.Price, p => p.Price * 2)
        .SetProperty(p => p.Sku, p => p.Sku + "-sale"));     // jedna instrukcja UPDATE ... WHERE

var removed = await db.Products.Where(p => p.IsDiscontinued).ExecuteDeleteAsync();   // jedna instrukcja DELETE
```

- **Jedna instrukcja SQL**, bez wczytywania wierszy i bez śledzenia zmian: w teście aktualizacja 8 wierszy i usunięcie
  10 zajęły po jednym poleceniu.
- Wykonują się **od razu**, a nie przy `SaveChanges`, i poza jego transakcją, chyba że jawnie się ją otworzy.
- **Omijają change tracker**: już wczytane encje zachowują stare wartości, a funkcje po stronie EF się nie uruchamiają:
  brak interceptorów i zdarzeń `SaveChanges`, brak kaskadowego usuwania skonfigurowanego tylko w EF (bazodanowe
  `ON DELETE CASCADE` nadal działa), brak sprawdzania tokenów współbieżności (chyba że doda się je do `Where`).
- Od EF Core 10 lambda z setterami może być zwykłym blokiem, więc właściwości da się ustawiać warunkowo
  (`if (discount) s.SetProperty(...)`).

## Wstawianie wielu wierszy

EF Core nie ma wbudowanego hurtowego wstawiania: `AddRange` + `SaveChanges` generuje `INSERT` na wiersz (grupowane na
SQL Server). Przy dziesiątkach tysięcy wierszy albo importach używa się API hurtowego dostawcy (`SqlBulkCopy` dla
SQL Server, `COPY` dla PostgreSQL) lub biblioteki zewnętrznej i rozważa osobny, krótko żyjący kontekst na każdą porcję,
żeby change tracker nie rósł bez końca.

## Źródła

- [Saving data overview](https://learn.microsoft.com/en-us/ef/core/saving/)
- [ExecuteUpdate and ExecuteDelete](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)
- [Efficient updating (batching)](https://learn.microsoft.com/en-us/ef/core/performance/efficient-updating)
- [Disconnected entities](https://learn.microsoft.com/en-us/ef/core/saving/disconnected-entities)
- [Related data (saving graphs)](https://learn.microsoft.com/en-us/ef/core/saving/related-data)

## Pytania

### Co krok po kroku robi `SaveChanges`? {mid}

Wykrywa zmiany w śledzonych encjach, porządkuje polecenia SQL tak, żeby relacje były spełnione, rozpoczyna transakcję, jeśli jej nie ma, wykonuje
polecenia (grupowane tam, gdzie dostawca to obsługuje), odczytuje wygenerowane wartości, jak klucze identity i tokeny współbieżności, a na końcu
oznacza encje jako `Unchanged`. Jeśli któreś polecenie się nie powiedzie, transakcja jest wycofywana i nic nie zostaje zapisane.

### Czy `SaveChanges` jest atomowe? {junior}

Tak. Domyślnie wszystkie zmiany z jednego wywołania `SaveChanges` wykonują się w jednej transakcji: jeśli któreś polecenie się nie powiedzie (np.
naruszenie indeksu unikalnego), żadna ze zmian nie zostanie zapisana. Jawna transakcja jest potrzebna dopiero wtedy, gdy kilka wywołań
`SaveChanges` albo inne operacje (np. `ExecuteUpdate`, surowy SQL) muszą razem się powieść lub razem zawieść.

### Kiedy znany jest klucz nowej encji? {junior}

Dla kluczy generowanych przez bazę (np. `IDENTITY`) dopiero po `SaveChanges`: wcześniej właściwość ma wartość domyślną (`0`), a potem EF odczytuje
wygenerowaną wartość i ustawia ją w encji, poprawiając też klucze obce encji powiązanych. Klucze `Guid` EF generuje już przy `Add`. Jeśli
identyfikatory są potrzebne przed zapisem, rozważa się klucze generowane po stronie klienta albo HiLo.

### Dlaczego nie wywoływać `SaveChanges` w pętli? {junior}

Każde wywołanie to osobna transakcja i co najmniej jedno wywołanie bazy, więc zapisywanie 1000 encji pojedynczo oznacza 1000 transakcji i wywołań
zamiast jednej transakcji z kilkoma batchami. Do tego nie jest to atomowe: błąd w połowie zostawia część danych zapisaną. Dodaje się wszystkie encje
i wywołuje `SaveChanges` raz na jednostkę pracy (przy bardzo dużych zbiorach porcjami).

### Co oznacza batching w `SaveChanges`? {mid}

EF grupuje kilka instrukcji `INSERT`/`UPDATE`/`DELETE` w jedno polecenie bazodanowe, zmniejszając liczbę wywołań. Dla SQL Server domyślnie do
42 instrukcji trafia do jednego batcha (konfigurowalne przez `MaxBatchSize`), bo większe batche nie pomagają. Batching zależy od dostawcy: SQLite,
baza działająca w procesie, wykonuje instrukcje osobno.

### Czym różni się `Attach` od `Update` dla odłączonej encji? {mid}

`Attach` oznacza encję z ustawionym kluczem jako `Unchanged` (a encje bez wartości klucza jako `Added`), więc nic nie zostanie zapisane, dopóki nie
zmieni się właściwości lub nie oznaczy ich jako zmodyfikowanych. `Update` oznacza encje z kluczami jako `Modified`, co aktualizuje wszystkie ich
kolumny, także niezmienione, i może nadpisać równoległe zmiany. Obie metody przechodzą cały graf osiągalnych encji.

### Czym różni się `ExecuteUpdate` od wczytania encji i wywołania `SaveChanges`? {mid}

`ExecuteUpdate` tłumaczy się na jedną instrukcję `UPDATE ... WHERE` wykonaną od razu: żadne wiersze nie są wczytywane, nic nie jest śledzone i można
zmienić miliony wierszy w jednym wywołaniu. Tradycyjny sposób wczytuje każdą encję, śledzi ją i wysyła `UPDATE` na wiersz. Ceną `ExecuteUpdate` jest
ominięcie change trackera, interceptorów, kaskad po stronie EF i sprawdzania współbieżności oraz to, że domyślnie nie bierze udziału w transakcji
`SaveChanges`.

### Co się nie dzieje, gdy używasz `ExecuteDelete`? {senior}

EF nie wczytuje encji, więc kaskadowe usuwanie skonfigurowane tylko w modelu EF nie jest stosowane (działają tylko reguły bazodanowe `ON DELETE`),
interceptory i zdarzenia `SaveChanges` się nie uruchamiają, logika soft delete zaimplementowana w `SaveChanges` jest pomijana, a śledzone instancje
usuniętych wierszy zostają w kontekście, jakby nic się nie stało. Globalne filtry zapytań są stosowane w `WHERE`, co ma znaczenie przy danych
wielodostępnych (multi-tenant).

### Jak wydajnie wstawić 100 000 wierszy? {senior}

Nie jednym ogromnym `AddRange` + `SaveChanges`, które tworzy 100 000 śledzonych encji i instrukcji `INSERT`. Używa się mechanizmu hurtowego kopiowania
dostawcy (`SqlBulkCopy`, `COPY` w PostgreSQL) albo biblioteki z rozszerzeniami hurtowymi, które przesyłają dane w kilku operacjach. Jeśli musi to być
EF, wstawia się porcjami (np. 1000 na `SaveChanges`) z nowym kontekstem albo `ChangeTracker.Clear()` między porcjami, żeby koszt pamięci i wykrywania
zmian pozostał stały.

### Dlaczego aktualizacja encji otrzymanej z API przez `Update()` może być ryzykowna? {mid}

`Update` oznacza każdą właściwość jako zmodyfikowaną i zapisuje wszystkie kolumny, więc pola, których klient nie wysłał (albo nie powinien móc zmienić,
jak `IsAdmin` czy `CreatedAt`), zostają nadpisane tym, co zawiera obiekt, często wartościami domyślnymi. Bezpieczniej wczytać encję, skopiować z DTO
tylko dozwolone pola (żeby wykryte zostały tylko prawdziwe zmiany) i użyć tokenu współbieżności do wykrywania konfliktowych aktualizacji.
