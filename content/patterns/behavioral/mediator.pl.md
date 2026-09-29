# Mediator {mid}

**Mediator** ogranicza chaotyczne zależności między obiektami, sprawiając, że **komunikują się przez obiekt pośredniczący**
zamiast odwoływać się do siebie bezpośrednio. Zamiast sieci N×N referencji każdy komponent (**współpracownik**, colleague) zna
tylko mediator, który je koordynuje. W .NET nazwa kojarzy się też mocno z **MediatR**, biblioteką rozsyłającą żądania
i powiadomienia do handlerów, co jest pokrewnym, ale innym zastosowaniem tej idei.

## Klasyczny mediator

```csharp
public class ChatRoom                                           // mediator
{
    private readonly Dictionary<string, User> _users = new();
    public void Join(User u) => _users[u.Name] = u;
    public void Broadcast(string from, string msg) { foreach (var u in _users.Values) if (u.Name != from) u.Receive(from, msg); }
    public void Direct(string from, string to, string msg) => _users[to].Receive(from, msg);
}

public class User(string name, ChatRoom room)                   // współpracownik: zna tylko pokój, nie innych użytkowników
{
    public string Name => name;
    public void Send(string msg) => room.Broadcast(name, msg);
    public void SendTo(string to, string msg) => room.Direct(name, to, msg);
    public void Receive(string from, string msg) => Console.WriteLine($"{name} <- {from}: {msg}");
}
```

W teście z trzema użytkownikami wiadomość Ann do wszystkich dotarła do Boba i Cida (nie do Ann), a wiadomość bezpośrednia Boba
tylko do Ann. Typowe zastosowania: okna dialogowe UI, w których kontrolki wpływają na siebie (checkbox włącza pole, wybór na
liście wypełnia formularz), kontrola ruchu lotniczego, koordynacja przepływów. Ryzyko polega na tym, że sam mediator staje się
**boskim obiektem**, który wie wszystko.

## Komunikacja w procesie: styl MediatR

```csharp
public record PlaceOrder(string Product, int Qty) : IRequest<int>;

public class PlaceOrderHandler : IRequestHandler<PlaceOrder, int>
{
    public Task<int> Handle(PlaceOrder r, CancellationToken ct) => Task.FromResult(42);
}

services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssemblyContaining<PlaceOrderHandler>();
    cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));             // pipeline behavior wokół każdego żądania
});

var id = await mediator.Send(new PlaceOrder("book", 2));        // jedno żądanie → dokładnie jeden handler
await mediator.Publish(new OrderPlaced(id));                     // jedno powiadomienie → wszystkie handlery
```

Sprawdzone z MediatR 14: `Send` przeszło przez behavior logowania (`before → handler → after`) i zwróciło 42; `Publish` wykonało
oba handlery powiadomienia (e-mail i statystyki).

- Nadawca zależy tylko od `IMediator` i typu komunikatu, a nie od handlera, więc kontrolery zostają cienkie, a każdy przypadek
  użycia to osobny handler (popularny sposób implementacji CQRS).
- **Pipeline behaviors** dodają zagadnienia przekrojowe (walidację, logowanie, transakcje) wokół wszystkich handlerów.
- Krytyka: to **pośredniość**; „przejdź do definicji” na `Send` nie prowadzi do handlera, a bezpośrednie wstrzyknięcie handlera
  (albo serwisu) jest często prostsze. W małych aplikacjach wnosi niewiele ponad zwykłe DI.
- **Licencja**: nowsze wersje MediatR są komercyjne (Lucky Penny Software) z darmową licencją Community dla małych organizacji
  (roczny przychód poniżej 5 mln USD). Bez klucza licencyjnego biblioteka loguje ostrzeżenie, które według jego treści jest
  dopuszczalne przy developmencie i testach. Alternatywy to generowany kodem `Mediator` (martinothamar), Wolverine albo kilkadziesiąt
  linii własnego dyspozytora.

## Mediator a obserwator a fasada

- **Obserwator**: jednokierunkowe powiadomienia od podmiotu do subskrybentów; podmiot niczego nie koordynuje.
- **Mediator**: dwukierunkowa koordynacja między równorzędnymi obiektami, które się nie znają; często implementowany wewnętrznie
  zdarzeniami.
- **Fasada**: upraszcza klientom dostęp do podsystemu; klasy podsystemu nie wiedzą o istnieniu fasady, a współpracownicy aktywnie
  rozmawiają z mediatorem.

## Źródła

- [Mediator (refactoring.guru)](https://refactoring.guru/design-patterns/mediator)
- [MediatR (GitHub)](https://github.com/LuckyPennySoftware/MediatR)
- [MediatR licensing and pricing](https://mediatr.io/)
- [Mediator: source-generated alternative](https://github.com/martinothamar/Mediator)

## Pytania

### Czym jest wzorzec mediatora? {junior}

To wzorzec behawioralny, który definiuje obiekt zamykający sposób interakcji zbioru obiektów. Zamiast odwoływać się do siebie bezpośrednio, obiekty (współpracownicy) komunikują się
tylko przez mediator, który je koordynuje. Zastępuje to zależności wiele-do-wielu zależnościami jeden-do-wielu, więc współpracowników można zmieniać i wykorzystywać niezależnie.

### Jaki problem rozwiązuje wzorzec mediatora? {junior}

Gdy wiele komponentów współdziała bezpośrednio, każdy trzyma referencje do kilku innych, a zależności tworzą splątaną sieć: zmiana jednego komponentu wpływa na wiele, a żadnego nie da
się użyć osobno. Przeniesienie logiki interakcji do mediatora sprawia, że komponenty zależą tylko od mediatora, a reguły ich współpracy są w jednym miejscu.

### Czym jest MediatR i jak ma się do wzorca? {mid}

MediatR to biblioteka .NET do komunikacji w procesie: wysyła się obiekt żądania przez `IMediator.Send`, a on trafia do dokładnie jednego zarejestrowanego handlera, albo publikuje
powiadomienie do wszystkich jego handlerów. Oddziela nadawcę od handlera jak mediator, ale bliżej mu do dyspozytora poleceń czy komunikatów niż do klasycznego mediatora GoF, który
koordynuje interakcje między współpracownikami. Często używa się jej do porządkowania handlerów w stylu CQRS.

### Czym różni się `Send` od `Publish` w MediatR? {mid}

`Send` służy do żądań (poleceń i zapytań): każdy typ żądania ma dokładnie jeden handler, a wywołanie zwraca jego odpowiedź. `Publish` służy do powiadomień (zdarzeń): dowolna liczba
handlerów, także zero, obsługuje to samo powiadomienie i nic nie jest zwracane. Domyślnie handlery powiadomień wykonują się sekwencyjnie, a wyjątek z jednego zatrzymuje pozostałe,
podobnie jak przy zdarzeniach C#.

### Czym są pipeline behaviors? {mid}

Behaviors to komponenty opakowujące obsługę każdego żądania (jak middleware dla mediatora): każdy dostaje żądanie i delegat `next`, może wykonać kod przed i po albo przerwać
przetwarzanie. Rejestruje się je jako otwarte typy generyczne (`AddOpenBehavior(typeof(LoggingBehavior<,>))`) i używa do walidacji, logowania, pomiaru wydajności, transakcji
i cache'owania, żeby handlery zawierały tylko logikę przypadku użycia.

### Jaka jest krytyka używania MediatR? {senior}

Dodaje pośredniość: kod wysyłający żądanie nie pokazuje, który handler się wykona, co utrudnia nawigację i debugowanie, a zależności są ukryte za `IMediator` zamiast być widoczne
w konstruktorach. W wielu aplikacjach bezpośrednie wstrzyknięcie handlera albo serwisu aplikacyjnego jest prostsze i tak samo rozprzęgnięte. Krytycy wskazują też, że bywa używany jako
„service locator” do wszystkiego, łącznie z handlerami wołającymi inne handlery. Jego wartość rośnie z pipeline behaviors i spójną strukturą handler-na-przypadek-użycia.

### Co zmieniło się w licencjonowaniu MediatR? {mid}

Nowsze wersje MediatR są rozpowszechniane na licencji komercyjnej przez Lucky Penny Software, z darmową licencją Community dla małych organizacji (poniżej 5 mln USD rocznego przychodu
i inne warunki) i płatnymi planami dla większych. Klucz licencyjny konfiguruje się przy rejestracji; bez niego biblioteka loguje ostrzeżenie, a development i testy są dozwolone.
Zespoły, które nie chcą tej zależności, zostają przy starszej wersji albo przechodzą na alternatywy, takie jak generowana kodem biblioteka Mediator, Wolverine albo mały własny
dyspozytor.

### Czym mediator różni się od wzorca obserwatora? {mid}

Obserwator jest jednokierunkowy: podmiot powiadamia subskrybentów o swoich zmianach i nie interesuje go, co zrobią. Mediator koordynuje interakcje między kilkoma równorzędnymi
obiektami w obu kierunkach: współpracownicy wysyłają komunikaty do mediatora, który decyduje, kogo powiadomić albo co wywołać. Mediator często implementuje się wewnętrznie
obserwatorem (współpracownicy wywołują zdarzenia, a mediator je subskrybuje).

### Na czym polega ryzyko, że mediator stanie się boskim obiektem? {senior}

Skoro cała logika interakcji przechodzi do mediatora, może on urosnąć w ogromną klasę, która zna każdego współpracownika i każdą regułę, i stać się najtrudniejszą do zmiany
i testowania częścią systemu. Zapobiega się temu, trzymając mediatory małe i skupione na jednej interakcji (jednym oknie dialogowym, jednym przepływie), dzieląc je według
funkcjonalności, a w projektach opartych na komunikatach mając handler na komunikat zamiast jednej centralnej klasy.

### Jak zaimplementować minimalny mediator bez biblioteki? {senior}

Zdefiniować interfejsy `IRequest<TResponse>` i `IRequestHandler<TRequest, TResponse>`, zarejestrować handlery w DI (np. skanowaniem przez Scrutor albo ręcznie) i napisać dyspozytor,
który dla typu żądania pobiera `IRequestHandler<TRequest, TResponse>` z `IServiceProvider` i go wywołuje. Pipeline behaviors można dodać, pobierając
`IEnumerable<IPipelineBehavior<...>>` i składając je wokół wywołania handlera. Generator kodu może usunąć koszt refleksji.
