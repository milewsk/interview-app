# async/await w C# {mid}

`async`/`await` pozwala pisać kod asynchroniczny, który czyta się jak synchroniczny. Główny cel
to **niezablokowanie wątku** podczas oczekiwania na I/O (baza danych, HTTP, plik), dzięki czemu
serwer obsłuży więcej żądań, a UI pozostanie responsywne.

```csharp
public async Task<User> GetUserAsync(int id, CancellationToken ct)
{
    var response = await _http.GetAsync($"/users/{id}", ct); // wątek wraca do puli
    response.EnsureSuccessStatusCode();
    return (await response.Content.ReadFromJsonAsync<User>(ct))!;
}
```

## Jak to działa

- Kompilator zamienia metodę `async` w **maszynę stanów**. Każdy `await` to punkt, w którym
  metoda może się zawiesić i później wznowić.
- Metoda wykonuje się **synchronicznie aż do pierwszego `await`**, który faktycznie czeka
  (niezakończony `Task`). Wtedy zwraca wywołującemu niezakończony `Task`.
- Po zakończeniu operacji **kontynuacja** (reszta metody) jest planowana na
  `SynchronizationContext` przechwycony w chwili `await` (np. wątek UI). Jeśli go nie ma, trafia
  na pulę wątków.
- **`await` nie tworzy nowego wątku.** Asynchroniczne I/O w ogóle nie zajmuje wątku podczas
  oczekiwania.

`Task` reprezentuje operację, która się zakończy: z wynikiem (`Task<T>`), wyjątkiem albo
anulowaniem.

## Równolegle czy po kolei

```csharp
// po kolei: ~400 ms
await Task.Delay(200);
await Task.Delay(200);

// współbieżnie: ~200 ms
await Task.WhenAll(Task.Delay(200), Task.Delay(200));
```

- `Task.WhenAll`: czeka na wszystkie. `await` rzuca **pierwszy** wyjątek, a pełną listę błędów
  zawiera `task.Exception.InnerExceptions` (`AggregateException`).
- `Task.WhenAny`: czeka na pierwszy zakończony (np. timeout, pierwszy z wielu serwerów).
- `Task.WhenEach` (.NET 9+): `IAsyncEnumerable` zadań **w kolejności ich kończenia**.

```csharp
await foreach (var task in Task.WhenEach(downloads))
    Console.WriteLine(await task); // najpierw najszybsze
```

## Wyjątki

Wyjątek rzucony w metodzie `async Task` jest **zapisywany w zwróconym `Task`** i rzucany dopiero
przy `await`. Wywołanie metody bez `await` nie zgłosi go od razu, więc „odpalony i zapomniany”
`Task` może ukryć błąd.

## `async void`: tylko dla handlerów zdarzeń

Metody `async void` nie da się awaitować ani złapać jej wyjątku w wywołującym. Nieobsłużony
wyjątek trafia na `SynchronizationContext` i zwykle **kończy proces**. Stosuje się je wyłącznie
w handlerach zdarzeń (`button.Click += async (s, e) => ...`), a w pozostałych przypadkach
używa się `async Task`.

## Blokowanie i deadlock

`.Result`, `.Wait()` i `.GetAwaiter().GetResult()` **blokują wątek**. W środowisku
z jednowątkowym `SynchronizationContext` (WinForms, WPF, klasyczny ASP.NET) prowadzi to do
zakleszczenia:

1. wątek UI blokuje się na `.Result`,
2. kontynuacja po `await` wewnątrz metody chce wrócić **na wątek UI**,
3. wątek UI jest zablokowany, więc nic nie postępuje.

Rozwiązanie: **async do samego końca** („async all the way”). ASP.NET Core nie ma
`SynchronizationContext`, więc ten deadlock nie wystąpi, ale blokowanie nadal marnuje wątki
puli i przy obciążeniu prowadzi do ich wyczerpania (thread pool starvation).

## `ConfigureAwait(false)`

Mówi, że kontynuacja **nie musi wracać** do przechwyconego kontekstu. Stosuje się go głównie
w **kodzie bibliotecznym**, który nie wie, w jakiej aplikacji będzie działał. Zmniejsza koszt
i chroni przed opisanym deadlockiem. W kodzie aplikacji ASP.NET Core nie ma kontekstu do
przechwycenia, więc nie zmienia zachowania. W aplikacji UI po `ConfigureAwait(false)` nie wolno
dotykać kontrolek.

## Anulowanie: `CancellationToken`

Token przekazuje się **w dół całego łańcucha wywołań**. Operacja anulowana rzuca
`OperationCanceledException` (lub dziedziczący `TaskCanceledException`).

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
await DoWorkAsync(cts.Token);
```

W ASP.NET Core `HttpContext.RequestAborted` (albo parametr `CancellationToken` akcji) anuluje
pracę, gdy klient się rozłączy.

## CPU-bound a I/O-bound

- **I/O-bound** (sieć, baza, plik): używaj asynchronicznych API (`ReadAsync`, `ToListAsync`).
  Nie opakowuj ich w `Task.Run`.
- **CPU-bound** (obliczenia): w aplikacji UI przenieś pracę z wątku UI przez
  `await Task.Run(...)`. W ASP.NET Core `Task.Run` nic nie daje: zajmuje inny wątek z tej samej
  puli i dokłada narzut.

## `ValueTask`

`ValueTask<T>` to struktura, która pozwala uniknąć alokacji `Task`, gdy wynik jest często dostępny
**synchronicznie** (np. z cache). Ma ograniczenia: można ją awaitować **tylko raz** i nie wolno
wywoływać `.Result` przed jej zakończeniem. Domyślnym wyborem pozostaje `Task`, a `ValueTask`
stosuje się w „gorących” ścieżkach po pomiarze.

## Strumienie asynchroniczne

`IAsyncEnumerable<T>` łączy `yield return` z `await`, a konsumuje się go przez `await foreach`.
Przydaje się do stronicowania API czy strumieniowania wyników z bazy.

```csharp
static async IAsyncEnumerable<int> NumbersAsync()
{
    for (var i = 1; i <= 3; i++)
    {
        await Task.Delay(10);
        yield return i;
    }
}
```

## Źródła

- [Asynchronous programming with async and await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/)
- [Task-based asynchronous pattern (TAP)](https://learn.microsoft.com/en-us/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap)
- [ConfigureAwait FAQ (.NET Blog)](https://devblogs.microsoft.com/dotnet/configureawait-faq/)
- [Task.WhenEach](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.wheneach)

## Pytania

### Czy `await` tworzy nowy wątek? {junior}

Nie. `await` rejestruje kontynuację i zwalnia bieżący wątek. Asynchroniczne I/O podczas oczekiwania
nie zajmuje żadnego wątku. Po zakończeniu operacji kontynuacja wykonuje się na przechwyconym
`SynchronizationContext` (np. wątku UI) albo na wątku z puli. Nowy wątek z puli angażuje dopiero
`Task.Run`.

### Co się dzieje, gdy wywołasz metodę `async` bez `await`? {mid}

Metoda wykona się synchronicznie do pierwszego „prawdziwego” `await` i zwróci niezakończony `Task`,
a reszta pracy potoczy się w tle. Wyjątek z metody zostanie zapisany w `Task` i nie zostanie
zgłoszony, dopóki ktoś go nie zaawaituje, więc łatwo go przeoczyć. W ASP.NET Core taka praca może
też przeżyć zakres żądania i użyć już zwolnionych zależności (np. `DbContext`).

### Dlaczego `.Result` lub `.Wait()` może spowodować deadlock? {mid}

W środowisku z jednowątkowym `SynchronizationContext` (UI, klasyczny ASP.NET) wątek blokuje się,
czekając na `Task`. Kontynuacja wewnątrz tej metody chce się wykonać na **tym samym**, zablokowanym
wątku. Oba czekają na siebie nawzajem. Rozwiązania: async do samego końca albo `ConfigureAwait(false)`
w kodzie bibliotecznym. W ASP.NET Core deadlocka nie ma, ale blokowanie marnuje wątki puli.

### Kiedy używać `ConfigureAwait(false)`? {mid}

W kodzie bibliotecznym ogólnego przeznaczenia, który nie potrzebuje wracać do kontekstu wywołującego.
Poprawia to wydajność i zapobiega deadlockom, gdy biblioteka zostanie użyta w aplikacji UI
blokującej się na `.Result`. W kodzie aplikacji ASP.NET Core nie ma efektu, bo brak kontekstu.
W kodzie UI nie stosuje się go tam, gdzie po `await` trzeba dotykać kontrolek.

### Dlaczego unika się `async void`? {junior}

Wywołujący nie dostaje `Task`, więc nie może poczekać na zakończenie ani obsłużyć wyjątku.
Nieobsłużony wyjątek trafia prosto na `SynchronizationContext` i zwykle wywraca proces. Metod
`async void` nie da się też łatwo testować. Są dopuszczalne tylko jako handlery zdarzeń, bo sygnatura
zdarzenia wymaga `void`.

### Jak wykonać kilka niezależnych operacji asynchronicznych równolegle i jak obsłużyć błędy? {mid}

Uruchomić wszystkie (bez `await`), a potem `await Task.WhenAll(t1, t2, t3)`. Czas wynosi tyle, co
najdłuższa operacja, a nie ich suma. `await` rzuca pierwszy wyjątek, a wszystkie są dostępne
w `whenAllTask.Exception.InnerExceptions`. Dla wyników w kolejności kończenia służy
`Task.WhenEach` (.NET 9+). Uwaga: operacje na **tym samym** `DbContext` nie mogą biec równolegle.

### Czym różni się praca I/O-bound od CPU-bound w kontekście async? {mid}

I/O-bound to oczekiwanie na zewnętrzny system. Wtedy używa się natywnie asynchronicznych API
i żaden wątek nie czeka. CPU-bound to obliczenia, które zawsze zajmują wątek. W UI przenosi się je
z wątku UI przez `Task.Run`. W ASP.NET Core `Task.Run` tylko przerzuca pracę na inny wątek tej
samej puli, co nie daje korzyści, a dodaje narzut.

### Czym jest `ValueTask` i kiedy go użyć? {senior}

To struktura, która może zawierać gotowy wynik bez alokacji `Task`. Opłaca się, gdy metoda często
kończy się synchronicznie (cache, bufor) i jest wywoływana bardzo często. Ograniczenia: można ją
awaitować tylko raz, nie wolno awaitować jej współbieżnie ani odczytywać wyniku przed zakończeniem.
Jeśli trzeba, zamienia się ją na `Task` przez `.AsTask()`.

### Jak działa anulowanie w .NET? {mid}

Kooperacyjnie. `CancellationTokenSource` wydaje `CancellationToken`, który przekazuje się w dół
wywołań. Metody sprawdzają go (`ThrowIfCancellationRequested`) albo przekazują dalej do API
asynchronicznych. Anulowanie kończy operację wyjątkiem `OperationCanceledException`. Można też
ustawić timeout: `new CancellationTokenSource(TimeSpan.FromSeconds(5))` albo `CancelAfter`.

### Czym jest `IAsyncEnumerable<T>`? {mid}

To asynchroniczny odpowiednik `IEnumerable<T>`. Producent łączy `yield return` z `await`, a konsument
używa `await foreach`. Elementy są dostarczane w miarę ich pojawiania się, bez buforowania całości
w pamięci, np. przy stronicowaniu API czy `AsAsyncEnumerable()` w EF Core.
