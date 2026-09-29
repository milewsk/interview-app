# OOP, dziedziczenie i interfejsy w C# {mid}

C# to język obiektowy z pojedynczym dziedziczeniem klas i wielokrotną implementacją interfejsów. Pytania na
rozmowach sprawdzają cztery filary i przede wszystkim praktyczne mechanizmy: `virtual`/`override`, `new`, klasy
abstrakcyjne kontra interfejsy oraz nowoczesne możliwości interfejsów.

## Cztery filary

- **Hermetyzacja** (enkapsulacja): ukrycie stanu za publicznym API (prywatne pola, właściwości, metody pilnujące
  niezmienników).
- **Abstrakcja**: udostępnienie tego, *co* obiekt robi, a nie *jak* (interfejsy, klasy abstrakcyjne).
- **Dziedziczenie**: klasa pochodna ponownie używa i rozszerza klasę bazową. C# pozwala na **jedną** klasę bazową.
- **Polimorfizm**: wywołanie przez typ bazowy uruchamia implementację faktycznego typu (`virtual`/`override`,
  interfejsy).

## Modyfikatory dostępu

`public`, `private` (domyślny dla składowych klasy), `protected` (klasa i pochodne), `internal` (domyślny dla typów
najwyższego poziomu; to samo assembly), `protected internal` (pochodne **lub** to samo assembly), `private protected`
(pochodne **i** to samo assembly), `file` (C# 11; widoczny tylko w jednym pliku, używany przez generatory kodu).

## `virtual`, `override`, `new`, `sealed`

```csharp
Animal a = new Dog();
a.Speak();      // "woof": override, decyduje faktyczny typ
a.Describe();   // "animal": new ukrywa metodę, decyduje typ zmiennej
((Dog)a).Describe();   // "dog"

class Animal
{
    public virtual string Speak() => "...";
    public string Describe() => "animal";
}

class Dog : Animal
{
    public override string Speak() => "woof";
    public new string Describe() => "dog";   // ukrycie, nie nadpisanie
}
```

- Metody są **domyślnie niewirtualne** (inaczej niż w Javie). Polimorfizm wymaga `virtual` (lub `abstract`) w bazie
  i `override` w klasie pochodnej.
- `new` **ukrywa** składową: o wersji decyduje typ zmiennej znany podczas kompilacji. Bez `new` kompilator ostrzega
  (CS0108). Zwykle to sygnał problemu w projekcie.
- `sealed` na klasie blokuje dziedziczenie (CS0509), a `sealed override` blokuje dalsze nadpisywanie. Domyślne
  pieczętowanie klas pomaga JIT-owi (dewirtualizacja) i jasno pokazuje intencję.
- `base.Method()` wywołuje implementację bazową.

**Pułapka:** wywołanie metody wirtualnej w konstruktorze bazowym uruchamia nadpisanie z klasy **pochodnej** przed
ciałem jej konstruktora. Inicjalizatory pól klasy pochodnej już się wykonały, ale pola ustawiane w jej konstruktorze
mają jeszcze wartości domyślne.

## Klasa abstrakcyjna a interfejs

```csharp
public abstract class Shape
{
    public abstract double Area();                     // trzeba zaimplementować
    public override string ToString() => $"{GetType().Name}: {Area():F2}";   // wspólny kod
}

public interface ILogger
{
    void Log(string message);
    void LogError(string message) => Log($"ERROR: {message}");   // domyślna implementacja (C# 8)
}
```

| | Klasa abstrakcyjna | Interfejs |
|---|---|---|
| Ile na typ | jedna klasa bazowa | dowolnie wiele |
| Stan (pola instancji) | tak | nie |
| Konstruktory | tak | nie |
| Implementacja | tak | metody domyślne (C# 8+), składowe statyczne |
| Modyfikatory dostępu składowych | dowolne | domyślnie publiczne |
| Mogą jej użyć struktury | nie | tak |

Reguła kciuka: **interfejs** opisuje zdolność lub kontrakt („da się zalogować”, „da się porównać”) i jest podstawą
DI oraz testów z mockami. **Klasa abstrakcyjna** ma sens, gdy spokrewnione typy współdzielą stan i kod (metoda
szablonowa).

## Nowoczesne możliwości interfejsów

- **Domyślne metody interfejsu** (C# 8): metoda z ciałem. Jest dostępna tylko **przez interfejs**:
  `new ConsoleLogger().LogError("x")` się nie skompiluje (CS1061), a `((ILogger)logger).LogError("x")` tak. Pozwalają
  dodać składową do opublikowanego interfejsu bez psucia implementacji.
- **Statyczne abstrakcyjne składowe** (C# 11): interfejs może wymagać statycznych składowych i operatorów, co umożliwia
  generyczną matematykę:

```csharp
static T Sum<T>(IEnumerable<T> items) where T : IAdditionOperators<T, T, T>, IAdditiveIdentity<T, T>
{
    var total = T.AdditiveIdentity;
    foreach (var item in items) total += item;
    return total;
}
```

- **Jawna implementacja**: `string IStore.Save() => ...` jest widoczna tylko przez interfejs. Rozwiązuje konflikty
  nazw dwóch interfejsów i ukrywa składowe, które nie powinny być częścią publicznego API klasy.

## Kompozycja zamiast dziedziczenia

Głębokie hierarchie dziedziczenia są kruche: zmiana w bazie wpływa na wszystkie klasy pochodne (problem kruchej
klasy bazowej), a klasa pochodna zależy od szczegółów implementacji. Współczesny domyślny wybór: małe interfejsy,
kompozycja (obiekt **ma** współpracowników wstrzykniętych przez konstruktor) i zapieczętowane klasy. Dziedziczenie
zostaje dla prawdziwych relacji „jest” i punktów rozszerzeń frameworków.

## Źródła

- [Object-oriented programming (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/tutorials/oop)
- [Polymorphism](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/object-oriented/polymorphism)
- [Interfaces (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/interface)
- [Explore static virtual members in interfaces](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/tutorials/static-virtual-interface-members)
- [Access modifiers](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/access-modifiers)

## Pytania

### Jakie są cztery filary programowania obiektowego? {junior}

Hermetyzacja (ukrycie stanu za API pilnującym niezmienników), abstrakcja (udostępnienie tego, co obiekt robi, a nie jak), dziedziczenie
(ponowne użycie i rozszerzenie klasy bazowej) i polimorfizm (wywołanie przez typ bazowy lub interfejs uruchamia implementację faktycznego
obiektu). W C# dziedziczenie klas jest pojedyncze, a polimorfizm realizują `virtual`/`override` i interfejsy.

### Czym różni się `override` od `new` przy metodzie? {mid}

`override` zastępuje implementację metody `virtual`, więc wywołanie przez referencję typu bazowego uruchomi wersję pochodną (decyduje typ
obiektu w czasie wykonania). `new` ukrywa składową: wywołanie przez zmienną typu bazowego uruchomi wersję bazową, a przez zmienną typu
pochodnego nową, więc decyduje typ znany podczas kompilacji. `new` rzadko ma sens i zwykle sygnalizuje problem w projekcie.

### Czy metody w C# są domyślnie wirtualne? {junior}

Nie. W przeciwieństwie do Javy metody w C# są domyślnie niewirtualne, a polimorficzne nadpisanie wymaga oznaczenia metody jako `virtual` lub
`abstract` w klasie bazowej i `override` w pochodnej. Chroni to klasę bazową przed niezamierzonym nadpisaniem i pomaga JIT-owi (wywołania
bezpośrednie, inlining).

### Kiedy wybrać klasę abstrakcyjną, a kiedy interfejs? {mid}

Interfejs opisuje kontrakt lub zdolność, może go implementować wiele niepowiązanych typów (także struktury) i jest podstawą DI oraz mockowania.
Klasa abstrakcyjna ma sens, gdy spokrewnione typy współdzielą stan (pola), konstruktory i implementację, np. metodę szablonową. Typ może
implementować wiele interfejsów, ale dziedziczyć tylko jedną klasę, więc interfejsy są domyślnym wyborem.

### Czym są domyślne metody interfejsu i do czego służą? {mid}

Od C# 8 składowa interfejsu może mieć ciało. Klasa implementująca nie musi dostarczać tej składowej, a metoda jest dostępna tylko przez
referencję typu interfejsu, nie bezpośrednio na klasie. Głównym celem jest ewolucja opublikowanego interfejsu: dodanie składowej bez psucia
istniejących implementacji. Są też podstawą API w stylu traitów.

### Do czego służą statyczne abstrakcyjne składowe w interfejsach? {senior}

Od C# 11 interfejs może wymagać składowych statycznych, w tym operatorów i stałych (`static abstract T Zero { get; }`). W połączeniu
z ograniczeniami pozwala to pisać generyczne algorytmy wywołujące statyczne składowe na `T`, np. `T.AdditiveIdentity` i `+`. To podstawa
generycznej matematyki w .NET (`INumber<T>`, `IAdditionOperators<...>`), dzięki której jedna metoda `Sum<T>` działa dla `int`, `double`
i `decimal`.

### Co się dzieje, gdy konstruktor klasy bazowej wywołuje metodę wirtualną? {senior}

Wykonuje się nadpisanie z klasy pochodnej, choć ciało konstruktora pochodnego jeszcze się nie wykonało. Inicjalizatory pól klasy pochodnej
już zadziałały (wykonują się przed wywołaniem konstruktora bazowego), ale pola ustawiane w jej konstruktorze mają jeszcze wartości domyślne.
Prowadzi to do `NullReferenceException` albo złego stanu, dlatego należy unikać wywoływania składowych wirtualnych w konstruktorach.

### Czym jest jawna implementacja interfejsu? {mid}

Implementacja składowej z nazwą interfejsu (`string IStore.Save() => ...`) sprawia, że jest ona dostępna tylko przez referencję typu
interfejsu, nie na klasie. Używa się jej do rozwiązania konfliktu, gdy dwa interfejsy mają składową o tej samej sygnaturze, i do ukrycia
składowych, które nie powinny być częścią publicznego API klasy (np. niegeneryczne `IEnumerable.GetEnumerator`).

### Co robi `sealed` i po co pieczętować klasy? {mid}

Na klasie blokuje dziedziczenie, a na metodzie `override` blokuje dalsze nadpisywanie w klasach pochodnych. Pieczętowanie pokazuje intencję
(klasa nie jest projektowana do rozszerzania), chroni niezmienniki i pozwala JIT-owi zamienić wywołania wirtualne na bezpośrednie
(dewirtualizacja). Wiele zespołów domyślnie pieczętuje klasy i odpieczętowuje je dopiero w razie potrzeby.

### Dlaczego zaleca się „kompozycję zamiast dziedziczenia”? {mid}

Dziedziczenie mocno wiąże klasę pochodną ze szczegółami implementacji bazy: zmiana w bazie może zepsuć wszystkie pochodne, a głębokie
hierarchie są trudne do zrozumienia i sztywne (klasa może mieć tylko jedną bazę). Kompozycja buduje zachowanie z małych obiektów wstrzykiwanych
przez interfejsy, które łatwiej wymienić, testować i łączyć. Dziedziczenie zostaje dla prawdziwych relacji „jest”.
