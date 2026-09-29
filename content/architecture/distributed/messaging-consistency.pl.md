# Komunikacja i spójność danych: outbox, sagi, idempotentność {senior}

Gdy dane są rozproszone między serwisami (albo między bazą a brokerem komunikatów), jedna transakcja ACID nie obejmuje już
całej operacji. Rozmowy sprawdzają, czy znasz wynikające z tego problemy (**podwójny zapis**, zduplikowane komunikaty,
częściowe awarie) i standardowe wzorce: **transactional outbox**, **idempotentnych konsumentów** i **sagi**.

## Komunikacja synchroniczna a asynchroniczna

- **Synchroniczna** (HTTP, gRPC): wywołujący czeka na odpowiedź. Łatwa do zrozumienia, ale tworzy sprzężenie czasowe: jeśli
  wywoływany jest wolny albo niedostępny, wywołujący też, a łańcuchy wywołań mnożą opóźnienia i prawdopodobieństwo awarii.
- **Asynchroniczna** (komunikaty przez broker: RabbitMQ, Azure Service Bus, Kafka): nadawca publikuje i działa dalej; odbiorca
  przetwarza później. Serwisy pozostają dostępne niezależnie, a obciążenie jest buforowane, kosztem **spójności ostatecznej**
  i większej liczby ruchomych części.
- **Komendy** („ReserveStock”) są adresowane do jednego handlera i wyrażają intencję; **zdarzenia** („OrderPlaced”) ogłaszają
  fakty wszystkim zainteresowanym subskrybentom.

## Problem podwójnego zapisu (dual write)

```csharp
await db.SaveChangesAsync();                 // 1. zatwierdź zamówienie
await bus.PublishAsync(new OrderPlaced(...)); // 2. opublikuj zdarzenie → jeśli proces tu padnie, zdarzenie przepada
```

Dwóch osobnych systemów nie da się zaktualizować atomowo: jeśli publikacja zawiedzie po zatwierdzeniu, inne serwisy nigdy
nie dowiedzą się o zamówieniu; jeśli najpierw się opublikuje, a zatwierdzenie zawiedzie, zareagują na zamówienie, które nie
istnieje. Rozproszone transakcje (2PC) obejmujące bazę i broker są zwykle niedostępne albo zbyt kosztowne.

## Transactional outbox

Komunikat zapisuje się do **tabeli outbox w tej samej transakcji bazy** co zmianę biznesową; osobny **przekaźnik** (relay:
worker w tle albo change data capture) czyta nieprzetworzone wiersze, publikuje je do brokera i oznacza jako przetworzone.

```csharp
db.Orders.Add(order);
db.Outbox.Add(new OutboxMessage { Type = "OrderPlaced", Payload = JsonSerializer.Serialize(new { order.Id, order.Total }) });
await db.SaveChangesAsync();                 // jedna transakcja: oba albo żadne
```

W teście z EF Core i SQLite nieudany zapis nie zostawił ani zamówienia, ani komunikatu w outbox, a gdy przekaźnik padł po
publikacji, ale przed oznaczeniem komunikatu jako przetworzonego, broker dostał ten sam komunikat **dwa razy**. Outbox
gwarantuje dostarczenie **at-least-once** (co najmniej raz), więc konsumenci muszą tolerować duplikaty. W .NET implementują go
biblioteki takie jak MassTransit, NServiceBus, Wolverine i Brighter.

## Idempotentni konsumenci

Handler komunikatów jest idempotentny, gdy wielokrotne przetworzenie tego samego komunikatu daje ten sam efekt co
jednokrotne. Techniki:

- zapisywanie identyfikatorów przetworzonych komunikatów w tabeli z kluczem unikalnym, **w tej samej transakcji** co zmiany
  handlera (w teście: duplikat został odrzucony przez klucz i powstała tylko jedna wysyłka);
- projektowanie operacji naturalnie idempotentnych (`SET status = 'Shipped'` zamiast `stock = stock - 1`) albo upserty;
- przenoszenie w komunikacie klucza biznesowego lub wersji i ignorowanie nieaktualnych.

„Przetwarzanie exactly-once” w praktyce oznacza dostarczenie at-least-once plus idempotentną obsługę.

## Sagi

Saga realizuje proces biznesowy obejmujący kilka serwisów jako **sekwencję lokalnych transakcji**, z których każda publikuje
zdarzenie albo komunikat uruchamiający następny krok. Gdy krok zawiedzie, **transakcje kompensujące** cofają poprzednie kroki
(zwrot płatności, zwolnienie zarezerwowanego towaru), bo nie ma globalnego rollbacku.

- **Choreografia**: serwisy reagują na swoje zdarzenia bez centralnego koordynatora. Proste przy kilku krokach, ale przepływ
  staje się trudny do śledzenia i zmiany, gdy rośnie.
- **Orkiestracja**: orkiestrator sagi (maszyna stanów, np. w MassTransit, albo silnik workflow) mówi każdemu uczestnikowi, co ma
  zrobić, i śledzi postęp. Przepływ jest jawny i łatwiejszy do monitorowania, kosztem centralnego komponentu.
- Kompensacje to akcje biznesowe, a nie techniczne cofnięcie: wysłanego e-maila nie da się „odwysłać”, można tylko wysłać
  kolejny. Kroki mogą potrzebować punktów **pivot**, po których saga tylko idzie naprzód.

## Inne praktyki

- Komunikaty potrzebują unikalnych identyfikatorów, identyfikatorów korelacji do śledzenia i schematu ewoluującego w sposób
  zgodny wstecz.
- **Kolejki dead-letter** przechowują komunikaty, które wielokrotnie się nie powiodły, żeby jeden „trujący” komunikat nie
  blokował kolejki.
- Konsumenci nie mogą zakładać kolejności, chyba że broker gwarantuje ją per klucz (np. partycje Kafki, sesje Service Bus).

## Źródła

- [Transactional outbox (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
- [Idempotent consumer (microservices.io)](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
- [Saga pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga)
- [Compensating transaction pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
- [Communication in a microservice architecture (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/communication-in-microservice-architecture)

## Pytania

### Czym różni się komunikacja synchroniczna od asynchronicznej między serwisami? {mid}

Wywołania synchroniczne (HTTP, gRPC) każą wywołującemu czekać na odpowiedź, co jest proste, ale wiąże dostępność i opóźnienia: jeśli wywoływany nie działa albo jest wolny,
wywołujący też, a długie łańcuchy wywołań wzmacniają awarie. Asynchroniczna komunikacja przez broker pozwala nadawcy od razu działać dalej, a odbiorcy przetworzyć później, więc
serwisy pozostają dostępne niezależnie, a skoki obciążenia są buforowane, kosztem spójności ostatecznej, obsługi duplikatów i większej infrastruktury.

### Czym jest problem podwójnego zapisu? {senior}

Pojawia się, gdy operacja musi zaktualizować dwa systemy, które nie mogą dzielić transakcji, typowo zapis do bazy i publikację komunikatu. Jeśli proces zawiedzie między nimi,
systemy się rozjeżdżają: zamówienie jest zapisane, ale zdarzenie nieopublikowane, albo zdarzenie opublikowano dla danych, których nigdy nie zatwierdzono. Ponawianie nie
rozwiązuje tego niezawodnie. Wzorzec transactional outbox rozwiązuje go, czyniąc komunikat częścią transakcji bazy.

### Jak działa wzorzec transactional outbox? {senior}

Serwis zapisuje zmianę biznesową i rekord komunikatu do tabeli outbox w tej samej lokalnej transakcji, więc oba są zatwierdzone albo żaden. Osobny proces przekaźnika (odpytywanie
albo change data capture) czyta nieopublikowane rekordy outbox, publikuje je do brokera i oznacza jako wysłane. Ponieważ przekaźnik może paść po publikacji, a przed oznaczeniem,
ten sam komunikat może zostać opublikowany więcej niż raz, więc wzorzec daje dostarczenie at-least-once i wymaga idempotentnych konsumentów.

### Czym jest idempotentny konsument i dlaczego jest potrzebny? {mid}

To handler komunikatów, który daje ten sam wynik niezależnie od tego, czy komunikat przetworzono raz, czy kilka razy. Jest potrzebny, bo brokery i przekaźniki outbox dostarczają
co najmniej raz: ponowienia po timeoutach, ponowne dostarczenia po awariach i restarty przekaźnika tworzą duplikaty. Typowa implementacja: zapisywać identyfikatory przetworzonych
komunikatów w tabeli z ograniczeniem unikalności w tej samej transakcji co zmiany handlera i pomijać już zapisane; albo uczynić operację naturalnie idempotentną.

### Czym jest saga? {senior}

To sposób realizacji transakcji biznesowej obejmującej kilka serwisów bez rozproszonej transakcji: sekwencja lokalnych transakcji w każdym serwisie, gdzie każdy krok publikuje
zdarzenie albo komunikat uruchamiający następny. Gdy krok zawiedzie, wcześniej zakończone kroki są cofane transakcjami kompensującymi (np. zwrot płatności, zwolnienie
zarezerwowanego towaru). Podczas działania sagi system jest ostatecznie spójny.

### Czym choreografia różni się od orkiestracji w sagach? {senior}

W choreografii nie ma koordynatora: każdy serwis nasłuchuje zdarzeń i reaguje, publikując własne; to zdecentralizowane i proste przy krótkich przepływach, ale cały proces jest
niejawny i trudny do śledzenia, a mogą pojawić się cykliczne zależności. W orkiestracji centralny orkiestrator (maszyna stanów lub workflow) wysyła komendy do uczestników
i śledzi stan, co czyni przepływ jawnym, łatwiejszym do monitorowania i zmiany, kosztem centralnego komponentu znającego cały proces.

### Czym jest transakcja kompensująca? {mid}

To operacja biznesowa, która semantycznie cofa efekt wcześniej zakończonego kroku sagi, skoro nie ma rollbacku między serwisami: anulowanie rezerwacji, zwrot płatności, wysłanie
korekty. Kompensacje same muszą być niezawodne i idempotentne, a niektórych efektów nie da się cofnąć (wysłany e-mail), więc proces projektuje się z tym na uwadze, np. wykonując
nieodwracalne kroki na końcu.

### Czy dostarczenie komunikatu „exactly-once” jest możliwe? {senior}

W ogólnym przypadku przez sieć nie: nadawca nie odróżni zgubionego komunikatu od zgubionego potwierdzenia, więc musi albo ryzykować utratę komunikatów (at-most-once), albo
wysyłać je ponownie (at-least-once). Systemy osiągają efektywnie jednokrotne przetwarzanie: dostarczenie at-least-once połączone z idempotentnymi lub deduplikującymi
konsumentami i transakcyjną obsługą efektów ubocznych konsumenta. Niektóre brokery oferują funkcje „exactly-once” działające tylko w ich własnych granicach.

### Czym komenda różni się od zdarzenia w komunikacji? {mid}

Komenda to prośba o zrobienie czegoś (`ReserveStock`), wysyłana do jednego konkretnego handlera, który może ją przyjąć lub odrzucić; nazywa się ją w trybie rozkazującym.
Zdarzenie to powiadomienie, że coś już się stało (`OrderPlaced`), publikowane do dowolnej liczby subskrybentów, których wydawca nie zna; nazywa się je w czasie przeszłym i nie
można go odrzucić. Komendy wiążą nadawcę z możliwościami odbiorcy, zdarzenia je rozprzęgają.

### Czym jest kolejka dead-letter? {mid}

To osobna kolejka, do której broker przenosi komunikaty, których nie udało się przetworzyć po skonfigurowanej liczbie prób albo które wygasły lub zostały odrzucone. Zapobiega
temu, żeby „trujący” komunikat blokował kolejkę albo był ponawiany w nieskończoność, i daje operatorom miejsce do przejrzenia, naprawy i ponownego odtworzenia nieudanych
komunikatów. Monitorowanie i alerty na kolejkach dead-letter to część utrzymania systemu komunikatów.
