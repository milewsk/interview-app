# Łańcuch zobowiązań (chain of responsibility) {mid}

**Łańcuch zobowiązań** przekazuje żądanie wzdłuż **łańcucha handlerów**. Każdy handler decyduje, czy obsłużyć żądanie,
przekazać je dalej, czy jedno i drugie, i może **zatrzymać** łańcuch. Nadawca nie wie, który handler się nim zajmie. W .NET
używa się go codziennie: **pipeline middleware ASP.NET Core** i **handlery komunikatów HttpClient** to łańcuchy zobowiązań.

## Klasyczny łańcuch

```csharp
public abstract class Handler
{
    private Handler? _next;
    public Handler SetNext(Handler next) { _next = next; return next; }
    public virtual string Handle(Payment p) => _next?.Handle(p) ?? "approved";      // koniec łańcucha
}

public class NotEmptyValidator : Handler
{
    public override string Handle(Payment p) => p.Account == "" ? "rejected: no account" : base.Handle(p);
}
public class AmountLimitValidator : Handler
{
    public override string Handle(Payment p) => p.Amount > 10_000 ? "rejected: over limit" : base.Handle(p);
}

var chain = new NotEmptyValidator();
chain.SetNext(new AmountLimitValidator()).SetNext(new FraudCheck());
```

W teście: puste konto zatrzymało się na pierwszym handlerze, 50 000 na sprawdzeniu limitu, 9 999 na sprawdzeniu nadużyć,
a 100 przeszło przez cały łańcuch i zostało zatwierdzone. Handlery są małe i niezależne, a łańcuch można przestawiać albo
rozszerzać bez zmiany pozostałych.

Dwa warianty:

- **Zatrzymanie na pierwszym handlerze, który potrafi obsłużyć żądanie** (oryginalna wersja GoF): np. poziomy wsparcia,
  propagacja zdarzeń w UI, wyszukiwanie handlera wyjątku.
- **Każdy handler robi swoją część i woła następny** (pipeline): middleware, pipeline'y walidacji, pipeline behaviors
  w MediatR.

## Middleware ASP.NET Core

```csharp
app.Use(async (ctx, next) => { log.Add("A in"); await next(ctx); log.Add("A out"); });
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path == "/blocked") { ctx.Response.StatusCode = 403; return; }    // przerwanie: next nie jest wołane
    log.Add("B in"); await next(ctx); log.Add("B out");
});
app.Run(ctx => { log.Add("endpoint"); return Task.CompletedTask; });
```

Sprawdzone: `/ok` → `A in > B in > endpoint > B out > A out` (każde middleware wykonuje kod przed resztą pipeline'u i po niej),
`/blocked` → `A in > B short-circuit > A out` ze statusem 403. **Kolejność ma znaczenie**: najpierw obsługa wyjątków, potem
przekierowanie HTTPS, pliki statyczne, routing, CORS, uwierzytelnianie, autoryzacja, endpointy; na przykład autoryzacja przed
uwierzytelnianiem przestaje działać.

## HttpClient: `DelegatingHandler`

Wychodzące żądania przechodzą przez łańcuch `DelegatingHandler`, zakończony właściwym `HttpClientHandler`; każdy może zmienić
żądanie, odpowiedź albo ponowić wywołanie. Sprawdzona kolejność: `outer in > inner in > terminal > inner out > outer out`.
Z `IHttpClientFactory` handlery dodaje się przez `AddHttpMessageHandler<T>()` (pierwszy zarejestrowany jest najbardziej
zewnętrzny); tak podpina się logowanie, tokeny uwierzytelniające i polityki odporności.

## Źródła

- [Chain of Responsibility (refactoring.guru)](https://refactoring.guru/design-patterns/chain-of-responsibility)
- [ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/)
- [Make HTTP requests using IHttpClientFactory: outgoing request middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/http-requests)

## Pytania

### Czym jest wzorzec łańcucha zobowiązań? {junior}

To wzorzec behawioralny, w którym żądanie jest przekazywane wzdłuż łańcucha obiektów-handlerów; każdy handler albo je przetwarza, albo przekazuje następnemu, albo robi jedno i drugie,
i może zatrzymać dalsze przetwarzanie. Nadawca zna tylko pierwszy handler, a nie ten, który ostatecznie obsłuży żądanie. Rozprzęga nadawców od odbiorców i pozwala składać kroki
przetwarzania.

### Jaki problem rozwiązuje łańcuch zobowiązań? {junior}

Zastępuje jedną dużą metodę pełną kolejnych sprawdzeń (walidacja, autoryzacja, cache, logowanie) osobnymi małymi handlerami, z których każdy ma jedną odpowiedzialność. Handlery można
wykorzystywać wielokrotnie, testować osobno, przestawiać i dodawać bez modyfikowania pozostałych, a łańcuch można konfigurować w czasie wykonania.

### Dlaczego pipeline middleware ASP.NET Core jest jego przykładem? {mid}

Każde middleware dostaje `HttpContext` i delegat `next`; może wykonać kod przed wywołaniem `next`, wywołać go, żeby przekazać żądanie dalej, wykonać kod po jego powrocie (w drodze
powrotnej) albo nie wywołać go wcale i przerwać przetwarzanie (np. zwracając 401, odpowiedź z cache albo plik statyczny). Pipeline zbudowany z wywołań `Use`, `Map` i `Run` to
dokładnie łańcuch zobowiązań, w którym odpowiedź wraca przez te same handlery w odwrotnej kolejności.

### Dlaczego kolejność middleware ma znaczenie? {mid}

Middleware wykonują się w kolejności rejestracji, a każde widzi tylko to, co zrobiły wcześniejsze. Obsługa wyjątków musi być pierwsza, żeby łapać błędy ze wszystkiego po niej;
uwierzytelnianie musi działać przed autoryzacją, która potrzebuje tożsamości użytkownika; CORS i routing muszą być przed endpointami, które ich potrzebują. Zła kolejność powoduje
subtelne błędy, np. autoryzację odrzucającą każde żądanie albo błędy omijające handler wyjątków.

### Czym jest przerwanie łańcucha (short-circuiting)? {junior}

To sytuacja, gdy handler zatrzymuje żądanie zamiast przekazać je dalej: w middleware nie woła `next` i sam zapisuje odpowiedź (403, 304 z cache, plik statyczny). Dalsze handlery
w łańcuchu i endpoint nigdy się nie wykonają. Tak walidacja albo autoryzacja wcześnie odrzuca żądania, a cache unika zbędnej pracy.

### Jak napisać middleware mierzące czas trwania żądania? {mid}

Uruchomić `Stopwatch`, wywołać `await next(context)`, zatrzymać pomiar i zalogować czas, a middleware zarejestrować wcześnie, żeby obejmowało resztę pipeline'u. Żeby zwrócić
czas w nagłówku odpowiedzi, nie ustawia się go po `next`: odpowiedź zwykle jest już wtedy rozpoczęta, a w teście rzuciło to „The response headers cannot be modified because
the response has already started”. Przed wywołaniem `next` rejestruje się `context.Response.OnStarting(...)`, które działa tuż przed wysłaniem nagłówków (ustawiony tam
nagłówek dotarł w odpowiedzi).

### Czym różni się wariant „wygrywa pierwszy handler” od wariantu pipeline? {mid}

W klasycznym wariancie GoF żądanie wędruje, aż jeden handler weźmie za nie odpowiedzialność i je obsłuży, a pozostałe go nie zobaczą (eskalacja wsparcia, propagacja zdarzeń UI).
W wariancie pipeline każdy handler robi swoją część i przekazuje żądanie dalej, a każdy nadal może je przerwać (middleware, handlery komunikatów, behaviors w MediatR). Oba mają tę
samą strukturę; różnią się tym, czy obsługa jest wyłączna.

### Jakie są ryzyka łańcucha zobowiązań? {mid}

Żądanie może dotrzeć do końca łańcucha bez obsłużenia, więc potrzebne jest zdefiniowane zachowanie domyślne (końcowy handler albo jasny wynik). Przepływ trudniej prześledzić, bo jest
rozłożony na wiele handlerów i zależy od ich kolejności, konfigurowanej gdzie indziej. Długie łańcuchy dodają narzut, a handler, który zapomni wywołać następny, po cichu gubi żądanie.

### Jak ma się do wzorca dekoratora? {senior}

Strukturalnie są podobne: każdy element opakowuje albo wskazuje następny i może działać przed nim i po nim. Dekorator dodaje zachowanie i zawsze deleguje do opakowanego obiektu,
a opakowania zwykle nakłada się wokół jednego obiektu; handler łańcucha może zdecydować, że nie przekaże żądania dalej, a łańcuch dotyczy tego, kto obsłuży żądanie. Middleware
i `DelegatingHandler` są pośrodku: to handlery pipeline'u, które zachowują się jak dekoratory następnego handlera, ale mogą przerwać przetwarzanie.

### Jak zaimplementować pipeline walidacji dla poleceń? {senior}

Zdefiniować interfejs kroku pipeline'u (np. `IPipelineBehavior<TRequest, TResponse>` w MediatR albo własne `Handle(request, next)`) i zarejestrować behaviors, takie jak walidacja,
logowanie, transakcje i cache, które działają wokół właściwego handlera polecenia w kolejności rejestracji. Behavior walidacji uruchamia wszystkie walidatory dla typu żądania (np.
FluentValidation) i przerywa przetwarzanie wynikiem z błędem albo wyjątkiem, jeśli którykolwiek zawiedzie, więc handlery mogą zakładać poprawne dane wejściowe.
