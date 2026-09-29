# Architektura warstwowa (N-layer) {junior}

Najczęstszy sposób organizacji aplikacji biznesowych to podział na **warstwy** według odpowiedzialności: prezentację,
logikę biznesową i dostęp do danych. To domyślny punkt startowy w wielu projektach .NET i punkt odniesienia przy
porównywaniu innych stylów (czystej architektury, pionowych wycinków).

## Klasyczne warstwy

```
Prezentacja (UI / API)      kontrolery, endpointy, widoki, DTO żądań/odpowiedzi
        ↓
Logika biznesowa (BLL)      serwisy, reguły domenowe, walidacja, transakcje
        ↓
Dostęp do danych (DAL)      repozytoria, DbContext EF Core, SQL
        ↓
Baza danych
```

- Każda warstwa ma jedną odpowiedzialność i rozmawia tylko z warstwą poniżej: UI nie odpytuje bazy bezpośrednio, a logika
  biznesowa przechodzi przez warstwę dostępu do danych.
- **Ścisłe warstwy**: warstwa może wywoływać tylko warstwę bezpośrednio pod nią. **Luźne warstwy**: może je pomijać (np.
  endpoint raportu tylko do odczytu odpytuje dane bezpośrednio). W praktyce luźne podejście jest częste przy prostych
  odczytach.
- Między prezentacją a domeną często umieszcza się **warstwę aplikacji** (przypadki użycia / serwisy aplikacyjne): orkiestruje
  przypadek użycia, otwiera transakcję, wywołuje obiekty domenowe i repozytoria i zwraca DTO.

## Warstwy a tiery

**Warstwy** (layers) to **logiczny** podział wewnątrz kodu (projekty, przestrzenie nazw). **Tiery** to **fizyczny** podział na
procesy lub maszyny (przeglądarka, serwer webowy, serwer bazy). Aplikację trójwarstwową często wdraża się jako jeden tier
plus bazę; dodawanie tierów dodaje wywołania sieciowe, opóźnienia i rodzaje awarii, więc robi się to z konkretnego powodu
(strefy bezpieczeństwa, niezależne skalowanie).

## Zalety

- Separacja odpowiedzialności: kod łatwiej znaleźć i zrozumieć.
- Warstwy można podmieniać (np. inny magazyn danych za tym samym interfejsem) i testować z atrapami.
- Zespoły mogą się specjalizować, a konwencje są znane większości programistów.

## Wady i typowe problemy

- **Zależności wskazują w stronę bazy.** W tradycyjnej formie logika biznesowa zależy od warstwy dostępu do danych (a więc od
  bazy), przez co trudno ją testować jednostkowo bez bazy. Czysta architektura naprawia to, odwracając tę zależność.
- **Jedna funkcja dotyka każdej warstwy**: dodanie pola oznacza zmianę DTO, kontrolera, serwisu, repozytorium i encji,
  rozrzuconych po folderach.
- **Warstwy przelotowe**: serwisy, które tylko przekazują wywołania do repozytoriów, dodają kod bez wartości.
- **Anemiczny model domeny** (Martin Fowler): encje to tylko pojemniki na dane z getterami i setterami, a wszystkie reguły
  siedzą w klasach „serwisów”. To kod proceduralny w obiektowym przebraniu; reguły powielają się między serwisami,
  a niezmienniki łatwo złamać.
- **Przeciekające warstwy**: zwracanie encji EF Core albo `IQueryable` z warstwy danych do kontrolerów wiąże UI ze schematem
  bazy i pozwala na przypadkowe zapytania (np. lazy loading podczas serializacji).

## Praktyczne wskazówki

- Mapuj między warstwami świadomie: DTO API to nie encje, więc zmiany schematu nie przeciekają do publicznych kontraktów,
  a over-posting jest wykluczony.
- Walidację kształtu danych wejściowych trzymaj na brzegu (DTO żądań), a niezmienniki biznesowe w domenie.
- Granice transakcji umieszczaj w warstwie aplikacji (jeden przypadek użycia = jedna transakcja / `SaveChanges`).
- Dla małych aplikacji CRUD wystarczy jeden projekt z folderami; na projekty dzieli się, gdy wymaga tego rozmiar albo
  struktura zespołu.

## Źródła

- [Common web application architectures (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
- [N-tier architecture style (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/n-tier)
- [Presentation–domain–data layering (Martin Fowler)](https://martinfowler.com/bliki/PresentationDomainDataLayering.html)
- [Anemic domain model (Martin Fowler)](https://martinfowler.com/bliki/AnemicDomainModel.html)

## Pytania

### Czym jest architektura warstwowa? {junior}

To sposób organizacji aplikacji w poziome warstwy z osobnymi odpowiedzialnościami, zwykle prezentację (UI lub API), logikę biznesową i dostęp do danych, gdzie każda
warstwa używa tylko warstwy poniżej. Rozdziela odpowiedzialności, ułatwia poruszanie się po kodzie i pozwala podmienić lub zastąpić atrapą warstwę (np. dostęp do danych
w testach). To najczęstsza struktura aplikacji biznesowych i częsty punkt startowy.

### Czym warstwy różnią się od tierów? {junior}

Warstwy to logiczny podział kodu (projekty, przestrzenie nazw) w obrębie jednej aplikacji; tiery to fizyczny podział na osobno wdrażane procesy lub maszyny, np.
przeglądarkę, serwer webowy i serwer bazy. Aplikację trójwarstwową często wdraża się jako jeden tier plus bazę. Każdy dodatkowy tier dodaje opóźnienia sieciowe i punkty
awarii, więc fizyczny podział powinien służyć konkretnemu celowi, jak bezpieczeństwo czy niezależne skalowanie.

### Jaka jest główna wada tradycyjnej architektury N-warstwowej? {mid}

Zależności kompilacji idą z góry na dół, więc warstwa logiki biznesowej, zawierająca najważniejszy kod, zależy od warstwy dostępu do danych i pośrednio od bazy.
Testowanie reguł biznesowych wymaga wtedy bazy albo złożonego mockowania szczegółów dostępu do danych, a sprawy infrastruktury przeciekają w górę. Czysta architektura
rozwiązuje to tak, że warstwa biznesowa definiuje interfejsy, które implementuje warstwa danych.

### Czym jest anemiczny model domeny? {mid}

To model, w którym encje są tylko workami właściwości bez zachowania, a wszystkie reguły biznesowe żyją w klasach serwisów, które nimi manipulują. Martin Fowler nazywa to
antywzorcem: wygląda obiektowo, ale jest proceduralne, reguły powielają się między serwisami i nic nie powstrzymuje kodu przed wprowadzeniem encji w niepoprawny stan.
Bogaty model domeny umieszcza zachowanie i niezmienniki w samych encjach (`order.AddLine(...)`, `account.Withdraw(...)`).

### Dlaczego kontrolery nie powinny dostawać encji EF Core ani `IQueryable`? {mid}

Zwracanie encji wiąże publiczne API ze schematem bazy, więc zmiana nazwy kolumny zmienia kontrakt JSON, a wiązanie żądań z encjami pozwala na over-posting (klient ustawia
pola takie jak `IsAdmin`). `IQueryable` pozwala wyższym warstwom budować zapytania wykonywane później, być może z lazy loadingiem podczas serializacji czy N+1, i zaciera,
gdzie odbywa się dostęp do danych. DTO albo projekcje na granicy utrzymują warstwy niezależne.

### Czym różnią się ścisłe i luźne warstwy? {mid}

W ścisłych warstwach warstwa może wywoływać tylko warstwę bezpośrednio pod nią, więc prezentacja zawsze przechodzi przez logikę biznesową, żeby dotrzeć do danych. Luźne
warstwy pozwalają je pomijać, np. endpoint zapytań tylko do odczytu czyta dane bezpośrednio. Ścisłe warstwy wymuszają spójność, ale tworzą kod przelotowy dla prostych
operacji; wiele systemów luzuje je dla odczytów, a zapisy nadal przepuszcza przez warstwę biznesową (co naturalnie prowadzi do CQRS).

### Gdzie zarządzać transakcjami w aplikacji warstwowej? {mid}

W warstwie aplikacji (serwisów), wokół całego przypadku użycia: jedna operacja biznesowa powinna się powieść albo zawieść jako całość. W EF Core zwykle oznacza to jedno
`SaveChanges` na przypadek użycia albo jawną transakcję, gdy potrzeba kilku. Zarządzanie transakcjami w repozytoriach sprawia, że każde wywołanie repozytorium to osobna
transakcja i traci się atomowość między nimi; zarządzanie nimi w kontrolerach miesza infrastrukturę z warstwą prezentacji.

### Czym są warstwy przelotowe? {junior}

To warstwy, które nie dodają logiki, tylko przekazują wywołania, np. `ProductService.GetById`, które tylko wywołuje `ProductRepository.GetById`, które tylko wywołuje
`DbContext.Find`. Dodają pliki, pośredniość i mapowanie bez wartości. Pojawiają się, gdy warstwy stosuje się mechanicznie. Ogranicza je luzowanie warstw przy prostych
odczytach albo organizacja według funkcji.

### Kiedy architektura warstwowa to dobry wybór? {junior}

Dla typowych aplikacji biznesowych i CRUD małej i średniej wielkości, z zespołem znającym ten styl, gdzie logika domenowa nie jest bardzo złożona. Jest prosta, dobrze
znana i łatwo z nią zacząć. Gdy złożoność domeny rośnie, odwrócenie zależności (czysta architektura) albo organizacja według funkcji (pionowe wycinki) zwykle lepiej się
skalują, a podział na warstwy może ewoluować w tym kierunku.

### Czym architektura pionowych wycinków różni się od warstwowej? {mid}

Architektura warstwowa grupuje kod według spraw technicznych w całej aplikacji, więc jedna funkcja jest rozrzucona po wszystkich warstwach. Pionowe wycinki (vertical
slices) grupują kod według funkcji (albo żądania): każdy wycinek zawiera swój endpoint, handler, walidację i dostęp do danych, a wycinki mogą wewnętrznie stosować różne
podejścia (EF Core w jednym, surowy SQL w innym). Wycinki maksymalizują spójność w obrębie funkcji i minimalizują sprzężenie między funkcjami, kosztem mniej wymuszonej
struktury w całej bazie kodu.
