# Sprzężenie i spójność (coupling i cohesion) {mid}

**Sprzężenie** (coupling) to stopień, w jakim moduły zależą od siebie nawzajem; **spójność** (cohesion) to to, jak mocno
elementy wewnątrz jednego modułu do siebie należą. Celem, od klas po mikroserwisy, jest **niskie sprzężenie i wysoka
spójność**: zmiana powinna zostać wewnątrz jednego modułu, a nie rozchodzić się po systemie. Większość zasad
projektowych (SRP, DIP, bounded contexty, modularne monolity) to sposoby, żeby to osiągnąć.

## Sprzężenie

Dwa moduły są sprzężone, gdy zmiana w jednym może wymusić zmianę w drugim. Rodzaje sprzężenia, od najgorszego do
najbardziej akceptowalnego:

| Rodzaj | Przykład |
|---|---|
| **Zawartości** (content) | jeden moduł modyfikuje wewnętrzne dane drugiego (refleksja do prywatnych pól, zapis do tabel innego serwisu) |
| **Wspólne / globalne** (common) | moduły współdzielą globalny mutowalny stan (zmienne statyczne, wspólna baza używana przez kilka serwisów) |
| **Sterowania** (control) | jeden moduł przekazuje flagę mówiącą drugiemu, co ma robić (`Process(order, isRefund: true)`) |
| **Stemplowe** (stamp) | moduł dostaje całą strukturę, ale używa tylko jej części |
| **Danych** (data) | moduły wymieniają tylko proste dane, których potrzebują, przez parametry |
| **Komunikatów** (message) | moduły komunikują się tylko komunikatami lub zdarzeniami, nie wiedząc o sobie nic więcej |

Inne rodzaje ważne w praktyce:

- **Sprzężenie czasowe** (temporal): operacje muszą odbyć się w określonej kolejności (`Init()` przed `Run()`) albo dwa
  serwisy muszą być dostępne w tym samym momencie (wywołania synchroniczne).
- **Sprzężenie wdrożeniowe**: moduły muszą być wydawane razem (współdzielone biblioteki z niekompatybilnymi zmianami,
  „rozproszony monolit”).
- **Sprzężenie semantyczne**: obie strony dzielą ukryte założenia, np. co do znaczenia wartości statusu.

## Spójność

Moduł jest spójny, gdy jego elementy pracują na jeden cel i zmieniają się razem. Od najlepszej do najgorszej:
**funkcjonalna** (wszystko służy jednemu dobrze zdefiniowanemu zadaniu), sekwencyjna, komunikacyjna, proceduralna, czasowa
(rzeczy zgrupowane, bo działają w tym samym momencie, np. „zadania startowe”), logiczna (zgrupowane według kategorii, np.
klasa `Utils`) i **przypadkowa** (brak jakiegokolwiek związku). Klasy nazwane `Helper`, `Manager` czy `Utils` to często
oznaka niskiej spójności.

## Pomiar: stabilność i zależności

Metryki pakietów Roberta C. Martina:

- **Sprzężenie dośrodkowe (Ca)**: ile klas z zewnątrz zależy od tego pakietu (jego odpowiedzialność).
- **Sprzężenie odśrodkowe (Ce)**: od ilu klas z zewnątrz zależy ten pakiet.
- **Niestabilność** `I = Ce / (Ce + Ca)`, od 0 (stabilny: wiele od niego zależy, on zależy od niewielu) do 1 (niestabilny:
  łatwy do zmiany, nic od niego nie zależy).

**Zasada stabilnych zależności**: zależności wskazują w stronę stabilności, czyli moduły zmienne (UI, adaptery) zależą od
stabilnych (domeny), nigdy odwrotnie. **Zasada acyklicznych zależności**: żadnych cykli między modułami, bo cykl sprawia, że
w praktyce stają się jednym modułem.

## Organizacja kodu pod kątem spójności

- **Pakietowanie według warstw** (`Controllers/`, `Services/`, `Repositories/`) grupuje kod według roli technicznej, więc
  zmiana jednej funkcji dotyka każdego folderu.
- **Pakietowanie według funkcji / pionowe wycinki** (vertical slices: `Orders/`, `Invoices/`, każdy z endpointem, handlerem,
  walidacją i dostępem do danych) grupuje kod, który zmienia się razem, co zwiększa spójność i ułatwia znajdowanie, zmianę
  i usuwanie funkcji.
- Między modułami komunikuje się przez małe, jawne interfejsy albo komunikaty i nie współdzieli tabel bazy.

## Sprzężenie w systemach rozproszonych

Podział systemu na serwisy sam w sobie nie zmniejsza sprzężenia: serwisy wywołujące się synchronicznie w długich
łańcuchach, dzielące bazę albo wymagające wspólnego wdrażania to **rozproszony monolit**, z wadami obu podejść. Obniża się
je przez asynchroniczną komunikację, własne dane każdego serwisu, kontrakty zgodne wstecz i projektowanie od strony
konsumenta.

## Źródła

- [Coupling (Wikipedia)](https://en.wikipedia.org/wiki/Coupling_%28computer_programming%29)
- [Cohesion (Wikipedia)](https://en.wikipedia.org/wiki/Cohesion_%28computer_science%29)
- [Software package metrics (Wikipedia)](https://en.wikipedia.org/wiki/Software_package_metrics)
- [Reducing coupling (Martin Fowler, IEEE Software)](https://martinfowler.com/ieeeSoftware/coupling.pdf)
- [Vertical slice architecture (Jimmy Bogard)](https://www.jimmybogard.com/vertical-slice-architecture/)

## Pytania

### Co oznaczają sprzężenie i spójność? {junior}

Sprzężenie mierzy, jak bardzo moduły zależą od siebie nawzajem: przy wysokim sprzężeniu zmiana w jednym wymusza zmiany w innych. Spójność mierzy, jak blisko
powiązane są odpowiedzialności wewnątrz jednego modułu: przy wysokiej spójności wszystko w module służy jednemu celowi. Dobry projekt dąży do niskiego sprzężenia
między modułami i wysokiej spójności wewnątrz nich, żeby zmiany pozostawały lokalne.

### Dlaczego niskie sprzężenie jest pożądane? {junior}

Luźno sprzężone moduły można zrozumieć, zmienić, przetestować, wdrożyć i skalować niezależnie: zmiana w jednym nie rozchodzi się na inne, zespoły mogą pracować
równolegle, a części da się podmienić (np. dostawcę płatności za interfejsem). Wysokie sprzężenie czyni każdą zmianę ryzykowną i kosztowną, bo trzeba zrozumieć
i przetestować ponownie wiele części systemu.

### Czym jest sprzężenie sterowania (control coupling)? {mid}

Jeden moduł przekazuje parametr sterujący wewnętrzną logiką drugiego, np. `Process(order, isRefund: true)` albo enum mówiący metodzie, którą gałąź wybrać.
Wywołujący musi wiedzieć, jak wywoływany działa w środku, a wywoływany robi kilka rzeczy. Zwykle lepiej rozdzielić to na osobne operacje (`Process`, `Refund`)
albo użyć polimorfizmu, co przy okazji poprawia spójność.

### Co zwykle mówi o spójności klasa nazwana `Utils` albo `Helper`? {mid}

Że prawdopodobnie ma niską (logiczną albo przypadkową) spójność: niepowiązane funkcje zgrupowane tylko dlatego, że nie pasowały gdzie indziej, np. formatowanie
tekstu, obliczenia na datach i obsługa plików w jednej klasie. Takie klasy rosną bez końca, stają się zależnością wszystkiego, a zmiany w nich wpływają na
niezwiązany kod. Przeniesienie każdej funkcji obok pojęcia, któremu służy (metoda rozszerzająca typu, value object, serwis domenowy), podnosi spójność.

### Czym jest niestabilność w sensie metryk pakietów? {senior}

To metryka Roberta C. Martina `I = Ce / (Ce + Ca)`, gdzie Ce to liczba klas z zewnątrz, od których pakiet zależy (sprzężenie odśrodkowe), a Ca to liczba klas
z zewnątrz, które od niego zależą (sprzężenie dośrodkowe). I = 0 oznacza pakiet stabilny: wiele od niego zależy, a on od niczego, więc trudno go zmienić. I = 1
oznacza pakiet niestabilny, od którego nic nie zależy. Zależności powinny wskazywać w stronę stabilności: UI (niestabilne) zależy od domeny (stabilnej).

### Czym jest sprzężenie czasowe? {mid}

To zależność od czasu lub kolejności: metody, które trzeba wywołać w określonej sekwencji (`Open()` przed `Read()`, `Init()` przed użyciem), albo serwisy, które
muszą być dostępne w tym samym momencie, bo wywołują się synchronicznie. Pierwsze zmniejsza się, projektując obiekty poprawne od razu po utworzeniu; drugie przez
asynchroniczną komunikację, kolejki i cache, żeby chwilowo niedostępny serwis nie pociągał za sobą innych.

### Czym pakietowanie według funkcji różni się od pakietowania według warstw? {mid}

Pakietowanie według warstw grupuje kod według roli technicznej (`Controllers`, `Services`, `Repositories`), więc implementacja lub zmiana jednej funkcji dotyka
plików rozrzuconych po wszystkich folderach, a niezwiązane funkcje leżą obok siebie. Pakietowanie według funkcji (pionowe wycinki) grupuje wszystko dla jednej
funkcji razem (endpoint, handler, walidacja, dostęp do danych), co zwiększa spójność, ułatwia znajdowanie i usuwanie funkcji i pozwala im rozwijać się niezależnie.

### Czym jest rozproszony monolit? {senior}

To system podzielony na serwisy, które pozostają mocno sprzężone: dzielą bazę danych, wywołują się synchronicznie w długich łańcuchach, dzielą biblioteki
z niekompatybilnymi zmianami albo muszą być wdrażane razem. Ma złożoność operacyjną mikroserwisów (awarie sieci, rozproszone debugowanie) bez ich zalet
(niezależne wdrażanie i skalowanie). Zwykle to znak, że granice serwisów wyznaczono według warstw technicznych, a nie zdolności biznesowych.

### Dlaczego dwa serwisy nie powinny dzielić bazy danych? {mid}

Wspólna baza to sprzężenie globalne: schemat staje się kontraktem, którego żaden serwis nie może zmienić bez koordynacji z drugim, jeden serwis może ominąć reguły
biznesowe drugiego, zapisując bezpośrednio do jego tabel, a problemy z wydajnością czy migracje jednego wpływają na oba. Każdy serwis powinien być właścicielem
swoich danych i udostępniać je przez API albo zdarzenia. Repliki tylko do odczytu albo publikowane produkty danych to bezpieczniejsze sposoby dzielenia się
danymi.

### Czym jest zasada acyklicznych zależności? {mid}

Graf zależności między modułami (projektami, pakietami, przestrzeniami nazw) nie powinien mieć cykli. Jeśli A zależy od B, a B od A, bezpośrednio lub przez inne
moduły, nie da się ich budować, testować ani wydawać niezależnie i w praktyce zachowują się jak jeden moduł. Cykle przerywa się, wydzielając wspólną część do nowego
modułu albo przez odwrócenie zależności: wprowadza się interfejs należący do jednej strony i implementowany przez drugą.
