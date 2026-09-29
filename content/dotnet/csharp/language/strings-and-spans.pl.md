# Stringi, StringBuilder i Span<T> {mid}

`string` to najczęściej używany typ, a wiele pytań na rozmowach dotyczy jego niemutowalności, porównywania
i wydajności. `Span<T>` i `Memory<T>` to nowoczesny sposób pracy na fragmentach danych bez kopiowania.

## `string` jest niemutowalny

`string` to typ referencyjny, ale **niemutowalny**: każda „modyfikująca” metoda (`ToUpper`, `Replace`, `Substring`,
`+`) zwraca **nowy** string. Dzięki temu stringi można bezpiecznie współdzielić między wątkami i używać jako kluczy
słownika. `==` na `string` porównuje **zawartość** (operator jest przeciążony).

```csharp
string a = "hello";
string b = "hello";
Console.WriteLine(ReferenceEquals(a, b));   // True: literały są internowane (jedna instancja)

object x = a, y = new StringBuilder("hel").Append("lo").ToString();
Console.WriteLine(x == y);                  // False: == na object porównuje referencje!
Console.WriteLine(x.Equals(y));             // True
```

**Internowanie**: kompilator umieszcza wszystkie literały w puli, więc identyczne literały to ten sam obiekt.
Stringi budowane w czasie wykonania nie są internowane (`string.Intern` robi to jawnie, ale rzadko jest potrzebne).

## Konkatenacja i `StringBuilder`

`acc += "x"` w pętli za każdym razem tworzy nowy string i kopiuje całą zawartość: łącznie O(n²). W prostym teście
20 000 konkatenacji zajęło około 18 ms, a `StringBuilder` poniżej 1 ms, i różnica rośnie kwadratowo.

- **`StringBuilder`**: mutowalny bufor do budowania tekstu w pętlach.
- **Interpolacja** `$"..."` oraz `string.Concat`/`string.Join`: do stałej liczby fragmentów. Od .NET 6 interpolacja
  używa wydajnego handlera (`DefaultInterpolatedStringHandler`) bez pośrednich stringów.
- **Surowe literały** (raw string literals, C# 11): `"""..."""` bez escapowania cudzysłowów i backslashy, wygodne dla
  JSON-a, SQL-a i wyrażeń regularnych.

## Porównywanie i kultura

```csharp
"title".ToUpper(new CultureInfo("tr-TR"));    // "TİTLE": tureckie İ z kropką
string.Equals("File", "FILE", StringComparison.OrdinalIgnoreCase);   // True
```

- **Porządkowe** (`StringComparison.Ordinal`, `OrdinalIgnoreCase`): porównuje jednostki kodu. Szybkie
  i przewidywalne, więc używa się go dla identyfikatorów, kluczy, ścieżek, protokołów i wszystkiego, co nie jest
  tekstem dla człowieka.
- **Zależne od kultury** (`CurrentCulture`, `InvariantCulture`): stosuje reguły języka, np. do sortowania nazw
  wyświetlanych użytkownikowi.
- Metody bez parametru `StringComparison` (`ToUpper()`, `StartsWith(string)`, `string.Compare`) często używają
  **bieżącej kultury**, co daje różne wyniki na serwerach o różnych ustawieniach. Wskazują to analizatory (CA1307,
  CA1309, CA1310).
- Formatowanie liczb i dat też zależy od kultury: `$"{1234.5:N2}"` daje `1,234.50` w `en-US` i `1 234,50` w `pl-PL`.
  Dla danych (logi, pliki, API) używa się `CultureInfo.InvariantCulture`.

## `Span<T>` i `ReadOnlySpan<T>`

`Span<T>` to **widok** ciągłego fragmentu pamięci: części tablicy, stringa, bufora `stackalloc` albo pamięci
natywnej. Wycinanie fragmentu spanu **nie alokuje** i niczego nie kopiuje.

```csharp
ReadOnlySpan<char> line = "2026-09-26;42;Ada";
int sep = line.IndexOf(';');
ReadOnlySpan<char> date = line[..sep];                 // widok, bez nowego stringa
ReadOnlySpan<char> rest = line[(sep + 1)..];
int number = int.Parse(rest[..rest.IndexOf(';')]);     // parsowanie wprost ze spanu: 42

Span<int> buffer = stackalloc int[16];                 // bufor na stosie, bez GC
```

W teście parsowanie linii przez spany zaalokowało **0 bajtów**, a `Split(';')` zaalokował tablicę i trzy stringi.

Spany to typy `ref struct`, więc żyją tylko na stosie. **Nie mogą**:

- być polem klasy (CS8345) ani zostać opakowane do `object`,
- przetrwać `await` ani `yield` (CS4007); od C# 13 można ich używać w metodach `async` i iteratorach, ale tylko między
  punktami zawieszenia,
- zostać przechwycone w lambdzie.

Do kodu asynchronicznego i przechowywania w polach służy **`Memory<T>` / `ReadOnlyMemory<T>`**: podobny widok, który
może żyć na stercie, a z którego do synchronicznego przetwarzania bierze się span (`memory.Span`).

## Inne narzędzia

- `ArrayPool<T>.Shared.Rent/Return`: ponowne użycie buforów zamiast alokowania nowych tablic.
- `string.Create`: budowanie stringa bezpośrednio w docelowej pamięci.
- `SearchValues<T>` (.NET 8): szybkie wyszukiwanie dowolnego z wielu znaków lub napisów.
- Wiele API BCL przyjmuje `ReadOnlySpan<char>` (`int.Parse`, `Path`, `Utf8JsonReader`), a C# 14 dodaje niejawne
  konwersje między tablicami i spanami.

## Źródła

- [Strings (C# guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/strings/)
- [Best practices for comparing strings](https://learn.microsoft.com/en-us/dotnet/standard/base-types/best-practices-strings)
- [StringBuilder](https://learn.microsoft.com/en-us/dotnet/standard/base-types/stringbuilder)
- [Memory- and span-related types](https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/)
- [ref struct types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/ref-struct)
- [Raw string literals](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/tokens/raw-string)

## Pytania

### Dlaczego `string` jest niemutowalny i jakie są tego konsekwencje? {junior}

Niemutowalność sprawia, że stringi można bezpiecznie współdzielić między wątkami, używać jako kluczy słownika (hash się nie zmienia) i pozwala
internować literały. Konsekwencją jest to, że każda „modyfikacja” (`Replace`, `ToUpper`, `+`) tworzy nowy obiekt, więc budowanie tekstu w pętli
przez konkatenację generuje dużo śmieci i kopiowania. Do tego służy `StringBuilder`.

### Kiedy używać `StringBuilder`? {junior}

Gdy tekst powstaje w wielu krokach, zwłaszcza w pętli o nieznanej liczbie iteracji: `+=` w pętli za każdym razem kopiuje cały string, co daje
O(n²). `StringBuilder` trzyma mutowalny bufor i tworzy string raz na końcu (`ToString()`). Przy kilku fragmentach wystarczy interpolacja albo
`string.Join`, które są czytelniejsze.

### Czy `==` porównuje zawartość stringów? {mid}

Dla zmiennych typu `string` tak: operator `==` jest przeciążony i porównuje zawartość. Ale jeśli obie strony są typu `object`, `==` porównuje
referencje i może zwrócić `false` dla identycznego tekstu. `Equals` zawsze porównuje zawartość. Identyczne literały są dodatkowo tym samym
obiektem dzięki internowaniu, co może ukryć problem w testach.

### Czym jest internowanie stringów? {mid}

Środowisko utrzymuje pulę unikalnych stringów. Trafiają do niej wszystkie literały z kodu, więc identyczne literały wskazują ten sam obiekt.
Stringi budowane w czasie wykonania (konkatenacja, `StringBuilder`, odczyt z pliku) nie są internowane, chyba że wywoła się `string.Intern`.
Internowane stringi żyją do końca procesu, więc internowanie dynamicznych danych może marnować pamięć.

### Dlaczego stringi warto porównywać z `StringComparison.Ordinal`? {mid}

Metody bez parametru `StringComparison` często używają bieżącej kultury, więc wyniki zależą od ustawień maszyny: w kulturze tureckiej
`"title".ToUpper()` daje `"TİTLE"`, co psuje porównania kluczy czy poleceń. Porównanie porządkowe porównuje jednostki kodu, jest szybkie
i deterministyczne, więc używa się go dla identyfikatorów, ścieżek, kluczy i protokołów. Porównanie zależne od kultury jest tylko dla tekstu
wyświetlanego ludziom, np. sortowania nazw.

### Czym jest `Span<T>` i do czego służy? {mid}

`Span<T>` to bezpieczny typowo widok ciągłego fragmentu pamięci (tablicy, stringa, bufora na stosie). Wycinanie z niego fragmentów nie alokuje
i nie kopiuje, więc można parsować lub przetwarzać dane bez tworzenia podciągów i pośrednich tablic. Wiele API BCL przyjmuje spany, np.
`int.Parse(ReadOnlySpan<char>)`. To podstawa wydajnych parserów i serializatorów.

### Jakie są ograniczenia `Span<T>` i dlaczego? {senior}

`Span<T>` to `ref struct`, więc może żyć tylko na stosie: nie może być polem klasy, zostać opakowany, przechwycony w lambdzie ani przetrwać
`await` czy `yield` (od C# 13 można go używać w metodach `async` między punktami zawieszenia). Te reguły gwarantują, że span nigdy nie przeżyje
pamięci, na którą wskazuje, np. bufora `stackalloc`. Do kodu asynchronicznego lub przechowywania używa się `Memory<T>`.

### Czym różni się `Span<T>` od `Memory<T>`? {senior}

`Span<T>` to `ref struct`, więc jest szybki, ale ograniczony do stosu. `Memory<T>` to zwykła struktura, więc może być polem klasy, przechodzić
przez metody `async` i trafiać do kolekcji. Nie daje bezpośredniego dostępu do elementów: bierze się z niej span przez `.Span`
w synchronicznej części kodu. API asynchroniczne (`Stream.ReadAsync(Memory<byte>)`) używają `Memory<T>`, a synchroniczne `Span<T>`.

### Dlaczego formatowanie liczb może dawać różne wyniki na różnych serwerach? {mid}

`ToString()`, interpolacja i `Parse` domyślnie używają bieżącej kultury: `1234.5` formatuje się jako `1,234.50` w `en-US` i `1 234,50`
w `pl-PL`, a parsowanie `"1.5"` w polskiej kulturze kończy się błędem albo daje inną wartość. Dla danych czytanych przez maszyny (pliki, logi,
API, baza) używa się `CultureInfo.InvariantCulture`, a kulturę ustawia jawnie tylko przy wyświetlaniu użytkownikowi.

### Czym są surowe literały stringów (raw string literals)? {junior}

To literał C# 11 ograniczony co najmniej trzema cudzysłowami (`"""..."""`), w którym cudzysłowów i backslashy nie trzeba escapować. Wielowierszowy
surowy literał usuwa wcięcie wspólne dla wszystkich linii (na podstawie zamykających cudzysłowów), więc JSON, SQL czy wyrażenia regularne można
wkleić do kodu w czytelnej formie. Przy `$$"""` nawiasy interpolacji są podwójne, więc pojedyncze klamry zostają tekstem.
