# Fabryki: prosta fabryka, metoda wytwórcza, fabryka abstrakcyjna {mid}

Fabryki przenoszą decyzję **którą konkretną klasę utworzyć** poza kod, który używa obiektu. Wywołujący pracuje na
abstrakcji i nie potrzebuje `new` dla konkretnych typów, co utrzymuje go rozprzężonym i otwartym na nowe warianty. Na
rozmowach często myli się trzy warianty, więc warto dokładnie znać różnice.

## Prosta fabryka (nie wzorzec GoF)

Jedna metoda lub klasa, która decyduje, jaki obiekt utworzyć, zwykle na podstawie parametru:

```csharp
public static class NotifierFactory
{
    public static INotifier Create(string kind) => kind switch
    {
        "email" => new EmailNotifier(),
        "sms" => new SmsNotifier(),
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
```

Prosta i często wystarczająca. Dodanie typu wymaga edycji `switch`, co łamie zasadę otwarte-zamknięte, ale trzyma logikę
tworzenia w jednym miejscu.

## Metoda wytwórcza (factory method, GoF)

Klasa bazowa definiuje operację, która potrzebuje obiektu, ale **który obiekt** zostawia metodzie nadpisywanej przez podklasy:

```csharp
public abstract class ReportGenerator
{
    protected abstract IExporter CreateExporter();          // metoda wytwórcza
    public string Generate(string period) => CreateExporter().Export($"report {period}");
}

public class PdfReportGenerator : ReportGenerator
{
    protected override IExporter CreateExporter() => new PdfExporter();   // → "report Q3.pdf"
}
```

Opiera się na **dziedziczeniu**: klasa bazowa zawiera algorytm, podklasy decydują o produkcie. Jest bliska wzorcowi metody
szablonowej.

## Fabryka abstrakcyjna (abstract factory, GoF)

Interfejs do tworzenia **rodzin powiązanych obiektów**, które muszą być używane razem, bez wskazywania konkretnych klas:

```csharp
public interface IUiFactory { IButton CreateButton(); ICheckbox CreateCheckbox(); }
public class DarkTheme : IUiFactory { public IButton CreateButton() => new DarkButton(); public ICheckbox CreateCheckbox() => new DarkCheckbox(); }
public class LightTheme : IUiFactory { ... }
```

Klient dostaje jedną `IUiFactory` i otrzymuje spójne produkty (ciemny przycisk z ciemnym checkboxem, nigdy wymieszane). Inne
przykłady: dostawcy baz danych (połączenie, komenda i parametr tego samego dostawcy: `DbProviderFactory` w ADO.NET), dostawcy
chmurowi, implementacje testowe a produkcyjne.

## Fabryki a wstrzykiwanie zależności

We współczesnym .NET główną „fabryką” jest kontener DI, ale jawne fabryki są nadal potrzebne, gdy:

- konkretny typ zależy od **danych w czasie wykonania** (wybór użytkownika, tenant, typ komunikatu): wstrzykuje się interfejs
  fabryki oparty na keyed services (`GetRequiredKeyedService<INotifier>(kind)`) albo słowniku strategii;
- obiekt potrzebuje zarówno wstrzykniętych serwisów, jak i parametrów z czasu wykonania:
  `ActivatorUtilities.CreateInstance<T>(sp, runtimeArg)` albo metoda fabrykująca `Func<string, IReportExporter>`;
- obiekt trzeba utworzyć później albo wiele razy: `IDbContextFactory<T>`, `IHttpClientFactory`.

## Statyczne metody wytwórcze

Metoda statyczna tworząca instancję z opisową nazwą: `TimeSpan.FromSeconds(90)`, `Guid.CreateVersion7()`,
`DateOnly.FromDateTime(...)`, `Order.Create(customerId)`. Zalety wobec konstruktorów: znaczące nazwy, możliwość zwrócenia
instancji z cache lub pochodnej, walidacja przed utworzeniem i kilka ścieżek tworzenia z tymi samymi typami parametrów.

## Źródła

- [Factory method (refactoring.guru)](https://refactoring.guru/design-patterns/factory-method)
- [Abstract factory (refactoring.guru)](https://refactoring.guru/design-patterns/abstract-factory)
- [IHttpClientFactory in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory)
- [Dependency injection: keyed services (.NET)](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)

## Pytania

### Jaki problem rozwiązują fabryki? {junior}

Oddzielają tworzenie obiektów od ich używania: kod wywołujący zależy od abstrakcji i prosi fabrykę o instancję, zamiast samemu wybierać i konstruować konkretną klasę. Usuwa to
z wywołującego wiedzę o konkretnych typach i szczegółach konstrukcji, centralizuje logikę tworzenia i pozwala dodawać nowe warianty albo podmieniać implementacje (np. w testach)
bez zmiany wywołujących.

### Czym prosta fabryka różni się od wzorca metody wytwórczej? {mid}

Prosta fabryka to pojedyncza metoda lub klasa wybierająca konkretny typ, zwykle przez `switch` po parametrze; nie jest wzorcem GoF, a dodanie typu wymaga jej edycji. Metoda
wytwórcza to wzorzec GoF oparty na dziedziczeniu: klasa bazowa definiuje algorytm wywołujący abstrakcyjną metodę tworzącą, a podklasy ją nadpisują, decydując o produkcie. Dodanie
wariantu oznacza dodanie podklasy.

### Czym metoda wytwórcza różni się od fabryki abstrakcyjnej? {mid}

Metoda wytwórcza tworzy jeden produkt i opiera się na dziedziczeniu: podklasy nadpisują jedną metodę tworzącą. Fabryka abstrakcyjna to obiekt z kilkoma metodami tworzącymi
dla rodziny powiązanych produktów (przycisk + checkbox tego samego motywu, połączenie + komenda tej samej bazy), oparty na kompozycji: klient dostaje obiekt fabryki i go używa,
co gwarantuje, że produkty są ze sobą zgodne.

### Kiedy nadal potrzebujesz fabryki, jeśli używasz kontenera DI? {mid}

Gdy konkretna implementacja zależy od danych w czasie wykonania (metody płatności wybranej przez użytkownika, typu komunikatu, tenanta), gdy obiekt potrzebuje parametrów z czasu
wykonania oprócz wstrzykniętych serwisów, albo gdy obiekty trzeba tworzyć na żądanie i być może wiele razy (`DbContext` na zadanie, instancje `HttpClient`). Wtedy wstrzykuje się
interfejs fabryki zaimplementowany przez keyed services, `ActivatorUtilities` albo fabryki frameworka, jak `IDbContextFactory<T>` i `IHttpClientFactory`.

### Jakie zalety mają statyczne metody wytwórcze wobec konstruktorów? {junior}

Mają opisowe nazwy (`TimeSpan.FromMinutes`, `Order.Create`), więc różne ścieżki tworzenia z tymi samymi typami parametrów są czytelne; mogą walidować dane i zwracać wynik albo
błąd, zwracać instancje z cache lub współdzielone albo podtyp; mogą ukrywać konstruktory, żeby wymusić niezmienniki. Wadą jest to, że nie da się ich nadpisać i nie są widoczne
dla kontenerów DI.

### Czym jest `IHttpClientFactory` i dlaczego to fabryka? {mid}

Tworzy instancje `HttpClient` skonfigurowane według nazwy lub typu, jednocześnie pulując i ponownie używając bazowych `HttpMessageHandler`. Tworzenie `new HttpClient()` na każde
żądanie może wyczerpać gniazda, a jeden statyczny klient nie respektuje zmian DNS; fabryka zarządza czasem życia handlerów, rozwiązując oba problemy. Kod prosi fabrykę (albo
dostaje typowanego klienta) o klienta zamiast go konstruować, co jest wzorcem fabryki zastosowanym do infrastruktury.

### Podaj przykład fabryki abstrakcyjnej w .NET. {senior}

`DbProviderFactory` w ADO.NET: każdy dostawca bazy danych dostarcza fabrykę (`SqlClientFactory.Instance`, `NpgsqlFactory.Instance`) z metodami takimi jak `CreateConnection`,
`CreateCommand` i `CreateParameter`, więc kod napisany względem `DbProviderFactory` tworzy spójną rodzinę obiektów jednego dostawcy bez odwoływania się do konkretnych typów.
Podmiana fabryki zmienia całą rodzinę.

### Jak wybrać implementację po kluczu w czasie wykonania z DI? {mid}

Zarejestrować implementacje jako keyed services (`AddKeyedTransient<INotifier, SmsNotifier>("sms")`) i wstrzyknąć małą fabrykę, która wywołuje
`serviceProvider.GetRequiredKeyedService<INotifier>(key)`, albo wstrzyknąć `IEnumerable<INotifier>` i wybierać po właściwości, np. `Kind`. Wybór zostaje w jednym miejscu, nowe
implementacje dodaje się samą rejestracją, a wywołujący zależą od abstrakcji fabryki, a nie od kontenera.

### Kiedy fabryka to przesada? {junior}

Gdy istnieje tylko jedna implementacja i brak realnej perspektywy kolejnej, gdy konstrukcja jest trywialna (`new Order()` z kilkoma właściwościami) albo gdy kontener DI już
rozwiązuje właściwy typ. Dodawanie fabryk „na wszelki wypadek” dodaje pośredniość bez korzyści, przed czym ostrzega YAGNI. Fabrykę wprowadza się, gdy logika tworzenia jest
złożona, powtarzana albo zależy od warunków w czasie wykonania.

### Jak metoda wytwórcza ma się do metody szablonowej? {senior}

Metoda wytwórcza często jest krokiem metody szablonowej: klasa bazowa definiuje algorytm (szablon), który wywołuje abstrakcyjną metodę, żeby utworzyć potrzebny obiekt, a podklasy
dostarczają ten obiekt. Oba wzorce używają dziedziczenia, żeby pozwolić podklasom dostosować część algorytmu; metoda wytwórcza to szczególny przypadek, w którym dostosowywanym
krokiem jest tworzenie obiektu.
