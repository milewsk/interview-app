# Transakcje, write concern i read concern {senior}

MongoDB domyślnie gwarantuje **atomowość na poziomie dokumentu** i obsługuje **wielodokumentowe transakcje ACID** w replica setach
i klastrach shardowanych. Trwałość i widoczność stroi się per operacja przez **write concern** (ile węzłów musi potwierdzić zapis) i **read
concern** (jakie dane może zwrócić odczyt). Zrozumienie tych mechanizmów oddziela mity w stylu „MongoDB gubi dane” od poprawnej konfiguracji.
Przykłady uruchamiałem na replica setach MongoDB 8.0 (jednowęzłowym oraz trzywęzłowym dla przypadków awarii).

## Atomowość pojedynczego dokumentu

Zapis do jednego dokumentu jest atomowy, łącznie z zagnieżdżonymi polami i tablicami, więc dobrze zaprojektowany dokument często nie potrzebuje
transakcji. Operacje na wielu dokumentach są atomowe **tylko per dokument**: `updateMany`, który trafił na dokument z nienumerycznym `balance`,
przerwał się w połowie, a dokumenty zaktualizowane przed błędem **zachowały zmiany** (A i B zostały zwiększone, C nie).

## Transakcje wielodokumentowe

```js
const session = db.getMongo().startSession();
const accounts = session.getDatabase('bank').accounts;
session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
accounts.updateOne({ _id: 'A' }, { $inc: { balance: -30 } });
accounts.updateOne({ _id: 'B' }, { $inc: { balance: 30 } });
session.commitTransaction();                 // albo abortTransaction()
```

Sprawdzone:

- gdy transakcja była otwarta, czytelnik spoza niej nadal widział `A=100 B=0`; po commicie widział `A=70 B=30`;
- `abortTransaction` odrzuciło zmianę;
- dwie transakcje aktualizujące ten sam dokument: druga od razu zakończyła się **`WriteConflict`** z etykietą **`TransientTransactionError`**,
  która oznacza „ponów całą transakcję”. Pomocnicze `withTransaction` w sterownikach automatycznie ponawiają takie błędy.

Transakcje wymagają replica setu albo klastra shardowanego (samodzielny serwer ich nie obsługuje), mają domyślny limit czasu życia **60 sekund**
(`transactionLifetimeLimitSeconds`, sprawdzone) i kosztują więcej niż zapisy pojedynczych dokumentów, więc używa się ich tam, gdzie niezmienniki
obejmują wiele dokumentów, a nie domyślnie.

## Write concern

| Write concern | Znaczenie |
|---|---|
| `w: 1` | potwierdzone tylko przez primary |
| `w: 'majority'` (domyślne od 5.0) | potwierdzone przez większość głosujących członków, więc przetrwa przełączenie awaryjne |
| `w: 0` | wyślij i zapomnij |
| `j: true` | zapisane w dzienniku na dysku |

Sprawdzone na trzywęzłowym secie: `w: 'majority'` powiodło się przy wszystkich węzłach działających i przy **jednym** wyłączonym secondary;
przy **dwóch** wyłączonych zakończyło się `WriteConcernFailed` („waiting for replication timed out”) po `wtimeout`. Na jednowęzłowym secie
`w: 2` zakończyło się `UnsatisfiableWriteConcern`. W obu przypadkach zapis **i tak został wykonany na primary** (dokument był obecny, a po powrocie
secondary się zreplikował): błąd write concern oznacza „niepotwierdzony”, a nie „wycofany”, więc ponowienia muszą być idempotentne.

## Read concern i read preference

- **Read concern**: `local` (domyślny: najnowsze dane węzła, mogą zostać wycofane po przełączeniu awaryjnym), `majority` (tylko dane zatwierdzone
  przez większość), `snapshot` (spójny punkt w czasie, używany w transakcjach), `linearizable` (odzwierciedla wszystkie wcześniejsze zapisy
  większościowe, dla odczytów pojedynczych dokumentów).
- **Read preference** wybiera węzeł: `primary` (domyślny), `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest`. Odczyty z secondary mogą
  zwracać **nieaktualne** dane.
- Sesje ze **spójnością przyczynową** (causal consistency) gwarantują „czytaj własne zapisy” nawet przy odczytach z secondary.

## Źródła

- [Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Transactions in production (limits)](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- [Write concern](https://www.mongodb.com/docs/manual/reference/write-concern/)
- [Read concern](https://www.mongodb.com/docs/manual/reference/read-concern/)
- [Read preference](https://www.mongodb.com/docs/manual/core/read-preference/)
- [Causal consistency](https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/)

## Pytania

### Czy MongoDB obsługuje transakcje? {junior}

Tak. Każdy zapis pojedynczego dokumentu jest atomowy, a od wersji 4.0 (replica sety) i 4.2 (klastry shardowane) MongoDB obsługuje wielodokumentowe transakcje ACID z izolacją snapshot. W teście
przelew między dwoma kontami był niewidoczny dla innych czytelników do commita, a przerwana transakcja nie zostawiła zmian. Wymagają replica setu albo klastra shardowanego, a nie samodzielnego
serwera.

### Kiedy potrzebna jest transakcja wielodokumentowa w MongoDB? {mid}

Gdy niezmiennik obejmuje kilka dokumentów albo kolekcji i musi obowiązywać nawet przy awarii w połowie: przelew między kontami, utworzenie zamówienia i rezerwacja stanu w innej kolekcji, zapis
encji razem z komunikatem outbox. Jeśli powiązane dane mogą być w jednym dokumencie, pojedyncza atomowa aktualizacja jest prostsza i szybsza. Bez transakcji operacja wielodokumentowa może
zatrzymać się w połowie: w teście nieudany `updateMany` zostawił wcześniejsze dokumenty zaktualizowane.

### Co się dzieje, gdy dwie transakcje zmieniają ten sam dokument? {senior}

Druga, która zapisuje, dostaje błąd `WriteConflict` z etykietą `TransientTransactionError` (sprawdzone) i musi zostać przerwana i ponowiona w całości. MongoDB nie czeka w transakcjach na blokady
tak, jak wiele baz relacyjnych, więc kolidujące transakcje szybko zawodzą. API `withTransaction`/callback w sterownikach automatycznie ponawiają błędy przejściowe i nieznane wyniki commita;
kod biznesowy powinien utrzymywać transakcje krótkie.

### Czym jest write concern? {mid}

To poziom potwierdzenia żądany dla zapisu: `w: 1` (tylko primary), `w: 'majority'` (większość głosujących członków replica setu, domyślne od MongoDB 5.0), konkretna liczba, `w: 0` (bez
potwierdzenia), plus `j: true` dla dziennika i `wtimeout`. Zapisy większościowe przetrwają awarię primary; zapisy `w: 1` mogą zostać wycofane, jeśli primary padnie przed ich replikacją.

### Czy błąd write concern oznacza, że zapis się nie odbył? {senior}

Nie. Oznacza, że nie otrzymano w czasie żądanego potwierdzenia; zapis może już być wykonany na primary i nadal się replikować. W testach dokument zapisany z niemożliwym do spełnienia `w: 2` na
jednowęzłowym secie był obecny na primary, a zapis `w: 'majority'`, który przekroczył czas przy dwóch wyłączonych węzłach, zreplikował się po ich powrocie. Takie błędy obsługuje się, sprawdzając
stan albo ponawiając idempotentnie, a nie zakładając porażkę.

### Czym jest read concern? {senior}

Steruje spójnością danych zwracanych przez odczyt: `local` zwraca najnowsze dane węzła, które mogą zostać wycofane po przełączeniu awaryjnym; `majority` zwraca tylko dane potwierdzone przez
większość, a więc trwałe; `snapshot` daje spójny widok w punkcie czasu (używany przez transakcje); `linearizable` gwarantuje, że odczyt odzwierciedla wszystkie udane zapisy większościowe sprzed
niego. Silniejsze poziomy dodają opóźnienie.

### Czym jest read preference i jakie jest ryzyko odczytu z secondary? {mid}

Read preference decyduje, którzy członkowie replica setu obsługują odczyty: domyślnie `primary`, albo `secondary`, `secondaryPreferred`, `primaryPreferred`, `nearest`. Odczyt z secondary rozkłada
obciążenie albo obsługuje użytkowników z pobliskiego regionu, ale secondary replikują asynchronicznie, więc mogą zwracać nieaktualne dane, a użytkownik może nie zobaczyć własnego niedawnego zapisu.
Używa się tego do raportów albo tolerancyjnych odczytów, a sesji ze spójnością przyczynową, gdy użytkownik musi widzieć własne zapisy.

### Dlaczego zapis potwierdzony z `w: 1` może zostać utracony? {senior}

Przy `w: 1` primary potwierdza, zanim zapis dotrze do innych członków. Jeśli primary padnie tuż potem, zostaje wybrany secondary bez tego zapisu, a gdy stary primary wróci, wycofuje zapisy, których
nowy primary nie ma (zapisując je do plików rollback). `w: 'majority'` tego unika, bo zapis potwierdzony przez większość jest obecny na każdym węźle, który może wygrać wybory.

### Jakie są ograniczenia transakcji w MongoDB? {senior}

Mają limit czasu życia (domyślnie 60 sekund, sprawdzone przez `transactionLifetimeLimitSeconds`), trzymają zasoby i zwiększają presję na cache, a bardzo duże transakcje (możliwe od 4.2, gdy transakcja
może zajmować kilka wpisów oplogu) zwiększają opóźnienie replikacji. Są wolniejsze niż operacje na pojedynczych dokumentach, a w klastrach shardowanych angażują dwufazowy commit między shardami. Utrzymuje się je krótkie,
dotyka niewielu dokumentów i projektuje dokumenty tak, żeby większość operacji ich nie potrzebowała.

### Jak zapewnić „czytaj własne zapisy” przy replikach? {mid}

Czytać z primary (domyślnie) albo używać sesji spójnej przyczynowo z read concern `majority` i write concern `majority`: sterownik przekazuje czas operacji zapisu, a secondary obsługujący odczyt
czeka, aż dogoni ten punkt. Pozwala to aplikacjom czytać z secondary bez pokazywania użytkownikom nieaktualnych wersji ich własnych zmian.
