# IDisposable i garbage collector {mid}

W .NET pamięcią zarządzaną zajmuje się **garbage collector (GC)**, ale nie wie on, jak zwolnić
**zasoby niezarządzane**: uchwyty plików, połączenia sieciowe i bazodanowe, gniazda, blokady.
Do ich deterministycznego zwalniania służy `IDisposable`.

## Jak działa GC

- Obiekty typów referencyjnych trafiają na **stertę zarządzaną**. Alokacja to w praktyce przesunięcie
  wskaźnika, więc jest bardzo szybka.
- GC startuje, gdy kończy się miejsce w generacji 0, przy niskiej pamięci systemu albo po `GC.Collect()`.
- **Oznaczanie**: od **korzeni** (zmienne lokalne na stosie, pola statyczne, uchwyty GC, kolejka
  finalizacji) GC wyznacza obiekty osiągalne. Pozostałe są śmieciami.
- **Kompaktowanie**: żywe obiekty są przesuwane, a referencje aktualizowane. Na czas zbierania wątki
  zarządzane są wstrzymywane (z wyjątkiem części pracy GC w tle).

### Generacje

| Generacja | Zawartość | Jak często zbierana |
| --- | --- | --- |
| 0 | nowe obiekty | najczęściej, tanio |
| 1 | przeżyły jedno zbieranie, bufor | rzadziej |
| 2 | długo żyjące (cache, singletony) | rzadko, „pełny GC” |

Obiekt, który przeżyje zbieranie, **awansuje** do starszej generacji. Założenie: większość obiektów
umiera młodo, więc opłaca się często sprzątać tylko generację 0.

**Large Object Heap (LOH)**: obiekty **≥ 85 000 bajtów** (zwykle duże tablice) trafiają na osobną
stertę, logicznie zbieraną razem z generacją 2. Domyślnie **nie jest kompaktowana**, bo kopiowanie
dużych obiektów jest drogie, co grozi fragmentacją. Częste alokacje dużych tymczasowych buforów to
typowy problem wydajności, a rozwiązaniem jest `ArrayPool<T>.Shared`.

```csharp
GC.GetGeneration(new byte[84_000]); // 0
GC.GetGeneration(new byte[85_000]); // 2 (LOH)
```

**Tryby GC**: *workstation* (aplikacje desktopowe) i *server* (osobna sterta i wątek GC na rdzeń,
większa przepustowość). Aplikacje ASP.NET Core domyślnie używają server GC. *Background GC* pozwala
zbierać generację 2 współbieżnie z działaniem aplikacji.

## `IDisposable` i `using`

```csharp
using var connection = new SqlConnection(cs);   // using declaration (C# 8)
await connection.OpenAsync();
// Dispose na końcu zakresu, także przy wyjątku

using (var file = File.OpenRead(path))           // using statement
{
    // ...
}
```

- `using` to `try/finally`, które wywołuje `Dispose()` **nawet przy wyjątku**.
- Kilka `using var` w jednym zakresie jest zwalnianych w **odwrotnej kolejności** deklaracji.
- `IAsyncDisposable` + `await using`: dla zasobów, których zwolnienie wymaga I/O (np. opróżnienie
  bufora strumienia, zamknięcie połączenia).
- `Dispose` powinien być **idempotentny**: wielokrotne wywołanie nie może rzucać. Po zwolnieniu
  metody obiektu rzucają `ObjectDisposedException`
  (`ObjectDisposedException.ThrowIf(disposed, this)`).

## Finalizery

Finalizer (`~MyClass()`) to siatka bezpieczeństwa: GC wywoła go na osobnym wątku, **kiedyś**, jeśli
programista zapomniał o `Dispose`. Ma poważne wady:

- obiekt z finalizerem przeżywa co najmniej **jedno dodatkowe zbieranie**,
- kolejność i moment wywołania nie są gwarantowane, a w finalizerze nie wolno odwoływać się do innych
  obiektów zarządzanych,
- wyjątek w finalizerze kończy proces.

Dlatego **zasoby niezarządzane opakowuje się w `SafeHandle`**, który ma już poprawny finalizer. Własne
finalizery są dziś potrzebne bardzo rzadko.

## Wzorzec Dispose

Dla klasy bez finalizera, zapieczętowanej, która tylko posiada inne `IDisposable`, wystarcza wersja
prosta:

```csharp
public sealed class ReportWriter : IDisposable
{
    private readonly StreamWriter _writer = new("report.txt");
    private bool _disposed;

    public void Write(string line)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        _writer.WriteLine(line);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _writer.Dispose();
        _disposed = true;
    }
}
```

Pełny wzorzec (`protected virtual void Dispose(bool disposing)` + `GC.SuppressFinalize(this)`) stosuje
się w klasach bazowych przeznaczonych do dziedziczenia i w klasach z finalizerem. `disposing == true`
oznacza wywołanie z `Dispose()` (można zwalniać zasoby zarządzane), a `false` oznacza wywołanie
z finalizera (tylko niezarządzane).

## Kto wywołuje `Dispose`

- Obiekt utworzony przez `new` zwalnia ten, kto go utworzył (zwykle przez `using`).
- Kontener DI zwalnia serwisy, **które sam utworzył**: scoped na końcu zakresu (żądania), singletony
  przy zamknięciu aplikacji. Nie należy ręcznie wywoływać `Dispose` na wstrzykniętych zależnościach.
- `HttpClient`: tworzenie i zwalnianie instancji na każde żądanie może wyczerpać gniazda (stan
  `TIME_WAIT`). Stosuje się `IHttpClientFactory` albo długo żyjący klient z `SocketsHttpHandler`
  i `PooledConnectionLifetime`.

## Wycieki pamięci w kodzie zarządzanym

GC zwalnia tylko obiekty **nieosiągalne**. Wycieki biorą się z niechcianych referencji:

- statyczne kolekcje i cache bez limitu lub wygasania,
- zdarzenia: długo żyjący publikujący trzyma subskrybentów,
- timery i zadania w tle trzymające obiekty,
- domknięcia przechwytujące duże obiekty,
- niezwolnione `IDisposable` (np. strumienie, `CancellationTokenSource` z `CancelAfter`).

Diagnostyka: `dotnet-counters` (rozmiar sterty, liczba GC), `dotnet-gcdump` / `dotnet-dump` i porównanie
zrzutów sterty.

## Źródła

- [Fundamentals of garbage collection](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals)
- [Implement a Dispose method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose)
- [Implement a DisposeAsync method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-disposeasync)
- [The large object heap](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/large-object-heap)
- [IHttpClientFactory guidelines](https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines)

## Pytania

### Po co jest `IDisposable`, skoro .NET ma garbage collector? {junior}

GC zarządza tylko pamięcią zarządzaną i działa w nieprzewidywalnym momencie. Zasoby takie jak pliki,
połączenia, gniazda czy blokady trzeba zwolnić **deterministycznie**, zaraz po użyciu, bo są ograniczone
lub blokują innych. `IDisposable.Dispose()` to miejsce na takie sprzątanie, a `using` gwarantuje jego
wywołanie, także przy wyjątku.

### Jak działają generacje GC i dlaczego ich używa się? {mid}

Nowe obiekty trafiają do generacji 0, a te, które przeżyją zbieranie, awansują do 1, a potem do 2. GC
najczęściej zbiera tylko generację 0, co jest szybkie, bo większość obiektów umiera młodo (hipoteza
generacyjna). Rzadsze zbieranie generacji 2 („pełny GC”) obejmuje całą stertę i jest najdroższe. Obiekty
długo żyjące nie są więc skanowane przy każdym zbieraniu.

### Czym jest Large Object Heap i jakie problemy może powodować? {mid}

To osobna sterta dla obiektów o rozmiarze co najmniej 85 000 bajtów, zbierana razem z generacją 2
i domyślnie niekompaktowana. Częste alokacje dużych tymczasowych tablic powodują kosztowne pełne GC
i fragmentację pamięci. Pomaga ponowne użycie buforów (`ArrayPool<T>.Shared`, `RecyclableMemoryStream`)
albo przetwarzanie strumieniowe zamiast ładowania wszystkiego do jednej tablicy.

### Czym różni się `Dispose` od finalizera? {mid}

`Dispose` wywołuje jawnie kod (zwykle przez `using`), deterministycznie i natychmiast, a może zwalniać
zasoby zarządzane i niezarządzane. Finalizer wywołuje GC w nieokreślonym momencie, na osobnym wątku, jako
zabezpieczenie przed zapomnianym `Dispose`. Nie wolno w nim sięgać do innych obiektów zarządzanych, a sam
obiekt przeżywa dodatkowe zbieranie. `Dispose` wywołuje `GC.SuppressFinalize(this)`, żeby finalizer się
nie wykonał.

### Po co jest `Dispose(bool disposing)` i `GC.SuppressFinalize`? {senior}

To wzorzec dla klas dziedziczonych lub z finalizerem. Wspólna logika sprzątania jest w
`Dispose(bool disposing)`: przy `true` (wywołanie z `Dispose()`) zwalnia się zasoby zarządzane
i niezarządzane, przy `false` (z finalizera) tylko niezarządzane, bo inne obiekty mogły już zostać
sfinalizowane. `GC.SuppressFinalize(this)` informuje GC, że sprzątanie się odbyło, więc obiekt nie trafi
do kolejki finalizacji i nie przeżyje dodatkowego zbierania. Klasa `sealed` bez finalizera nie potrzebuje
tego wzorca.

### Dlaczego nie wywołuje się `GC.Collect()` w kodzie produkcyjnym? {mid}

GC sam dobiera moment i zakres zbierania na podstawie alokacji i przeżywalności obiektów. Wymuszony pełny
GC wstrzymuje wątki, promuje żywe obiekty do starszych generacji (przez co będą zbierane rzadziej
i drożej) i zwykle pogarsza wydajność. Uzasadnione wyjątki to testy, benchmarki i bardzo specyficzne
scenariusze po zwolnieniu ogromnej ilości pamięci.

### Czy w aplikacji .NET może wystąpić wyciek pamięci? Podaj przykłady. {mid}

Tak. GC zwalnia tylko obiekty nieosiągalne, a wyciek to obiekty wciąż osiągalne, choć niepotrzebne.
Przykłady: statyczne słowniki lub cache bez wygasania, subskrypcje zdarzeń długo żyjących obiektów bez
`-=`, timery i zadania w tle trzymające referencje, domknięcia przechwytujące duże obiekty, niezwolnione
zasoby `IDisposable`. Diagnozuje się je przez `dotnet-counters` oraz zrzuty sterty (`dotnet-gcdump`).

### Kto powinien wywołać `Dispose` na serwisie wstrzykniętym przez DI? {mid}

Nikt ręcznie. Kontener DI zwalnia obiekty, które sam utworzył: scoped na końcu zakresu (np. żądania
HTTP), transient w ramach zakresu, który je utworzył, a singletony przy zamknięciu dostawcy usług. Jeśli
zarejestruje się gotową instancję (`AddSingleton(instance)`), kontener jej **nie zwolni**. Ręczne
`Dispose` wstrzykniętej zależności może zepsuć innych jej użytkowników.

### Dlaczego tworzenie `new HttpClient()` w każdym żądaniu to problem? {mid}

Zwolniony klient zamyka połączenia, ale gniazda pozostają przez pewien czas w stanie `TIME_WAIT`. Przy
dużym ruchu prowadzi to do wyczerpania portów (socket exhaustion). Z kolei jeden statyczny klient bez
konfiguracji nie reaguje na zmiany DNS. Rozwiązania: `IHttpClientFactory` (zarządza pulą handlerów)
albo długo żyjący `HttpClient` z `SocketsHttpHandler` i ustawionym `PooledConnectionLifetime`.

### Czym różni się `using` statement od `using` declaration i jak działa `await using`? {junior}

`using (var x = ...) { }` zwalnia zasób na końcu bloku. `using var x = ...;` (C# 8) zwalnia go na końcu
otaczającego zakresu, a kilka takich deklaracji jest zwalnianych w odwrotnej kolejności. Oba są
kompilowane do `try/finally`. `await using` wywołuje `DisposeAsync()` z `IAsyncDisposable`, gdy zwolnienie
wymaga asynchronicznego I/O, np. opróżnienia bufora strumienia czy zamknięcia połączenia.
