# Równoległość, PLINQ i kanały {senior}

**Współbieżność** (concurrency) to obsługa wielu rzeczy naraz (np. wielu żądań czekających na I/O).
**Równoległość** (parallelism) to wykonywanie wielu rzeczy w tym samym czasie na wielu rdzeniach. .NET ma osobne
narzędzia do pracy obliczeniowej (`Parallel`, PLINQ), do wielu operacji I/O (`Task.WhenAll`,
`Parallel.ForEachAsync`) i do przekazywania danych między producentami a konsumentami (`Channel<T>`).

## Wybór narzędzia

| Scenariusz | Narzędzie |
|---|---|
| Ciężkie obliczenia na wielu elementach (CPU-bound) | `Parallel.For` / `Parallel.ForEach`, PLINQ |
| Wiele operacji I/O, wszystkie naraz | `await Task.WhenAll(...)` |
| Wiele operacji I/O z limitem współbieżności | `Parallel.ForEachAsync` z `MaxDegreeOfParallelism`, `SemaphoreSlim` |
| Przetwarzanie wyników w kolejności ukończenia | `Task.WhenEach` (.NET 9), `Task.WhenAny` |
| Potok lub kolejka producent–konsument | `Channel<T>` |

## `Parallel` do pracy obliczeniowej

```csharp
Parallel.For(0, images.Length, i => images[i] = Resize(images[i]));
```

W teście 64 obciążających CPU elementów na 16 rdzeniach pętla sekwencyjna zajęła ~650 ms, a `Parallel.For` ~94 ms.
`Parallel` **blokuje wątek wywołujący** do zakończenia i używa wątków puli, więc w ASP.NET Core konkuruje o te same
wątki z żądaniami: zrównoleglanie pracy CPU w obrębie żądania rzadko poprawia przepustowość. Wyjątki z iteracji są
zbierane w **`AggregateException`**.

Nie używa się `Parallel.ForEach` z lambdą `async`: staje się ona `async void`, a pętla nie czeka na operacje.

## `Parallel.ForEachAsync` do I/O z limitem

```csharp
await Parallel.ForEachAsync(urls,
    new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
    async (url, token) =>
    {
        var html = await http.GetStringAsync(url, token);
        await SaveAsync(url, html, token);
    });
```

Przetwarza elementy asynchronicznie, najwyżej N naraz (sprawdzone: maksymalna liczba równoczesnych operacji wyniosła
dokładnie 4), obsługuje anulowanie i nie uruchamia 10 000 zapytań naraz, jak zrobiłoby
`Task.WhenAll(urls.Select(...))`.

## PLINQ

```csharp
var result = orders.AsParallel()
    .Where(o => IsSuspicious(o))      // kosztowny predykat
    .Select(o => Score(o))
    .ToList();
```

- `AsParallel()` dzieli źródło na partycje przetwarzane na wielu rdzeniach. Opłaca się tylko przy **kosztownych**
  operacjach na wielu elementach, a przy tanich wygrywa narzut.
- Kolejność wyników **nie jest gwarantowana**: przy dużym źródle wyniki wyszły w innej kolejności. `AsOrdered()`
  przywraca kolejność kosztem wydajności.
- `WithDegreeOfParallelism`, `WithCancellation` i `ForAll` (przetwarzanie bez scalania wyników) dają więcej kontroli.

## `Task.WhenAll`, `WhenAny`, `WhenEach`

- `WhenAll` czeka na wszystkie zadania (i przy `await` rzuca pierwszy wyjątek).
- `WhenAny` zwraca zadanie, które skończyło się pierwsze, np. do timeoutów albo „kto pierwszy odpowie”.
- `Task.WhenEach` (.NET 9) zwraca zadania **w kolejności ukończenia** jako `IAsyncEnumerable`, więc każdy wynik można
  przetworzyć, gdy tylko jest gotowy:

```csharp
await foreach (var task in Task.WhenEach(downloads))
    Console.WriteLine(await task);     // najszybsze najpierw
```

## Kanały: producent–konsument

`System.Threading.Channels` to asynchroniczna, bezpieczna wątkowo kolejka do przekazywania danych między producentami
a konsumentami.

```csharp
var channel = Channel.CreateBounded<Order>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.Wait,     // producent czeka, gdy kolejka jest pełna
});

// producent
await channel.Writer.WriteAsync(order, ct);
channel.Writer.Complete();                      // koniec elementów

// konsument
await foreach (var item in channel.Reader.ReadAllAsync(ct))
    await ProcessAsync(item);
```

- Kanał **ograniczony** (bounded) daje **backpressure**: gdy jest pełny, `WriteAsync` czeka na miejsce, więc szybki
  producent nie zaleje pamięci. W teście z pojemnością 2 producent zapisał dwa elementy, a potem czekał na każdy odczyt.
- Kanał **nieograniczony** (unbounded) nigdy nie blokuje producenta, ale pamięć może rosnąć bez końca.
- Typowe użycie: `BackgroundService` przetwarzający kolejkę zadań zgłaszanych przez endpointy HTTP, potoki (odczyt →
  transformacja → zapis) i oddzielenie szybkiego wejścia od wolnego przetwarzania.

## Źródła

- [Task Parallel Library (TPL)](https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/task-parallel-library-tpl)
- [Parallel.ForEachAsync](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.parallel.foreachasync)
- [Introduction to PLINQ](https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/introduction-to-plinq)
- [Channels](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)
- [Task.WhenEach](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.wheneach)

## Pytania

### Czym różni się współbieżność od równoległości? {mid}

Współbieżność to obsługa wielu zadań w nakładających się okresach, np. serwer obsługujący tysiące żądań czekających na bazę, i może działać nawet
na jednym rdzeniu dzięki async. Równoległość to wykonywanie obliczeń w tym samym czasie na wielu rdzeniach, żeby szybciej skończyć pracę CPU.
Async/await daje współbieżność dla I/O, a `Parallel` i PLINQ równoległość dla pracy obliczeniowej.

### Kiedy używać `Parallel.For`, a kiedy `Task.WhenAll`? {mid}

`Parallel.For`/`ForEach` służy do pracy CPU na wielu elementach: dzieli pracę między wątki puli i blokuje wywołującego do końca. `Task.WhenAll`
służy do operacji I/O: uruchamia je wszystkie i czeka asynchronicznie bez zajmowania wątków. Użycie `Parallel` do I/O blokuje wątki podczas
czekania, a `Task.Run` + `WhenAll` do pracy CPU to ręczna reimplementacja `Parallel`.

### Dlaczego nie przekazywać lambdy `async` do `Parallel.ForEach`? {mid}

`Parallel.ForEach` oczekuje `Action<T>`, więc lambda async staje się `async void`: każda iteracja kończy się na pierwszym `await`, pętla kończy się
przed zakończeniem operacji, a wyjątków nie da się złapać i mogą zakończyć proces. Do pracy asynchronicznej z ograniczoną współbieżnością służy
`Parallel.ForEachAsync`, które przyjmuje `Func<T, CancellationToken, ValueTask>`.

### Jak ograniczyć liczbę równoczesnych zapytań HTTP? {mid}

Najprościej przez `Parallel.ForEachAsync` z `MaxDegreeOfParallelism`, które przetwarza kolekcję najwyżej N operacjami naraz i obsługuje
anulowanie. Alternatywą jest `SemaphoreSlim(N)` z `WaitAsync`/`Release` wokół każdego wywołania, połączony z `Task.WhenAll`. Bez limitu
`Task.WhenAll(urls.Select(Fetch))` uruchamia wszystkie zapytania naraz, co może przeciążyć zdalny serwer albo wyczerpać połączenia.

### Czym jest PLINQ i kiedy się opłaca? {mid}

Parallel LINQ: `source.AsParallel()` sprawia, że kolejne operatory wykonują się równolegle na partycjach danych. Opłaca się przy kosztownych
operacjach na dużych kolekcjach (złożone obliczenia na element), a przy tanich narzut partycjonowania i scalania czyni je wolniejszym od
zwykłego LINQ. Kolejność wyników nie jest gwarantowana bez `AsOrdered()`, a efekty uboczne w lambdach muszą być bezpieczne wątkowo.

### Jak zgłaszane są wyjątki z `Parallel.For`? {mid}

Iteracje wykonują się na różnych wątkach, więc kilka może się nie powieść: `Parallel.For` po pierwszym wyjątku przestaje uruchamiać nowe
iteracje, czeka na trwające i rzuca `AggregateException` ze wszystkimi zebranymi wyjątkami w `InnerExceptions`. `Parallel.ForEachAsync`
oczekiwane przez `await` rzuca bezpośrednio pierwszy wyjątek, jak `Task.WhenAll`.

### Do czego służy `Channel<T>`? {senior}

To asynchroniczna, bezpieczna wątkowo kolejka dla wzorca producent–konsument: producenci wywołują `WriteAsync`, konsumenci czytają przez
`await foreach (... in reader.ReadAllAsync())`, a `Writer.Complete()` sygnalizuje koniec. Używa się jej do oddzielenia szybkiego wejścia od
wolnego przetwarzania, np. endpointy HTTP wrzucają zadania do kolejki, a `BackgroundService` je przetwarza. W porównaniu z `BlockingCollection`
nie blokuje wątków podczas czekania.

### Czym różni się kanał ograniczony od nieograniczonego? {senior}

Kanał ograniczony ma maksymalną pojemność, a gdy jest pełny, zachowanie zależy od `FullMode`: `Wait` każe producentowi czekać (backpressure),
a `DropOldest`, `DropNewest` czy `DropWrite` odrzucają elementy. Chroni to pamięć, gdy konsument nie nadąża. Kanał nieograniczony przyjmuje
wszystko od razu, co jest prostsze, ale przy wolnym konsumencie zużycie pamięci rośnie bez limitu.

### Co robi `Task.WhenEach`? {mid}

Dodane w .NET 9, przyjmuje kolekcję zadań i zwraca `IAsyncEnumerable<Task<T>>`, które oddaje je w kolejności ukończenia. Każdy wynik można
przetworzyć, gdy tylko jest gotowy, np. pokazać najszybsze wyniki wyszukiwania najpierw, zamiast czekać na wszystkie przez `WhenAll` albo
wywoływać `WhenAny` w pętli, co ma koszt kwadratowy.

### Czy warto używać `Parallel.For` wewnątrz żądania ASP.NET Core? {senior}

Zwykle nie. `Parallel` używa tych samych wątków puli, które obsługują żądania, więc pod obciążeniem zrównoleglenie jednego żądania zabiera wątki
innym i nie zwiększa ogólnej przepustowości, a może nawet pogorszyć opóźnienia. Serwer i tak osiąga równoległość, obsługując wiele żądań naraz.
Może to mieć sens przy rzadkich, ciężkich operacjach na nieobciążonym serwerze, a lepiej przenieść taką pracę do kolejki w tle.
