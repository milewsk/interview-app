# Bazy NoSQL: rodzaje i zastosowania {junior}

**NoSQL** („not only SQL”) obejmuje bazy danych, które nie używają relacyjnego modelu tabel jako głównej abstrakcji. Wymieniają część funkcji
relacyjnych (złączenia, stałe schematy, czasem transakcje wielorekordowe) na elastyczne modele danych, skalowanie poziome i wysoką dostępność.
Pytanie na rozmowie rzadko brzmi „czym jest MongoDB”, a zwykle „jaki rodzaj bazy pasuje do tego problemu i dlaczego nie PostgreSQL?”.

## Główne rodziny

| Rodzaj | Model danych | Przykłady | Dobre do |
|---|---|---|---|
| **Dokumentowe** | dokumenty w stylu JSON z zagnieżdżonymi obiektami i tablicami | MongoDB, Couchbase, Azure Cosmos DB, Firestore | agregatów czytanych i zapisywanych w całości: katalogi, profile, treści |
| **Klucz-wartość** | wartość (często nieprzezroczysta) na klucz | Redis, Valkey, DynamoDB, etcd | cache, sesji, liczników, bardzo szybkich wyszukiwań po kluczu |
| **Szerokokolumnowe** | wiersze z dynamicznymi kolumnami pogrupowane w partycje | Cassandra, ScyllaDB, HBase, Bigtable | ogromnej liczby zapisów, szeregów czasowych, wielu regionów, znanych wzorców zapytań |
| **Grafowe** | węzły i relacje z właściwościami | Neo4j, Amazon Neptune | silnie powiązanych danych: sieci społecznościowe, rekomendacje, wykrywanie oszustw |
| **Wyszukiwarki** | indeksy odwrócone nad dokumentami | Elasticsearch, OpenSearch | wyszukiwania pełnotekstowego, logów, filtrowania fasetowego |
| **Szeregi czasowe / wektorowe** | punkty ze znacznikiem czasu / embeddingi | InfluxDB, TimescaleDB; indeksy wektorowe w wielu bazach | metryk i IoT; wyszukiwania semantycznego i RAG |

## Relacyjne a NoSQL

- **Schemat**: schematy relacyjne definiuje się z góry i są wymuszane; bazy dokumentowe pozwalają aplikacji definiować strukturę (opcjonalnie
  z walidacją), co pasuje do zmieniających się albo niejednorodnych danych, ale przenosi dyscyplinę do kodu.
- **Relacje**: bazy relacyjne świetnie radzą sobie ze złączeniami i zapytaniami ad hoc między encjami; modele NoSQL projektuje się **wokół wzorców
  dostępu** (osadza się to, co czyta się razem, i duplikuje, żeby uniknąć złączeń), co przyspiesza znane zapytania, a utrudnia nieznane.
- **Spójność i transakcje**: bazy relacyjne domyślnie mają transakcje ACID; wiele systemów NoSQL domyślnie zapewnia atomowość pojedynczego rekordu
  i regulowaną albo ostateczną spójność (MongoDB ma też transakcje wielodokumentowe).
- **Skalowanie**: wiele systemów NoSQL zbudowano do skalowania poziomego (sharding, partycjonowanie) i replikacji między regionami; bazy relacyjne
  skalują się w górę i używają replik do odczytu, a sharding jest dostępny, ale trudniejszy.

Granica jest płynna: PostgreSQL przechowuje i indeksuje dokumenty JSON. Sprawdzone na PostgreSQL 18: zapytanie zawierania `doc @> '{"tags":["sale"]}'`
na 50 000 wierszy JSONB wykonało się jako przejście sekwencyjne, a po `CREATE INDEX ... USING gin (doc jsonb_path_ops)` jako **Bitmap Index Scan** na
indeksie GIN, zwracając 5000 wierszy. Relacyjna baza z kolumnami JSON często wystarcza przy „kilku elastycznych polach”.

## Wybór

Zaczyna się od danych i wzorców dostępu: silnie powiązane dane ze złożonymi zapytaniami i transakcjami przemawiają za bazą relacyjną; samodzielne
agregaty o elastycznym kształcie i dużym wolumenie odczytów i zapisów za bazą dokumentową; wyszukiwania po kluczu z ekstremalną szybkością za magazynem
klucz-wartość; masowe zapisy z przewidywalnymi zapytaniami za bazą szerokokolumnową; przechodzenie relacji za bazą grafową. **Polyglot persistence**
(kilka magazynów w jednym systemie, np. PostgreSQL + Redis + Elasticsearch) jest częste, ale każdy magazyn dodaje koszt utrzymania.

## Źródła

- [NoSQL databases explained (MongoDB)](https://www.mongodb.com/resources/basics/databases/nosql-explained)
- [What is NoSQL? (AWS)](https://aws.amazon.com/nosql/)
- [NoSQL definition (Martin Fowler)](https://martinfowler.com/bliki/NosqlDefinition.html)
- [Polyglot persistence (Martin Fowler)](https://martinfowler.com/bliki/PolyglotPersistence.html)
- [PostgreSQL: JSON types and indexing](https://www.postgresql.org/docs/current/datatype-json.html)

## Pytania

### Czym jest NoSQL? {junior}

To szerokie określenie baz danych, które nie używają relacyjnego modelu tabel, wierszy i złączeń SQL jako głównej abstrakcji: między innymi baz dokumentowych, klucz-wartość, szerokokolumnowych
i grafowych. Zwykle oferują elastyczne schematy, modele danych bliższe obiektom aplikacji oraz wbudowane skalowanie poziome i replikację, rezygnując z części funkcji relacyjnych, jak dowolne
złączenia albo, w niektórych systemach, transakcje wielorekordowe.

### Jakie są główne rodzaje baz NoSQL? {junior}

Bazy dokumentowe (MongoDB, Couchbase, Cosmos DB) przechowują dokumenty w stylu JSON; magazyny klucz-wartość (Redis, DynamoDB) mapują klucze na wartości; magazyny szerokokolumnowe (Cassandra,
HBase) przechowują wiersze z dynamicznymi kolumnami w partycjach zaprojektowanych pod ogromną liczbę zapisów; bazy grafowe (Neo4j, Neptune) przechowują węzły i relacje dla zapytań przechodzących
po grafie. Pokrewne wyspecjalizowane magazyny to wyszukiwarki oraz bazy szeregów czasowych i wektorowe.

### Kiedy wybrać bazę dokumentową zamiast relacyjnej? {mid}

Gdy dane naturalnie tworzą samodzielne agregaty czytane i zapisywane razem (produkt z wariantami, profil użytkownika, strona CMS), gdy struktura różni się między rekordami albo szybko się zmienia
i gdy potrzebne jest łatwe skalowanie poziome. Baza relacyjna pozostaje lepszym domyślnym wyborem, gdy dane są silnie powiązane, wymagają złożonych zapytań ad hoc i raportowania albo zależą od
transakcji i ograniczeń obejmujących wiele encji.

### Czym jest magazyn szerokokolumnowy i do czego się nadaje? {mid}

To baza, jak Cassandra czy ScyllaDB, w której dane są grupowane według klucza partycji i sortowane według kolumn klastrujących w partycji, rozproszone na wiele węzłów bez jednego lidera. Radzi sobie
z bardzo dużą przepustowością zapisów i replikacją między regionami z regulowaną spójnością. Tabele projektuje się pod zapytania (modelowanie „query-first”, często z duplikacją danych na wzorzec
dostępu), bo dowolne złączenia i filtry ad hoc nie są efektywnie obsługiwane.

### Kiedy baza grafowa to dobry wybór? {mid}

Gdy pytania dotyczą relacji i ścieżek: znajomi znajomych, rekomendacje oparte na wspólnym zachowaniu, wykrywanie oszustw między powiązanymi kontami, analiza sieci albo zależności. Bazy grafowe
przechowują relacje jako pełnoprawne rekordy, więc przechodzenie wielu skoków jest efektywne, podczas gdy w SQL każdy skok to kolejne złączenie, które staje się kosztowne i trudne do wyrażenia dla
ścieżek o zmiennej długości.

### Czy PostgreSQL może zastąpić bazę dokumentową? {mid}

Często tak, przy umiarkowanych potrzebach: kolumny JSONB przechowują dokumenty, operatory pozwalają je odpytywać, a indeksy GIN przyspieszają zapytania zawierania; w teście zapytanie zawierania
JSONB na 50 000 wierszy przeszło z przejścia sekwencyjnego na przejście indeksu GIN po jego utworzeniu. Obok elastycznych danych zachowuje się transakcje, złączenia i ograniczenia. Dedykowane bazy
dokumentowe nadal oferują bardziej naturalne API dokumentów, wbudowany sharding i przełączanie awaryjne replica setów.

### Czym jest polyglot persistence? {mid}

To używanie różnych technologii przechowywania do różnych potrzeb w jednym systemie: np. PostgreSQL do zamówień, Redis do cache i sesji, Elasticsearch do wyszukiwania produktów, baza grafowa do
rekomendacji. Każdy magazyn pasuje do swojego obciążenia, ale każdy dodatkowy przynosi koszt utrzymania, problemy z synchronizacją danych (często rozwiązywane zdarzeniami albo change data capture)
i wymaga od zespołu kolejnych umiejętności.

### Z czego bazy NoSQL rezygnują w porównaniu z relacyjnymi? {mid}

Zależnie od systemu: ze złączeń ad hoc między encjami, wymuszanych schematów i kluczy obcych, wielorekordowych transakcji ACID i domyślnej silnej spójności. W zamian oferują elastyczne schematy,
skalowanie poziome, wysoką dostępność i modele danych dostrojone do konkretnych wzorców dostępu. Wiele nowoczesnych baz NoSQL dodało transakcje i walidację schematu, a wiele baz relacyjnych dodało
JSON, więc różnice są mniejsze niż kiedyś.

### Czym jest modelowanie danych „query-first”? {senior}

To projektowanie struktury przechowywania na podstawie zapytań, które aplikacja będzie wykonywać, a nie encji i ich znormalizowanych relacji. Jest niezbędne w magazynach szerokokolumnowych, jak
Cassandra, gdzie każda tabela obsługuje konkretne zapytania, a dane są duplikowane między tabelami, i jest domyślnym podejściem w bazach dokumentowych (osadzaj to, co czyta się razem). Znane zapytania
są wtedy bardzo szybkie, ale nowe, nieprzewidziane zapytania są trudniejsze i czasem wymagają nowych tabel albo indeksów oraz uzupełnienia danych.

### Jak wybrać bazę danych dla nowej usługi? {senior}

Zacząć od kształtu danych i wzorców dostępu: relacji i elastyczności zapytań, potrzeb spójności i transakcji, wolumenów odczytów i zapisów oraz docelowych opóźnień, wzrostu i rozproszenia
geograficznego, a także ograniczeń operacyjnych (dostępne usługi zarządzane, doświadczenie zespołu, koszt). Preferować dobrze znaną bazę relacyjną, chyba że konkretne wymaganie (elastyczne dokumenty
w dużej skali, ekstremalne wyszukiwania po kluczu, masowe zapisy, przechodzenie grafu, wyszukiwanie pełnotekstowe) wyraźnie wskazuje inny kierunek, a wyspecjalizowane magazyny dodawać dopiero wtedy,
gdy rozwiązują zmierzony problem.
