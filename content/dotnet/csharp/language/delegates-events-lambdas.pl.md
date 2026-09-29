# Delegaty, zdarzenia i wyrażenia lambda {mid}

**Delegat** to typ reprezentujący referencję do metody o określonej sygnaturze, czyli bezpieczny
typowo odpowiednik wskaźnika na funkcję. **Lambda** to zwięzły sposób utworzenia instancji delegata
(albo drzewa wyrażeń). **Zdarzenie** (`event`) to delegat opakowany tak, żeby z zewnątrz można było
tylko się zapisać (`+=`) i wypisać (`-=`).

```csharp
Func<int, int, int> add = (a, b) => a + b;   // zwraca wartość
Action<string> print = Console.WriteLine;     // void, grupa metod jako delegat
Predicate<int> isEven = n => n % 2 == 0;      // bool

delegate bool TryParse<T>(string text, out T result); // własny typ delegata
```

W praktyce używa się głównie generycznych `Func<...>` (ostatni parametr typu to wynik) i `Action<...>`.
Własne typy delegatów definiuje się, gdy potrzebne są parametry `ref`/`out`/`in` albo czytelna nazwa.

## Delegaty wielokrotne (multicast)

Delegat może przechowywać **listę wywołań**. `+=` dodaje metodę, `-=` usuwa ją, a wywołanie uruchamia
wszystkie po kolei:

```csharp
Action log = () => Console.Write("A ");
log += () => Console.Write("B ");
log();                              // A B

Func<int> f = () => 1;
f += () => 2;
f();                                // 2: zwracana jest wartość OSTATNIEJ metody
```

- Wyjątek w jednej metodzie **przerywa** wywołanie pozostałych.
- `-=` usuwa tylko **tę samą** instancję delegata. Nowa lambda o identycznej treści to inny obiekt,
  więc `x -= () => ...` niczego nie usunie.
- Delegaty są **niemutowalne**: `+=` tworzy nowy obiekt, co ma znaczenie przy wielowątkowości.
- Pusty delegat to `null`, dlatego wywołuje się go przez `handler?.Invoke(...)`.

## Zdarzenia

```csharp
public class Order
{
    public event EventHandler<OrderShippedEventArgs>? Shipped;

    public void Ship()
    {
        // ... logika ...
        Shipped?.Invoke(this, new OrderShippedEventArgs(Id));
    }
}

public class OrderShippedEventArgs(int orderId) : EventArgs
{
    public int OrderId { get; } = orderId;
}

order.Shipped += (sender, e) => Console.WriteLine($"Wysłano {e.OrderId}");
```

Różnica między publicznym **polem delegata** a **zdarzeniem**:

| | pole `Action? Changed` | `event Action? Changed` |
| --- | --- | --- |
| `+=` / `-=` z zewnątrz | tak | tak |
| wywołanie z zewnątrz | tak | **nie** (błąd CS0070) |
| nadpisanie `= null` z zewnątrz | tak (usunie wszystkich subskrybentów) | **nie** |

Konwencja .NET to sygnatura `(object? sender, TEventArgs e)` i typ `EventHandler`/`EventHandler<T>`.

### Wycieki pamięci przez zdarzenia

Publikujący trzyma referencję do subskrybenta (przez delegat, który wskazuje na jego metodę). Jeśli
publikujący żyje długo (singleton, zdarzenie statyczne), subskrybent **nie zostanie zebrany przez GC**,
dopóki się nie wypisze. Rozwiązania: `-=` przy sprzątaniu (np. w `Dispose`), krótko żyjący publikujący
albo wzorzec słabych zdarzeń.

## Lambdy i domknięcia

Lambda może używać zmiennych z otaczającej metody. Kompilator przenosi je wtedy do ukrytej klasy
(domknięcia), więc lambda widzi **zmienną, a nie kopię wartości** i może ją modyfikować:

```csharp
var counter = 0;
Action inc = () => counter++;
inc(); inc();                        // counter == 2
```

Pułapka pętli `for`: jedna zmienna dla wszystkich iteracji. Od C# 5 `foreach` tworzy nową zmienną
w każdej iteracji.

```csharp
for (var i = 0; i < 3; i++) actions.Add(() => Console.Write(i));      // 333
foreach (var j in new[] { 0, 1, 2 }) actions.Add(() => Console.Write(j)); // 012
```

Domknięcie oznacza alokację. W gorących ścieżkach można użyć lambdy `static`, która nie może
przechwytywać zmiennych, a kompilator to wymusza: `static x => x * x`.

## Delegat czy drzewo wyrażeń

Ta sama lambda może zostać skompilowana do dwóch rzeczy:

- `Func<int, bool> f = x => x > 5;` to **kod wykonywalny** (LINQ to Objects),
- `Expression<Func<int, bool>> e = x => x > 5;` to **struktura danych** opisująca kod, którą można
  analizować i tłumaczyć, np. na SQL w EF Core. `e.Compile()` zamienia ją w delegat.

## Nowsze możliwości

- **Naturalny typ lambdy** (C# 10): `var parse = (string s) => int.Parse(s);` daje `Func<string, int>`.
- **Parametry domyślne i `params`** w lambdach (C# 12).
- **Modyfikatory bez typów** (C# 14): `TryParse<int> p = (text, out result) => int.TryParse(text, out result);`.

## Źródła

- [Delegates (C# programming guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/delegates/)
- [Events (C# programming guide)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/events/)
- [Lambda expressions (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/lambda-expressions)
- [Expression trees](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)
- [What's new in C# 14](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-14)

## Pytania

### Czym jest delegat i czym różnią się `Func`, `Action` i `Predicate`? {junior}

Delegat to typ opisujący sygnaturę metody. Jego instancja wskazuje na konkretną metodę (lub kilka),
którą można wywołać lub przekazać dalej. `Func<T1, …, TResult>` zwraca wartość (ostatni parametr typu
to wynik), `Action<T1, …>` zwraca `void`, a `Predicate<T>` przyjmuje `T` i zwraca `bool` (odpowiednik
`Func<T, bool>`).

### Czym różni się `event` od publicznego pola delegata? {mid}

`event` ogranicza dostęp z zewnątrz do `+=` i `-=`. Tylko klasa, która je zadeklarowała, może je wywołać
lub wyczyścić. Publiczne pole delegata pozwala każdemu je wywołać (np. zasymulować zdarzenie) albo
nadpisać przez `= null` i usunąć wszystkich subskrybentów. Próba wywołania zdarzenia spoza klasy kończy
się błędem kompilacji CS0070.

### Co zwróci wywołanie delegata wielokrotnego typu `Func<int>`? {mid}

Wartość zwróconą przez **ostatnią** metodę na liście wywołań, a wyniki poprzednich zostają pominięte.
Aby zebrać wszystkie, trzeba przejść po `GetInvocationList()` i wywołać każdy element osobno. To samo
podejście pozwala obsłużyć wyjątki osobno dla każdego subskrybenta, bo przy zwykłym wywołaniu wyjątek
przerywa wykonanie pozostałych.

### Dlaczego `handler -= () => DoWork()` nie wypisuje wcześniej dodanej lambdy? {mid}

`-=` usuwa delegat równy temu z listy, a każda nowa lambda to nowa instancja z innym celem wywołania,
nawet jeśli treść jest identyczna. Żeby móc się wypisać, trzeba zachować referencję do delegata
(`var h = () => DoWork(); x += h; ... x -= h;`) albo zapisać się metodą (`x += DoWork`), bo delegaty
utworzone z tej samej metody i obiektu są równe.

### Jak zdarzenia mogą powodować wycieki pamięci? {mid}

Delegat w zdarzeniu trzyma referencję do obiektu subskrybenta. Jeśli publikujący żyje dłużej (singleton,
zdarzenie statyczne, długo żyjący serwis), subskrybent pozostaje osiągalny i GC go nie zbierze, nawet
gdy nikt inny go nie używa. Rozwiązaniem jest wypisanie się (`-=`), np. w `Dispose` subskrybenta.
Stosuje się też słabe referencje (weak event pattern) albo ogranicza czas życia publikującego.

### Co wypisze pętla `for (var i = 0; i < 3; i++) list.Add(() => Console.Write(i));` po wywołaniu wszystkich akcji? {mid}

`333`. Wszystkie lambdy przechwytują **tę samą** zmienną `i`, która po zakończeniu pętli ma wartość 3.
Rozwiązanie to lokalna kopia wewnątrz pętli (`var copy = i;`). W `foreach` problem nie występuje od
C# 5, bo zmienna iteracji jest tworzona od nowa w każdym obrocie.

### Co dzieje się ze zmienną lokalną przechwyconą przez lambdę? {mid}

Kompilator przenosi ją do pola ukrytej klasy domknięcia. Metoda i lambda współdzielą tę samą instancję,
więc lambda widzi bieżącą wartość i może ją zmieniać, a zmienna żyje tak długo jak delegat. Kosztem jest
alokacja obiektu domknięcia i delegata. Lambda `static` zabrania przechwytywania i pozwala tego uniknąć.

### Czym różni się `Func<T, bool>` od `Expression<Func<T, bool>>`? {mid}

`Func` to skompilowany kod gotowy do wywołania. `Expression<Func<...>>` to drzewo wyrażeń, czyli dane
opisujące kod, które można analizować, modyfikować i tłumaczyć. Dlatego `IQueryable` (EF Core) przyjmuje
wyrażenia i zamienia je na SQL, a `IEnumerable` przyjmuje delegaty i wykonuje je w pamięci. `Compile()`
zamienia wyrażenie w delegat.

### Jak bezpiecznie wywołać zdarzenie w kodzie wielowątkowym? {senior}

`Shipped?.Invoke(this, args)`. Operator `?.` odczytuje pole zdarzenia **raz** do lokalnej kopii, więc
między sprawdzeniem `null` a wywołaniem inny wątek nie może go wyzerować (starszy wzorzec to
`var handler = Shipped; if (handler != null) handler(...)`). Delegaty są niemutowalne, a domyślne
akcesory `add`/`remove` zdarzeń polowych są bezpieczne wątkowo. Subskrybent może jednak zostać wywołany
tuż po tym, jak się wypisał.

### Jaka jest konwencja deklarowania zdarzeń w .NET? {junior}

Typ `EventHandler` lub `EventHandler<TEventArgs>` z sygnaturą `(object? sender, TEventArgs e)`, gdzie
argumenty zwykle dziedziczą po `EventArgs`. Zdarzenie nazywa się czasownikiem (`Shipped`, `Changing`),
a chroniona metoda wywołująca to `OnShipped(...)`, którą klasy pochodne mogą nadpisać. Brak danych
oznacza `EventArgs.Empty`.
