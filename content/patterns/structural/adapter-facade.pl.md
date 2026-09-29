# Adapter i fasada {junior}

Oba wzorce stawiają nowy interfejs przed istniejącym kodem, ale z różnych powodów. **Adapter** sprawia, że istniejąca klasa
**pasuje do interfejsu**, którego oczekuje klient. **Fasada** daje **prosty interfejs do złożonego podsystemu**. Należą do
najczęściej używanych wzorców w kodzie integracyjnym.

## Adapter

Klient oczekuje `IPaymentGateway`; stary system płatności mówi XML-em z innymi nazwami i jednostkami. Adapter implementuje
oczekiwany interfejs i tłumaczy wywołania:

```csharp
public interface IPaymentGateway { Task<PaymentResult> ChargeAsync(PaymentRequest request); }

public class LegacyPaymentAdapter(LegacyPaySystem legacy) : IPaymentGateway      // dopasowuje LegacyPaySystem do IPaymentGateway
{
    public Task<PaymentResult> ChargeAsync(PaymentRequest r)
    {
        var xml = new XElement("payment",
            new XElement("ref", r.OrderId),
            new XElement("amountCents", (int)(r.Amount * 100)),         // konwersja jednostek
            new XElement("ccy", r.Currency)).ToString();
        var response = XDocument.Parse(legacy.Pay(xml)).Root!;
        return Task.FromResult(new PaymentResult(response.Element("status")!.Value == "OK", response.Element("txn")?.Value));
    }
}
```

W teście `ChargeAsync` na adapterze zwróciło `Success = true, TransactionId = T-ORD-1` ze starego API XML. Kod klienta zna tylko
`IPaymentGateway`, więc stary system można później zastąpić nowym adapterem.

- **Adapter obiektowy** (kompozycja: adapter trzyma adaptowany obiekt) to zwykła forma w C#. **Adapter klasowy** (dziedziczenie
  po adaptowanym) ogranicza pojedyncze dziedziczenie.
- Adaptery to cegiełki architektury **portów i adapterów** oraz **warstwy antykorupcyjnej** w DDD.
- W .NET: `StreamReader`/`StringReader` dopasowują strumień albo string do `TextReader`, dostawcy `ILogger` dopasowują
  biblioteki logowania (Serilog, NLog), dostawcy baz w EF Core dopasowują każdą bazę do abstrakcji EF, a
  `Task.Factory.FromAsync` dopasowywało stary wzorzec APM do zadań.

## Fasada

Podsystem ma wiele klas, których trzeba używać razem we właściwej kolejności; fasada udostępnia jedną prostą operację:

```csharp
public class CheckoutFacade(Inventory inventory, Billing billing, Shipping shipping)
{
    public string PlaceOrder(string sku, int qty, string city) =>
        !inventory.Reserve(sku, qty) ? "out of stock"
            : $"{billing.Invoice(sku, qty)}, {shipping.Schedule(city)}";      // → "INV-PEN-2, SHIP-Krakow"
}
```

- **Upraszcza** użycie i zmniejsza sprzężenie: klienci zależą od fasady, a nie od każdej klasy podsystemu. Podsystem pozostaje
  dostępny do zaawansowanych zastosowań.
- W .NET: `File.ReadAllText` (fasada nad `FileStream`, `StreamReader` i wykrywaniem kodowania), `HttpClient.GetFromJsonAsync`
  (żądanie, obsługa odpowiedzi i deserializacja w jednym wywołaniu), `WebApplication.CreateBuilder` ukrywające konfigurację
  hosta.
- Ryzyko: fasada, która ciągle rośnie, staje się **boskim obiektem** (god object), który wie wszystko. Utrzymuje się ją skupioną
  na jednym przypadku użycia lub obszarze, a logikę trzyma w podsystemie, nie w fasadzie.

## Adapter a fasada a dekorator a proxy

| Wzorzec | Interfejs | Cel |
|---|---|---|
| Adapter | **inny** niż opakowanego obiektu | uczynić niekompatybilny obiekt użytecznym dla klienta |
| Fasada | **nowy, prostszy** interfejs nad **wieloma** obiektami | uprościć podsystem |
| Dekorator | **ten sam** co opakowanego obiektu | dodać zachowanie |
| Proxy | **ten sam** co opakowanego obiektu | kontrolować dostęp (leniwe ładowanie, cache, bezpieczeństwo, zdalność) |

## Źródła

- [Adapter (refactoring.guru)](https://refactoring.guru/design-patterns/adapter)
- [Facade (refactoring.guru)](https://refactoring.guru/design-patterns/facade)
- [Anti-corruption layer pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)

## Pytania

### Czym jest wzorzec adaptera? {junior}

To wzorzec strukturalny, który pozwala użyć obiektu z niekompatybilnym interfejsem tam, gdzie oczekiwany jest inny interfejs, przez opakowanie go w adapter, który implementuje
oczekiwany interfejs i tłumaczy wywołania, formaty danych i jednostki. Typowe zastosowania: integracja starego systemu albo zewnętrznego SDK za własnym interfejsem albo
obsługa kilku dostawców za jedną abstrakcją.

### Czym jest wzorzec fasady? {junior}

To wzorzec strukturalny, który daje prosty, wysokopoziomowy interfejs do złożonego podsystemu złożonego z wielu klas. Fasada koordynuje obiekty podsystemu przy typowych zadaniach,
więc klienci wywołują jedną metodę zamiast orkiestrować wiele obiektów we właściwej kolejności. Zmniejsza sprzężenie między klientami a podsystemem, który pozostaje dostępny do
zaawansowanych zastosowań.

### Czym adapter różni się od fasady? {mid}

Adapter przekształca jeden istniejący interfejs w inny, którego klient już oczekuje; zwykle opakowuje pojedynczy obiekt i niczego nie upraszcza, tylko czyni go zgodnym. Fasada
definiuje nowy, prostszy interfejs nad całym podsystemem obiektów, żeby typowe operacje były łatwe. Adapter pisze się z powodu niezgodności interfejsów, a fasadę z powodu złożoności.

### Czym adapter różni się od dekoratora? {mid}

Adapter zmienia interfejs: opakowany obiekt ma inny interfejs niż ten, którego potrzebuje klient. Dekorator zachowuje ten sam interfejs co opakowany obiekt i dodaje zachowanie
(logowanie, cache, ponowienia), więc dekoratory można nakładać, a klient nie wie o ich istnieniu. Oba opakowują obiekt, ale w różnych celach.

### Podaj przykłady adapterów w .NET. {mid}

`StreamReader` i `StringReader` dopasowują `Stream` albo `string` do API `TextReader`; dostawcy logowania dla Serilog czy NLog dopasowują te biblioteki do `ILogger`; dostawcy EF Core
dopasowują SQL Server, PostgreSQL czy SQLite do wewnętrznych abstrakcji EF; `Task.Factory.FromAsync` dopasowywało stary asynchroniczny wzorzec Begin/End do `Task`; `ArraySegment<T>`
i spany udostępniają fragmenty tablic przez interfejsy kolekcji.

### Jak adaptery mają się do architektury heksagonalnej? {senior}

W architekturze portów i adapterów aplikacja definiuje porty (interfejsy) we własnych pojęciach, a adaptery tłumaczą między tymi portami a konkretnymi technologiami: repozytorium
EF Core dopasowuje bazę, klient SMTP e-mail, kontroler HTTP przypadki użycia. Wzorzec adaptera to właśnie mechanizm, który utrzymuje rdzeń niezależnym od infrastruktury, a warstwa
antykorupcyjna w DDD to zestaw adapterów chroniących model przed modelem zewnętrznym.

### Na czym polega niebezpieczeństwo fasady? {mid}

Na tym, że rozrośnie się w boski obiekt: każda nowa funkcja dodaje metodę, zaczyna zawierać logikę biznesową, aż w końcu wszystko zależy od niej, a ona od wszystkiego. Fasada
powinna pozostać cienka (koordynować, a nie decydować) i skupiona na jednym obszarze; jeśli urośnie, dzieli się ją na kilka fasad albo przenosi logikę do klas podsystemu.

### Jak testować kod korzystający z zewnętrznego SDK? {mid}

Opakować SDK za własnym interfejsem adapterem (`IPaymentGateway` implementowany przez `StripePaymentGateway`), żeby kod biznesowy zależał tylko od własnego interfejsu, a testy
jednostkowe używały sztucznej implementacji. Sam adapter pokrywa się kilkoma testami integracyjnymi z prawdziwym SDK albo jego sandboxem. Izoluje to też resztę kodu od zmian wersji
SDK i umożliwia zmianę dostawcy.

### Czym adapter obiektowy różni się od klasowego? {senior}

Adapter obiektowy używa kompozycji: trzyma referencję do adaptowanego obiektu i deleguje do niego, więc może dopasować dowolną podklasę adaptowanego i jest zwykłą formą w C#.
Adapter klasowy używa dziedziczenia: dziedziczy po adaptowanym i implementuje interfejs docelowy, co w oryginalnej formie wymaga wielokrotnego dziedziczenia klas; w C# jest możliwy
tylko wtedy, gdy cel jest interfejsem, i wiąże adapter z jedną konkretną klasą adaptowaną.

### Podaj przykład fasady w .NET. {junior}

`File.ReadAllText(path)` ukrywa otwarcie `FileStream`, utworzenie `StreamReader`, wykrycie kodowania i czytanie do końca. `HttpClient.GetFromJsonAsync<T>` łączy wysłanie żądania,
sprawdzenie statusu i deserializację JSON-a. `WebApplication.CreateBuilder(args)` konfiguruje źródła ustawień, logowanie, DI i host webowy w jednym wywołaniu. Każda z nich upraszcza
typowe użycie, a szczegółowe API pozostają dostępne.
