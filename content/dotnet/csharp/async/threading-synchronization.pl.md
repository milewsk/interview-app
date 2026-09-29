# Wątki i synchronizacja w .NET {mid}

`async/await` obsługuje czekanie bez blokowania, ale gdy kilka wątków sięga do **współdzielonego, mutowalnego stanu**,
potrzebna jest synchronizacja. Rozmowy sprawdzają, czy rozpoznajesz wyścig (race condition), znasz podstawowe
narzędzia (`lock`, `Interlocked`, `SemaphoreSlim`) i wiesz, jak unikać zakleszczeń.

## Thread, ThreadPool, Task

- **`Thread`**: dedykowany wątek systemowy. Jego utworzenie jest kosztowne (domyślnie około 1 MB zarezerwowanego
  stosu), więc dziś używa się go rzadko, np. dla długiej, dedykowanej pętli w tle.
- **ThreadPool**: pula ponownie używanych wątków, którą środowisko automatycznie skaluje. Tam wykonuje się większość
  pracy: `Task.Run`, kontynuacje po `await`, timery, żądania ASP.NET Core.
- **`Task`**: abstrakcja operacji, która zakończy się w przyszłości. To nie jest wątek: zadanie I/O (`HttpClient`,
  baza danych) nie zajmuje wątku podczas czekania, a `Task.Run` wrzuca pracę CPU do puli.

**Głodzenie puli wątków** (thread pool starvation): blokowanie wątków puli (`.Result`, `.Wait()`, `Thread.Sleep`
w kodzie asynchronicznym) sprawia, że pula wolno dodaje wątki, a aplikacja pod obciążeniem przestaje odpowiadać,
choć CPU jest bezczynne. Dlatego ważne jest „async wszędzie”.

## Wyścig (race condition)

```csharp
int counter = 0;
Parallel.For(0, 1_000_000, _ => counter++);
Console.WriteLine(counter);     // np. 143420, a nie 1000000
```

`counter++` to trzy operacje (odczyt, dodanie, zapis). Dwa wątki mogą odczytać tę samą wartość, a jedna
z inkrementacji przepada. Zwykłe kolekcje też nie są bezpieczne wątkowo: `List<T>.Add` z wielu wątków może zgubić
elementy albo rzucić wyjątek.

## Narzędzia synchronizacji

| Narzędzie | Kiedy |
|---|---|
| `lock` (`Monitor`, albo `System.Threading.Lock` w .NET 9+) | krótkie sekcje krytyczne w kodzie synchronicznym |
| `Interlocked` | atomowe operacje na jednej zmiennej: `Increment`, `Add`, `Exchange`, `CompareExchange` |
| `SemaphoreSlim` | ograniczenie współbieżności do N i **asynchroniczne** wykluczanie (`WaitAsync`) |
| `ReaderWriterLockSlim` | wielu czytelników, rzadcy pisarze |
| Kolekcje współbieżne | `ConcurrentDictionary`, `ConcurrentQueue`, `Channel<T>` |
| Niemutowalność | współdzielone dane, które się nie zmieniają, nie potrzebują blokad |

```csharp
private readonly Lock _gate = new();
private decimal _balance;

public void Deposit(decimal amount)
{
    lock (_gate) { _balance += amount; }
}

Interlocked.Increment(ref _requestCount);

private readonly SemaphoreSlim _mutex = new(1, 1);
public async Task RefreshAsync()
{
    await _mutex.WaitAsync();
    try { await ReloadCacheAsync(); }
    finally { _mutex.Release(); }
}
```

- **`await` wewnątrz `lock` to błąd kompilacji** (CS1996): kontynuacja mogłaby wykonać się na innym wątku niż ten,
  który trzyma blokadę. Do asynchronicznych sekcji krytycznych służy `SemaphoreSlim(1, 1)` z `WaitAsync`.
- Blokuje się na **prywatnym obiekcie** używanym tylko w tym celu, nigdy na `this`, `Type` czy stringu, bo zewnętrzny
  kod mógłby zablokować ten sam obiekt.
- Sekcje krytyczne powinny być krótkie i nie wywoływać w środku zewnętrznego kodu ani I/O.

## Zakleszczenie (deadlock)

Dwa wątki czekają na siebie nawzajem: wątek 1 trzyma `A` i chce `B`, wątek 2 trzyma `B` i chce `A`. Zapobieganie:

- **stała kolejność blokad** w całej aplikacji,
- jak najmniej zagnieżdżonych blokad,
- timeouty (`Monitor.TryEnter`, `SemaphoreSlim.WaitAsync(timeout)`) do wykrywania problemu,
- w kodzie asynchronicznym: brak blokowania na zadaniach (`.Result` przy kontekście synchronizacji to klasyczne
  zakleszczenie async).

## `volatile`, model pamięci i inne narzędzia

- `volatile` gwarantuje, że odczyty i zapisy nie są przestawiane ani cache'owane, ale **nie czyni** `x++` atomowym.
  Rzadko jest potrzebny: `lock` i `Interlocked` dają właściwe bariery pamięci.
- `Lazy<T>` inicjalizuje wartość raz w sposób bezpieczny wątkowo (domyślny tryb to `ExecutionAndPublication`).
- `ThreadLocal<T>` daje każdemu wątkowi własną kopię, a `AsyncLocal<T>` wartość płynącą z kontekstem asynchronicznym
  przez `await` (używaną np. do identyfikatorów korelacji i `Activity`).
- `Channel<T>` realizuje wzorzec producent–konsument bez ręcznych blokad (zob. temat o równoległości).

## Źródła

- [Managed threading best practices](https://learn.microsoft.com/en-us/dotnet/standard/threading/managed-threading-best-practices)
- [Overview of synchronization primitives](https://learn.microsoft.com/en-us/dotnet/standard/threading/overview-of-synchronization-primitives)
- [The lock statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock)
- [The managed thread pool](https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool)
- [Debug thread pool starvation](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-threadpool-starvation)

## Pytania

### Czym różni się `Thread` od `Task`? {junior}

`Thread` to dedykowany wątek systemowy, kosztowny w tworzeniu i ręcznie zarządzany. `Task` to abstrakcja operacji, która zakończy się
w przyszłości: praca CPU wykonuje się na ponownie używanych wątkach puli (`Task.Run`), a zadania I/O podczas czekania w ogóle nie zajmują wątku.
Zadania obsługują `await`, składanie (`WhenAll`), anulowanie i propagację wyjątków, więc są domyślnym wyborem.

### Czym jest wyścig (race condition)? Podaj przykład. {junior}

To błąd, w którym wynik zależy od kolejności przeplatania się wątków. Klasyczny przykład to `counter++` z wielu wątków: operacja składa się
z odczytu, dodania i zapisu, więc dwa wątki mogą odczytać tę samą wartość, a jedna inkrementacja przepada. Test z milionem inkrementacji daje
dużo mniejszy wynik. Rozwiązaniem jest `Interlocked.Increment`, `lock` albo niewspółdzielenie stanu.

### Jak działa `lock` i na czym blokować? {mid}

`lock (obj) { ... }` wpuszcza do bloku tylko jeden wątek naraz. To `Monitor.Enter/Exit` w `try/finally`, a w .NET 9+ przy obiekcie
`System.Threading.Lock` kompilator używa `Lock.EnterScope()`. Blokuje się na prywatnym polu (`private readonly Lock _gate = new()`), nigdy na
`this`, `typeof(...)` czy stringu, bo inny kod mógłby zablokować ten sam obiekt i spowodować zakleszczenia.

### Dlaczego nie można użyć `await` wewnątrz `lock` i czego użyć zamiast tego? {mid}

Kompilator tego zabrania (CS1996), bo `Monitor` jest powiązany z wątkiem, a po `await` kontynuacja może wykonać się na innym wątku, który nie
mógłby zwolnić blokady. Poza tym trzymanie blokady podczas I/O blokuje inne wątki. W kodzie asynchronicznym używa się `SemaphoreSlim(1, 1)`
z `await WaitAsync()` i `Release()` w `finally`.

### Kiedy użyć `Interlocked` zamiast `lock`? {mid}

Gdy operacja dotyczy jednej zmiennej i da się ją wyrazić jako operację atomową: zwiększenie licznika (`Increment`, `Add`), podmiana referencji
(`Exchange`) albo warunkowa aktualizacja (`CompareExchange`). Nie używa blokad i jest dużo tańsze niż `lock`. Gdy trzeba spójnie zaktualizować
kilka powiązanych pól, `Interlocked` nie wystarczy i potrzebny jest `lock`.

### Czym jest zakleszczenie (deadlock) i jak go uniknąć? {mid}

To sytuacja, w której wątki czekają na siebie w nieskończoność, np. jeden trzyma blokadę A i czeka na B, a drugi trzyma B i czeka na A. Zapobiega
się mu stałą kolejnością blokad, małą liczbą zagnieżdżonych blokad, krótkimi sekcjami krytycznymi bez wywołań zewnętrznego kodu i timeoutami do
wykrywania. W kodzie asynchronicznym typową przyczyną jest blokowanie na zadaniu (`.Result`, `.Wait()`) w środowisku z kontekstem synchronizacji.

### Do czego służy `SemaphoreSlim`? {mid}

Ogranicza liczbę operacji wykonujących się jednocześnie: `new SemaphoreSlim(3)` wpuszcza najwyżej trzy. Obsługuje asynchroniczne czekanie
(`WaitAsync`), więc używa się go do ograniczania równoległych wywołań HTTP czy połączeń z bazą oraz jako asynchronicznego muteksu
(`new SemaphoreSlim(1, 1)`). `Release()` wywołuje się zawsze w `finally`, żeby wyjątek nie zostawił zajętego semafora.

### Czym jest głodzenie puli wątków (thread pool starvation)? {senior}

To sytuacja, w której wszystkie wątki puli są zablokowane (np. przez `.Result`, `.Wait()`, `Thread.Sleep` albo synchroniczne I/O), a nowe
zadania czekają w kolejce. Pula dodaje wątki powoli, więc aplikacja przestaje odpowiadać, a opóźnienia rosną skokowo, choć CPU prawie nie
pracuje. Rozwiązaniem jest kod asynchroniczny bez blokowania. Diagnostyka: rosnąca liczba wątków i długość kolejki (`dotnet-counters`) oraz zrzuty
stosów.

### Czy `volatile` wystarczy, żeby `counter++` było bezpieczne wątkowo? {senior}

Nie. `volatile` gwarantuje tylko, że każdy odczyt i zapis trafia do pamięci i nie jest przestawiany przez kompilator ani procesor, ale
`counter++` to nadal osobny odczyt i zapis, między które może wejść inny wątek. Potrzebne jest `Interlocked.Increment` albo `lock`. `volatile`
rzadko jest potrzebne w kodzie aplikacji, bo `lock` i `Interlocked` już zapewniają właściwe bariery pamięci.

### Czym różni się `ThreadLocal<T>` od `AsyncLocal<T>`? {senior}

`ThreadLocal<T>` przechowuje osobną wartość dla każdego wątku, więc po `await`, gdy kontynuacja wykona się na innym wątku, wartość może być
inna. `AsyncLocal<T>` płynie z logicznym przepływem asynchronicznym (`ExecutionContext`): wartość ustawiona przed `await` jest widoczna po nim,
nawet na innym wątku, a zmiana wykonana wewnątrz wywołanej metody `async` nie wraca do wywołującego (zmiana w metodzie synchronicznej wraca).
`AsyncLocal` służy do kontekstu żądania, np. identyfikatorów korelacji.
