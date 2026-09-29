# Replikacja i sharding {senior}

MongoDB skaluje się i przetrwa awarie dzięki dwóm mechanizmom. **Replikacja** (replica sety) trzyma kopie danych na kilku węzłach dla **wysokiej
dostępności** i skalowania odczytów. **Sharding** dzieli kolekcję między kilka replica setów dla **skalowania poziomego** rozmiaru danych
i przepustowości zapisów. Zachowanie replikacji poniżej zostało przetestowane na trzywęzłowym replica secie MongoDB 8.0 w Docker Compose;
sharding jest opisany na podstawie dokumentacji.

## Replica sety

Replica set ma jeden **primary**, który przyjmuje zapisy, i **secondary**, które kopiują jego **oplog** (uporządkowany dziennik operacji)
i go stosują. Sprawdzone:

- po `rs.initiate` z trzema członkami status wynosił `m1 PRIMARY, m2 SECONDARY, m3 SECONDARY`, a wstawienie pojawiło się w `local.oplog.rs`
  jako wpis z `op: "i"` i dokumentem;
- zapisy `w: 'majority'` powiodły się przy jednym zatrzymanym secondary; przy **obu** zatrzymanych przekroczyły czas, a po około 12 s
  odizolowany primary **ustąpił** (`isWritablePrimary: false`) i odrzucał nawet zapisy `w: 1` z `NotWritablePrimary`: węzeł, który nie widzi
  większości, nie może przyjmować zapisów, co zapobiega split brain;
- po zabiciu primary jeden z secondary został **wybrany** na primary po około **10 s**, zgodnie z domyślnym `electionTimeoutMillis` wynoszącym
  10 000 ms (heartbeaty co 2 s). Wszystkie dokumenty potwierdzone przez większość nadal były obecne.

Sterowniki łączą się z nazwą replica setu w connection stringu (`mongodb://m1,m2,m3/?replicaSet=rs`), wykrywają topologię i przekierowują zapisy
do nowego primary; **retryable writes** ponawiają zapis raz po przełączeniu awaryjnym. Używa się nieparzystej liczby głosujących członków (3, 5),
żeby zawsze dało się utworzyć większość; **arbiter** głosuje, ale nie przechowuje danych (generalnie odradzany). Secondary mogą być **ukryte**
albo **opóźnione** na potrzeby kopii zapasowych i raportów.

## Sharding

Klaster shardowany ma **shardy** (każdy to replica set), routery **mongos**, do których łączą się klienci, oraz **serwery konfiguracyjne**
(replica set z metadanymi; w MongoDB 8.0 może też być config shardem przechowującym dane).

- **Klucz shardowania** (jedno albo kilka pól) decyduje, gdzie trafia każdy dokument. Dane są dzielone na **chunki** (zakresy wartości klucza),
  które **balancer** przenosi między shardami.
- Sharding **zakresowy** trzyma bliskie wartości klucza razem (dobre dla zapytań zakresowych); **haszowany** rozkłada wartości równomiernie
  (dobre dla zapisów, słabe dla zapytań zakresowych).
- Dobry klucz shardowania ma **wysoką kardynalność**, **niską częstość** pojedynczych wartości i **nie rośnie monotonicznie**: przy monotonicznie
  rosnącym kluczu (znacznik czasu, `ObjectId`) wszystkie wstawienia trafiają do chunka z górną granicą, przez co jeden shard staje się wąskim
  gardłem zapisów; sharding haszowany tego unika.
- Zapytania zawierające klucz shardowania (albo jego prefiks) są **kierowane** do konkretnych shardów; pozostałe są typu **scatter-gather**
  (rozsyłane do wszystkich shardów).
- Od 5.0 kolekcję można **przeshardować** nowym kluczem, a klucz można **doprecyzować**, dodając pola na końcu.

Shardinguje się dopiero wtedy, gdy pojedynczy replica set nie radzi sobie z rozmiarem danych albo obciążeniem zapisami; sharding dodaje złożoność
operacyjną i podraża złączenia, transakcje i ograniczenia unikalności.

## Źródła

- [Replication](https://www.mongodb.com/docs/manual/replication/)
- [Replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- [Replica set oplog](https://www.mongodb.com/docs/manual/core/replica-set-oplog/)
- [Sharding](https://www.mongodb.com/docs/manual/sharding/)
- [Choose a shard key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)
- [Retryable writes](https://www.mongodb.com/docs/manual/core/retryable-writes/)

## Pytania

### Czym jest replica set? {junior}

To grupa serwerów MongoDB z tymi samymi danymi: jeden primary przyjmuje wszystkie zapisy i zapisuje je w oplogu, a secondary asynchronicznie replikują oplog. Gdy primary padnie, pozostali
członkowie automatycznie wybierają nowego. Zapewnia wysoką dostępność, redundancję danych i możliwość odczytu z secondary; wymagają go też transakcje.

### Co się dzieje, gdy primary padnie? {mid}

Secondary przestają dostawać heartbeaty, a po upływie timeoutu wyborów (domyślnie 10 sekund) uprawniony secondary ogłasza wybory; primary zostaje członek z najnowszymi danymi, który dostanie
głosy większości. W teście z trzema węzłami nowy primary został wybrany około 10 sekund po zabiciu starego, a wszystkie dane potwierdzone przez większość były obecne. Sterowniki ponownie wykrywają
topologię, a retryable writes ponawiają przerwaną operację.

### Dlaczego replica set potrzebuje większości i dlaczego używa się nieparzystej liczby członków? {mid}

Primary musi zostać wybrany przez większość głosujących członków i pozostawać z nią w kontakcie; inaczej dwie partycje mogłyby jednocześnie przyjmować zapisy (split brain). W teście primary
odcięty od obu secondary ustąpił i odrzucał zapisy z `NotWritablePrimary`. Przy nieparzystej liczbie członków (3, 5) podział zawsze zostawia jednej stronie większość; przy 2 albo 4 członkach remis
zostawia klaster bez primary.

### Czym jest oplog? {mid}

To dziennik operacji: specjalna kolekcja o stałym rozmiarze (`local.oplog.rs`), w której primary zapisuje każdą zmianę jako idempotentną operację, np. wstawienie jako `op: "i"` z dokumentem
(widoczne w teście). Secondary go śledzą i stosują wpisy, żeby się replikować. Jego rozmiar decyduje, jak długo secondary może być wyłączony i nadal nadrobić zaległości; jeśli zostanie za
najstarszym wpisem, potrzebuje pełnej ponownej synchronizacji. Change streams też są na nim zbudowane.

### Czym różni się replikacja od shardingu? {junior}

Replikacja kopiuje te same dane na kilka węzłów dla dostępności i skalowania odczytów; każdy węzeł ma wszystkie dane. Sharding dzieli dane między kilka replica setów, więc każdy trzyma tylko ich
część, co skaluje przechowywanie i przepustowość zapisów ponad jedną maszynę. Produkcyjne klastry shardowane używają obu: każdy shard jest replica setem.

### Jak wybrać klucz shardowania? {senior}

Wybrać pola występujące w większości zapytań (żeby można je było kierować), o wysokiej kardynalności i równym rozkładzie wartości, które nie rosną monotonicznie. Monotonicznie rosnący klucz, taki
jak znacznik czasu, wysyła wszystkie wstawienia do ostatniego chunka, przeciążając jeden shard; jego haszowanie rozkłada zapisy, ale sprawia, że zapytania zakresowe są scatter-gather. Klucz
złożony (np. `{ tenantId, orderId }`) często równoważy lokalność i rozkład. Przeshardowanie jest możliwe od 5.0, ale kosztowne.

### Czym są zapytania kierowane i scatter-gather? {mid}

Gdy zapytanie zawiera klucz shardowania (albo prefiks złożonego klucza), `mongos` wysyła je tylko do shardów, których chunki mogą zawierać pasujące dokumenty: to zapytanie kierowane. Bez klucza
shardowania musi rozesłać zapytanie do każdego shardu i scalić wyniki (scatter-gather), co zwalnia wraz z dodawaniem shardów. Wybór klucza pasującego do najczęstszych zapytań utrzymuje większość
operacji jako kierowane.

### Z czego składa się klaster shardowany? {mid}

Ze shardów, z których każdy jest replica setem z częścią danych; routerów `mongos`, do których łączą się aplikacje i które kierują operacje na podstawie metadanych klastra; oraz serwerów
konfiguracyjnych, czyli replica setu przechowującego te metadane (w 8.0 może jednocześnie być config shardem z danymi). Balancer przenosi chunki między shardami, żeby dane były równomiernie
rozłożone.

### Czym są retryable writes? {senior}

To funkcja sterownika (domyślnie włączona), która automatycznie ponawia raz niektóre operacje zapisu, jeśli zawiodą przez błąd sieci albo przełączenie primary, używając numeru transakcji, żeby
serwer zastosował zapis tylko raz, nawet jeśli pierwsza próba się powiodła. Obejmuje zapisy pojedynczych dokumentów i część operacji wsadowych, ale nie wielodokumentowe `updateMany`/`deleteMany`,
które w ogólności nie są idempotentne.

### Kiedy shardować wdrożenie MongoDB? {senior}

Gdy pojedynczy replica set nie radzi sobie już z ilością danych (przechowywanie, zbiór roboczy większy niż RAM) albo przepustowością zapisów, po optymalizacji indeksów, zapytań i sprzętu. Sharding
dodaje komponenty do utrzymania, podraża zapytania między shardami, transakcje i indeksy unikalne i zależy od dobrego klucza shardowania, który trudno zmienić. Wiele aplikacji długo działa na
jednym replica secie.
