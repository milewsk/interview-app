# Budowniczy i prototyp (builder, prototype) {mid}

**Budowniczy** (builder) tworzy złożony obiekt krok po kroku, oddzielając proces konstrukcji od końcowej reprezentacji.
**Prototyp** (prototype) tworzy nowe obiekty przez **kopiowanie** istniejącego. Oba to wzorce kreacyjne stale obecne w .NET:
`StringBuilder`, `WebApplication.CreateBuilder()`, buildery danych testowych, rekordy z `with`, `MemberwiseClone`.

## Budowniczy

```csharp
var email = new EmailBuilder()
    .To("ada@x.io")
    .Cc("bob@x.io")
    .Subject("Hi")
    .Body("Hello")
    .Build();          // waliduje i tworzy niemutowalny Email

public sealed class EmailBuilder
{
    private string? _to; private string _subject = ""; private string _body = ""; private readonly List<string> _cc = [];
    public EmailBuilder To(string to) { _to = to; return this; }        // każdy krok zwraca builder (płynny interfejs)
    public EmailBuilder Cc(string cc) { _cc.Add(cc); return this; }
    ...
    public Email Build() => _to is null
        ? throw new InvalidOperationException("Recipient is required")
        : new Email(_to, _cc.ToList(), _subject, _body);
}
```

- Przydaje się, gdy obiekt ma **wiele opcjonalnych parametrów** (zamiast „teleskopowego konstruktora” z dziesięcioma
  przeciążeniami), jest budowany w **kilku krokach** albo musi być **zwalidowany jako całość**, zanim powstanie (w teście
  `Build()` bez odbiorcy rzuciło „Recipient is required”).
- Produkt może być **niemutowalny**: builder trzyma mutowalny stan, a `Build()` tworzy obiekt końcowy.
- **Buildery danych testowych**: `new OrderBuilder().WithCustomer("Ada").WithLine("PEN", 2).Build()` daje poprawne wartości
  domyślne dla wszystkiego, co test pomija, co utrzymuje testy krótkie i odporne na zmiany modelu.
- W .NET: `StringBuilder`, `WebApplication.CreateBuilder(args)` (konfiguracja serwisów, potem `Build()`),
  `ConfigurationBuilder`, `HostApplicationBuilder`, `DbContextOptionsBuilder`, `UriBuilder`.
- We współczesnym C# inicjalizatory obiektów z właściwościami `required`/`init` pokrywają wiele prostych przypadków bez
  buildera; builder opłaca się przy złożonej konstrukcji albo walidacji.

## Prototyp

Nowe obiekty tworzy się, klonując skonfigurowaną instancję zamiast budować od zera, co przydaje się, gdy konstrukcja jest
kosztowna albo to konfiguracja obiektu jest istotna (szablony, gotowe dokumenty, ustawienia domyślne).

```csharp
var copy = (Document)original.MemberwiseClone();    // płytka kopia
var modified = config with { Env = "test" };         // rekordy: płytka kopia ze zmianami
```

Kluczowy szczegół to **kopia płytka a głęboka**:

- **Płytka**: pola kopiuje się tak, jak są, więc pola typów referencyjnych (listy, obiekty zagnieżdżone) wskazują **te same**
  obiekty. W teście dodanie tagu do kopii zrobionej przez `MemberwiseClone` zmieniło też listę oryginału, podobnie jak dodanie
  do listy w rekordzie skopiowanym przez `with`.
- **Głęboka**: obiekty zagnieżdżone też są kopiowane, więc kopia jest w pełni niezależna. Opcje: ręcznie pisane metody
  kopiujące albo konstruktory kopiujące (jawne i szybkie), serializacja w obie strony (np. JSON: proste, ale wolniejsze
  i ograniczone do danych serializowalnych; sprawdzone, że rozdzieliło listy) albo dane niemutowalne, przy których
  współdzielenie jest bezpieczne, a kopiowanie niepotrzebne.
- `ICloneable` jest odradzany: jego kontrakt nie mówi, czy `Clone()` jest płytkie, czy głębokie, i zwraca `object`.

## Źródła

- [Builder (refactoring.guru)](https://refactoring.guru/design-patterns/builder)
- [Prototype (refactoring.guru)](https://refactoring.guru/design-patterns/prototype)
- [Object.MemberwiseClone](https://learn.microsoft.com/en-us/dotnet/api/system.object.memberwiseclone)
- [Records: nondestructive mutation](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)

## Pytania

### Jaki problem rozwiązuje wzorzec budowniczego? {junior}

Konstruowanie złożonych obiektów z wieloma opcjonalnymi częściami albo w kilku krokach, bez ogromnych konstruktorów z wieloma przeciążeniami (problem teleskopowego konstruktora)
i bez obiektów zainicjalizowanych w połowie. Builder zbiera konfigurację krok po kroku, zwykle przez płynny interfejs, a `Build()` ją waliduje i tworzy końcowy, często
niemutowalny obiekt. Czyni konstrukcję czytelną i trzyma walidację w jednym miejscu.

### Gdzie widać wzorzec budowniczego w .NET? {junior}

`StringBuilder` (budowanie tekstu krokami), `WebApplication.CreateBuilder(args)` i `HostApplicationBuilder` (konfiguracja serwisów i ustawień, potem `Build()` aplikacji),
`ConfigurationBuilder`, `DbContextOptionsBuilder`, `UriBuilder` i wiele płynnych API w bibliotekach. W testach częstym zastosowaniem są buildery danych testowych.

### Czym jest builder danych testowych? {mid}

To builder używany w testach do tworzenia obiektów z sensownymi wartościami domyślnymi, nadpisujący tylko to, czego dotyczy test: `new OrderBuilder().WithCustomer("Ada").Build()`.
Testy stają się krótsze i skupione na istotnych danych, a gdy model dostaje nową wymaganą właściwość, zmienia się tylko wartość domyślna w builderze zamiast każdego testu. Często
łączy się go z generatorami losowych lub anonimowych danych.

### Kiedy builder jest lepszy niż inicjalizatory obiektów z właściwościami `required`? {mid}

Inicjalizatory wystarczą dla prostych obiektów o niezależnych właściwościach. Builder jest lepszy, gdy konstrukcja ma reguły obejmujące kilka wartości (walidacja całego obiektu),
opcjonalne części dodawane krok po kroku (kolekcje, części warunkowe), gdy produkt ma być niemutowalny i powstawać tylko jako poprawny, albo gdy konstrukcja to proces, który
warto nazwać (konfiguracja hosta aplikacji).

### Czym jest wzorzec prototypu? {junior}

To tworzenie nowych obiektów przez kopiowanie istniejącej instancji (prototypu) zamiast konstruowania ich od zera. Przydaje się, gdy tworzenie obiektu jest kosztowne albo gdy
chce się ponownie użyć jego wstępnie skonfigurowanego stanu (szablony, konfiguracje domyślne). W .NET implementuje się go przez `MemberwiseClone`, konstruktory kopiujące, rekordy
z `with` albo własne metody `Clone`/`Copy`.

### Czym kopia płytka różni się od głębokiej? {mid}

Kopia płytka kopiuje pola obiektu tak, jak są: typy wartościowe są duplikowane, ale pola typów referencyjnych nadal wskazują te same obiekty zagnieżdżone, więc zmiana listy w kopii
zmienia ją też w oryginale (sprawdzone z `MemberwiseClone` i z `with` rekordu). Kopia głęboka kopiuje też rekurencyjnie wskazywane obiekty, czyniąc kopię w pełni niezależną.
Wybór zależy od tego, czy obiekty zagnieżdżone mają być współdzielone.

### Kiedy wzorzec prototypu przydaje się w praktyce? {mid}

Gdy tworzenie obiektu od zera jest kosztowne albo złożone (sparsowany szablon, skonfigurowany dokument, obiekt gry z wieloma komponentami), a nowe obiekty różnią się niewiele:
klonuje się wstępnie skonfigurowany prototyp i dostosowuje go, być może z rejestru prototypów po nazwie. W C# rekordy z `with` dają kopiowanie w stylu prototypu dla
niemutowalnych danych. W kodzie biznesowym jest rzadszy, bo fabryki albo buildery zwykle wyrażają tworzenie czytelniej.

### Dlaczego odradza się `ICloneable`? {senior}

Jego kontrakt nie określa, czy `Clone()` wykonuje kopię płytką, czy głęboką, więc wywołujący nie mogą polegać na żadnym zachowaniu, a do tego zwraca `object`, co wymaga rzutowania.
Wytyczne projektowania frameworków zalecają, żeby nie implementować go w publicznych API; zamiast tego udostępnia się jawnie nazwane metody (`ShallowCopy`, `DeepCopy`), konstruktory
kopiujące albo używa typów niemutowalnych i rekordów.

### Jak zaimplementować głęboką kopię w C#? {mid}

Opcje: jawne metody kopiujące albo konstruktory kopiujące, które kopiują obiekty zagnieżdżone (szybkie, bezpieczne typowo, ale wymagają utrzymania przy zmianie pól); serializacja
w obie strony (np. do JSON i z powrotem, co jest proste, ale wolniejsze, działa tylko dla danych serializowalnych i gubi stan nieserializowany); albo klonowanie generowane kodem lub
biblioteką mapującą. Często lepszą odpowiedzią jest uczynienie danych zagnieżdżonych niemutowalnymi, żeby ich współdzielenie było bezpieczne, a głęboka kopia niepotrzebna.

### Czym budowniczy różni się od fabryki abstrakcyjnej? {senior}

Fabryka abstrakcyjna tworzy rodziny powiązanych obiektów, zwykle każdy jednym wywołaniem, i ukrywa, jakie konkretne klasy są używane. Budowniczy skupia się na konstruowaniu jednego
złożonego obiektu krok po kroku, pozwalając klientowi sterować procesem konstrukcji i dając wynik na końcu. Builder może wewnętrznie używać fabryk, a jedno API buildera może budować
różne reprezentacje (oryginalny builder GoF miał dyrektora i wymienne konkretne buildery).
