# Architektura czysta, heksagonalna i cebulowa {mid}

Architektura heksagonalna (porty i adaptery, Alistair Cockburn), cebulowa (Jeffrey Palermo) i czysta (Robert C. Martin)
to warianty jednej idei: **logika biznesowa jest w centrum i nie zależy od niczego zewnętrznego**, a baza danych,
framework webowy, broker komunikatów i UI to wymienialne szczegóły wokół niej. Przewodnik architektury .NET zauważa, że
aplikacje stosujące odwrócenie zależności i DDD zwykle dochodzą do takiego kształtu.

## Reguła zależności

```
        ┌──────────────────────────────────────────────┐
        │ Prezentacja / Infrastruktura (adaptery)       │  endpointy ASP.NET Core, EF Core, SMTP, kolejki
        │   ┌──────────────────────────────────────┐    │
        │   │ Aplikacja (przypadki użycia)          │    │  PlaceOrderHandler, IOrderRepository, IEmailSender
        │   │   ┌──────────────────────────────┐    │    │
        │   │   │ Domena (encje, reguły)        │    │    │  Order, Money, OrderPlaced
        │   │   └──────────────────────────────┘    │    │
        │   └──────────────────────────────────────┘    │
        └──────────────────────────────────────────────┘
                 zależności kodu źródłowego wskazują tylko do środka
```

- **Zależności kodu źródłowego wskazują tylko do środka.** Nic w wewnętrznym kręgu nie wie o niczym w zewnętrznym: domena
  nie odwołuje się do EF Core, ASP.NET Core ani żadnego typu infrastruktury.
- Wewnętrzne kręgi definiują **interfejsy (porty)** dla tego, czego potrzebują z zewnątrz (`IOrderRepository`,
  `IEmailSender`, `IPaymentGateway`), a zewnętrzne dostarczają **adaptery**, które je implementują. To odwrócenie zależności
  na poziomie architektury.
- Dane przekraczają granice jako proste struktury (DTO, komendy, wyniki), a nie obiekty specyficzne dla frameworka.

## Porty i adaptery

Intencja według Cockburna: „Pozwolić, by aplikacja była tak samo sterowana przez użytkowników, programy, testy
automatyczne czy skrypty wsadowe i by dało się ją rozwijać i testować w izolacji od docelowych urządzeń i baz danych”.

- **Strona sterująca** (driving, primary): aktorzy wywołujący aplikację: API HTTP, CLI, konsument komunikatów, test. Ich
  adaptery tłumaczą żądania na wywołania przypadków użycia.
- **Strona sterowana** (driven, secondary): rzeczy, które wywołuje aplikacja: baza, e-mail, dostawcy płatności. Aplikacja
  definiuje port, adapter go implementuje, a testy podstawiają atrapy.

## Typowe rozwiązanie .NET

| Projekt | Zawiera | Referencje |
|---|---|---|
| `Domain` | encje, value objecty, zdarzenia domenowe, serwisy domenowe, niezmienniki | nic (tylko biblioteka bazowa) |
| `Application` | przypadki użycia / handlery komend i zapytań, porty (`IOrderRepository`), DTO, walidacja | `Domain` |
| `Infrastructure` | `DbContext` i migracje EF Core, implementacje repozytoriów, e-mail, pliki, klienci zewnętrznych API | `Application` |
| `Web` / `Api` | endpointy, middleware, composition root (rejestracja DI) | `Application`, a `Infrastructure` tylko do okablowania |

Composition root (`Program.cs`) to jedyne miejsce, które zna wszystkie konkretne typy i je łączy. Testy architektury (np.
NetArchTest, ArchUnitNET) mogą pilnować reguły w CI: „`Domain` nie może zależeć od `Microsoft.EntityFrameworkCore`”.

## Zalety

- Reguły biznesowe można **testować jednostkowo** bez bazy, serwera webowego i sieci.
- Frameworki i infrastrukturę można wymienić lub zaktualizować z ograniczonym wpływem.
- Struktura komunikuje intencję: przypadki użycia są widoczne w warstwie aplikacji.

## Krytyka i kompromisy

- **Narzut dla prostych aplikacji**: cztery projekty, interfejsy i mapowania dla CRUD-a na kilku tabelach to ceremonia bez
  zysku.
- **Mapowanie wszędzie**: encje, modele trwałości, DTO i modele widoku mogą wyglądać niemal tak samo.
- **Repozytorium na EF Core**: `DbContext` już implementuje jednostkę pracy i repozytoria; opakowywanie go w generyczne
  repozytoria często ukrywa przydatne funkcje. Wiele zespołów pozwala warstwie aplikacji zależeć od abstrakcji
  `IAppDbContext` albo używa EF Core bezpośrednio w handlerach.
- Pełna izolacja domeny od trwałości rzadko jest w praktyce całkowita (EF Core potrzebuje konstruktorów bezparametrowych albo
  konkretnych mapowań) i zwykle to akceptowalny kompromis.

## Źródła

- [Common web application architectures: clean architecture (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)
- [The clean architecture (Robert C. Martin)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [The onion architecture (Jeffrey Palermo)](https://jeffreypalermo.com/blog/the-onion-architecture-part-1/)
- [Clean architecture solution template (Steve Smith)](https://github.com/ardalis/cleanarchitecture)
- [NetArchTest](https://github.com/BenMorris/NetArchTest)

## Pytania

### Jaka jest główna idea czystej architektury? {junior}

Logika biznesowa jest umieszczona w centrum i nie zależy od frameworków, bazy, UI ani usług zewnętrznych; to szczegóły w zewnętrznych warstwach, które zależą od rdzenia.
Zależności kodu źródłowego mogą wskazywać tylko do środka (reguła zależności). Dzięki temu reguły biznesowe da się zrozumieć i przetestować w izolacji, a infrastrukturę
zmienić bez ich przepisywania.

### Czym czysta architektura różni się od tradycyjnej N-warstwowej? {mid}

W architekturze N-warstwowej warstwa biznesowa zależy od warstwy dostępu do danych, więc zależności wskazują w stronę bazy. Czysta architektura to odwraca: rdzeń aplikacji
definiuje interfejsy (np. `IOrderRepository`), a warstwa infrastruktury je implementuje i zależy od rdzenia. Baza staje się wymienialnym szczegółem, a rdzeń można testować
jednostkowo bez niej.

### Czym są porty i adaptery? {mid}

W architekturze heksagonalnej port to interfejs zdefiniowany przez aplikację w konkretnym celu: do bycia wywoływaną (porty sterujące, jak „złóż zamówienie”) albo do
wywoływania na zewnątrz (porty sterowane, jak „zapisz zamówienie” czy „wyślij e-mail”). Adapter to specyficzna dla technologii implementacja podłączana do portu: kontroler
HTTP albo konsument komunikatów po stronie sterującej, repozytorium EF Core albo klient SMTP po stronie sterowanej. Testy mogą podłączać własne adaptery.

### Co trafia do projektów Domain, Application i Infrastructure? {mid}

Domain: encje, value objecty, agregaty, zdarzenia domenowe i niezmienniki biznesowe, bez zależności od frameworków. Application: przypadki użycia (handlery komend i zapytań
albo serwisy aplikacyjne), porty do infrastruktury (`IOrderRepository`, `IEmailSender`), DTO i walidacja, zależne tylko od Domain. Infrastructure: implementacje tych portów
(`DbContext` EF Core, repozytoria, e-mail, magazyn plików, klienci zewnętrznych API), zależne od Application. Projekt Web zawiera endpointy i composition root.

### Czym jest composition root? {mid}

To jedyne miejsce, zwykle `Program.cs` w projekcie startowym, gdzie składa się graf obiektów aplikacji: interfejsy z warstw wewnętrznych są mapowane w kontenerze DI na ich
implementacje z Infrastructure. Tylko ono może znać wszystkie konkretne typy, dlatego projekt startowy może odwoływać się do Infrastructure, choć reszta warstwy prezentacji
nie powinna jej używać bezpośrednio.

### Jak wymusić regułę zależności? {senior}

Przede wszystkim referencjami między projektami: projekt Domain nie odwołuje się do Application ani Infrastructure, a Application nie odwołuje się do Infrastructure, więc
kod łamiący regułę się nie skompiluje. Testy architektury (NetArchTest, ArchUnitNET) dodają reguły, których referencje nie wyrażą, np. „typy w Domain nie mogą zależeć od
`Microsoft.EntityFrameworkCore`” albo „handlery muszą być sealed”, i działają w CI. Resztę pokrywają przeglądy kodu i jasne konwencje.

### Jakie są wady czystej architektury? {mid}

Dodaje strukturę: kilka projektów, interfejsy i mapowanie między encjami a DTO, co jest narzutem dla prostych aplikacji CRUD, gdzie niewiele logiki biznesowej trzeba
chronić. Abstrakcje, takie jak generyczne repozytoria na EF Core, mogą ukrywać przydatne funkcje ORM-a. Opłaca się przy złożonej lub długo żyjącej domenie; dla prostych
serwisów lepszy może być jeden projekt albo pionowe wycinki.

### Czy w czystej architekturze opakowywać EF Core w repozytoria? {senior}

To sporne. `DbContext` już jest jednostką pracy, a `DbSet` repozytorium, więc generyczne opakowanie często dodaje kod i ukrywa funkcje, takie jak projekcje, `Include`
i `AsNoTracking`. Argumenty za konkretnymi repozytoriami: wyrażają operacje domenowe, trzymają reguły ładowania agregatów w jednym miejscu i pozwalają na zaślepki w testach
jednostkowych. Częstym kompromisem są konkretne repozytoria dla agregatów po stronie zapisu i bezpośredni `DbContext` albo obiekty zapytań dla odczytów.

### Jak czysta architektura ułatwia testowanie? {junior}

Ponieważ warstwy domeny i aplikacji nie zależą od infrastruktury, ich logikę można testować szybkimi testami jednostkowymi z prostymi atrapami portów (repozytorium
w pamięci, sztuczny nadawca e-maili) zamiast prawdziwej bazy czy sieci. Adaptery infrastruktury pokrywa mniejsza liczba testów integracyjnych z prawdziwymi zależnościami.
Odpowiada to piramidzie testów.

### Czy architektura heksagonalna, cebulowa i czysta to to samo? {mid}

To warianty tej samej zasady z innymi akcentami i terminologią. Architektura heksagonalna skupia się na portach i adapterach oraz symetrii strony sterującej i sterowanej.
Cebulowa rysuje koncentryczne warstwy z modelem domeny w środku. Czysta uogólnia je regułą zależności i nazywa warstwy encjami, przypadkami użycia, adapterami interfejsów
i frameworkami. W praktyce rozwiązania .NET implementujące którąkolwiek z nich wyglądają bardzo podobnie.
