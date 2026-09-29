# Domain-Driven Design (DDD) {mid}

Domain-Driven Design (Eric Evans, 2003) to podejście do oprogramowania ze złożonymi regułami biznesowymi: kod jest
zorganizowany wokół **modelu domeny biznesowej**, budowanego razem z ekspertami domenowymi i wyrażonego w ich języku. Ma
dwie części: **projektowanie strategiczne** (jak podzielić dużą domenę) i **projektowanie taktyczne** (cegiełki modelu
wewnątrz jednej części).

## Projektowanie strategiczne

- **Wszechobecny język** (ubiquitous language): jedno wspólne słownictwo używane przez programistów i ekspertów domenowych
  w rozmowach, dokumentacji i **kodzie**. Jeśli biznes mówi „polisa zostaje zaakceptowana do ubezpieczenia”, kod ma
  `Policy.Underwrite()`, a nie `PolicyManager.UpdateStatus(3)`.
- **Bounded context** (kontekst ograniczony): jawna granica, wewnątrz której model i jego język są spójne. To samo słowo może
  znaczyć co innego w różnych kontekstach: „Produkt” w katalogu (opis, zdjęcia), w magazynie (wymiary, stan) i w rozliczeniach
  (cena, stawka podatku). Zamiast jednego ogromnego wspólnego modelu każdy kontekst ma własny. Bounded contexty to naturalni
  kandydaci na moduły lub mikroserwisy.
- **Poddomeny**: domena **główna** (core, przewaga konkurencyjna, gdzie wysiłek DDD się opłaca), poddomeny **wspierające**
  i **generyczne** (uwierzytelnianie, fakturowanie: często kupowane albo używane jako biblioteka).
- **Mapa kontekstów** opisuje relacje między kontekstami: shared kernel, klient–dostawca, konformista, **warstwa
  antykorupcyjna** (warstwa tłumacząca, która chroni twój model przed modelem starego lub zewnętrznego systemu), open host
  service, published language.

## Taktyczne cegiełki

| Cegiełka | Czym jest | Przykład |
|---|---|---|
| **Encja** | ma tożsamość trwającą w czasie; równość po ID | `Order`, `Customer` |
| **Value object** | zdefiniowany wyłącznie przez wartości, niemutowalny, równość po wartości | `Money`, `Address`, `DateRange` |
| **Agregat** | grupa obiektów traktowana przy zmianach jako całość, z jednym **korzeniem agregatu** | `Order` z jego `OrderLine` |
| **Zdarzenie domenowe** | coś znaczącego, co wydarzyło się w domenie | `OrderPaid` |
| **Repozytorium** | abstrakcja podobna do kolekcji do wczytywania i zapisywania agregatów | `IOrderRepository` |
| **Serwis domenowy** | logika domenowa, która nie należy do jednej encji | obliczenie przelewu między dwoma kontami |
| **Fabryka** | zamyka złożone tworzenie | `Order.Create(...)` |

```csharp
public readonly record struct Money
{
    public Money(decimal amount, string currency) { ArgumentOutOfRangeException.ThrowIfNegative(amount); Amount = amount; Currency = currency; }
    public static Money operator +(Money x, Money y) =>
        x.Currency == y.Currency ? new(x.Amount + y.Amount, x.Currency) : throw new InvalidOperationException("Currency mismatch");
    ...
}

public sealed class Order                       // korzeń agregatu
{
    private readonly List<OrderLine> _lines = [];
    public IReadOnlyList<OrderLine> Lines => _lines;          // z zewnątrz nie da się dodać pozycji bezpośrednio
    public bool IsPaid { get; private set; }

    public void AddLine(string sku, int qty, Money price)
    {
        if (IsPaid) throw new InvalidOperationException("Cannot modify a paid order");   // niezmiennik
        ...
    }

    public void Pay() { ...; IsPaid = true; _events.Add(new OrderPaid(Id, Total)); }
}
```

W teście: dwie wartości `Money(10, "PLN")` były równe, dodanie PLN do EUR rzuciło „Currency mismatch”, dwukrotne dodanie tego
samego SKU połączyło się w jedną pozycję z ilością 3, opłacenie wygenerowało `OrderPaid`, a późniejsze dodanie pozycji rzuciło
„Cannot modify a paid order”.

## Reguły agregatów

- Kod z zewnątrz odwołuje się do agregatu i go modyfikuje **tylko przez korzeń**; obiekty wewnętrzne (pozycje zamówienia) nie są
  zmieniane bezpośrednio.
- Agregat to **granica spójności**: jego niezmienniki obowiązują po każdej operacji, a jedna transakcja zmienia **jeden
  agregat**. Inne agregaty aktualizuje się przez zdarzenia domenowe i spójność ostateczną.
- Agregaty odwołują się do siebie **przez ID** (`CustomerId`), a nie referencje do obiektów.
- Agregaty powinny być **małe**: duże agregaty powodują konflikty współbieżności i wolne wczytywanie.

## Kiedy DDD się opłaca

Przy złożonej, zmieniającej się logice biznesowej, która jest centralna dla produktu. W aplikacjach CRUD z niewielką ilością
zachowania taktyczne DDD dodaje ceremonię bez większej korzyści, ale idee strategiczne (bounded contexty, wszechobecny język)
przydają się prawie wszędzie.

## Źródła

- [Tackle business complexity with DDD and CQRS patterns (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/)
- [Domain events: design and implementation (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)
- [DDD reference (Eric Evans)](https://www.domainlanguage.com/ddd/reference/)
- [Bounded context (Martin Fowler)](https://martinfowler.com/bliki/BoundedContext.html)
- [DDD aggregate (Martin Fowler)](https://martinfowler.com/bliki/DDD_Aggregate.html)
- [Value object (Martin Fowler)](https://martinfowler.com/bliki/ValueObject.html)

## Pytania

### Czym jest Domain-Driven Design? {junior}

To podejście do budowy oprogramowania ze złożoną logiką biznesową, w którym kod jest zorganizowany wokół modelu domeny biznesowej, rozwijanego w ścisłej współpracy
z ekspertami domenowymi i wyrażonego we wspólnym wszechobecnym języku. Obejmuje projektowanie strategiczne (podział domeny na bounded contexty i poddomeny) oraz wzorce
taktyczne (encje, value objecty, agregaty, zdarzenia domenowe, repozytoria) do implementacji modelu.

### Czym jest bounded context? {mid}

To jawna granica (często moduł, serwis albo zespół), wewnątrz której dany model domenowy i jego pojęcia mają jedno spójne znaczenie. To samo pojęcie może być modelowane różnie
w różnych kontekstach: „klient” w sprzedaży ma leady i rabaty, w obsłudze zgłoszenia, a w rozliczeniach metody płatności. Osobne modele per kontekst pozwalają uniknąć
rozdętego, niejednoznacznego wspólnego modelu, a bounded contexty to naturalne granice modułów lub mikroserwisów.

### Czym encja różni się od value objectu? {junior}

Encja ma tożsamość, która trwa mimo zmian atrybutów: dwa zamówienia o tej samej zawartości to nadal różne zamówienia, a równość jest po ID. Value object nie ma tożsamości
i jest w całości zdefiniowany przez swoje wartości (pieniądze, adres, zakres dat): dwa `Money(10, "PLN")` są równe. Value objecty powinny być niemutowalne, walidować się przy
tworzeniu i świetnie pasują do rekordów w C#.

### Czym jest agregat i czym jest korzeń agregatu? {mid}

Agregat to grupa powiązanych obiektów (np. zamówienie i jego pozycje) traktowana jako jedna całość przy zmianach danych i chroniąca niezmienniki biznesowe. Korzeń agregatu
(`Order`) to jedyny punkt wejścia: kod z zewnątrz wywołuje jego metody i trzyma referencje tylko do niego, nigdy nie modyfikując bezpośrednio obiektów wewnętrznych. Dzięki temu
korzeń może egzekwować reguły, takie jak „opłaconego zamówienia nie można modyfikować”, w jednym miejscu.

### Dlaczego jedna transakcja powinna modyfikować tylko jeden agregat? {senior}

Agregat to granica spójności, zaprojektowana tak, żeby jego niezmienniki dało się egzekwować w jednej transakcji. Zmiana kilku agregatów w jednej transakcji w praktyce czyni
agregaty większymi, zwiększa blokowanie i konflikty współbieżności i nie działa, gdy agregaty żyją w różnych serwisach czy bazach. Zmiany innych agregatów wykonuje się
w osobnych transakcjach wywołanych zdarzeniami domenowymi, akceptując spójność ostateczną między nimi.

### Czym są zdarzenia domenowe? {mid}

To obiekty reprezentujące coś znaczącego, co wydarzyło się w domenie, nazwane w czasie przeszłym we wszechobecnym języku (`OrderPaid`, `CustomerRelocated`). Agregat zapisuje
je, gdy zmienia się jego stan, a handlery na nie reagują, np. aktualizując inne agregaty, wysyłając e-maile albo publikując zdarzenia integracyjne dla innych serwisów.
Oddzielają efekty uboczne od agregatu i czynią proces biznesowy jawnym.

### Czym jest warstwa antykorupcyjna? {mid}

To warstwa tłumacząca między twoim bounded contextem a innym modelem, zwykle starym systemem albo zewnętrznym API. Przekłada pojęcia, formaty i dziwactwa drugiej strony na
twój model, żeby jej projekt nie przeciekał do twojego i go nie „psuł”. Implementuje się ją jako adaptery, fasady i translatory na granicy, a szczególnie przydaje się, gdy
drugiego systemu nie da się zmienić.

### Czym jest wszechobecny język? {junior}

To wspólne, precyzyjne słownictwo, którym posługują się programiści i eksperci domenowi i które jest używane konsekwentnie w rozmowach, wymaganiach, testach i samym kodzie
(nazwy klas, metod i zdarzeń). Zmniejsza błędy tłumaczenia między „językiem biznesu” a „językiem programistów”, a gdy język się zmienia, kod zmienia się razem z nim. Obowiązuje
w obrębie jednego bounded contextu.

### Dlaczego agregaty powinny odwoływać się do siebie przez ID? {senior}

Referencje do obiektów między agregatami zacierają ich granice: wczytanie jednego ciągnęłoby za sobą inne, a kod mógłby modyfikować inny agregat przez referencję, omijając jego
korzeń i transakcję. Referencje przez ID (`CustomerId` zamiast `Customer`) utrzymują agregaty niezależne, małe i możliwe do wczytania osobno, czynią granicę transakcyjną
jawną i pozwalają agregatom żyć w różnych bazach czy serwisach.

### Kiedy taktyczne DDD to przesada? {mid}

Gdy aplikacja to głównie CRUD z niewielką ilością zachowania: formularze zapisujące dane z prostą walidacją. Bogate agregaty, value objecty, zdarzenia domenowe i repozytoria
dodają wtedy ceremonię, nie chroniąc znaczących niezmienników. DDD opłaca się w domenie głównej, gdzie reguły biznesowe są złożone, często się zmieniają i dają biznesowi
przewagę; części wspierające i generyczne mogą używać prostszych podejść. Idee strategiczne pozostają przydatne niezależnie od tego.
