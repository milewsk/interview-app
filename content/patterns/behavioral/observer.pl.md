# Obserwator i publish–subscribe {mid}

**Obserwator** (observer) definiuje zależność jeden-do-wielu: gdy jeden obiekt (**podmiot**) się zmienia, wszyscy jego
**obserwatorzy** są automatycznie powiadamiani, a podmiot nie zna ich konkretnych typów. To podstawa kodu sterowanego
zdarzeniami: zdarzeń C#, `IObservable<T>`, wiązania danych (`INotifyPropertyChanged`), zdarzeń domenowych, a na poziomie
systemu komunikacji publish–subscribe.

## Zdarzenia C#: wbudowany obserwator

```csharp
public class Stock
{
    private decimal _price;
    public event EventHandler<PriceChangedEventArgs>? PriceChanged;       // podmiot udostępnia zdarzenie

    public decimal Price
    {
        get => _price;
        set { _price = value; PriceChanged?.Invoke(this, new PriceChangedEventArgs(value)); }   // powiadom wszystkich obserwatorów
    }
}

stock.PriceChanged += OnPrice;    // subskrypcja
stock.PriceChanged -= OnPrice;    // wypisanie się
```

W teście z dwoma subskrybentami ustawienie ceny na 10 powiadomiło obu, a po wypisaniu pierwszego ustawienie 12 powiadomiło
tylko drugiego (`A:10, B:10, B:12`).

Pułapki sprawdzone w testach:

- **Handlery działają synchronicznie, po kolei, na wątku wydawcy.** Jeśli jeden rzuci wyjątek, pozostałe się nie wykonają,
  a wyjątek trafi do kodu, który wywołał zdarzenie (w teście trzeci handler nigdy się nie wykonał).
- **Wycieki pamięci**: delegat wydawcy trzyma referencję do subskrybenta. Jeśli długo żyjący wydawca (zdarzenie statyczne,
  serwis singleton) przeżyje subskrybenta, który nigdy się nie wypisał, subskrybenta nie da się sprzątnąć (w teście przetrwał
  GC, gdy się nie wypisał, i został zebrany, gdy się wypisał). Wypisuje się w `Dispose` albo używa wzorców słabych zdarzeń.
- Handlery z wolną pracą blokują wydawcę; handlery `async void` sprawiają, że wyjątków nie da się zaobserwować.

## `IObservable<T>` i `IObserver<T>`

Formalne interfejsy obserwatora w .NET: obserwator dostaje `OnNext(value)`, `OnError(exception)` i `OnCompleted()`, a `Subscribe`
zwraca `IDisposable`, którego zwolnienie wypisuje subskrypcję (sprawdzone: po zwolnieniu obserwator nie dostał już niczego, nawet
zakończenia). **Reactive Extensions** (Rx.NET, `System.Reactive`) budują na nich bogate API w stylu LINQ: filtrowanie, dławienie,
łączenie i buforowanie strumieni zdarzeń (`Throttle`, `Buffer`, `Merge`).

## Obserwator a publish–subscribe

- We wzorcu **obserwatora** podmioty znają swoich obserwatorów bezpośrednio (trzymają referencje), a powiadamianie jest zwykle
  synchroniczne i w obrębie procesu.
- W **publish–subscribe** wydawcy i subskrybenci się nie znają: komunikaty idą przez pośrednika (szynę zdarzeń, mediator, broker
  komunikatów), często asynchronicznie i między procesami. Bardziej ich to rozprzęga, ale dodaje infrastrukturę i spójność
  ostateczną.
- **Zdarzenia domenowe** w DDD są pośrodku: agregat zapisuje zdarzenia, a po zapisie dyspozytor (często w procesie, np.
  powiadomienia MediatR) dostarcza je do handlerów; zdarzenia integracyjne idą przez broker do innych serwisów.

## Gdzie spotkasz go w .NET

Zdarzenia C# wszędzie (frameworki UI, `FileSystemWatcher.Changed`, `Process.Exited`), `INotifyPropertyChanged`
i `ObservableCollection<T>` do wiązania danych, `IObservable<T>`/Rx.NET, `IChangeToken` i `IOptionsMonitor<T>.OnChange` do
przeładowania konfiguracji, `DiagnosticListener` oraz `EventSource`/`EventListener` do diagnostyki.

## Źródła

- [Observer (refactoring.guru)](https://refactoring.guru/design-patterns/observer)
- [Observer design pattern (.NET)](https://learn.microsoft.com/en-us/dotnet/standard/events/observer-design-pattern)
- [Handling and raising events (.NET)](https://learn.microsoft.com/en-us/dotnet/standard/events/)
- [Weak event patterns (WPF)](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/events/weak-event-patterns)
- [Reactive Extensions for .NET (Rx.NET)](https://github.com/dotnet/reactive)

## Pytania

### Czym jest wzorzec obserwatora? {junior}

To wzorzec behawioralny, w którym podmiot utrzymuje listę obserwatorów i automatycznie powiadamia ich, gdy zmienia się jego stan, nie zależąc od ich konkretnych typów. Rozprzęga
źródło zmiany od reakcji na nią. W C# bezpośrednio implementują go zdarzenia i delegaty, a formalnymi interfejsami są `IObservable<T>`/`IObserver<T>`.

### Jak zdarzenia C# implementują wzorzec obserwatora? {junior}

Podmiot deklaruje `event` typu delegatu (np. `EventHandler<TArgs>`); obserwatorzy subskrybują przez `+=` i wypisują się przez `-=`, a podmiot wywołuje zdarzenie przez
`Event?.Invoke(this, args)`, wywołując każdy zasubskrybowany handler. Słowo kluczowe `event` ogranicza kod z zewnątrz do subskrybowania i wypisywania się, więc tylko klasa właściciela
może wywołać zdarzenie albo wyczyścić listę.

### Jak zdarzenia mogą powodować wycieki pamięci? {mid}

Subskrypcja zapisuje w liście wywołań wydawcy delegat wskazujący subskrybenta. Jeśli wydawca żyje dłużej niż subskrybent (zdarzenie statyczne, serwis singleton, zdarzenie całej
aplikacji), a subskrybent nigdy się nie wypisze, wydawca utrzymuje go osiągalnym i garbage collector nie może go zwolnić razem ze wszystkim, do czego się odwołuje. Rozwiązaniem jest
wypisanie się, zwykle w `Dispose`, albo wzorce słabych zdarzeń.

### Co się stanie, gdy handler zdarzenia rzuci wyjątek? {mid}

Handlery delegatu multicast wykonują się synchronicznie jeden po drugim; jeśli jeden rzuci wyjątek, wywoływanie się zatrzymuje, pozostałe handlery nie są wywołane, a wyjątek trafia
do kodu, który wywołał zdarzenie. Jeśli handlery mają być odizolowane, wydawca może przejść po `GetInvocationList()` i wywołać każdy handler we własnym `try/catch` albo rozsyłać
powiadomienia mechanizmem obsługującym błędy per subskrybent.

### Jak działają `IObservable<T>` i `IObserver<T>`? {mid}

`IObservable<T>` to źródło wartości; obserwatorzy implementują `IObserver<T>` z `OnNext`, `OnError` i `OnCompleted`. Wywołanie `Subscribe(observer)` zwraca `IDisposable`, a jego
zwolnienie wypisuje subskrypcję. Kontrakt mówi, że po `OnError` albo `OnCompleted` nie wysyła się już powiadomień. Rx.NET buduje na tych interfejsach składalny język zapytań dla
strumieni zdarzeń.

### Czym wzorzec obserwatora różni się od publish–subscribe? {mid}

W obserwatorze podmiot trzyma bezpośrednie referencje do obserwatorów i sam ich powiadamia, zwykle synchronicznie i w obrębie jednego procesu. W publish–subscribe wydawcy
i subskrybenci się nie znają: komunikaty przechodzą przez pośrednika, jak szyna zdarzeń albo broker komunikatów, mogą być asynchroniczne, trwałe i przekraczać granice procesów.
Pub/sub daje luźniejsze sprzężenie i skalowalność kosztem infrastruktury i spójności ostatecznej.

### Czym jest `INotifyPropertyChanged`? {junior}

To interfejs ze zdarzeniem `PropertyChanged`, które obiekty wywołują, gdy zmienia się wartość właściwości. Frameworki UI (wiązanie danych w WPF, MAUI, WinForms) subskrybują je, żeby
automatycznie aktualizować kontrolki, co jest wzorcem obserwatora zastosowanym do wiązania danych. `ObservableCollection<T>` robi to samo dla kolekcji przez `CollectionChanged`.
Generatory kodu, np. MVVM Toolkit, generują szablonowy kod.

### Jak zdarzenia domenowe mają się do wzorca obserwatora? {senior}

Zdarzenia domenowe stosują ideę obserwatora do logiki biznesowej: agregat zapisuje, że coś się wydarzyło (`OrderPaid`), nie wiedząc, kto zareaguje, a handlery subskrybują typy
zdarzeń. Zwykle zdarzenia są zbierane w trakcie operacji i rozsyłane po zapisie (albo w jego trakcie), często w procesie przez mediator, więc reakcje, takie jak wysłanie e-maila
czy aktualizacja innego agregatu, są oddzielone od agregatu. Zdarzenia dla innych serwisów publikuje się jako zdarzenia integracyjne przez broker.

### Czym jest wzorzec słabych zdarzeń (weak event)? {senior}

To sposób, żeby wydawca powiadamiał subskrybentów, nie utrzymując ich przy życiu: subskrypcja trzyma tylko słabą referencję do subskrybenta, więc jeśli nic innego się do niego nie
odwołuje, GC może go zebrać, a wydawca po prostu porzuca martwą subskrypcję. WPF dostarcza do tego `WeakEventManager`. Rozwiązuje wycieki, gdy subskrybenci nie mogą niezawodnie się
wypisać, kosztem złożoności i nieco wolniejszego rozsyłania.

### Dlaczego synchroniczne handlery zdarzeń mogą być problemem? {mid}

Handlery działają na wątku wydawcy, zanim kod wywołujący pójdzie dalej, więc wolny handler (I/O, ciężkie obliczenia) opóźnia wydawcę i wszystkie inne handlery, a na wątku UI
zamraża interfejs. Handlery `async void` unikają blokowania, ale sprawiają, że wydawca nie zaobserwuje wyjątków ani zakończenia. Ciężkie lub zawodne reakcje lepiej kolejkować (kanał,
serwis w tle, broker komunikatów) zamiast wykonywać w handlerze.
