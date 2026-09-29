# Dekorator i proxy {mid}

Oba wzorce opakowują obiekt innym obiektem o **tym samym interfejsie**. **Dekorator** dodaje zachowanie (logowanie, cache,
ponowienia, kompresję) i można go nakładać warstwami; **proxy** kontroluje dostęp do prawdziwego obiektu (leniwe tworzenie,
autoryzacja, wywołania zdalne). W .NET są wszędzie: strumienie, handlery `HttpClient`, middleware ASP.NET Core, proxy leniwego
ładowania w EF Core.

## Dekorator

```csharp
public interface IProductRepository { Product Get(int id); }

public class CachingRepository(IProductRepository inner, IMemoryCache cache) : IProductRepository
{
    public Product Get(int id) => cache.GetOrCreate($"product:{id}", _ => inner.Get(id))!;
}

public class LoggingRepository(IProductRepository inner, ILogger<LoggingRepository> log) : IProductRepository
{
    public Product Get(int id) { log.LogInformation("Get {Id}", id); return inner.Get(id); }
}

IProductRepository repo = new LoggingRepository(new CachingRepository(new SqlProductRepository(...), cache), logger);
```

W teście dwukrotne wywołanie `Get(1)` dało `log Get(1) | SQL SELECT 1 | log Get(1)`: oba wywołania zostały zalogowane, ale do
SQL dotarło tylko pierwsze. **Kolejność** dekoratorów ma znaczenie: logowanie na zewnątrz cache loguje każde wywołanie,
a wewnątrz logowałoby tylko chybienia cache.

- Dodaje zachowanie **bez modyfikacji** oryginalnej klasy i **bez dziedziczenia** (zasada otwarte-zamknięte, kompozycja zamiast
  dziedziczenia); każdy dekorator ma jedną odpowiedzialność.
- Dobrze pasuje do spraw przekrojowych: cache, logowanie, metryki, ponowienia, walidacja, autoryzacja, transakcje.
- DI: wbudowany kontener nie ma metody `Decorate`; rejestruje się ręcznie fabryką albo używa biblioteki **Scrutor**
  (`services.Decorate<IProductRepository, CachingRepository>()`).
- W .NET: **strumienie** (`GZipStream`, `CryptoStream`, `BufferedStream` opakowują inny `Stream`; w teście 10 000 znaków
  skompresowało się do 52 bajtów), **`DelegatingHandler`** w `HttpClient` (w teście łańcuch wykonał
  `timing → auth header → stub saw auth=Bearer t0k3n`), middleware ASP.NET Core i pipeline behaviors w MediatR (dekoratory wokół
  handlerów żądań).

## Proxy

Zastępca o tym samym interfejsie co prawdziwy obiekt, który kontroluje, jak i kiedy się do niego sięga:

| Rodzaj | Cel | Przykład |
|---|---|---|
| **Wirtualne** | tworzyć kosztowny obiekt dopiero, gdy jest potrzebny | `Lazy<T>`; proxy leniwego ładowania EF Core wczytujące nawigację przy pierwszym dostępie |
| **Ochronne** | sprawdzić uprawnienia przed delegacją | proxy rzucające wyjątek dla ról innych niż admin (sprawdzone: „role 'guest' can't delete”) |
| **Zdalne** | reprezentować obiekt w innym procesie | stuby klientów gRPC i WCF, klienci HTTP API (Refit) |
| **Cache / smart** | cache'ować wyniki, liczyć referencje, logować | opakowanie z cache wokół zdalnego serwisu |

```csharp
public class AuthorizingDocumentProxy(IDocumentService inner, ICurrentUser user) : IDocumentService
{
    public void Delete(int id)
    {
        if (!user.IsInRole("admin")) throw new UnauthorizedAccessException();
        inner.Delete(id);
    }
}
```

**Dynamiczne proxy** są generowane w czasie wykonania zamiast pisane ręcznie: `DispatchProxy` w .NET (sprawdzone: przechwycił
`Delete(7)` przed i po wywołaniu), Castle DynamicProxy (używany przez Moq i NSubstitute do atrap oraz przez biblioteki
interceptorów). Wymagają generowania kodu w czasie wykonania albo refleksji, więc nie działają z Native AOT.

## Dekorator a proxy

Struktura jest identyczna; różnica to intencja. Dekorator **dodaje lub wzbogaca zachowanie** i zwykle składa go klient (można
nałożyć kilka). Proxy **kontroluje dostęp** do obiektu i często zarządza jego cyklem życia (tworzy go leniwie, łączy się
zdalnie), zwykle w sposób przezroczysty dla klienta. W praktyce opakowanie z cache opisuje się obiema nazwami.

## Źródła

- [Decorator (refactoring.guru)](https://refactoring.guru/design-patterns/decorator)
- [Proxy (refactoring.guru)](https://refactoring.guru/design-patterns/proxy)
- [HttpClient message handlers (DelegatingHandler)](https://learn.microsoft.com/en-us/aspnet/web-api/overview/advanced/httpclient-message-handlers)
- [DispatchProxy class](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.dispatchproxy)
- [Scrutor (assembly scanning and decoration for MS DI)](https://github.com/khellang/Scrutor)

## Pytania

### Czym jest wzorzec dekoratora? {junior}

To wzorzec strukturalny, który dodaje zachowanie obiektowi przez opakowanie go innym obiektem implementującym ten sam interfejs: dekorator wykonuje swoją dodatkową pracę
(logowanie, cache, kompresję), a resztę deleguje do opakowanego obiektu. Dekoratory można nakładać, klient nie wie o ich istnieniu, a oryginalna klasa nie jest modyfikowana.
To rozszerzanie zachowania oparte na kompozycji.

### Czym dekorator różni się od dziedziczenia przy dodawaniu zachowania? {mid}

Przy dziedziczeniu każda kombinacja funkcji wymaga własnej podklasy (`CachingLoggingRepository`, `LoggingRepository`, ...), zachowanie jest ustalone podczas kompilacji i związane
z jedną klasą bazową. Dekoratory łączy się w czasie wykonania w dowolnej kolejności i liczbie, każdy robi jedną rzecz i działają z każdą implementacją interfejsu. Dlatego dekoratory
lepiej się skalują przy sprawach przekrojowych.

### Dlaczego kolejność dekoratorów ma znaczenie? {mid}

Każdy dekorator opakowuje następny, więc wywołania przechodzą przez nie od zewnątrz do środka. Dekorator logujący na zewnątrz cache loguje każde wywołanie, a wewnątrz tylko
chybienia cache; dekorator ponowień na zewnątrz timeoutu ponawia po każdym timeoucie, a wewnątrz timeout obejmuje wszystkie ponowienia razem. Kolejność składania musi
odzwierciedlać zamierzone zachowanie.

### Jak zarejestrować dekoratory w kontenerze DI .NET? {senior}

Wbudowany kontener nie ma API do dekorowania. Można zarejestrować wewnętrzną implementację jako typ konkretny, a interfejs fabryką budującą łańcuch
(`services.AddScoped<IProductRepository>(sp => new CachingRepository(sp.GetRequiredService<SqlProductRepository>(), ...))`), albo użyć biblioteki Scrutor:
`services.Decorate<IProductRepository, CachingRepository>()`, która przepisuje rejestrację tak, że dotychczasowa staje się wewnętrzną zależnością.

### Podaj przykłady dekoratorów w .NET. {mid}

Strumienie: `GZipStream`, `CryptoStream` i `BufferedStream` opakowują inny `Stream` i dodają kompresję, szyfrowanie albo buforowanie. `DelegatingHandler` opakowuje wewnętrzny
handler `HttpClient`, dodając logowanie, nagłówki uwierzytelniania, ponowienia albo odporność (jednym z nich jest `AddStandardResilienceHandler`). Middleware ASP.NET Core
i pipeline behaviors w MediatR opakowują w ten sam sposób następny krok potoku.

### Czym jest wzorzec proxy? {junior}

To wzorzec strukturalny, w którym obiekt zastępczy o tym samym interfejsie co prawdziwy obiekt kontroluje dostęp do niego: może tworzyć prawdziwy obiekt leniwie (proxy
wirtualne), sprawdzać uprawnienia (proxy ochronne), przekazywać wywołania do innego procesu lub maszyny (proxy zdalne) albo cache'ować i logować (smart proxy). Klient używa
proxy tak, jakby był prawdziwym obiektem.

### Czym dekorator różni się od proxy? {mid}

Strukturalnie są takie same: opakowanie implementujące interfejs obiektu i delegujące do niego. Różni się intencja: dekorator dodaje lub wzbogaca zachowanie i zwykle jest
składany jawnie, często kilka w łańcuchu; proxy kontroluje dostęp do obiektu (kiedy powstaje, kto może go wywołać, gdzie działa) i zwykle jest przezroczysty dla klienta. Wiele
prawdziwych opakowań, jak te z cache, pasuje do obu opisów.

### Czym są dynamiczne proxy i gdzie się ich używa? {senior}

To klasy proxy generowane w czasie wykonania dla interfejsu albo wirtualnych składowych, kierujące każde wywołanie do interceptora: `DispatchProxy` w .NET albo Castle
DynamicProxy. Biblioteki do atrap (Moq, NSubstitute) używają ich do tworzenia dublerów testowych, biblioteki przechwytywania w stylu AOP do logowania czy transakcji, a EF Core
może używać generowanych proxy do leniwego ładowania i śledzenia zmian. Opierają się na generowaniu kodu w czasie wykonania, więc są niezgodne z Native AOT i trimmingiem, gdzie
zamiast nich używa się generatorów kodu.

### Jak leniwe ładowanie w EF Core ma się do wzorca proxy? {senior}

Z `UseLazyLoadingProxies()` EF Core generuje w czasie wykonania podklasy typów encji, które nadpisują wirtualne właściwości nawigacyjne. Gdy kod po raz pierwszy odczyta taką
właściwość, proxy wczytuje powiązane dane z bazy. To proxy wirtualne: prawdziwe dane są pobierane dopiero przy pierwszym dostępie. Dlatego właściwości nawigacyjne muszą być
`virtual` i dlatego leniwe ładowanie może po cichu powodować zapytania N+1.

### Czym jest `DelegatingHandler`? {mid}

To klasa bazowa handlerów komunikatów HTTP, które siedzą w potoku `HttpClient`: każdy handler dostaje żądanie, może je zmodyfikować (np. dodać nagłówek autoryzacji), przekazuje je
do swojego `InnerHandler` i może obejrzeć lub zmienić odpowiedź w drodze powrotnej. Łączenie handlerów w łańcuch to wzorzec dekoratora zastosowany do HTTP; rejestruje się je
w `IHttpClientFactory` przez `AddHttpMessageHandler`, a handlery odporności są zbudowane w ten sam sposób.
