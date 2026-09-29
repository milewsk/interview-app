# Strategia i stan (strategy, state) {mid}

**Strategia** zamyka **wymienne algorytmy** za wspólnym interfejsem, żeby algorytm dało się wybrać w czasie wykonania.
**Stan** pozwala obiektowi **zmieniać zachowanie, gdy zmienia się jego stan wewnętrzny**, przez delegowanie do obiektu stanu.
Ich struktura jest niemal identyczna; różnica polega na tym, kto zmienia obiekt i dlaczego, co jest ulubionym pytaniem na
rozmowach.

## Strategia

```csharp
public interface IShippingStrategy { decimal Cost(decimal weightKg); }
public class StandardShipping : IShippingStrategy { public decimal Cost(decimal w) => 10 + w * 2; }
public class ExpressShipping  : IShippingStrategy { public decimal Cost(decimal w) => 25 + w * 4; }
public class PickupShipping   : IShippingStrategy { public decimal Cost(decimal w) => 0; }

public class ShippingCalculator(IReadOnlyDictionary<string, IShippingStrategy> strategies)
{
    public decimal Cost(string method, decimal weightKg) => strategies[method].Cost(weightKg);   // 16 / 37 / 0 dla 3 kg
}
```

- Zastępuje rosnący `switch` albo `if/else` po wariantach algorytmu: każdy wariant to osobna, testowalna klasa, a dodanie
  nowego nie modyfikuje istniejącego kodu (zasada otwarte-zamknięte).
- Strategię wybiera **klient albo konfiguracja**; strategie zwykle nic o sobie nie wiedzą.
- Z DI rejestruje się wszystkie strategie i wybiera po kluczu (keyed services, słownik albo `IEnumerable<IStrategy>` z metodą
  `CanHandle`).
- W C# **delegat** to lekka strategia: `Func<decimal, decimal> vat = p => p * 1.23m`, `keySelector` w LINQ albo predykat.
- W .NET: `IComparer<T>`/`StringComparer` do sortowania (`names.Sort(StringComparer.OrdinalIgnoreCase)`), `IEqualityComparer<T>`
  dla słowników, handlery uwierzytelniania i polityki autoryzacji w ASP.NET Core, konwertery wartości EF Core, dostawcy
  kompresji.

## Stan

```csharp
public class Order
{
    internal IOrderState State { get; set; } = new NewState();
    public void Pay() => State.Pay(this);
    public void Ship() => State.Ship(this);
    public void Cancel() => State.Cancel(this);
}

public abstract class OrderStateBase : IOrderState
{
    public virtual void Pay(Order o) => Invalid("pay");
    public virtual void Ship(Order o) => Invalid("ship");
    public virtual void Cancel(Order o) => Invalid("cancel");
    private void Invalid(string action) => throw new InvalidOperationException($"Cannot {action} an order in state {GetType().Name}");
}

public class NewState  : OrderStateBase { public override void Pay(Order o) => o.State = new PaidState(); public override void Cancel(Order o) => o.State = new CancelledState(); }
public class PaidState : OrderStateBase { public override void Ship(Order o) => o.State = new ShippedState(); public override void Cancel(Order o) => o.State = new CancelledState(); }
public class ShippedState : OrderStateBase { }
```

W teście: `New → Paid → Shipped`; dwukrotna płatność rzuciła „Cannot pay an order in state PaidState”, a anulowanie wysłanego
zamówienia „Cannot cancel an order in state ShippedState”.

- Każdy stan to klasa, która wie, jakie operacje są dozwolone i **jaki stan następuje potem**; kontekst deleguje do bieżącego
  stanu.
- Zastępuje ten sam `switch (status)` powtarzany w każdej metodzie polimorfizmem i trzyma reguły każdego stanu w jednym miejscu.
- Alternatywy dla prostszych przypadków: enum plus **tabela przejść** albo biblioteka maszyn stanów, jak **Stateless**
  (konfiguracja `Permit(Trigger.Pay, State.Paid)`), która daje też diagramy i warunki strażnicze. W EF Core utrwalany stan to
  zwykle kolumna enuma, a obiekty stanów tworzy się na jej podstawie.

## Strategia a stan

| | Strategia | Stan |
|---|---|---|
| Kto ją zmienia | **klient** wybiera i podmienia | **same stany** wywołują przejścia |
| Czy warianty się znają | nie, są niezależne | tak, stan zna swoich następców |
| Co się zmienia | *jak* wykonuje się jedno zadanie | *co* obiekt robi zależnie od sytuacji |
| Typowy przykład | algorytmy płatności, wysyłki, sortowania | cykl życia zamówienia, obieg dokumentu, połączenie TCP |

## Źródła

- [Strategy (refactoring.guru)](https://refactoring.guru/design-patterns/strategy)
- [State (refactoring.guru)](https://refactoring.guru/design-patterns/state)
- [Stateless state machine library](https://github.com/dotnet-state-machine/stateless)

## Pytania

### Czym jest wzorzec strategii? {junior}

To wzorzec behawioralny, który definiuje rodzinę algorytmów, umieszcza każdy w osobnej klasie implementującej wspólny interfejs i czyni je wymiennymi, żeby klient mógł wybrać
albo podmienić algorytm w czasie wykonania. Typowe przykłady to obliczanie kosztów wysyłki, metody płatności, reguły cenowe czy rabatowe i porównywarki do sortowania. Zastępuje
logikę warunkową wybierającą algorytm polimorfizmem.

### Jaki problem rozwiązuje wzorzec strategii? {junior}

Metoda ze `switch` albo długim łańcuchem `if/else` wybierającym między wariantami algorytmu rośnie z każdym nowym wariantem, miesza kilka algorytmów w jednym miejscu i trzeba ją za
każdym razem modyfikować (i testować ponownie). Ze strategiami każdy wariant to mała, niezależnie testowalna klasa, nowe warianty dodaje się, pisząc nową klasę (zasada otwarte-
zamknięte), a wybór może pochodzić z konfiguracji albo danych od użytkownika.

### Jak testować kod używający wzorca strategii? {mid}

Każdą strategię testuje się osobno jako małą jednostkę z danymi wejściowymi i oczekiwanymi wynikami (dla 3 kg: standard 16, ekspres 37, odbiór 0). Kontekst testuje się z
atrapą albo mockiem strategii, żeby sprawdzić, że poprawnie deleguje i używa wyniku, bez zależności od prawdziwych algorytmów. Logikę wyboru testuje się osobno: właściwa
strategia dla każdego klucza i jasny błąd dla nieznanego klucza. Ten podział to jedna z głównych zalet wzorca.

### Czy delegat może zastąpić wzorzec strategii w C#? {mid}

Często tak. Gdy strategia to pojedyncza operacja bez stanu i zależności, `Func<>` albo `Action<>` (lambda) wyraża ją zwięźlej: sortowanie z selektorem klucza, predykat filtrujący,
formuła cenowa. Strategia oparta na klasie jest lepsza, gdy algorytm ma kilka metod, zależności do wstrzyknięcia, konfigurację albo potrzebuje nazwy do wykrywania i testowania.

### Czym jest wzorzec stanu? {junior}

To wzorzec behawioralny, w którym zachowanie obiektu zależy od jego bieżącego stanu, a każdy stan jest reprezentowany przez klasę implementującą wspólny interfejs. Obiekt
(kontekst) deleguje operacje do bieżącego obiektu stanu, a stany decydują, które operacje są dozwolone i jaki stan następuje potem. Zastępuje powtarzane w każdej metodzie
`switch (status)` polimorfizmem.

### Czym wzorzec strategii różni się od wzorca stanu? {mid}

Struktura jest taka sama (kontekst delegujący do wymiennego obiektu), ale w strategii algorytm wybiera klient, a strategie są od siebie niezależne, natomiast w stanie same obiekty
stanów wywołują przejścia do innych stanów i znają swoich następców. Strategia zmienia to, jak wykonuje się zadanie; stan zmienia to, co obiekt robi zależnie od etapu swojego cyklu
życia.

### Kiedy użyć biblioteki maszyn stanów zamiast wzorca stanu? {mid}

Gdy stanów i przejść jest wiele albo często się zmieniają, gdy chce się deklaratywnej konfiguracji (`Permit`, warunki strażnicze, akcje wejścia i wyjścia), wizualizacji przepływu
albo utrwalania stanu jako prostej wartości enuma. Biblioteki takie jak Stateless dają to przy mniejszej ilości kodu niż jedna klasa na stan. Klasyczny wzorzec stanu pasuje lepiej,
gdy każdy stan ma istotne, odrębne zachowanie wykraczające poza przejścia.

### Podaj przykłady wzorca strategii w .NET. {mid}

`IComparer<T>` i `StringComparer` przekazywane do sortowania i kolekcji, `IEqualityComparer<T>` dla słowników i `HashSet<T>`, metody LINQ przyjmujące delegat selektora lub predykatu,
handlery uwierzytelniania i polityki autoryzacji w ASP.NET Core, wymienialna `JsonNamingPolicy` w System.Text.Json oraz dostawcy kompresji czy serializacji wybierani konfiguracją.

### Jak utrwalić w EF Core obiekt zaimplementowany wzorcem stanu? {senior}

Utrwalić stan jako prostą wartość, zwykle kolumnę enuma albo stringa (`Status`), i przy wczytywaniu encji mapować ją na odpowiedni obiekt stanu, np. fabryką albo właściwością
zwracającą klasę stanu dla bieżącego statusu. Klasy stanów pozostają bezstanowe i mogą być współdzielonymi instancjami. Alternatywnie trzyma się zachowanie w encji z tabelą przejść
i używa enuma bezpośrednio, co łatwiej utrwalać i odpytywać.

### Jak zapobiegać niedozwolonym przejściom? {mid}

Sprawić, żeby każdy stan jawnie dopuszczał tylko poprawne operacje, a dla pozostałych rzucał wyjątek (albo zwracał wynik z błędem): w przykładzie płatność za już opłacone zamówienie
rzuciła „Cannot pay an order in state PaidState”. Setter właściwości stanu utrzymuje się prywatny albo wewnętrzny, żeby kod z zewnątrz nie mógł przeskoczyć do dowolnego stanu,
a przejścia pokrywa testami. Biblioteki maszyn stanów wymuszają dozwolone przejścia deklaratywnie i zgłaszają niedozwolone wyzwalacze.
