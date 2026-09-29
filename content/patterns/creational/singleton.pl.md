# Singleton {junior}

**Singleton** gwarantuje, że klasa ma **tylko jedną instancję**, i daje do niej globalny punkt dostępu. To najbardziej znany
wzorzec GoF, a zarazem najbardziej krytykowany: rozmowy zwykle sprawdzają, czy umiesz go zaimplementować bezpiecznie wątkowo
i czy wiesz, dlaczego we współczesnym .NET lepiej, żeby jedną instancją zarządzał **kontener DI**.

## Implementacje w C#

```csharp
// 🔴 niebezpieczne wątkowo: dwa wątki mogą oba zobaczyć null i utworzyć dwie instancje
public sealed class NaiveSingleton
{
    private static NaiveSingleton? _instance;
    private NaiveSingleton() { }
    public static NaiveSingleton Instance => _instance ??= new NaiveSingleton();
}

// ✅ Lazy<T>: leniwie i bezpiecznie wątkowo (domyślny tryb ExecutionAndPublication)
public sealed class Configuration
{
    private static readonly Lazy<Configuration> _instance = new(() => new Configuration());
    private Configuration() { }
    public static Configuration Instance => _instance.Value;
}

// ✅ pole static readonly: bezpieczne wątkowo dzięki gwarancjom inicjalizacji typów w CLR
public sealed class Clock
{
    public static readonly Clock Instance = new();
    private Clock() { }
}
```

W teście z 16 wątkami sięgającymi po instancję jednocześnie naiwna wersja wywołała konstruktor **16 razy**, a `Lazy<T>`, pole
`static readonly` i podwójnie sprawdzana blokada wywołały go dokładnie raz. Podwójnie sprawdzana blokada działa (z `volatile`),
ale `Lazy<T>` osiąga to samo z mniejszym polem do błędów.

Kluczowe elementy: **prywatny konstruktor**, klasa `sealed` (żeby podklasa nie mogła tworzyć kolejnych instancji) i statyczny
punkt dostępu.

## Dlaczego singleton uchodzi za antywzorzec (w klasycznej formie)

- **Ukryta zależność**: kod wywołujący `Configuration.Instance` nie deklaruje zależności w konstruktorze, więc jest niewidoczna
  i trudna do podmiany.
- **Globalny mutowalny stan**: każdy kod może go zmienić, co wiąże niezwiązane części i powoduje błędy zależne od kolejności.
- **Trudny do testowania**: testy nie mogą podstawić atrapy, a stan przecieka między testami.
- **Łamie SRP**: klasa zarządza zarówno swoim zachowaniem, jak i własnym czasem życia.
- **Bezpieczeństwo wątkowe** stanu samej instancji nadal jest twoją odpowiedzialnością.

## Nowoczesna alternatywa: czas życia singleton w DI

```csharp
builder.Services.AddSingleton<IExchangeRateCache, ExchangeRateCache>();

public class PriceService(IExchangeRateCache cache) { ... }   // zależność jest jawna i wymienialna
```

Kontener gwarantuje jedną instancję na aplikację, klasa pozostaje zwykłą klasą z publicznym konstruktorem, zależności są jawne,
a testy mogą przekazać atrapę. Dobrzy kandydaci na jedną instancję: cache, konfiguracja, handlery `HttpClient` (przez
`IHttpClientFactory`), bezstanowe serwisy. Muszą być bezpieczne wątkowo.

## Gdzie spotkasz go w .NET

`TimeProvider.System`, `StringComparer.Ordinal`, `ArrayPool<T>.Shared`, `EqualityComparer<T>.Default`: współdzielone,
bezstanowe albo bezpieczne wątkowo instancje udostępnione jako właściwości statyczne, co jest akceptowalnym użyciem wzorca.

## Źródła

- [Singleton (refactoring.guru)](https://refactoring.guru/design-patterns/singleton)
- [Implementing the singleton pattern in C# (Jon Skeet)](https://csharpindepth.com/articles/singleton)
- [Lazy&lt;T&gt; class](https://learn.microsoft.com/en-us/dotnet/api/system.lazy-1)
- [Service lifetimes (.NET DI)](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview)

## Pytania

### Czym jest wzorzec singleton? {junior}

To wzorzec kreacyjny, który gwarantuje, że klasa ma tylko jedną instancję, i daje do niej globalny punkt dostępu. Implementuje się go przez prywatny konstruktor, statyczne
pole trzymające instancję i statyczną właściwość lub metodę ją zwracającą. Typowe przykłady to konfiguracja, logowanie czy cache, choć we współczesnym .NET czas życia
singleton w kontenerze DI zwykle zastępuje ręcznie pisany wzorzec.

### Jak zaimplementować bezpieczny wątkowo singleton w C#? {mid}

Najprościej przez pole `static readonly` inicjalizowane w miejscu deklaracji, które CLR inicjalizuje raz w sposób bezpieczny wątkowo, albo przez `Lazy<T>` z domyślnym trybem
`ExecutionAndPublication`, które dodatkowo odkłada tworzenie do pierwszego użycia. Podwójnie sprawdzana blokada z polem `volatile` i `lock` też działa, ale łatwo o błąd. Naiwne
`if (_instance == null) _instance = new()` nie jest bezpieczne wątkowo: w teście z 16 wątkami utworzyło 16 instancji.

### Dlaczego singleton często nazywa się antywzorcem? {mid}

Bo klasyczna forma wprowadza globalny stan dostępny przez właściwość statyczną: zależności są ukryte (niewidoczne w konstruktorach), niezwiązany kod zostaje sprzężony przez
wspólny mutowalny stan, testy nie mogą podmienić instancji, a stan przecieka między nimi, do tego klasa miesza swoje odpowiedzialności z zarządzaniem czasem życia. Problemem
nie jest posiadanie jednej instancji, tylko sposób dostępu do niej.

### Czym singleton w DI różni się od wzorca singleton? {mid}

Przy `AddSingleton<IService, Service>()` kontener zapewnia jedną instancję na aplikację, ale sama klasa jest zwyczajna: publiczny konstruktor, brak statycznego dostępu,
wstrzyknięte zależności. Konsumenci deklarują ją jako zależność konstruktora, więc jest jawna i wymienialna w testach. Wzorzec natomiast wymusza jedną instancję wewnątrz klasy
i udostępnia ją globalnie.

### Do czego służy `Lazy<T>`? {junior}

Odkłada utworzenie wartości do pierwszego dostępu przez `.Value` i domyślnie gwarantuje bezpieczną wątkowo, jednokrotną inicjalizację
(`LazyThreadSafetyMode.ExecutionAndPublication`). Poza singletonami używa się go dla kosztownych obiektów, które mogą nie być potrzebne, np. ciężkiego parsera albo połączenia
tworzonego dopiero przy użyciu danej funkcji. Fabryka wykonuje się najwyżej raz, a w tym trybie wyjątki z niej są zapamiętywane.

### Dlaczego klasa singletonu jest zwykle `sealed` z prywatnym konstruktorem? {junior}

Prywatny konstruktor uniemożliwia innemu kodowi tworzenie instancji przez `new`, a `sealed` blokuje dziedziczenie, bo klasa pochodna mogłaby inaczej tworzyć dodatkowe
instancje przez własny konstruktor (klasa pochodna może wywołać prywatny konstruktor tylko wtedy, gdy jest zagnieżdżona, ale zapieczętowanie jasno pokazuje intencję). Razem
wymuszają regułę „tylko jedna instancja”.

### Jakie problemy powodują singletony w testach jednostkowych? {mid}

Testy nie mogą podstawić atrapy za singleton dostępny statycznie, więc kod, który go używa, ciągnie prawdziwe zachowanie (prawdziwy zegar, prawdziwy cache, prawdziwe
połączenie). Stan zapisany w singletonie przetrwa między testami, więc kolejność testów może zmieniać wyniki, a testy równoległe sobie przeszkadzają. Wstrzyknięcie zależności
przez interfejs rozwiązuje oba problemy.

### Czy singleton musi być bezpieczny wątkowo także poza tworzeniem? {mid}

Tak. Bezpieczne tworzenie gwarantuje tylko jedną instancję; potem jest ona współdzielona przez wszystkie wątki, więc każdy mutowalny stan w niej (słownik cache, liczniki)
wymaga bezpiecznych wątkowo struktur (`ConcurrentDictionary`, `Interlocked`, blokady) albo niemutowalności. Dotyczy to tak samo singletonów w DI: serwis singleton z polem
niebezpiecznym wątkowo to częste źródło błędów współbieżności.

### Podaj przykłady instancji podobnych do singletonu w .NET. {junior}

`TimeProvider.System`, `StringComparer.Ordinal`, `EqualityComparer<T>.Default`, `ArrayPool<T>.Shared` i `Encoding.UTF8` to współdzielone instancje udostępnione jako właściwości
statyczne. Są bezstanowe albo wewnętrznie bezpieczne wątkowo, co czyni statyczny dostęp akceptowalnym. W aplikacjach `IHttpClientFactory` zarządza współdzielonymi handlerami,
żeby `HttpClient` nie wyczerpywał gniazd.

### Kiedy ręcznie pisany singleton nadal ma sens? {senior}

Dla naprawdę bezstanowych lub niemutowalnych obiektów, gdzie DI nic by nie dodało (porównywarki, null objecty, zapamiętane instancje domyślne), w kodzie bibliotek, które nie
mogą zakładać kontenera DI, albo dla niskopoziomowej infrastruktury potrzebnej, zanim kontener powstanie. Nawet wtedy najlepiej udostępnić go jako implementację interfejsu,
żeby konsumenci mogli dostać go przez DI, a testy go podmienić.
