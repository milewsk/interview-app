# Monolit, modularny monolit i mikroserwisy {mid}

„Czy zbudowałbyś to jako mikroserwisy?” to jedno z najczęstszych pytań architektonicznych. Dobra odpowiedź to nie
„mikroserwisy są nowoczesne”, tylko omówienie **kompromisów**: wielkości zespołu, granic domeny, potrzeb skalowania
i kosztu operacyjnego, na który stać organizację.

## Definicje

- **Monolit**: aplikacja jest budowana i wdrażana jako **jedna całość** (jeden proces), nawet jeśli wewnętrznie jest
  podzielona na projekty lub warstwy. Skaluje się ją, uruchamiając więcej kopii całości.
- **Modularny monolit**: nadal jedna jednostka wdrożeniowa, ale wewnętrznie podzielona na **moduły o ścisłych granicach**
  (np. per bounded context): każdy moduł jest właścicielem swoich danych (osobny schemat lub tabele), udostępnia małe
  publiczne API albo zdarzenia, a inne moduły nie mogą sięgać do jego wnętrza.
- **Mikroserwisy**: według Martina Fowlera i Jamesa Lewisa „podejście do budowy jednej aplikacji jako zestawu małych
  serwisów, z których każdy działa we własnym procesie i komunikuje się lekkimi mechanizmami, często API zasobów HTTP”.
  Każdy serwis jest **niezależnie wdrażalny**, jest **właścicielem swoich danych** i jest zorganizowany wokół **zdolności
  biznesowej**.

## Cechy mikroserwisów (Fowler i Lewis)

Komponentyzacja przez serwisy, organizacja wokół zdolności biznesowych, produkty zamiast projektów, inteligentne końcówki
i proste kanały (smart endpoints and dumb pipes), zdecentralizowane zarządzanie, zdecentralizowane dane, automatyzacja
infrastruktury, projektowanie z myślą o awariach, projektowanie ewolucyjne.

## Porównanie

| | Monolit / modularny monolit | Mikroserwisy |
|---|---|---|
| Wdrażanie | jedna jednostka, proste | wiele niezależnych jednostek, wymaga CI/CD i orkiestracji |
| Skalowanie | cała aplikacja | per serwis, tam gdzie jest obciążenie |
| Komunikacja | wywołania metod w procesie (szybkie, niezawodne) | wywołania sieciowe i komunikaty (opóźnienia, częściowe awarie) |
| Dane i transakcje | jedna baza, transakcje ACID | baza per serwis, spójność ostateczna, sagi |
| Autonomia zespołów | wspólna baza kodu i wydanie | zespoły są właścicielami serwisów i wydają je niezależnie |
| Technologia | jeden stos | może się różnić między serwisami |
| Debugowanie i operacje | jeden proces, proste logi | rozproszony tracing, centralne logi, service discovery, więcej infrastruktury |
| Refaktoryzacja granic | tania (przeniesienie kodu) | droga (zmiana API, migracja danych) |

## Kiedy mikroserwisy mają sens

- **Wiele zespołów**, które muszą pracować i wydawać niezależnie (prawo Conwaya: struktura systemu odzwierciedla strukturę
  komunikacji organizacji).
- Części o bardzo **różnych wymaganiach co do skalowania lub dostępności**.
- **Dobrze zrozumiana domena** ze stabilnymi granicami.
- Organizację stać na **premię mikroserwisową**: zautomatyzowane wdrożenia, monitoring, tracing, dyżury dla wielu serwisów.

Kiedy nie: małe zespoły, wczesne produkty, których domena jest wciąż odkrywana, i systemy bez realnej potrzeby niezależnego
skalowania. Obserwacja Fowlera „MonolithFirst”: prawie wszystkie udane historie mikroserwisów zaczynały się od monolitu,
który urósł za bardzo i został podzielony, a systemy budowane od zera jako mikroserwisy często kończyły w poważnych
tarapatach, głównie przez złe granice i kosztowną refaktoryzację między serwisami.

## Migracja z monolitu

- Zacznij od **modularyzacji** monolitu: jasne granice modułów, brak wspólnych tabel, komunikacja przez interfejsy albo
  zdarzenia w procesie. Dobrze zmodularyzowany monolit łatwo podzielić; wielkiej kuli błota (big ball of mud) już nie.
- **Strangler fig** (wzorzec dusiciela): postaw warstwę routingu z przodu, przenoś po jednej zdolności do nowego serwisu,
  kieruj tam jej ruch i usuwaj ją z monolitu, aż stary system zniknie.
- Najpierw wydzielaj części z najwyraźniejszymi granicami i najsilniejszą potrzebą (niezależne skalowanie, osobny zespół).

## Typowe pułapki

- **Rozproszony monolit**: serwisy dzielące bazę, wywołujące się synchronicznie w długich łańcuchach albo wymagające
  wspólnego wdrażania.
- Serwisy dzielone według **warstwy technicznej** („serwis bazodanowy”, „serwis walidacji”) zamiast zdolności biznesowej.
- Gadatliwa komunikacja: jedno żądanie użytkownika rozchodzi się na dziesiątki synchronicznych wywołań.
- Niedoszacowanie pracy nad spójnością danych bez rozproszonych transakcji.

## Źródła

- [Microservices (James Lewis, Martin Fowler)](https://martinfowler.com/articles/microservices.html)
- [MonolithFirst (Martin Fowler)](https://martinfowler.com/bliki/MonolithFirst.html)
- [Microservices architecture style (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices)
- [.NET microservices: architecture for containerized .NET applications](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [Decompose by business capability (microservices.io)](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html)
- [Strangler fig application (Martin Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html)

## Pytania

### Czym jest architektura mikroserwisów? {junior}

To architektura, w której jedna aplikacja jest zbudowana jako zestaw małych serwisów, z których każdy działa we własnym procesie, jest właścicielem swoich danych, da się go
wdrożyć niezależnie i odpowiada za jedną zdolność biznesową, a komunikują się przez sieć (API HTTP/gRPC albo komunikaty). Umożliwia niezależne wdrażanie, skalowanie
i własność zespołów, kosztem złożoności systemu rozproszonego.

### Jakie są zalety i wady monolitu? {junior}

Zalety: proste wytwarzanie, debugowanie, testowanie i wdrażanie; szybkie wywołania w procesie; transakcje ACID w całej domenie; łatwa refaktoryzacja granic. Wady w miarę
wzrostu: długie budowanie i testy, każda zmiana wymaga ponownego wdrożenia całości, skalować można tylko całość, zmiana jednego zespołu może zepsuć pracę innego, a bez
dyscypliny degraduje się do „wielkiej kuli błota” z poplątanymi zależnościami.

### Czym jest modularny monolit? {mid}

To jedna wdrażalna aplikacja, wewnętrznie podzielona na moduły o ścisłych granicach, zwykle zgodnych z bounded contextami. Każdy moduł jest właścicielem swoich danych
(własny schemat lub tabele), udostępnia mały publiczny interfejs albo zdarzenia, a inne moduły nie mają dostępu do jego wnętrza. Zachowuje prostotę operacyjną monolitu,
zyskując dużą część utrzymywalności mikroserwisów, i znacznie ułatwia późniejszy podział na serwisy.

### Kiedy wybrałbyś mikroserwisy? {mid}

Gdy kilka zespołów musi rozwijać i wydawać niezależnie, gdy części systemu mają bardzo różne wymagania co do skalowania lub dostępności, gdy domena i jej granice są dobrze
zrozumiane i gdy organizacja ma automatyzację i dojrzałość operacyjną (CI/CD, monitoring, tracing), żeby utrzymywać wiele serwisów. Bez tego (modularny) monolit jest zwykle
szybszy i tańszy, a Fowler zaleca od niego zacząć.

### Dlaczego często zaleca się „najpierw monolit”? {mid}

Trafienie w granice serwisów wymaga zrozumienia domeny, która na wczesnym etapie produktu wciąż się zmienia, a przenoszenie funkcji między serwisami jest dużo droższe niż
między modułami w jednej bazie kodu. Mikroserwisy niosą też stałą premię operacyjną, która opłaca się tylko przy złożonych systemach. Start od dobrze zmodularyzowanego
monolitu pozwala zespołowi poznać domenę i wydzielać serwisy później, tam gdzie wyraźnie to pomaga.

### Jak zarządzać danymi w mikroserwisach? {mid}

Każdy serwis jest właścicielem swoich danych i tylko on czyta i zapisuje swoją bazę (baza per serwis); inni dostają dane przez jego API albo konsumując jego zdarzenia
i utrzymując własne kopie. Nie ma rozproszonych transakcji między serwisami, więc spójność między nimi jest ostateczna, a procesy obejmujące wiele serwisów używają sag.
Wspólna baza wiązałaby serwisy i niweczyła niezależne wdrażanie.

### Czym jest wzorzec strangler fig? {mid}

To sposób stopniowej wymiany starego systemu: przed starą aplikacją stoi warstwa routingu (proxy albo API gateway), nowa lub przepisana funkcjonalność powstaje jako osobny
serwis, a ruch dla niej jest stopniowo kierowany do niego. Kawałek po kawałku stary system jest „duszony”, aż można go wyłączyć. Pozwala uniknąć ryzykownego przepisania
wszystkiego naraz i dostarczać wartość w sposób ciągły.

### Czym jest prawo Conwaya i dlaczego ma znaczenie dla architektury? {senior}

Prawo Conwaya mówi, że organizacje projektują systemy odzwierciedlające ich struktury komunikacyjne. Przy zespołach UI, backendu i bazy systemy dzielą się według warstw
technicznych; przy zespołach zgodnych ze zdolnościami biznesowymi dzielą się według zdolności. Granice mikroserwisów działają najlepiej, gdy pokrywają się z granicami
zespołów, żeby każdy zespół mógł niezależnie posiadać i zmieniać swoje serwisy; „odwrotny manewr Conwaya” kształtuje zespoły tak, żeby uzyskać pożądaną architekturę.

### Jakich zdolności operacyjnych wymaga architektura mikroserwisów? {mid}

Zautomatyzowanego budowania, testowania i wdrażania każdego serwisu (CI/CD), konteneryzacji i orkiestracji, centralnych logów, metryk i rozproszonego tracingu (np.
OpenTelemetry), żeby śledzić żądanie między serwisami, health checków, service discovery i zarządzania konfiguracją, mechanizmów odporności (timeouty, ponowienia, circuit
breakery), wersjonowania API i testów kontraktowych. Bez nich wiele serwisów szybko staje się niemożliwych do utrzymania i debugowania.

### Jak zdecydować, gdzie przebiegają granice serwisów? {senior}

Według zdolności biznesowych i bounded contextów, a nie warstw technicznych: serwis powinien posiadać spójny fragment domeny z jego danymi i regułami (zamówienia,
rozliczenia, katalog), żeby większość zmian dotykała jednego serwisu. Oznaki dobrych granic: mało synchronicznych wywołań między serwisami, mało wspólnych danych, niezależny
rytm wydań i zespół, który może być właścicielem. Pomagają event storming i analiza domeny, a modularny monolit pozwala zweryfikować granice przed poniesieniem kosztu podziału.
