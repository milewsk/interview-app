# Obsługa wyjątków w C# {mid}

Wyjątki w .NET sygnalizują sytuacje, których bieżący kod **nie potrafi obsłużyć** w tym miejscu: brak pliku, błąd
sieci, złamany kontrakt. Wszystkie dziedziczą po `System.Exception` i niosą komunikat, **ślad stosu** (stack trace)
i opcjonalnie **wyjątek wewnętrzny** (`InnerException`).

```csharp
try
{
    var config = await File.ReadAllTextAsync(path);
    return JsonSerializer.Deserialize<Config>(config)!;
}
catch (FileNotFoundException)
{
    return Config.Default;                       // oczekiwany przypadek, który umiemy obsłużyć
}
catch (JsonException ex)
{
    throw new ConfigException($"Invalid config in {path}", ex);   // opakowanie z zachowaniem przyczyny
}
finally
{
    // wykona się zawsze: po try, po catch, także przy return
}
```

## Zasady `try`/`catch`/`finally`

- Bloki `catch` są sprawdzane **po kolei**, więc szczegółowe typy umieszcza się przed ogólnymi. Ogólny
  `catch (Exception)` przed szczegółowym to błąd kompilacji (CS0160).
- `finally` wykonuje się **zawsze**: po normalnym zakończeniu, po wyjątku i po `return` (wartość zwracana jest
  zapamiętana przed `finally`, więc zmiana zmiennej w `finally` nie zmienia wyniku). Nie wykona się tylko wtedy, gdy
  proces zostanie zabity lub się wysypie (np. `Environment.FailFast`, `StackOverflowException`).
- Wyjątek rzucony w `finally` **zastępuje** oryginalny, który przepada.
- `using` / `await using` to `try/finally` z `Dispose()`, więc zasoby są zwalniane także przy wyjątku.

## `throw` a `throw ex`

```csharp
catch (Exception ex)
{
    logger.LogError(ex, "Failed");
    throw;        // ✅ ponownie rzuca i zachowuje oryginalny ślad stosu
    // throw ex;  // 🔴 resetuje ślad stosu do tej linii (analizator CA2200)
}
```

Gdy wyjątek trzeba rzucić ponownie później (np. na innym wątku), `ExceptionDispatchInfo.Capture(ex).Throw()` zachowuje
oryginalny ślad stosu. Opakowanie (`throw new MyException("kontekst", ex)`) jest w porządku, o ile oryginał trafia
do `innerException`.

## Filtry wyjątków: `when`

```csharp
catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode.ServiceUnavailable)
{
    // tylko 503; inne kody idą dalej
}
```

Filtr jest obliczany **przed** zwinięciem stosu. Jeśli zwróci `false`, wyjątek szuka obsługi wyżej, a stos zostaje
nienaruszony (przydatne przy diagnostyce i zrzutach pamięci). To czystsze niż złapanie, sprawdzenie i ponowne rzucenie.

## Wyjątki a `async`

- `await` rzuca ponownie **oryginalny** wyjątek z zadania (nie `AggregateException`).
- `.Wait()` i `.Result` opakowują go w `AggregateException`, co jest kolejnym powodem, by nie blokować na zadaniach.
- `await Task.WhenAll(...)` rzuca **pierwszy** wyjątek. Wszystkie są w `task.Exception.InnerExceptions`.
- Wyjątku w metodzie `async void` wywołujący nie złapie i zwykle kończy on proces.

## Własne wyjątki

```csharp
public sealed class OrderNotFoundException(int orderId)
    : Exception($"Order {orderId} was not found.")
{
    public int OrderId { get; } = orderId;
}
```

Tworzy się je, gdy wywołujący musi zareagować na konkretny przypadek (`catch (OrderNotFoundException)`) albo potrzebuje
dodatkowych danych. Nazwa kończy się na `Exception`, a klasa dziedziczy po `Exception` (nie `ApplicationException`).
Często wystarczą typy wbudowane: `ArgumentException`, `ArgumentNullException`, `ArgumentOutOfRangeException`,
`InvalidOperationException`, `NotSupportedException`, `KeyNotFoundException`, `TimeoutException`,
`OperationCanceledException`.

## Dobre praktyki

- **Nie używaj wyjątków do sterowania przepływem**: rzucanie jest kosztowne (zbieranie śladu stosu). W prostym
  teście 100 000 rzuconych wyjątków zajęło około 250 ms, a 100 000 nieudanych `int.TryParse` około 9 ms. Do
  oczekiwanych przypadków służy wzorzec `TryXxx`, wartości zwracane albo typ `Result`.
- **Nie połykaj wyjątków**: pusty `catch {}` ukrywa błędy. Łap tylko to, co umiesz obsłużyć, a resztę przepuść wyżej.
- **Łap na granicach**: jeden globalny handler (np. middleware `UseExceptionHandler` w ASP.NET Core z `ProblemDetails`)
  loguje i mapuje wyjątki na odpowiedź, zamiast `try/catch` w każdej metodzie.
- **Fail fast**: waliduj argumenty na początku metody (`ArgumentNullException.ThrowIfNull`,
  `ArgumentOutOfRangeException.ThrowIfNegative`).
- Loguj cały obiekt wyjątku (`logger.LogError(ex, ...)`), a nie samo `ex.Message`, żeby mieć ślad stosu i wyjątki
  wewnętrzne.

## Źródła

- [Exceptions and exception handling](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/)
- [Best practices for exceptions](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)
- [Exception-handling statements (try, catch, finally)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/exception-handling-statements)
- [CA2200: Rethrow to preserve stack details](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca2200)

## Pytania

### Czym różni się `throw` od `throw ex`? {junior}

`throw;` w bloku `catch` ponownie rzuca ten sam wyjątek i zachowuje jego oryginalny ślad stosu, więc widać, gdzie błąd naprawdę wystąpił.
`throw ex;` traktuje wyjątek jak rzucony od nowa z tej linii i resetuje ślad stosu, przez co traci się informację o źródle. Analizatory
zgłaszają to jako CA2200.

### Czy `finally` wykona się, gdy w `try` jest `return`? {junior}

Tak. `finally` wykonuje się po obliczeniu wartości do zwrócenia, ale przed powrotem do wywołującego. Zmiana zwracanej zmiennej w `finally` nie
zmienia wyniku, bo wartość została już zapamiętana. `finally` nie wykona się tylko przy zakończeniu procesu, np. przez `Environment.FailFast`
albo przepełnienie stosu.

### Dlaczego kolejność bloków `catch` ma znaczenie? {junior}

Bloki `catch` są sprawdzane od góry do dołu, a wygrywa pierwszy pasujący do typu wyjątku. Dlatego bardziej szczegółowe typy
(`FileNotFoundException`) umieszcza się przed ogólnymi (`IOException`, `Exception`). Jeśli ogólny `catch` poprzedza szczegółowy, kompilator
zgłasza błąd CS0160, bo szczegółowy nigdy by nie zadziałał.

### Czym są filtry wyjątków (`when`) i co dają? {mid}

`catch (Exception ex) when (warunek)` łapie wyjątek tylko wtedy, gdy warunek jest prawdziwy. Filtr wykonuje się przed zwinięciem stosu, więc
gdy warunek jest fałszywy, wyjątek idzie dalej z nienaruszonym stosem, co jest lepsze dla diagnostyki niż złapanie, sprawdzenie i ponowne
rzucenie. Używa się go np. do obsługi tylko niektórych kodów HTTP albo do logowania bez łapania (`when (Log(ex))` zwracające `false`).

### Co się dzieje z wyjątkiem rzuconym wewnątrz `finally`? {mid}

Zastępuje wyjątek, który propagował się z `try` lub `catch`, a oryginał przepada bez śladu. Dlatego `finally` (i `Dispose`) pisze się tak,
żeby nie rzucały: sprzątają bezpiecznie, a w razie potrzeby łapią i logują wewnątrz `finally`.

### Jak zachowują się wyjątki przy `async`/`await`? {mid}

`await` ponownie rzuca oryginalny wyjątek z zadania, więc `catch (InvalidOperationException)` działa zgodnie z oczekiwaniem. Blokowanie przez
`.Wait()` lub `.Result` opakowuje wyjątek w `AggregateException`. `await Task.WhenAll` rzuca pierwszy wyjątek, a wszystkie są w
`Exception.InnerExceptions` zwróconego zadania. Wyjątków z `async void` wywołujący nie złapie.

### Dlaczego nie używać wyjątków do sterowania przepływem? {mid}

Rzucenie wyjątku jest kosztowne: środowisko zbiera ślad stosu i szuka obsługi, więc to dziesiątki razy wolniejsze niż zwrócenie wartości. Do
tego kod staje się trudniejszy do śledzenia, a debugger zatrzymuje się na wyjątkach „first-chance”. Do oczekiwanych sytuacji (błędne dane od
użytkownika, brak klucza) używa się `TryParse`/`TryGetValue`, wartości zwracanych, `null` albo typu `Result`.

### Kiedy tworzyć własny typ wyjątku? {mid}

Gdy wywołujący musi zareagować na konkretny przypadek inaczej niż na pozostałe (`catch (OrderNotFoundException)`) albo gdy wyjątek musi nieść
dodatkowe dane (identyfikator, kod błędu). Klasa kończy się na `Exception`, dziedziczy po `Exception` i ma konstruktory z komunikatem
i wyjątkiem wewnętrznym. Jeśli typ wbudowany (`ArgumentException`, `InvalidOperationException`, `KeyNotFoundException`) mówi wystarczająco
dużo, używa się go.

### Gdzie łapać wyjątki w aplikacji webowej? {mid}

Głównie w jednym miejscu, na granicy: globalne middleware (w ASP.NET Core `UseExceptionHandler` z `IExceptionHandler` lub `ProblemDetails`)
loguje wyjątek i mapuje go na odpowiedź HTTP z odpowiednim statusem. W metodach łapie się tylko wyjątki, które naprawdę da się obsłużyć
(ponowienie, wartość awaryjna, opakowanie z kontekstem). Łapanie `Exception` wszędzie i zwracanie `null` ukrywa błędy.

### Do czego służy `ExceptionDispatchInfo`? {senior}

Pozwala przechwycić wyjątek (`ExceptionDispatchInfo.Capture(ex)`) i rzucić go ponownie później, nawet na innym wątku, zachowując oryginalny
ślad stosu (`.Throw()` dopisuje nowe ramki zamiast je nadpisywać). Używa go samo `await` oraz kod infrastrukturalny, który przekazuje wyjątki
między wątkami albo rzuca je ponownie po dodatkowej pracy.
