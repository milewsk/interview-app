# Klasy, struktury i rekordy {mid}

C# ma cztery „kształty” typów definiowanych przez użytkownika: `class`, `struct`, `record` (rekord klasowy)
i `record struct`. Wybór decyduje o **semantyce kopiowania** (referencja czy wartość) i **semantyce równości**
(tożsamość czy dane).

| | `class` | `struct` | `record` / `record class` | `record struct` |
|---|---|---|---|---|
| Rodzaj | referencyjny | wartościowy | referencyjny | wartościowy |
| `==` domyślnie | tożsamość (ten sam obiekt) | niezdefiniowany (trzeba przeciążyć) | porównuje dane | porównuje dane |
| `Equals` | tożsamość | pole po polu (refleksja, wolne) | generowany, po danych | generowany, po danych |
| Dziedziczenie | tak | nie | tylko z rekordów | nie |
| `with` | nie | tak (C# 10+) | tak | tak |
| Generowany `ToString` | nie | nie | `Typ { A = 1, B = 2 }` | `Typ { A = 1, B = 2 }` |

## Rekordy

```csharp
public record Person(string Name, int Age);          // rekord pozycyjny: właściwości init-only

var a = new Person("Ada", 36);
var b = new Person("Ada", 36);
Console.WriteLine(a == b);                    // True: równość po danych
Console.WriteLine(ReferenceEquals(a, b));     // False: dwa obiekty
Console.WriteLine(a);                         // Person { Name = Ada, Age = 36 }

var older = a with { Age = 37 };              // niedestrukcyjna mutacja: kopia ze zmianą
var (name, age) = a;                          // wygenerowany Deconstruct
```

- Rekord pozycyjny generuje konstruktor, właściwości **init-only**, `Deconstruct`, `Equals`/`GetHashCode`,
  `==`/`!=`, `ToString` i konstruktor kopiujący używany przez `with`.
- Równość porównuje **wartości pól**, ale dla pól typów referencyjnych używa ich własnego `Equals`. `List<string>`
  w rekordzie porównywana jest **po referencji**, więc dwa rekordy z identycznymi listami nie są równe.
- `with` robi **płytką kopię**: lista w środku jest współdzielona przez oryginał i kopię.
- Równość uwzględnia też **typ w czasie wykonania** (`EqualityContract`): rekord `Employee : Person` nigdy nie jest
  równy `Person` z tymi samymi `Name` i `Age`.
- Rekordy idealnie pasują do DTO, komunikatów, value objectów w DDD i wyników zapytań. Do encji EF Core, które mają
  tożsamość i zmieniają stan, lepsza jest zwykła klasa.

## Struktury

```csharp
public readonly struct Money(decimal amount, string currency)
{
    public decimal Amount { get; } = amount;
    public string Currency { get; } = currency;
}
```

- Wartość jest **kopiowana** przy przypisaniu, przekazaniu do metody i zwróceniu. Kopia dużej struktury kosztuje
  więcej niż kopia referencji.
- Struktura nie ma nagłówka obiektu i nie wymaga osobnej alokacji na stercie (jeśli nie jest opakowana), co zmniejsza
  obciążenie GC.
- `default(T)` jest zawsze dostępne i zeruje wszystkie pola, więc struktura musi mieć sens w stanie „zerowym”.
- Wytyczne: mała (Microsoft zaleca poniżej 16 bajtów), **niemutowalna** (`readonly struct`), reprezentująca jedną
  wartość (punkt, kwota, zakres).
- Mutowalna struktura to pułapka: `list[0].X = 3` się nie skompiluje (CS1612), bo indeksator zwraca **kopię**,
  a `array[0].X = 3` działa, bo element tablicy jest zmienną.
- Domyślne `Equals` struktury porównuje pola przez refleksję, więc jest wolne. Warto zaimplementować `IEquatable<T>`
  albo użyć `record struct`.

`record struct` generuje równość, `ToString` i `with` jak rekord. Jego właściwości pozycyjne są **mutowalne**, chyba
że zadeklaruje się go jako `readonly record struct`.

## `init`, `required` i konstruktory główne

```csharp
public class Order
{
    public required int Id { get; init; }   // musi być ustawione w inicjatorze (inaczej CS9035)
    public string? Note { get; init; }      // można ustawić tylko przy inicjalizacji (później CS8852)
}

var order = new Order { Id = 1 };

public class Service(string connectionString)      // konstruktor główny (C# 12)
{
    public string Describe() => $"uses {connectionString}";
}
```

- `init` pozwala przypisać wartość tylko w inicjatorze obiektu, konstruktorze albo `with`. Daje niemutowalność bez
  rozbudowanych konstruktorów.
- `required` wymusza, by wywołujący ustawił składową w inicjatorze. Sprawdza to kompilator.
- Parametry konstruktora głównego w **klasie lub strukturze** **nie** są właściwościami: to parametry widoczne
  w całym ciele (przechwytywane w ukrytych polach, gdy używają ich składowe) i są mutowalne. Dopiero w **rekordzie**
  stają się publicznymi właściwościami.

## Jak wybrać

- **`class`**: wybór domyślny. Obiekt z tożsamością i zachowaniem, zmieniający stan (encje, serwisy).
- **`record`**: niemutowalne dane, w których liczy się równość po wartości (DTO, zdarzenia, komunikaty, value objecty).
- **`struct` / `readonly record struct`**: małe, często tworzone wartości, gdzie liczy się uniknięcie alokacji
  (współrzędne, identyfikatory, kwoty).

## Źródła

- [Records (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)
- [Structure types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/struct)
- [Choosing between class and struct](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/choosing-between-class-and-struct)
- [The init keyword](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/init)
- [The required modifier](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/required)
- [Primary constructors](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/tutorials/primary-constructors)

## Pytania

### Czym różni się `record` od `class`? {junior}

Oba są typami referencyjnymi, ale rekord generuje równość po danych (`Equals`, `GetHashCode`, `==`), czytelny `ToString`, `Deconstruct`
i obsługę `with`. Właściwości pozycyjne są init-only, więc rekordy zachęcają do niemutowalności. Dwa rekordy z tymi samymi danymi są równe,
a dwa obiekty klasy z tymi samymi danymi są równe tylko wtedy, gdy to ten sam obiekt.

### Czym różni się `struct` od `class`? {junior}

Struktura to typ wartościowy: przypisanie i przekazanie kopiują całą wartość, nie ma nagłówka obiektu ani osobnej alokacji na stercie (chyba
że zostanie opakowana). Nie może dziedziczyć po innych typach (może implementować interfejsy) i zawsze ma wartość `default` z wyzerowanymi
polami. Klasa to typ referencyjny: przypisanie kopiuje referencję do tego samego obiektu, a obiekty sprząta GC.

### Co robi `with` i czy kopia jest głęboka? {mid}

Tworzy nową instancję rekordu z tymi samymi wartościami, zmieniając wskazane właściwości (niedestrukcyjna mutacja). Kopia jest płytka: pola
typów referencyjnych (np. `List<T>`) wskazują ten sam obiekt w oryginale i kopii, więc zmiana listy przez jedno z nich jest widoczna
w drugim. Przy pełnej niemutowalności używa się kolekcji niemutowalnych.

### Czy dwa rekordy z identycznymi właściwościami `List<string>` są równe? {mid}

Nie, chyba że to ta sama instancja listy. Wygenerowane `Equals` porównuje każde pole przez `EqualityComparer<T>.Default`, a dla `List<T>`
oznacza to porównanie referencji. Jeśli potrzebna jest równość po zawartości kolekcji, trzeba nadpisać `Equals` w rekordzie albo użyć typu
z równością strukturalną.

### Co oznacza `init` i czym różni się od `required`? {mid}

`init` to setter działający tylko podczas inicjalizacji: w inicjatorze obiektu, konstruktorze albo `with`. Później przypisanie to błąd
kompilacji (CS8852). `required` oznacza, że wywołujący musi ustawić składową w inicjatorze (inaczej CS9035). Często się je łączy:
`required ... { get; init; }` to obowiązkowa, niemutowalna właściwość bez rozbudowanego konstruktora.

### Kiedy warto wybrać `struct`? {mid}

Gdy typ reprezentuje małą, pojedynczą wartość (np. punkt, kwotę, identyfikator), jest niemutowalny i tworzy się go często, więc uniknięcie
alokacji na stercie daje realny zysk. Wytyczna Microsoftu to instancja poniżej 16 bajtów, która nie będzie często opakowywana. Duże albo
mutowalne struktury powodują kosztowne kopiowanie i subtelne błędy, więc domyślnym wyborem jest klasa.

### Co daje `readonly struct`? {mid}

Kompilator wymusza, żeby wszystkie pola były tylko do odczytu (przypisanie właściwości poza inicjalizacją to błąd kompilacji: w teście `V = 5` w metodzie `readonly struct`
dało CS0200), co czyni typ niemutowalnym i bezpiecznym do kopiowania. Pozwala też kompilatorowi pominąć kopie obronne przy wywoływaniu składowych przez parametry `in` albo
pola `readonly`, które inaczej tworzy, żeby chronić oryginał przed mutacją. W strukturach, które nie mogą być w pełni niemutowalne, można oznaczać jako `readonly` pojedyncze
składowe.

### Czym różnią się konstruktory główne w klasach od tych w rekordach? {mid}

W rekordzie parametry pozycyjne stają się publicznymi właściwościami (init-only w `record class`) i biorą udział w równości oraz dekonstrukcji.
W klasie czy strukturze (C# 12+) parametry są tylko widoczne w całym ciele: kompilator przechwytuje je w ukrytych polach, gdy używają ich
składowe, są mutowalne i niepubliczne. Jeśli potrzebna jest właściwość, definiuje się ją jawnie: `public string Name { get; } = name;`.

### Czy rekord pochodny jest równy rekordowi bazowemu z tymi samymi wartościami? {senior}

Nie. Równość rekordów sprawdza typ w czasie wykonania przez generowaną właściwość `EqualityContract`, więc `Employee : Person` z tymi samymi
`Name` i `Age` co `Person` nie jest mu równy. Gwarantuje to symetrię: `a.Equals(b) == b.Equals(a)`. Rekord pochodny porównuje też swoje
dodatkowe pola.

### Po co implementować `IEquatable<T>` w strukturze? {senior}

Domyślne `ValueType.Equals` przyjmuje `object`, więc argument jest opakowywany, a gdy struktura zawiera pola referencyjne, porównuje je przez
refleksję, co jest wolne. `IEquatable<T>` daje silnie typowane `Equals(T)` bez boxingu, używane np. przez `Dictionary`, `HashSet`
i `List.Contains`. Razem z `GetHashCode` i operatorami `==`/`!=` daje pełną, szybką równość wartościową. `record struct` generuje to wszystko
automatycznie.
