# Pattern matching w C# {mid}

Pattern matching (dopasowywanie wzorców) pozwala sprawdzić **kształt** wartości (typ, właściwości, zakresy, zawartość
listy) i wyciągnąć z niej dane w jednym wyrażeniu. Działa w wyrażeniach `is`, instrukcjach `switch` i **wyrażeniach
`switch`**, a od C# 7 rozrosło się w jedną z najczęściej używanych funkcji języka.

## Wyrażenie `switch`

```csharp
string Classify(int n) => n switch
{
    < 0 => "ujemna",
    0 => "zero",
    > 0 and <= 100 => "mała",
    _ => "duża",               // discard: wszystko inne
};
```

- Ramiona są sprawdzane **od góry do dołu**, a wygrywa pierwsze dopasowanie.
- Ramię, które nigdy nie może zostać dopasowane (bo pokrywa je wcześniejsze), to **błąd kompilacji** (CS8510).
- Niewyczerpujący switch daje **ostrzeżenie** (CS8509) z przykładem nieobsłużonej wartości, a w czasie wykonania brak
  dopasowania rzuca `SwitchExpressionException`.

## Rodzaje wzorców

| Wzorzec | Przykład | Znaczenie |
|---|---|---|
| Stała | `0`, `"PL"`, `null` | równość ze stałą |
| Typ / deklaracja | `Circle c` | typ pasuje, a wartość trafia do `c` |
| Relacyjny | `> 0`, `<= 100` | porównanie ze stałą |
| Logiczny | `and`, `or`, `not` | łączenie wzorców (`not null`, `>= 1 and <= 9`) |
| Właściwości | `{ Length: > 0 }` | rekurencyjnie sprawdza właściwości |
| Rozszerzony właściwości | `{ Customer.Country: "PL" }` | zagnieżdżona właściwość bez dodatkowych klamer (C# 10) |
| Pozycyjny | `(> 0, > 0)` | używa `Deconstruct` (rekordy, krotki) |
| `var` | `var x` | zawsze pasuje i przypisuje wartość |
| Discard | `_` | zawsze pasuje |
| Listowy | `[1, .., var last]` | zawartość tablicy/listy (C# 11) |

```csharp
static double Area(Shape shape) => shape switch
{
    Circle c => Math.PI * c.Radius * c.Radius,
    Rectangle { Width: var w, Height: var h } => w * h,
    null => throw new ArgumentNullException(nameof(shape)),
    _ => throw new ArgumentOutOfRangeException(nameof(shape)),
};

static decimal Discount(Order order) => order switch
{
    { Customer.IsVip: true, Total: > 100m } => 0.20m,
    { Customer.Country: "PL" } => 0.05m,
    _ => 0m,
};

static string Quadrant(Point p) => p switch
{
    (> 0, > 0) => "I ćwiartka",
    (< 0, < 0) => "III ćwiartka",
    (0, _) or (_, 0) => "na osi",
    _ => "inna",
};
```

## `is` ze wzorcami

```csharp
if (obj is string { Length: > 3 } text)    // typ + właściwość + zmienna
    Console.WriteLine(text.ToUpper());

if (value is not null) { ... }
if (status is Status.Active or Status.Pending) { ... }
if (c is >= 'a' and <= 'z') { ... }
```

## Wzorce listowe

```csharp
static string Describe(int[] items) => items switch
{
    [] => "pusta",
    [var single] => $"jeden element: {single}",
    [0, ..] => "zaczyna się od 0",
    [var first, .. var rest] when rest.Length > 2 => $"{first} i jeszcze {rest.Length}",
    [_, _] => "dwa elementy",
    _ => "inna",
};
```

`..` to wycinek (dowolna liczba elementów, najwyżej raz we wzorcu), a `.. var rest` przechwytuje wycinek. Działają
dla typów z `Length`/`Count` i indeksatorem (tablice, `List<T>`, `Span<T>`).

## Klauzule `when`

`when` dodaje do ramienia dowolny warunek: `>= 90 when hasBonus => "A+"`. Kompilator nie uwzględnia warunków przy
sprawdzaniu wyczerpywalności, więc warto zostawić ramię łapiące wszystko.

## Kiedy wzorce pomagają, a kiedy nie

Wzorce świetnie sprawdzają się przy mapowaniu wartości, obsłudze zamkniętego zbioru typów (np. hierarchii rekordów,
wyników `Success`/`Failure`) i walidacji. Ale długi `switch` po typach, które często się rozszerza, może być
sygnałem, że lepsza byłaby metoda wirtualna (polimorfizm): dodanie nowego typu nie wymaga wtedy szukania każdego
`switch`.

## Źródła

- [Patterns (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/patterns)
- [switch expression](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/switch-expression)
- [Pattern matching overview](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/functional/pattern-matching)

## Pytania

### Czym jest wyrażenie `switch` i czym różni się od instrukcji `switch`? {junior}

Wyrażenie `switch` zwraca wartość (`var x = input switch { ... }`), używa ramion `=>` bez `case` i `break` i obsługuje wszystkie wzorce.
Kompilator sprawdza je pod kątem wyczerpywalności i nieosiągalnych ramion. Instrukcja `switch` wykonuje bloki kodu i nie ma wyniku. Wyrażenie
jest zwięźlejsze, gdy mapuje się jedną wartość na inną.

### W jakiej kolejności sprawdzane są ramiona wyrażenia `switch`? {junior}

Od góry do dołu, a wygrywa pierwsze pasujące ramię. Dlatego bardziej szczegółowe wzorce umieszcza się przed ogólniejszymi. Ramię, które
nigdy nie może zostać dopasowane, bo pokrywa je wcześniejsze, to błąd kompilacji (CS8510), np. `> 10` po `> 0`.

### Co się stanie, gdy żadne ramię wyrażenia `switch` nie pasuje? {mid}

Kompilator ostrzega już podczas kompilacji (CS8509), że switch nie jest wyczerpujący, i podaje przykład nieobsłużonej wartości. W czasie
wykonania brak dopasowania rzuca `SwitchExpressionException`. Dlatego zwykle dodaje się ramię `_ => ...`, często rzucające sensowny wyjątek,
np. `ArgumentOutOfRangeException`.

### Czym są wzorce właściwości i co daje ich rozszerzona forma? {mid}

Wzorzec właściwości sprawdza właściwości obiektu: `order is { Status: "Paid", Total: > 100 }`, a przy okazji sprawdza, że obiekt nie jest
`null`. Od C# 10 forma rozszerzona pozwala odwołać się do zagnieżdżonych właściwości przez kropkę: `{ Customer.Address.Country: "PL" }` zamiast
`{ Customer: { Address: { Country: "PL" } } }`.

### Czym są wzorce relacyjne i logiczne? {mid}

Wzorce relacyjne porównują ze stałą: `< 0`, `>= 18`. Wzorce logiczne łączą wzorce: `and`, `or`, `not`. Razem wyrażają zakresy i warunki bez
powtarzania zmiennej: `age is >= 18 and < 65`, `c is >= 'a' and <= 'z' or >= 'A' and <= 'Z'`, `x is not null`. Działają tylko ze stałymi,
nie ze zmiennymi.

### Jak działają wzorce listowe? {mid}

Od C# 11 można dopasować zawartość tablicy lub listy: `[]` to pusta, `[var x]` ma jeden element, `[1, 2, ..]` zaczyna się od 1 i 2,
a `[.., var last]` przechwytuje ostatni element. `..` to wycinek dowolnej długości i może wystąpić najwyżej raz, a `.. var rest` go
przechwytuje. Działają dla typów z właściwością `Length` lub `Count` i indeksatorem.

### Czym jest wzorzec pozycyjny? {mid}

Dopasowuje wartość przez jej metodę `Deconstruct`, którą rekordy i krotki mają od razu: `point is (0, 0)` albo `(> 0, > 0) => "I ćwiartka"`.
Przydaje się z krotkami, żeby przełączać się po kilku wartościach naraz: `(state, action) switch { (State.Open, Action.Close) => State.Closed, ... }`.

### Do czego służy klauzula `when` i jaka jest jej wada? {mid}

Dodaje do ramienia dowolny warunek logiczny, np. porównanie dwóch przechwyconych zmiennych, czego sam wzorzec nie wyrazi:
`Rectangle { Width: var w, Height: var h } when w == h => "kwadrat"`. Wadą jest to, że kompilator nie analizuje warunków `when` przy sprawdzaniu
wyczerpywalności, więc nie ostrzeże o lukach.

### Dlaczego często woli się `is not null` od `!= null`? {junior}

`is not null` zawsze sprawdza referencję i nie da się go zmienić przeciążonym operatorem `!=`, więc zachowuje się przewidywalnie. Do tego czyta
się naturalnie, działa z nullowalnymi typami wartościowymi i łączy się z resztą składni wzorców (`is not null and { Length: > 0 }`).

### Kiedy `switch` po typach jest sygnałem złego projektu? {senior}

Gdy po tym samym zbiorze typów przełącza się w wielu miejscach, a zbiór jest otwarty, czyli często dochodzą nowe typy. Każdy nowy typ wymaga
wtedy znalezienia i poprawienia każdego `switch`, co łamie zasadę otwarte-zamknięte, a lepsza byłaby metoda wirtualna lub interfejs.
Przełączanie po zamkniętej hierarchii (np. `Result` = `Success` | `Failure`) albo mapowanie na granicy systemu jest w porządku.
