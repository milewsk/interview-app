# Wstrzykiwanie zależności i kontenery IoC {mid}

**Wstrzykiwanie zależności (DI)** oznacza, że obiekt dostaje swoje zależności z zewnątrz, zamiast je tworzyć. To główna
technika stosowania odwrócenia zależności, czyni kod testowalnym i konfigurowalnym, a w .NET jest wbudowana w platformę
(`Microsoft.Extensions.DependencyInjection`, używane przez ASP.NET Core, workery i MAUI).

```csharp
public class OrderService(IOrderRepository repository, IPaymentGateway payments, TimeProvider clock)   // wstrzykiwanie przez konstruktor
{
    public async Task PlaceAsync(Order order) { ... }
}

builder.Services.AddScoped<IOrderRepository, SqlOrderRepository>();
builder.Services.AddSingleton<IPaymentGateway, StripeGateway>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<OrderService>();
```

## IoC, DI i kontener

- **Odwrócenie sterowania (IoC)**: framework steruje przepływem i wywołuje twój kod (nie piszesz `Main` dla każdego
  żądania, ASP.NET Core wywołuje twój endpoint).
- **Wstrzykiwanie zależności**: forma IoC dla zależności. Rodzaje: **przez konstruktor** (domyślne: zależności są jawne
  i wymagane), przez metodę (`[FromServices]`, parametr endpointu minimal API) i przez właściwość (nieobsługiwane przez
  wbudowany kontener).
- **Kontener** (composition root): jedno miejsce przy starcie aplikacji, gdzie interfejsy mapuje się na implementacje
  i buduje grafy obiektów. Bez kontenera DI też jest możliwe (pure DI:
  `new OrderService(new SqlOrderRepository(...), ...)`).

## Czasy życia

| Czas życia | Instancja | Typowe użycie |
|---|---|---|
| **Transient** | nowa instancja przy każdym pobraniu | lekkie, bezstanowe serwisy |
| **Scoped** | jedna na zakres (w ASP.NET Core: jedna na żądanie) | `DbContext`, jednostka pracy, kontekst żądania |
| **Singleton** | jedna na całą aplikację | cache, konfiguracja, handlery `HttpClient`, bezpieczne wątkowo bezstanowe serwisy |

Sprawdzone: dwa pobrania transient dały różne obiekty, scoped ten sam obiekt w obrębie zakresu i różne między zakresami,
a singleton wszędzie ten sam. Kontener **zwalnia** też serwisy `IDisposable`, które utworzył, na końcu ich zakresu
(transient został zwolniony razem ze swoim zakresem).

**Zależność przechwycona** (captive dependency): serwis o dłuższym życiu trzyma serwis o krótszym życiu, najczęściej
singleton ze scoped `DbContext`. Obiekt scoped żyje wtedy tak długo jak aplikacja, jest współdzielony między żądaniami i nie
jest bezpieczny wątkowo. Przy walidacji zakresów (domyślnie włączonej w środowisku Development w ASP.NET Core) kontener to
zgłasza: `Cannot consume scoped service 'ScopedDep' from singleton 'CaptiveSingleton'`. Pobranie serwisu scoped z głównego
providera kończy się błędem z tego samego powodu. Singleton, który potrzebuje serwisów scoped, sam tworzy zakres
(`IServiceScopeFactory`) albo używa fabryki.

## Szczegóły rejestracji

- **Ostatnia rejestracja wygrywa** przy pobieraniu pojedynczego serwisu, a dla `IEnumerable<T>` zwracane są **wszystkie**
  rejestracje: po zarejestrowaniu `Email`, a potem `Sms`, `INotifier` zwrócił `SmsNotifier`, a `IEnumerable<INotifier>`
  oba.
- `TryAdd*` rejestruje tylko wtedy, gdy serwis nie jest jeszcze zarejestrowany; biblioteki używają tego, żeby aplikacje mogły
  nadpisać ich domyślne ustawienia.
- **Keyed services** (.NET 8+): `AddKeyedSingleton<IStorage, DiskStorage>("disk")` oraz `[FromKeyedServices("disk")]` albo
  `GetRequiredKeyedService`.
- `ValidateOnBuild` sprawdza przy starcie, czy każdy zarejestrowany serwis da się utworzyć, więc brakująca rejestracja kończy
  się błędem od razu, a nie przy pierwszym żądaniu.
- Fabryki: `AddScoped<IFoo>(sp => new Foo(sp.GetRequiredService<IBar>(), "config"))` dla logiki tworzenia.

## Antywzorce

- **Service locator**: wstrzykiwanie `IServiceProvider` i wywoływanie `GetService<T>()` w kodzie biznesowym ukrywa
  zależności, zawodzi w czasie wykonania zamiast przy starcie i utrudnia testy. Do przyjęcia tylko w kodzie
  infrastrukturalnym (fabryki, middleware).
- **Przeładowany konstruktor**: klasa potrzebująca 8+ zależności zwykle ma za dużo odpowiedzialności.
- **Wstrzykiwanie wszystkiego przez interfejsy z jedną implementacją**, tylko „dla DI”: gdy nie ma powodu do abstrakcji,
  wstrzykuje się konkretne klasy (nadal można je zarejestrować i podmienić).
- **Statyczny dostęp** do serwisów (`ServiceLocator.Current`), ambient context i `new` dla zależności z efektami ubocznymi.

## Źródła

- [Dependency injection in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)
- [Service lifetimes and guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines)
- [Dependency injection in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [Inversion of Control containers and the DI pattern (Martin Fowler)](https://martinfowler.com/articles/injection.html)

## Pytania

### Czym jest wstrzykiwanie zależności i jakie daje korzyści? {junior}

To technika, w której obiekt dostaje swoje zależności (zwykle przez konstruktor), zamiast tworzyć je przez `new` albo znajdować w statycznym stanie. Zależności
stają się jawne w sygnaturze konstruktora, implementacje można podmieniać konfiguracją (np. atrapę bramki płatności w testach albo inny magazyn zależnie od
środowiska), a tworzenie obiektów i zarządzanie ich czasem życia przenosi się w jedno miejsce, composition root.

### Jakie czasy życia serwisów ma DI w .NET? {junior}

Transient (nowa instancja przy każdym pobraniu), scoped (jedna instancja na zakres, co w ASP.NET Core oznacza na żądanie HTTP) i singleton (jedna instancja przez
cały czas życia aplikacji). Wybór zależy od stanu i bezpieczeństwa wątkowego: bezstanowe lekkie serwisy mogą być transient lub singleton, stan per żądanie jak
`DbContext` jest scoped, a współdzielone cache to singletony, które muszą być bezpieczne wątkowo.

### Czym jest zależność przechwycona (captive dependency)? {mid}

To serwis o dłuższym czasie życia trzymający zależność o krótszym, typowo singleton, który dostaje w konstruktorze scoped `DbContext`. Obiekt scoped zostaje
przechwycony na cały czas życia aplikacji i współdzielony przez równoległe żądania, co prowadzi do błędów bezpieczeństwa wątkowego i nieaktualnych danych. .NET
wykrywa to przy włączonej walidacji zakresów (domyślnie w Development): „Cannot consume scoped service ... from singleton ...”. Rozwiązaniem jest tworzenie zakresu
przez `IServiceScopeFactory` albo zmiana czasów życia.

### Dlaczego service locator uchodzi za antywzorzec? {mid}

Wywoływanie `serviceProvider.GetService<T>()` w klasach biznesowych ukrywa ich prawdziwe zależności (konstruktor ich nie pokazuje), przenosi błędy brakującej
rejestracji ze startu do czasu wykonania i wiąże kod z kontenerem. Testy muszą konfigurować cały provider zamiast przekazać kilka atrap. Jest do przyjęcia w kodzie
infrastrukturalnym, który naprawdę tworzy obiekty dynamicznie, jak fabryki czy middleware.

### Co się stanie, gdy zarejestrujesz dwie implementacje tego samego interfejsu? {mid}

Pobranie interfejsu zwraca ostatnio zarejestrowaną implementację, a pobranie `IEnumerable<IInterfejs>` zwraca wszystkie w kolejności rejestracji. Wykorzystuje się to
we wzorcach złożonych, jak wiele walidatorów czy kanałów powiadomień. Metody `TryAdd*` rejestrują tylko wtedy, gdy nic jeszcze nie jest zarejestrowane, co pozwala
bibliotekom dostarczać wartości domyślne, które aplikacje mogą nadpisać, a keyed services (.NET 8+) wybierają implementację po kluczu.

### Co robi `ValidateOnBuild`? {mid}

Przy budowaniu providera sprawdza, czy każdy zarejestrowany serwis da się utworzyć: wszystkie zależności konstruktora są zarejestrowane, a czasy życia zgodne.
Brakująca rejestracja kończy się wtedy błędem przy starcie („Unable to resolve service for type ... while attempting to activate ...”), a nie przy pierwszym żądaniu,
które jej potrzebuje. ASP.NET Core włącza to razem z walidacją zakresów w środowisku Development.

### Kto zwalnia serwisy utworzone przez kontener DI? {mid}

Kontener zwalnia serwisy `IDisposable`/`IAsyncDisposable`, które sam utworzył: scoped i transient na końcu ich zakresu (np. żądania), a singletony przy zwolnieniu
głównego providera przy zamykaniu aplikacji. Serwisy utworzone samodzielnie i zarejestrowane jako instancje nie są przez kontener zwalniane. Przejściowe obiekty
disposable pobrane z głównego providera są zwalniane dopiero przy zamknięciu, co może powodować wyciek pamięci.

### Czym wstrzykiwanie przez konstruktor różni się od wstrzykiwania przez metodę? {junior}

Wstrzykiwanie przez konstruktor dostarcza zależności przy tworzeniu obiektu, więc są wymagane, jawne i dostępne dla wszystkich metod; to wybór domyślny.
Wstrzykiwanie przez metodę przekazuje zależność konkretnej metodzie, np. parametr endpointu minimal API albo `[FromServices]` na akcji, co przydaje się, gdy
potrzebuje jej tylko jedna metoda albo zależy od wywołania. Wstrzykiwanie przez właściwość (opcjonalne zależności ustawiane po utworzeniu) nie jest obsługiwane
przez wbudowany kontener .NET.

### Co mówi konstruktor z wieloma zależnościami? {mid}

Że klasa prawdopodobnie ma za dużo odpowiedzialności (łamie SRP): koordynuje zbyt wielu współpracowników. Zwykle pomaga podział na mniejsze klasy, wprowadzenie
serwisu-fasady grupującego powiązane zależności albo przeniesienie logiki do obiektów domenowych. DI raczej uwidacznia problem, niż go powoduje, co jest zaletą
jawnych zależności w konstruktorze.

### Jak użyć serwisu scoped z singletonu albo serwisu w tle? {senior}

Wstrzyknąć `IServiceScopeFactory` (albo `IServiceProvider`), tworzyć zakres dla każdej jednostki pracy (`using var scope = scopeFactory.CreateScope()`), pobrać serwis
scoped z `scope.ServiceProvider` i zwolnić zakres po zakończeniu. Dla samego `DbContext` alternatywą jest `IDbContextFactory<T>`. Wstrzyknięcie serwisu scoped
bezpośrednio do singletonu uczyniłoby go zależnością przechwyconą.
