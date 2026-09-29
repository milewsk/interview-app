# Nullable reference types i obsługa null {mid}

`NullReferenceException` to jeden z najczęstszych błędów w .NET. Od C# 8 **nullable reference types (NRT)** pozwalają
kompilatorowi śledzić, które referencje mogą być `null`, i ostrzegać przed potencjalnym wyłuskaniem. Nowe projekty
mają je domyślnie włączone (`<Nullable>enable</Nullable>`).

```csharp
string name = "Ada";        // nienullowalny: nie powinien być null
string? nickname = null;    // nullowalny: może być null

Console.WriteLine(nickname.Length);    // ⚠️ CS8602: wyłuskanie referencji, która może być null
string s = nickname;                   // ⚠️ CS8600: konwersja możliwego null na typ nienullowalny

if (nickname is not null)
    Console.WriteLine(nickname.Length);   // ✅ analiza przepływu wie, że tu nie jest null
```

## Czym naprawdę jest NRT

- To **wyłącznie analiza podczas kompilacji**: `string` i `string?` to w czasie wykonania ten sam typ. Kompilator
  dodaje adnotacje (atrybuty) i ostrzeżenia, a w czasie wykonania nic nie jest sprawdzane. Metoda z parametrem
  `string` nadal może dostać `null`, np. z kodu bez NRT, przez refleksję czy deserializację.
- To **ostrzeżenie, nie błąd**. Zespoły często włączają `<WarningsAsErrors>nullable</WarningsAsErrors>`, żeby było
  egzekwowalne.
- Analiza śledzi **stan null** zmiennej w przepływie kodu: po `if (x is null) return;` kompilator wie, że `x` nie
  jest null.
- Nienullowalna właściwość nieustawiona w konstruktorze daje CS8618. Rozwiązania: ustawienie w konstruktorze,
  `required`, wartość domyślna albo `?`, jeśli `null` jest naprawdę dozwolony.

Nullowalne **typy wartościowe** to co innego: `int?` to `Nullable<int>`, prawdziwa struktura w czasie wykonania
z `HasValue` i `Value`.

## Operatory

| Operator | Znaczenie |
|---|---|
| `a?.B` | warunkowy dostęp: `null`, gdy `a` jest `null`, w przeciwnym razie `a.B` |
| `a?[i]` | to samo dla indeksatorów |
| `a ?? b` | koalescencja: `a`, jeśli nie jest null, w przeciwnym razie `b` |
| `a ??= b` | przypisuje `b` tylko wtedy, gdy `a` jest null |
| `a!` | null-forgiving: „zaufaj mi, to nie null”. Tylko wycisza ostrzeżenie i daje NRE w czasie wykonania, jeśli się mylisz |
| `a?.B = x` | (C# 14) przypisanie warunkowe: przypisuje tylko wtedy, gdy `a` nie jest null |

```csharp
var length = customer?.Address?.Street?.Length ?? 0;
cache ??= new Dictionary<string, int>();
```

`is null` / `is not null` są lepsze niż `== null`, bo nie da się ich zmienić przeciążonym operatorem `==`.

## Klauzule strażnicze

W publicznych API argumenty i tak waliduje się w czasie wykonania, bo NRT niczego nie gwarantuje:

```csharp
public void Send(string email)
{
    ArgumentNullException.ThrowIfNull(email);
    ArgumentException.ThrowIfNullOrWhiteSpace(email);
}
```

## Atrybuty dla analizy przepływu

Gdy kontrakt metody jest bardziej złożony niż jej sygnatura, atrybuty z `System.Diagnostics.CodeAnalysis` mówią
kompilatorowi, co się dzieje:

```csharp
public static bool TryFind(string key, [NotNullWhen(true)] out string? value) { ... }

if (TryFind("a", out var value))
    Console.WriteLine(value.Length);    // brak ostrzeżenia: true oznacza, że value nie jest null
```

Inne: `[MaybeNull]`, `[NotNull]` (np. na parametrze sprawdzanym przez metodę strażniczą), `[MemberNotNull]` (metoda
inicjalizuje wymienione pola), `[DoesNotReturn]`, `[NotNullIfNotNull]`.

## Migracja istniejącego projektu

NRT włącza się stopniowo: per plik przez `#nullable enable`, zaczynając od najniższych warstw (modele, narzędzia),
naprawiając ostrzeżenia i dopiero potem włączając je w całym projekcie. Nie należy uciszać ostrzeżeń `!` wszędzie,
bo to tylko ukrywa problem.

## Źródła

- [Nullable reference types](https://learn.microsoft.com/en-us/dotnet/csharp/nullable-references)
- [Attributes for null-state static analysis](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis)
- [Nullable value types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-value-types)
- [Member access operators (?. and ?[])](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/member-access-operators)
- [?? and ??= operators](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/null-coalescing-operator)

## Pytania

### Czym są nullable reference types? {junior}

To funkcja C# 8+, w której typy referencyjne są domyślnie nienullowalne (`string`), a referencję mogącą być null oznacza się `string?`.
Kompilator analizuje przepływ kodu i ostrzega przed wyłuskaniem możliwego null lub przypisaniem `null` do zmiennej nienullowalnej. Włącza się ją
przez `<Nullable>enable</Nullable>`, co nowe projekty mają domyślnie.

### Czy NRT gwarantuje, że zmienna `string` nigdy nie będzie `null`? {mid}

Nie. To tylko analiza podczas kompilacji z ostrzeżeniami: `string` i `string?` to w czasie wykonania ten sam typ i nic nie jest sprawdzane.
`null` nadal może przyjść z kodu bez NRT, przez refleksję, deserializację albo operator `!`. Dlatego publiczne API wciąż walidują argumenty,
np. przez `ArgumentNullException.ThrowIfNull`.

### Czym różni się `string?` od `int?`? {mid}

`int?` to `Nullable<int>`: prawdziwa struktura z `HasValue` i `Value`, istniejąca w czasie wykonania. `string?` to tylko adnotacja dla
kompilatora: w czasie wykonania to ten sam typ `string`, który zawsze mógł być `null`. Dlatego `typeof(int?) != typeof(int)`, a dla stringów
typ jest ten sam.

### Co robi operator `!` (null-forgiving)? {mid}

Mówi kompilatorowi, żeby traktował wyrażenie jako nie-null, i wycisza ostrzeżenie. W czasie wykonania niczego nie zmienia: jeśli wartość jest
`null`, wyłuskanie i tak rzuci `NullReferenceException`. Używa się go, gdy programista wie więcej niż kompilator (np. po inicjalizacji przez
framework), ale nadużywanie ukrywa prawdziwe problemy.

### Co robią operatory `?.`, `??` i `??=`? {junior}

`a?.B` zwraca `null` zamiast rzucać wyjątek, gdy `a` jest `null` (łańcuch zatrzymuje się na pierwszym `null`). `a ?? b` zwraca `a`, jeśli nie
jest `null`, a w przeciwnym razie `b`. `a ??= b` przypisuje `b` do `a` tylko wtedy, gdy `a` jest `null`, np. przy leniwej inicjalizacji. Razem:
`customer?.Address?.City ?? "nieznane"`.

### Jak naprawić ostrzeżenie CS8618 dla nienullowalnej właściwości? {mid}

Ostrzeżenie oznacza, że nienullowalna właściwość może być `null` po zakończeniu konstruktora. Opcje: ustawić ją w konstruktorze, nadać wartość
domyślną, oznaczyć jako `required`, żeby wywołujący musiał ją ustawić w inicjatorze, albo zadeklarować jako `string?`, jeśli brak wartości jest
poprawny. `= null!` tylko wycisza ostrzeżenie i lepiej go unikać.

### Dlaczego `is null` jest lepsze niż `== null`? {mid}

`is null` zawsze sprawdza referencję i nie da się go zmienić przeciążonym operatorem `==` w typie, więc wynik jest przewidywalny. `== null`
wywołuje przeciążony operator, jeśli taki istnieje, co może dać zaskakujące wyniki. `is not null` czyta się naturalnie i działa też
z nullowalnymi typami wartościowymi.

### Do czego służy atrybut `[NotNullWhen(true)]`? {senior}

Opisuje kontrakt, którego sygnatura nie wyrazi: gdy metoda zwraca `true`, parametr `out` nie jest `null`. Po
`if (dict.TryGetValue(key, out var value))` kompilator nie ostrzega przy użyciu `value`. Podobne atrybuty to `[MaybeNull]`, `[NotNull]`,
`[MemberNotNull]` i `[DoesNotReturn]`, a pozwalają metodom pomocniczym współpracować z analizą przepływu.

### Jak włączyć NRT w dużym istniejącym projekcie? {mid}

Stopniowo: włączać per plik przez `#nullable enable` albo per projekt, zaczynając od najniższych warstw (modele domenowe, narzędzia), i naprawiać
ostrzeżenia, poprawnie oznaczając to, co może być `null`. Gdy ostrzeżeń nie ma, włączyć w całym rozwiązaniu i rozważyć `WarningsAsErrors` dla
nullable. Nie uciszać ostrzeżeń hurtowo przez `!`, bo to usuwa korzyść.

### Czym jest przypisanie warunkowe (null-conditional assignment) w C# 14? {mid}

Pozwala użyć `?.` i `?[]` po lewej stronie przypisania: `customer?.Order = order` przypisuje tylko wtedy, gdy `customer` nie jest `null`,
a w przeciwnym razie nic nie robi (prawa strona też się nie wykonuje). Wcześniej wymagało to bloku `if (customer is not null)`. Działa też
z przypisaniami złożonymi, jak `+=`, ale nie z `++` i `--`.
