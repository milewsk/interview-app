# Zasady SOLID {mid}

SOLID to zestaw pięciu zasad projektowania obiektowego spopularyzowanych przez Roberta C. Martina. Celem jest kod
**łatwy do zmiany**: nowe wymaganie powinno oznaczać dopisanie kodu, a nie edycję wielu istniejących miejsc, a zmiana
w jednym miejscu nie powinna psuć niezwiązanych miejsc. Rekruterzy oczekują wyjaśnienia każdej zasady na przykładzie
i wiedzy, kiedy jej stosowanie to przesada.

## S: zasada pojedynczej odpowiedzialności (SRP)

„Klasa powinna mieć tylko jeden powód do zmiany”. Powód do zmiany to **aktor** albo obszar: reguły biznesowe,
utrwalanie danych, formatowanie, powiadomienia.

```csharp
// 🔴 trzy powody do zmiany: reguły cenowe, baza danych, szablon e-maila
class OrderService { decimal CalculateTotal(...); void SaveToDatabase(...); void SendConfirmationEmail(...); }

// ✅ osobne odpowiedzialności, złożone przez serwis aplikacyjny
class PriceCalculator { ... }   class OrderRepository { ... }   class OrderNotifier { ... }
```

SRP to nie „jedna metoda na klasę”: chodzi o spójność. Zbyt drobny podział daje mnóstwo malutkich klas, trudnych do
ogarnięcia.

## O: zasada otwarte-zamknięte (OCP)

„Elementy oprogramowania powinny być otwarte na rozszerzenia i zamknięte na modyfikacje”: nowe zachowanie dodaje się
**dopisując kod** (nową klasę), a nie edytując rosnący `switch`.

```csharp
interface IDiscount { decimal Apply(decimal price, Customer customer); }
class VipDiscount : IDiscount { public decimal Apply(decimal p, Customer c) => c.IsVip ? p * 0.9m : p; }
class BlackFridayDiscount : IDiscount { public decimal Apply(decimal p, Customer c) => p - 5m; }

class PriceCalculator(IEnumerable<IDiscount> discounts)
{
    public decimal Final(decimal price, Customer c) => discounts.Aggregate(price, (acc, d) => d.Apply(acc, c));   // 100 → 85
}
```

Nowy rabat to nowa implementacja `IDiscount` zarejestrowana w DI; `PriceCalculator` się nie zmienia. Typowe narzędzia:
polimorfizm, strategia, dekoratory, wtyczki.

## L: zasada podstawienia Liskov (LSP)

„Podtypy muszą dać się podstawić w miejsce typów bazowych” bez łamania oczekiwań wywołującego: klasa pochodna nie może
zaostrzać warunków wstępnych, osłabiać warunków końcowych ani łamać niezmienników.

```csharp
static int AreaAfterResize(Rectangle r) { r.Width = 5; r.Height = 4; return r.Area; }

AreaAfterResize(new Rectangle());   // 20
AreaAfterResize(new Square());      // 16: kwadrat pilnuje równych boków, łamiąc oczekiwania wywołującego
```

Kwadrat „jest” prostokątem matematycznie, ale nie behawioralnie, gdy prostokąty są mutowalne. Inne klasyczne naruszenia:
nadpisanie rzucające `NotSupportedException` (np. `ReadOnlyCollection<T>` implementujące `ICollection<T>.Add`) albo
podklasa ignorująca kontrakt metody. Rozwiązaniem jest zwykle inna abstrakcja, np. niemutowalne figury albo wspólny
interfejs `IShape`.

## I: zasada segregacji interfejsów (ISP)

„Klienci nie powinni być zmuszani do zależności od metod, których nie używają”. Lepsze są małe interfejsy według ról niż
jeden gruby:

```csharp
interface IReadRepository<T> { IEnumerable<T> GetAll(); }
interface IWriteRepository<T> { void Delete(T item); }
class ProductRepository : IReadRepository<Product>, IWriteRepository<Product> { ... }
```

Serwis raportowy dostaje tylko `IReadRepository<Product>` i nie może niczego usunąć; dublery testowe implementują tylko to,
co potrzebne.

## D: zasada odwrócenia zależności (DIP)

„Moduły wysokiego poziomu nie powinny zależeć od modułów niskiego poziomu; oba powinny zależeć od abstrakcji”. Logika
biznesowa definiuje interfejs, którego potrzebuje (`IClock`, `IOrderRepository`, `IPaymentGateway`), a infrastruktura go
implementuje.

```csharp
interface IClock { DateTime Now { get; } }
class GreetingService(IClock clock) { public string Greeting() => clock.Now is { Month: 12, Day: 24 } ? "Merry Christmas" : "Hello"; }

new GreetingService(new FixedClock(new DateTime(2026, 12, 24))).Greeting();   // "Merry Christmas": testowalne bez prawdziwej daty
```

DIP (zasada projektowa) to co innego niż **wstrzykiwanie zależności** (technika dostarczania zależności z zewnątrz), choć DI
to zwykły sposób stosowania DIP. W .NET wbudowaną abstrakcją czasu jest `TimeProvider`.

## Pragmatyzm

Zasady SOLID to heurystyki, a nie prawa. Stosowanie ich wszędzie tworzy zbędne interfejsy i pośredniość (`IFooService`
z jedną implementacją, która nigdy nie dostanie drugiej). Stosuje się je tam, gdzie zmiana jest prawdopodobna albo testy
potrzebują punktu zaczepienia, a prosty kod pozostawia prostym (zob. KISS i YAGNI).

## Źródła

- [Architectural principles (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles)
- [The Single Responsibility Principle (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)
- [Inversion of Control containers and the dependency injection pattern (Martin Fowler)](https://martinfowler.com/articles/injection.html)

## Pytania

### Co oznacza SOLID? {junior}

Single Responsibility (klasa ma jeden powód do zmiany), Open/Closed (rozszerzaj zachowanie dopisując kod, nie modyfikując go), Liskov Substitution (podtypy mogą
zastąpić typy bazowe bez psucia wywołujących), Interface Segregation (małe interfejsy dopasowane do klientów zamiast grubych) i Dependency Inversion (kod
wysokiego poziomu zależy od abstrakcji, a nie od konkretnych szczegółów niskiego poziomu). Razem mają dawać kod łatwy do zmiany i testowania.

### Co znaczy „jeden powód do zmiany” w SRP? {mid}

Klasa powinna obsługiwać jednego aktora albo jeden obszar, żeby zmieniała się tylko wtedy, gdy zmienia się ten obszar. Jeśli klasa liczy ceny, zapisuje zamówienia
i formatuje e-maile, to zmiana reguł cenowych, schematu bazy czy szablonu e-maila dotyka tej samej klasy, zwiększając ryzyko zepsucia czegoś niezwiązanego. SRP
dotyczy spójności, a nie jednej metody na klasę.

### Podaj przykład zasady otwarte-zamknięte. {mid}

Rabaty: zamiast `switch` po typach rabatów w `PriceCalculator`, który trzeba edytować przy każdej nowej promocji, definiuje się interfejs `IDiscount`, każdy rabat
implementuje jako osobną klasę, a kalkulator stosuje wszystkie zarejestrowane rabaty. Nowa promocja to nowa klasa zarejestrowana w DI, a kalkulator i istniejące
rabaty zostają nietknięte. Strategia, dekorator i architektura wtyczek to typowe sposoby osiągnięcia OCP.

### Czym jest zasada podstawienia Liskov i jakie jest klasyczne naruszenie? {mid}

Obiekty podtypu muszą dać się użyć wszędzie tam, gdzie oczekiwany jest typ bazowy, bez zauważenia tego przez wywołującego: te same lub łagodniejsze warunki
wstępne, te same lub mocniejsze warunki końcowe, zachowane niezmienniki. Klasyczne naruszenie to `Square` dziedziczący po mutowalnym `Rectangle`: kod ustawiający
szerokość 5 i wysokość 4 oczekuje pola 20, a dostaje 16, bo kwadrat wymusza równe boki. Nadpisania rzucające `NotSupportedException` to kolejny częsty sygnał.

### Czym jest zasada segregacji interfejsów? {junior}

Klienci nie powinni zależeć od metod, których nie używają. Zamiast jednego dużego interfejsu (np. repozytorium z dziesiątkami metod) definiuje się mniejsze
interfejsy ról (`IReadRepository`, `IWriteRepository`), a klasa implementuje kilka z nich. Konsumenci dostają tylko potrzebną zdolność, zależności są
czytelniejsze, a dublery testowe mniejsze.

### Czym odwrócenie zależności różni się od wstrzykiwania zależności? {mid}

Odwrócenie zależności to zasada projektowa: kod polityki wysokiego poziomu nie powinien zależeć od szczegółów niskiego poziomu; oba zależą od abstrakcji, często
definiowanych przez stronę wysokiego poziomu (np. domena definiuje `IOrderRepository`, infrastruktura go implementuje). Wstrzykiwanie zależności to technika:
obiekt dostaje zależności z zewnątrz (parametry konstruktora), zamiast je tworzyć. DI to zwykły sposób stosowania DIP, ale można wstrzykiwać konkretne klasy,
niczego nie odwracając.

### Dlaczego `DateTime.Now` w logice biznesowej to problem dla testowalności? {mid}

Logika zależy od ukrytej, niekontrolowalnej zależności: testy nie sprawdzą zachowania dla konkretnej daty (np. Wigilii, końca miesiąca) bez czekania na nią albo
kombinowania z zegarem systemowym. Zgodnie z DIP wstrzykuje się abstrakcję, np. `TimeProvider` z .NET (albo własny `IClock`), a w testach używa stałej lub
sztucznej implementacji. To samo dotyczy liczb losowych, GUID-ów, zmiennych środowiskowych i systemu plików.

### Czy można przesadzić z SOLID? {senior}

Tak. Mechaniczne stosowanie zasad daje interfejs dla każdej klasy z jedną implementacją, głębokie warstwy abstrakcji, mnóstwo malutkich klas i pośredniość, przez
którą prosty kod staje się trudny do śledzenia. Zasady to narzędzia do zarządzania zmianą; opłacają się tam, gdzie zmiana jest prawdopodobna albo potrzebny jest
punkt zaczepienia dla testów. KISS i YAGNI je równoważą: zaczyna się prosto, a abstrakcje wprowadza, gdy pojawi się prawdziwy drugi wariant albo potrzeba testowa.

### Jak SOLID ma się do testowalności? {mid}

Klasy z jedną odpowiedzialnością są małe i skupione, więc łatwo je testować. Odwrócenie i wstrzykiwanie zależności pozwalają testom podmienić bazy danych,
zegary i klientów HTTP na atrapy. Małe interfejsy (ISP) utrzymują atrapy małymi, a LSP zapewnia, że atrapa zachowuje się jak prawdziwa implementacja z punktu
widzenia wywołującego. Kod trudny do testowania to często objaw łamania tych zasad.

### Co znaczy, że podtypy nie mogą zaostrzać warunków wstępnych? {senior}

Wywołujący polega na kontrakcie typu bazowego, więc podtyp nie może wymagać więcej niż baza: jeśli `Save(Order order)` przyjmuje każde poprawne zamówienie,
nadpisanie rzucające wyjątek dla zamówień powyżej 1000 psuje wywołujących, którzy byli poprawni względem typu bazowego. Z drugiej strony podtyp nie może
gwarantować mniej (słabsze warunki końcowe), np. zwracać `null` tam, gdzie baza obiecuje wynik różny od null. Oba przypadki łamią podstawialność, której zabrania
LSP.
