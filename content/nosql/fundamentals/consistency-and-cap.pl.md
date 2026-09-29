# Spójność, CAP i BASE {mid}

Rozproszone bazy danych replikują dane na wiele maszyn, a sieci zawodzą. **Twierdzenie CAP** mówi, że gdy wystąpi **podział sieci**
(partycja), system musi wybrać między **spójnością** (każdy odczyt widzi najnowszy zapis) a **dostępnością** (każde żądanie dostaje odpowiedź).
**PACELC** dodaje, że nawet bez partycji istnieje kompromis między **opóźnieniem** a spójnością. Te idee wyjaśniają, dlaczego systemy NoSQL
mówią o spójności ostatecznej, kworach i regulowanej spójności.

## CAP w praktyce

- **C** w CAP oznacza **linearyzowalność**: system zachowuje się tak, jakby istniała jedna kopia danych. (To nie jest „C” z ACID, które oznacza
  ograniczenia integralności.)
- **A** oznacza, że każde żądanie do działającego węzła dostaje odpowiedź, która nie jest błędem.
- **P**: partycje zdarzają się w prawdziwych sieciach, więc prawdziwy wybór dotyczy tego, co robić **w trakcie** partycji: odrzucać część żądań (CP)
  albo odpowiadać potencjalnie nieaktualnymi danymi (AP).

Sprawdzone na trzywęzłowym replica secie MongoDB: gdy primary stracił kontakt z oboma secondary, **ustąpił i odrzucał zapisy** (`NotWritablePrimary`),
zamiast ryzykować rozbieżność danych, czyli wybrał spójność dla zapisów. Odczyty z secondary za to wymieniają spójność na dostępność i opóźnienie: tuż
po zapisie większościowym primary i zwykły secondary zwróciły nowy dokument, a secondary opóźniony o 5 sekund zwrócił **„NOT FOUND”**, a 7 sekund później
już go miał. To **spójność ostateczna**: repliki się zbiegają, jeśli zapisy ustaną.

Prawdziwe systemy nie są po prostu „CP” albo „AP”: większość oferuje ustawienia per operacja (write/read concern i read preference w MongoDB, poziomy
spójności w Cassandrze, silnie spójne odczyty w DynamoDB).

## PACELC

„Jeśli jest Partycja, wybierz Dostępność albo Spójność; w przeciwnym razie (Else) wybierz Opóźnienie (Latency) albo Spójność.” Nawet w normalnej pracy
czekanie na więcej replik (zapisy większościowe, odczyt z lidera, synchroniczna replikacja między regionami) kosztuje opóźnienie. Systemy takie jak
Cassandra i DynamoDB domyślnie stawiają na niskie opóźnienie (PA/EL), a klasyczne bazy z jednym liderem i synchroniczną replikacją na spójność (PC/EC).

## Kwora

Przy `N` replikach zapis potwierdzony przez `W` z nich i odczyt pytający `R` z nich nakładają się, gdy **`R + W > N`**, więc odczyt widzi co najmniej jedną
kopię najnowszego zapisu (np. `N=3`, `W=2`, `R=2`). Mniejsze `R`/`W` oznaczają niższe opóźnienie i wyższą dostępność, ale możliwe nieaktualne odczyty.
`w: 'majority'` z read concern `majority` w MongoDB realizuje tę samą ideę większości.

## ACID a BASE

- **ACID** (bazy relacyjne, transakcje MongoDB): atomowe, spójne, izolowane i trwałe transakcje.
- **BASE**: Basically Available, Soft state, Eventually consistent: akceptacja chwilowej niespójności na rzecz dostępności i skali oraz późniejsze
  rozwiązywanie konfliktów (last-write-wins, wektory wersji, CRDT, scalanie w aplikacji).

Silniejsze modele pomiędzy: **read-your-writes**, **monotonic reads** i **spójność przyczynowa** (sesje spójne przyczynowo w MongoDB) dają przydatne
gwarancje bez pełnej linearyzowalności.

## Źródła

- [CAP theorem (Gilbert and Lynch, "Brewer's conjecture...")](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf)
- [Please stop calling databases CP or AP (Martin Kleppmann)](https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html)
- [Consistency models (Jepsen)](https://jepsen.io/consistency)
- [PACELC (Daniel Abadi)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
- [MongoDB: read isolation, consistency and recency](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/)

## Pytania

### Co mówi twierdzenie CAP? {junior}

Że rozproszony magazyn danych nie może jednocześnie zagwarantować wszystkich trzech: spójności (każdy odczyt zwraca najnowszy zapis), dostępności (każde żądanie dostaje odpowiedź, która nie jest
błędem) i odporności na partycje (system działa, gdy komunikaty między węzłami giną). Ponieważ partycji sieci nie da się wykluczyć, w ich trakcie system musi wybrać między pozostaniem spójnym
(odrzucanie części żądań) a pozostaniem dostępnym (możliwe zwracanie nieaktualnych danych).

### Czy „C” w CAP to to samo co „C” w ACID? {mid}

Nie. Spójność w CAP oznacza linearyzowalność: wszyscy klienci widzą operacje tak, jakby istniała jedna aktualna kopia. Spójność w ACID oznacza, że transakcja przeprowadza bazę z jednego
poprawnego stanu do innego, respektując ograniczenia i niezmienniki. System może być ACID na jednym węźle, a mimo to oferować tylko spójność ostateczną między replikami.

### Czym jest spójność ostateczna? {junior}

To gwarancja, że jeśli nie pojawią się nowe zapisy, wszystkie repliki w końcu zwrócą tę samą wartość; w międzyczasie odczyty z różnych replik mogą zwracać różne, nieaktualne wartości. W teście
opóźniony secondary MongoDB zwrócił „NOT FOUND” dla właśnie zapisanego dokumentu, podczas gdy primary go zwrócił, a kilka sekund później secondary też go miał. Aplikacje muszą tolerować odczyt
starych danych albo kierować ważne odczyty do lidera.

### Dlaczego nazywanie bazy „CP” albo „AP” to uproszczenie? {senior}

Większość baz pozwala wybierać spójność per operacja i zachowuje się inaczej dla odczytów i zapisów: MongoDB odrzuca zapisy po stronie mniejszości partycji (primary ustępuje, co pokazał test),
ale może serwować nieaktualne odczyty z secondary; Cassandra i DynamoDB oferują silną albo ostateczną spójność per żądanie. Poza tym CAP opisuje tylko zachowanie w trakcie partycji i nic nie
mówi o opóźnieniu w normalnej pracy, co dodaje PACELC. Zamiast etykiet opisuje się gwarancje konkretnych konfiguracji.

### Czym jest PACELC? {senior}

To rozszerzenie CAP: jeśli jest Partycja (P), system wybiera między Dostępnością a Spójnością (A/C); w przeciwnym razie (E), w normalnej pracy, wybiera między Opóźnieniem a Spójnością (L/C).
Oddaje to fakt, że synchroniczna replikacja na więcej węzłów dla silniejszej spójności kosztuje opóźnienie nawet wtedy, gdy nic nie zawodzi, dlatego systemy takie jak Cassandra czy DynamoDB
domyślnie stawiają na niskie opóźnienie i spójność ostateczną, z dostępnymi silniejszymi opcjami.

### Jak kwora zapewniają spójność? {mid}

Przy N replikach, jeśli każdy zapis musi potwierdzić W replik, a każdy odczyt pyta R replik, to gdy R + W > N, zbiór odczytu i zbiór zapisu się nakładają, więc co najmniej jedna replika w każdym
odczycie ma najnowszy zapis (np. N = 3, W = 2, R = 2). Obniżenie R albo W zwiększa szybkość i dostępność, ale dopuszcza nieaktualne odczyty. Odczyty i zapisy większościowe w MongoDB realizują
tę samą ideę.

### Co oznacza BASE? {mid}

Basically Available, Soft state, Eventually consistent: filozofia projektowania systemów rozproszonych, która przedkłada dostępność i skalowalność nad natychmiastową spójność. System odpowiada
w trakcie awarii, jego stan może się zmieniać bez nowego wejścia, gdy repliki się zbiegają, i z czasem staje się spójny. To przeciwieństwo ścisłych gwarancji transakcyjnych ACID.

### Jak MongoDB zachowuje się w trakcie partycji sieci? {senior}

Strona z większością głosujących członków zachowuje albo wybiera primary i nadal przyjmuje zapisy; primary po stronie mniejszości ustępuje i odrzuca zapisy (w teście odizolowany primary przestał
przyjmować zapisy po około 12 sekundach i zwracał `NotWritablePrimary`). Zapisy potwierdzone tylko przez starego primary (`w: 1`) mogą zostać wycofane, gdy wróci; zapisy większościowe przetrwają.
Secondary po obu stronach mogą nadal serwować odczyty, jeśli pozwala na to read preference.

### Czym jest spójność read-your-writes i dlaczego ma znaczenie? {mid}

To gwarancja, że gdy klient coś zapisze, jego kolejne odczyty widzą ten zapis. Bez niej użytkownik, który zaktualizuje profil i przeładuje stronę, może zobaczyć stare dane, jeśli odczyt trafi do
opóźnionej repliki (jak opóźniony secondary w teście). Osiąga się ją przez odczyt z lidera po zapisach, sesje przyklejone albo spójność przyczynową (sesje spójne przyczynowo w MongoDB).

### Jak systemy rozwiązują kolidujące zapisy w bazach ze spójnością ostateczną? {senior}

Strategiami takimi jak last-write-wins według znaczników czasu (proste, ale może po cichu gubić aktualizacje), wektory wersji wykrywające równoległe zapisy i zachowujące wersje równoległe do scalenia
przez aplikację, CRDT (typy danych, jak liczniki i zbiory, które scalają się automatycznie bez konfliktów) albo logika scalania w aplikacji. Systemy z jednym liderem, jak MongoDB, unikają
większości konfliktów, przyjmując zapisy tylko na primary.
