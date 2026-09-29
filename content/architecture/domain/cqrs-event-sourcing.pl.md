# CQRS i event sourcing {senior}

**CQRS** (Command Query Responsibility Segregation) używa **różnych modeli do zapisu i odczytu** danych. **Event sourcing**
przechowuje **historię zmian** (zdarzenia) zamiast bieżącego stanu. Często wymienia się je razem i dobrze się łączą, ale
każde można stosować bez drugiego, a oba dodają złożoność uzasadnioną tylko w konkretnych częściach systemu.

## Od CQS do CQRS

- **CQS** (command–query separation, Bertrand Meyer) to reguła na poziomie metod: metoda albo zmienia stan (komenda, nic nie
  zwraca), albo zwraca dane (zapytanie, bez efektów ubocznych), ale nie oba naraz.
- **CQRS** przenosi ją na poziom architektury: Martin Fowler opisuje go jako użycie „innego modelu do aktualizacji informacji
  niż model, którego używasz do jej odczytu”.

```
Komendy ──► handlery komend ──► model domeny (agregaty, reguły) ──► magazyn zapisu
                                                   │ zdarzenia
                                                   ▼
Zapytania ─► handlery zapytań ──► modele odczytu (zdenormalizowane, w kształcie DTO) ◄── projekcje
```

- **Strona zapisu** skupia się na regułach biznesowych i spójności: bogate agregaty, walidacja, transakcje.
- **Strona odczytu** skupia się na zapytaniach: DTO projektowane bezpośrednio z bazy (czysty SQL, Dapper, projekcje EF Core
  z `AsNoTracking`) albo osobne zdenormalizowane tabele odczytu, cache czy indeksy wyszukiwania.
- **Poziomy**: najlżejsza forma to po prostu osobne handlery komend i zapytań nad tą samą bazą (częste w .NET z handlerami
  w stylu MediatR). Cięższa forma ma osobną bazę odczytu aktualizowaną asynchronicznie ze zdarzeń, co oznacza, że strona
  odczytu jest **ostatecznie spójna**.

Ostrzeżenie Fowlera: „w większości systemów CQRS dodaje ryzykowną złożoność”; stosuje się go tylko w konkretnych bounded
contextach, gdzie odczyty i zapisy bardzo się różnią, a nie w całym systemie.

## Event sourcing

Zamiast przechowywać bieżące saldo, przechowuje się to, co się wydarzyło: `AccountOpened`, `Deposited(100)`, `Withdrawn(30)`.
Bieżący stan wyprowadza się przez **odtworzenie** (replay) zdarzeń.

```csharp
public static Account Rehydrate(IEnumerable<Event> events)
{
    var account = new Account();
    foreach (var e in events) account.Apply(e);   // Deposited → +kwota, Withdrawn → −kwota
    return account;
}
```

Test minimalnego magazynu zdarzeń pokazał:

- odtworzenie `AccountOpened`, `Deposited(100)` i `Withdrawn(30)` dało saldo 70 w wersji 3;
- dopisanie z nieaktualną **oczekiwaną wersją** zakończyło się błędem „expected version 2, actual 3”, co jest mechanizmem
  optymistycznej współbieżności magazynów zdarzeń;
- odtworzenie tylko pierwszych 2 zdarzeń dało stan z tamtego momentu (100): **podróż w czasie** i pełny ślad audytowy za
  darmo;
- **projekcja** zbudowała model odczytu (`Ada, 120, 3 transakcje`) ze strumienia zdarzeń;
- **snapshot** (stan w wersji 3) plus późniejsze zdarzenia dały ten sam wynik co pełne odtworzenie.

Zalety: kompletny dziennik audytowy, możliwość odbudowy stanu i nowych modeli odczytu z historii, zapytania temporalne,
naturalna integracja przez zdarzenia. Koszty: zdarzenia są **niemutowalne i trwałe**, więc zmiana ich schematu wymaga
wersjonowania albo upcastingu; zapytania wymagają projekcji; strumienie rosną i potrzebują snapshotów; spójność ostateczna
modeli odczytu; trudniejsze „prawo do bycia zapomnianym” z RODO (crypto-shredding); stroma krzywa nauki.

## Kiedy ich używać

- CQRS: gdy obciążenia odczytu i zapisu bardzo się różnią (złożone reguły domenowe przy zapisach, wiele różnorodnych zapytań
  albo bardzo duże obciążenie odczytami) albo gdy odczytami i zapisami zajmują się różne zespoły. Prosta forma (osobne
  handlery, projekcje dla odczytów) jest tania i szeroko przydatna.
- Event sourcing: domeny, w których liczy się sama historia (finanse, księgowość, logistyka, audyt), albo gdy trzeba
  wyprowadzać wiele widoków z tych samych zdarzeń. Nie dla prostego CRUD-a.

## Źródła

- [CQRS pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Event sourcing pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html)
- [Event sourcing (Martin Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Simplified CQRS and DDD in a microservice (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns)

## Pytania

### Czym jest CQRS? {mid}

Command Query Responsibility Segregation: rozdzielenie modelu używanego do zmiany danych (komendy, obsługiwane przez model zapisu z regułami biznesowymi i agregatami) od modelu
używanego do ich odczytu (zapytania, obsługiwane przez modele odczytu w kształcie potrzebnym UI). Każdą stronę można optymalizować niezależnie: zapis pod spójność
i niezmienniki, odczyt pod szybkie, zdenormalizowane zapytania. Rozciąga się od osobnych handlerów nad jedną bazą po osobne bazy synchronizowane zdarzeniami.

### Czym CQS różni się od CQRS? {mid}

CQS (command–query separation) to zasada dla pojedynczych metod: metoda powinna albo zmieniać stan i nic nie zwracać, albo zwracać wartość bez efektów ubocznych. CQRS
stosuje tę samą ideę na poziomie architektury: osobne modele, handlery i ewentualnie magazyny dla komend i zapytań. CQS jest prawie zawsze dobrym pomysłem; CQRS to kompromis
wart zawarcia tylko w niektórych kontekstach.

### Czy CQRS wymaga dwóch baz danych? {mid}

Nie. Najprostszy CQRS używa jednej bazy z osobnymi handlerami komend (wczytującymi agregaty, egzekwującymi reguły, zapisującymi) i handlerami zapytań (projektującymi bezpośrednio
do DTO, np. z `AsNoTracking` albo Dapperem). Osobne magazyny odczytu (zdenormalizowane tabele, baza dokumentowa, indeks wyszukiwania) to opcjonalny krok dla skalowania albo
bardzo różnych kształtów odczytu i przynoszą spójność ostateczną oraz pracę przy synchronizacji.

### Czym jest event sourcing? {mid}

To podejście do utrwalania, w którym system przechowuje sekwencję zdarzeń domenowych, które zmieniły encję (`AccountOpened`, `Deposited`, `Withdrawn`), zamiast jej bieżącego
stanu. Bieżący stan odtwarza się przez odtworzenie zdarzeń, a nowe zdarzenia są dopisywane. Daje to kompletny ślad audytowy i możliwość odbudowy stanu z dowolnego momentu albo
budowy nowych modeli odczytu z historii.

### Jak działa optymistyczna współbieżność w magazynie zdarzeń? {senior}

Każdy strumień (agregat) ma wersję równą liczbie swoich zdarzeń. Komenda wczytuje strumień, podejmuje decyzję i dopisuje nowe zdarzenia z odczytaną wersją jako „oczekiwaną
wersją”. Jeśli w międzyczasie ktoś inny coś dopisał, faktyczna wersja się różni i dopisanie jest odrzucane (w teście: „expected version 2, actual 3”). Komendę ponawia się wtedy
na świeżym stanie albo zgłasza konflikt użytkownikowi.

### Czym są projekcje i snapshoty? {senior}

Projekcja przetwarza strumień zdarzeń i buduje model odczytu zoptymalizowany pod zapytania, np. tabelę sald kont z liczbą transakcji; można ją odbudować od zera, odtwarzając
wszystkie zdarzenia. Snapshot zapisuje stan agregatu w danej wersji, więc wczytanie go wymaga tylko snapshotu plus zdarzeń po nim, zamiast odtwarzania bardzo długiego strumienia.
Oba to optymalizacje wyprowadzone ze zdarzeń, które pozostają źródłem prawdy.

### Jakie są wady event sourcingu? {senior}

Złożoność i krzywa nauki, spójność ostateczna modeli odczytu, potrzeba projekcji dla każdego zapytania, ewolucja schematu zdarzeń (zapisane zdarzenia nigdy się nie zmieniają,
więc nowe wersje wymagają upcastingu albo wersjonowanych handlerów), rosnące strumienie wymagające snapshotów i trudność usuwania danych osobowych (RODO), często rozwiązywana
przez crypto-shredding. Rzadko jest uzasadniony w prostych domenach CRUD.

### Kiedy nie używać CQRS? {mid}

W prostych domenach i aplikacjach CRUD, gdzie ten sam model dobrze sprawdza się do odczytu i zapisu, oraz w zespołach bez doświadczenia ze spójnością ostateczną. Martin Fowler
ostrzega, że w większości systemów CQRS dodaje ryzykowną złożoność i powinien być stosowany tylko w konkretnych bounded contextach. Lekka forma (osobne handlery zapytań
projektujące do DTO) daje dużą część korzyści bez ryzyka.

### Jak modele odczytu pozostają aktualne w CQRS z osobnym magazynem odczytu? {senior}

Strona zapisu publikuje zdarzenia po udanej zmianie (niezawodnie, np. przez transactional outbox), a handlery projekcji je konsumują i aktualizują magazyn odczytu. Strona odczytu
jest więc ostatecznie spójna: przez krótki czas po komendzie zapytanie może zwrócić stare dane. UI radzi sobie z tym, zwracając nowy stan z komendy, stosując optymistyczne
aktualizacje albo czekając, aż projekcja osiągnie daną wersję.

### Co daje event sourcing, czego nie daje zwykła tabela audytowa? {senior}

W event sourcingu zdarzenia są źródłem prawdy, a nie dodatkowym zapisem: stan jest z nich wyprowadzany, więc historia jest z definicji kompletna i spójna ze stanem. Można
odbudować stan z dowolnego momentu, naprawić błędy w danych pochodnych przez ponowne odtworzenie i tworzyć nowe modele odczytu z przeszłych zdarzeń. Osobna tabela audytowa może
rozjechać się z prawdziwym stanem albo pominąć zmiany wykonane poza ścieżką kodu, która do niej zapisuje.
