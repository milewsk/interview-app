# Nowości w C# 12–14 {mid}

Rekruterzy lubią pytać: „co wiesz o najnowszej wersji C#?”. Każda wersja C# wychodzi z wersją .NET: **C# 12
z .NET 8** (LTS), **C# 13 z .NET 9**, **C# 14 z .NET 10** (LTS). Domyślnie projekt używa wersji C# pasującej do
docelowego frameworka (`net10.0` → C# 14), a zmiana `<LangVersion>` powyżej tej wersji nie jest wspierana.

## C# 12 (.NET 8)

```csharp
public class OrderService(IOrderRepository repository, ILogger<OrderService> logger)   // konstruktor główny
{
    public Task<Order?> Get(int id) => repository.Find(id);
}

int[] numbers = [1, 2, 3];                       // wyrażenia kolekcji
List<int> more = [.. numbers, 4];                // spread

var increment = (int x, int step = 1) => x + step;   // domyślne parametry w lambdach

using Point = (int X, int Y);                    // alias dowolnego typu (tu krotki)
```

- **Konstruktory główne** w klasach i strukturach: parametry są widoczne w całym ciele (w rekordach stają się też
  właściwościami).
- **Wyrażenia kolekcji** `[...]` ze spreadem `..`: jedna składnia dla tablic, list, spanów i kolekcji niemutowalnych.
- **Domyślne parametry lambd**, **alias dowolnego typu**, parametry `ref readonly`, inline arrays (głównie dla autorów
  bibliotek), `[Experimental]` oraz interceptory (preview, dla generatorów kodu).

## C# 13 (.NET 9)

```csharp
static int Sum(params ReadOnlySpan<int> values) { ... }     // params collections: bez alokacji tablicy
Sum(1, 2, 3);

private readonly Lock _gate = new();                         // System.Threading.Lock
lock (_gate) { ... }                                         // kompilator używa Lock.EnterScope() zamiast Monitor

var countdown = new Timer { Buffer = { [^1] = 0, [^2] = 1 } };   // ^ w inicjatorach obiektów
```

- **Kolekcje `params`**: `params` działa ze `Span<T>`, `ReadOnlySpan<T>`, `List<T>` i interfejsami kolekcji, nie tylko
  z tablicami.
- **Nowy typ `Lock`**: dedykowany obiekt synchronizacji, wydajniejszy niż blokowanie na `object` przez `Monitor`.
- Sekwencja ucieczki **`\e`** (znak ESC, `U+001B`).
- Lokalne zmienne `ref` i typy `ref struct` (np. `Span<T>`) są dozwolone w metodach `async` i iteratorach, o ile nie
  przekraczają `await`/`yield`.
- Typy `ref struct` mogą implementować interfejsy, a antyograniczenie `allows ref struct` pozwala używać ich jako
  argumentów generycznych.
- **Częściowe właściwości i indeksatory** (ważne dla generatorów kodu), `[OverloadResolutionPriority]` dla autorów
  bibliotek.

## C# 14 (.NET 10)

```csharp
public static class EnumerableExtensions
{
    extension<T>(IEnumerable<T> source)               // blok rozszerzeń
    {
        public bool IsEmpty => !source.Any();         // właściwość rozszerzająca
    }

    extension<T>(IEnumerable<T>)                      // statyczne składowe rozszerzające
    {
        public static IEnumerable<T> Pair(T item) => [item, item];
    }
}

items.IsEmpty;                          // używana jak właściwość instancji
IEnumerable<int>.Pair(7);               // używana jak statyczna składowa typu

public string Name
{
    get;
    set => field = value.Trim();        // field: pole pomocnicze wygenerowane przez kompilator
}

customer?.Order = GetCurrentOrder();    // przypisanie warunkowe
nameof(List<>);                         // "List": niezwiązane typy generyczne w nameof

TryParse<int> parse = (text, out result) => int.TryParse(text, out result);   // modyfikatory bez typów
```

- **Składowe rozszerzające** (extension members): bloki `extension` pozwalają na **właściwości** rozszerzające,
  statyczne składowe rozszerzające i operatory, nie tylko metody.
- **Słowo kluczowe `field`**: akcesor z logiką (walidacja, przycinanie, powiadomienia) bez ręcznego deklarowania pola
  pomocniczego.
- **Przypisanie warunkowe** `a?.B = x`: przypisuje tylko wtedy, gdy `a` nie jest `null` (w przeciwnym razie prawa
  strona się nie wykonuje), działa też z `+=`, ale nie z `++`/`--`.
- **Niejawne konwersje spanów**: tablice konwertują się niejawnie do `Span<T>`/`ReadOnlySpan<T>`, co poprawia wybór
  przeciążeń i wnioskowanie typów generycznych.
- **`nameof` z niezwiązanymi typami generycznymi**, **modyfikatory** parametrów lambd (`out`, `ref`, `in`, `scoped`) bez
  typów, **częściowe konstruktory i zdarzenia**, **operatory przypisania złożonego definiowane przez użytkownika**
  (`+=` bez tworzenia nowego obiektu).

## .NET 10 wokół języka

.NET 10 wprowadził też **aplikacje oparte na plikach** (file-based apps): `dotnet run app.cs` uruchamia pojedynczy plik
`.cs` bez projektu, a dyrektywy w rodzaju `#:package Microsoft.EntityFrameworkCore.Sqlite@10.*` i `#:property ...`
zastępują `.csproj`. Przydaje się do skryptów, prototypów i nauki.

## Źródła

- [What's new in C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14)
- [What's new in C# 13](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-13)
- [What's new in C# 12](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-12)
- [C# language versioning](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/configure-language-version)
- [Extension members](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/extension-methods)

## Pytania

### Która wersja C# wychodzi z którą wersją .NET? {junior}

C# 12 wychodzi z .NET 8, C# 13 z .NET 9, a C# 14 z .NET 10. Domyślnie kompilator wybiera wersję pasującą do docelowego frameworka projektu, więc
projekt `net10.0` używa C# 14. Można jawnie ustawić `<LangVersion>`, ale używanie nowszej wersji języka niż wspierana przez framework nie jest
wspierane, bo część funkcji wymaga wsparcia środowiska lub bibliotek.

### Na co pozwala „alias any type” w C# 12? {mid}

Alias `using` może teraz nazywać dowolny typ, nie tylko typy nazwane: krotki (`using Point = (int X, int Y);`), tablice, wskaźniki i zamknięte typy generyczne
(`using Names = List<string>;`). Skraca długie nazwy typów i nadaje znaczenie kształtom krotek bez deklarowania nowego typu; sprawdzone na .NET 10: `Point p = (1, 2)`
udostępniło `p.X` i `p.Y`. Alias to tylko nazwa tego samego typu, więc nie daje bezpieczeństwa typów między różnymi aliasami tej samej krotki.

### Czym są wyrażenia kolekcji? {junior}

To składnia C# 12 `[1, 2, 3]` do tworzenia kolekcji, która działa dla tablic, `List<T>`, `Span<T>`, kolekcji niemutowalnych i interfejsów kolekcji.
Element spread `..other` wstawia zawartość innej kolekcji: `[.. first, .. second, 42]`. Kompilator wybiera wydajny sposób budowy docelowego typu,
np. bez pośredniej tablicy dla spanów.

### Co zmieniło się w `params` w C# 13? {mid}

`params` nie musi już być tablicą: może to być `Span<T>`, `ReadOnlySpan<T>`, `List<T>`, `IEnumerable<T>` i inne typy kolekcji. Przy
`params ReadOnlySpan<T>` kompilator może przekazać argumenty bez alokowania tablicy na stercie, co przyspiesza często wywoływane metody, jak
`string.Concat` czy metody logowania. Istniejące wywołania działają bez zmian.

### Czym jest nowy typ `Lock` w .NET 9? {mid}

`System.Threading.Lock` to dedykowany typ synchronizacji. Gdy instrukcja `lock` jest użyta na obiekcie `Lock`, kompilator generuje kod używający
`Lock.EnterScope()` zamiast `Monitor.Enter/Exit`, co jest wydajniejsze i lepiej wyraża intencję niż blokowanie na dowolnym `object`. Wystarczy
zmienić typ pola na `Lock`, a reszta kodu zostaje bez zmian.

### Czym są składowe rozszerzające w C# 14? {mid}

To nowa składnia bloku `extension` w klasie statycznej, która pozwala deklarować nie tylko metody rozszerzające, ale też właściwości
rozszerzające, statyczne składowe rozszerzające (wywoływane na typie, np. `IEnumerable<int>.Identity`) i operatory. Wcześniej możliwe były tylko
metody instancji z `this` przy pierwszym parametrze. Istniejące metody rozszerzające działają dalej, a nowa składnia grupuje składowe dla jednego
typu odbiorcy.

### Co robi słowo kluczowe `field`? {mid}

W akcesorze właściwości `field` odnosi się do pola pomocniczego wygenerowanego przez kompilator. Można dodać logikę do jednego akcesora, np.
`set => field = value.Trim()` albo `get => field ??= Create()`, zostawiając drugi automatycznym, bez ręcznego deklarowania prywatnego pola. Jeśli
typ ma już składową o nazwie `field`, odwołuje się do niej przez `@field` albo `this.field`.

### Czym jest przypisanie warunkowe (null-conditional assignment)? {junior}

C# 14 pozwala użyć `?.` i `?[]` po lewej stronie przypisania: `customer?.Order = order` przypisuje tylko wtedy, gdy `customer` nie jest `null`.
Jeśli jest `null`, nic się nie dzieje, a prawa strona nie jest obliczana. Działa też z przypisaniami złożonymi (`+=`), ale nie z inkrementacją
i dekrementacją (`++`, `--`).

### Czym są niejawne konwersje spanów w C# 14? {senior}

Język traktuje `Span<T>` i `ReadOnlySpan<T>` jako typy pierwszej klasy: tablice konwertują się niejawnie do spanów, spany do spanów tylko do
odczytu, a te konwersje działają przy odbiorcach metod rozszerzających i wnioskowaniu typów generycznych. W efekcie przeciążenia oparte na
spanach (zwykle szybsze) są wybierane częściej bez jawnego `.AsSpan()`, a metody rozszerzające zdefiniowane dla `ReadOnlySpan<T>` działają
bezpośrednio na tablicach.

### Czym są aplikacje oparte na plikach w .NET 10? {junior}

To możliwość uruchomienia pojedynczego pliku `.cs` bez projektu: `dotnet run app.cs`. Dyrektywy na początku pliku zastępują plik projektu, np.
`#:package Nazwa@wersja` dodaje pakiet NuGet, a `#:property` ustawia właściwość MSBuild. Przydaje się do skryptów, prototypów i nauki, a plik
można później przekształcić w zwykły projekt poleceniem `dotnet project convert app.cs`.
