# Refleksja, atrybuty i generatory kodu {mid}

Frameworki takie jak ASP.NET Core, EF Core, serializatory i kontenery DI muszą poznać twoje typy: ich właściwości,
konstruktory i atrybuty. Tradycyjnie robiły to w czasie wykonania przez **refleksję**. Nowoczesny .NET coraz częściej
przenosi tę pracę na etap kompilacji dzięki **generatorom kodu** (source generators).

## Refleksja

Refleksja pozwala badać i używać typów w czasie wykonania na podstawie metadanych zapisanych w assembly.

```csharp
Type type = typeof(Customer);                         // albo obj.GetType()
foreach (PropertyInfo p in type.GetProperties())
    Console.WriteLine($"{p.Name}: {p.PropertyType.Name}");

var customer = (Customer)Activator.CreateInstance(type)!;
type.GetProperty("Name")!.SetValue(customer, "Ada");

var secret = type.GetField("_secret", BindingFlags.NonPublic | BindingFlags.Instance)!
    .GetValue(customer);                               // prywatne składowe też są osiągalne
```

Zastosowania: serializatory, ORM-y, kontenery DI, frameworki testowe, wtyczki, model binding i walidacja.

Wady:

- **Wydajność**: w teście 1 000 000 wywołań przez `MethodInfo.Invoke` zajęło ~34 ms, przez delegat utworzony
  `CreateDelegate` ~2 ms, a bezpośrednie wywołanie poniżej 1 ms. Dlatego biblioteki cache'ują `PropertyInfo`/`MethodInfo`
  i zamieniają je na delegaty lub skompilowane wyrażenia.
- **Brak bezpieczeństwa podczas kompilacji**: nazwy składowych to stringi, więc zmiana nazwy psuje kod dopiero
  w czasie wykonania (pomaga `nameof`).
- **Łamie hermetyzację**: prywatne składowe są osiągalne.
- **Niezgodność z trimmingiem i Native AOT**: trimmer nie wie, które składowe są używane przez refleksję, i może je
  usunąć.

## Atrybuty

Atrybuty dołączają deklaratywne metadane do typów, składowych i parametrów. Same z siebie nic nie robią: coś musi je
odczytać (kompilator, framework albo twój kod przez refleksję).

```csharp
[AttributeUsage(AttributeTargets.Property)]
public sealed class MaxLengthAttribute(int length) : Attribute
{
    public int Length { get; } = length;
}

public class Customer
{
    [MaxLength(10)]
    public string Name { get; set; } = "";
}

var attr = typeof(Customer).GetProperty("Name")!.GetCustomAttribute<MaxLengthAttribute>();   // Length = 10
```

Atrybuty odczytywane przez kompilator:

- `[Obsolete("Use New()")]`: ostrzeżenie (CS0618) albo błąd przy użyciu.
- `[CallerMemberName]`, `[CallerFilePath]`, `[CallerLineNumber]`, `[CallerArgumentExpression]`: kompilator wstawia
  informacje o wywołującym, np. do logowania i klauzul strażniczych (`ArgumentNullException.ThrowIfNull` pokazuje
  dzięki temu wyrażenie argumentu).
- Atrybuty analizy nullowalności (`[NotNullWhen]`), `[Flags]`, `[Conditional("DEBUG")]`, `[MethodImpl]`.

Dobrze znane atrybuty frameworków: `[HttpGet]`, `[Authorize]`, `[Required]`, `[JsonPropertyName]`, `[Key]`, `[Fact]`.

## Generatory kodu

Generator kodu to wtyczka kompilatora Roslyn, która analizuje twój kod **podczas kompilacji** i dodaje nowy kod C# do
kompilacji. Wygenerowany kod to zwykły C#: widoczny w IDE, debugowalny, szybki i zgodny z Native AOT.

```csharp
public static partial class Validators
{
    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[a-z]{2,}$")]
    public static partial Regex Email();              // silnik regexa generowany podczas kompilacji
}

[JsonSerializable(typeof(Customer))]
public partial class AppJsonContext : JsonSerializerContext { }

var json = JsonSerializer.Serialize(customer, AppJsonContext.Default.Customer);   // bez refleksji w czasie wykonania
```

Inne przykłady w .NET: `[LoggerMessage]` (wydajne logowanie), binder konfiguracji, minimal API w ASP.NET Core z Native
AOT (request delegate generator) i `[LibraryImport]` dla P/Invoke. Wiele bibliotek (np. Mapperly do mapowania,
implementacje Mediatora) używa generatorów zamiast refleksji.

Generatory korzystają z deklaracji **`partial`**: deklarujesz metodę lub klasę, a generator dostarcza implementację.
Od C# 13 możliwe są też częściowe właściwości, a od C# 14 częściowe konstruktory i zdarzenia.

| | Refleksja | Generator kodu |
|---|---|---|
| Kiedy | w czasie wykonania | podczas kompilacji |
| Wydajność | wolniejsza, kosztowna rozgrzewka | jak kod pisany ręcznie |
| Błędy | w czasie wykonania | podczas kompilacji |
| Native AOT / trimming | problematyczne | w pełni zgodne |
| Elastyczność | obsługuje typy nieznane podczas kompilacji (wtyczki) | tylko kod znany podczas kompilacji |

## Źródła

- [Reflection in .NET](https://learn.microsoft.com/en-us/dotnet/fundamentals/reflection/reflection)
- [Attributes (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/reflection-and-attributes/)
- [Caller information attributes](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/caller-information)
- [Source generators](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/source-generators-overview)
- [System.Text.Json source generation](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation)
- [Regular expression source generators](https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-source-generators)

## Pytania

### Czym jest refleksja i do czego się jej używa? {junior}

To mechanizm badania i używania typów w czasie wykonania na podstawie metadanych assembly: odczyt właściwości i metod, tworzenie obiektów,
wywoływanie składowych i odczyt atrybutów. Używają go serializatory, ORM-y, kontenery DI, frameworki testowe, model binding i systemy wtyczek,
czyli kod, który musi pracować z typami nieznanymi podczas kompilacji.

### Jakie są wady refleksji? {mid}

Jest wolniejsza od bezpośrednich wywołań: `MethodInfo.Invoke` jest wielokrotnie wolniejsze od delegata, a wyszukiwanie metadanych kosztuje czas.
Nie daje bezpieczeństwa podczas kompilacji, bo składowe identyfikuje się stringami, może łamać hermetyzację, sięgając do prywatnych składowych,
i źle współpracuje z trimmingiem i Native AOT, bo trimmer nie widzi, które składowe są używane dynamicznie.

### Jak przyspieszyć kod korzystający z refleksji? {senior}

Cache'ować obiekty `Type`, `PropertyInfo` i `MethodInfo` zamiast wyszukiwać je za każdym razem i raz zamienić je na delegaty
(`MethodInfo.CreateDelegate<Func<T, TResult>>()`) albo skompilowane drzewa wyrażeń, które potem działają prawie jak bezpośrednie wywołania. Jeszcze
lepiej wyeliminować refleksję, generując kod podczas kompilacji generatorem, np. `JsonSerializerContext` w System.Text.Json.

### Czym są atrybuty i jak działają? {junior}

To klasy dziedziczące po `Attribute`, które dołączają metadane do typów, metod, właściwości czy parametrów: `[Obsolete]`, `[Required]`,
`[HttpGet]`. Same nic nie robią: są zapisane w metadanych assembly, a coś musi je odczytać, albo kompilator (`[Obsolete]`, informacje
o wywołującym), albo framework lub twój kod przez refleksję (`GetCustomAttribute<T>()`) lub generator kodu.

### Jak utworzyć własny atrybut? {mid}

Utworzyć klasę dziedziczącą po `Attribute`, z nazwą kończącą się na `Attribute` (przy użyciu przyrostek można pominąć), i oznaczyć ją
`[AttributeUsage]`, żeby określić, gdzie można jej używać (np. `AttributeTargets.Property`) i czy może się powtarzać. Parametry konstruktora
i właściwości stają się argumentami atrybutu, które muszą być stałymi znanymi podczas kompilacji. Odczytuje się go potem refleksją albo
generatorem kodu.

### Co robią atrybuty `[CallerMemberName]` i `[CallerArgumentExpression]`? {mid}

Umieszcza się je na opcjonalnych parametrach, a kompilator wypełnia je w miejscu wywołania: `[CallerMemberName]` nazwą wywołującej metody lub
właściwości, `[CallerFilePath]`/`[CallerLineNumber]` lokalizacją, a `[CallerArgumentExpression]` tekstem źródłowym innego argumentu. Używa się ich
w logowaniu, implementacjach `INotifyPropertyChanged` i klauzulach strażniczych, więc `ThrowIfNull(user.Email)` podaje w komunikacie „user.Email”.

### Czym jest generator kodu (source generator)? {mid}

To wtyczka kompilatora Roslyn, która analizuje kompilowany kod (np. typy oznaczone atrybutem) i dodaje do kompilacji nowe pliki źródłowe C#. Wynik
to zwykły kod, widoczny i debugowalny w IDE, bez kosztu w czasie wykonania. Przykłady w .NET: `[GeneratedRegex]`, generowanie w System.Text.Json,
`[LoggerMessage]`, binder konfiguracji i `[LibraryImport]`.

### Czym generatory kodu różnią się od refleksji? {mid}

Refleksja bada typy w czasie wykonania, co kosztuje czas przy starcie i przy wywołaniach, zgłasza błędy dopiero w czasie wykonania i źle
współpracuje z trimmingiem i Native AOT. Generatory wykonują analizę podczas kompilacji i generują zwykły kod: jest szybki, błędy pojawiają się
przy kompilacji i działa z AOT. Ograniczeniem jest to, że generator widzi tylko kod znany podczas kompilacji, więc nie zastąpi refleksji dla
wtyczek ładowanych dynamicznie.

### Dlaczego Native AOT i trimming mają problem z refleksją? {senior}

Trimming usuwa kod, którego analiza statyczna nie widzi jako używanego, a refleksja sięga do składowych po nazwie w czasie wykonania, więc trimmer
może usunąć właściwość, którą serializator potem spróbuje odczytać. Native AOT nie ma też JIT-a, więc generowanie kodu w czasie wykonania
(`Reflection.Emit`) nie działa, a drzewa wyrażeń są tylko interpretowane, co jest wolniejsze. Dlatego biblioteki adnotują swój kod (`[DynamicallyAccessedMembers]`), a frameworki gotowe na
AOT używają generatorów zamiast refleksji.

### Do czego służy `[GeneratedRegex]`? {mid}

Oznacza metodę `partial` zwracającą `Regex`, a generator tworzy kod implementujący to wyrażenie regularne podczas kompilacji. Unika się kosztu
parsowania i kompilowania regexa w czasie wykonania (szybszy start), błędy we wzorcu są zgłaszane przy kompilacji, wygenerowany kod jest czytelny
i działa z Native AOT. To zalecany zamiennik `new Regex(..., RegexOptions.Compiled)`.
