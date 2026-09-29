# Redis i magazyny klucz-wartość {mid}

**Magazyny klucz-wartość** mapują klucz na wartość i robią niewiele więcej, dzięki czemu są niezwykle szybkie. **Redis** jest najpopularniejszy:
to magazyn w pamięci z bogatymi strukturami danych (napisy, hashe, listy, zbiory, zbiory posortowane, strumienie), wygasaniem i atomowymi
operacjami. Służy jako **cache**, magazyn sesji, ogranicznik liczby żądań, usługa blokad, ranking, kolejka albo szyna pub/sub obok głównej bazy
danych. Przykłady uruchamiałem na Redisie 8.10 w Dockerze.

## Struktury danych (sprawdzone)

| Struktura | Polecenia | Wynik | Typowe zastosowanie |
|---|---|---|---|
| String | `SET session:1 alice EX 60`, `GET`, `TTL` | `alice`, TTL 59 s | wpisy cache, sesje |
| Licznik | 5 równoległych `INCR counter` | **5** (atomowo) | limity żądań, liczniki |
| Hash | `HSET user:1 name Ann email ann@x.pl` | pary pole-wartość | obiekty |
| List | `RPUSH jobs j1 j2 j3`, `LPOP jobs` | `j1`, zostały 2 | proste kolejki |
| Set | `SINTER tags:a tags:b` | `y z` | unikalne elementy, przecięcia |
| Sorted set | `ZADD board ...`, `ZREVRANGE board 0 1` | `bob 300, cid 200` | rankingi, priorytety |
| Stream | `XADD`, `XREADGROUP` | odczytany przez grupę konsumentów, 1 oczekujący do `XACK` | trwały dziennik zdarzeń z grupami konsumentów |

Polecenia są wykonywane na serwerze po kolei, więc każde polecenie jest **atomowe**; logika wieloetapowa używa transakcji `MULTI/EXEC` albo
skryptów Lua.

## Blokady i idempotencja

`SET lock:order:7 worker-A NX EX 30` zwróciło `OK` dla pierwszego workera i nic dla drugiego, a właścicielem pozostał `worker-A`: prosta blokada
dzierżawna z automatycznym wygasaniem. Wartością powinien być unikalny token sprawdzany przed zwolnieniem, a TTL musi przekraczać czas pracy;
wstrzymany proces może jednak przeżyć swoją blokadę, więc przypadki krytyczne dla poprawności wymagają tokenów fencing albo ograniczenia w bazie
danych, a nie samej blokady w Redisie.

## Pamięć i wyrzucanie kluczy

Redis trzyma dane w RAM, ograniczonym przez `maxmemory`. Domyślną polityką było **`noeviction`**: przy limicie 2 MB zapisy zawiodły przy 21. wartości
10 KB z komunikatem „OOM command not allowed when used memory > 'maxmemory'”. Przy **`allkeys-lru`** zapisanie 400 wartości zostawiło 20, a resztę
wyrzuciło. Cache używają polityki LRU/LFU; dane, które nie mogą zniknąć, wymagają `noeviction` i planowania pojemności. Trwałość jest opcjonalna:
kontener miał skonfigurowane migawki RDB (`save 3600 1 300 100 60 10000`) i wyłączony AOF (`appendonly no`); czysty cache może działać bez obu.

## Wzorce cache

- **Cache-aside**: odczyt z cache, przy braku wczytanie z bazy i zapisanie z TTL; przy zapisach aktualizacja bazy i **usunięcie** klucza z cache.
- Uwaga na **nieaktualne dane** (TTL i unieważnianie), **cache stampede** (wiele żądań odbudowujących ten sam klucz: blokada, łączenie żądań albo
  wcześniejsze odświeżanie) i cache'owanie pustych wyników. W .NET `IDistributedCache` i `HybridCache` dają dwupoziomowy cache lokalny + Redis
  z ochroną przed stampede.

## Licencje

Redis zmienił licencje w 2024 roku: 7.4 był dostępny tylko jako source-available (RSALv2/SSPLv1), co doprowadziło do forka **Valkey** (BSD, Linux
Foundation). Redis 8 dodał **AGPLv3** jako trzecią opcję, więc znów jest dostępny na licencji zatwierdzonej przez OSI. W produkcji popularne są
usługi zarządzane (Azure Managed Redis, ElastiCache/MemoryDB z Valkey).

## Źródła

- [Redis data types](https://redis.io/docs/latest/develop/data-types/)
- [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Distributed locks with Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Redis licenses](https://redis.io/legal/licenses/)
- [HybridCache in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid)

## Pytania

### Czym jest Redis i do czego się go używa? {junior}

To magazyn danych klucz-wartość w pamięci ze strukturami takimi jak napisy, hashe, listy, zbiory, zbiory posortowane i strumienie, a do tego wygasaniem i atomowymi poleceniami. Ponieważ dane są
w RAM, operacje trwają mikrosekundy, więc używa się go obok głównej bazy jako cache, magazynu sesji, ogranicznika żądań, blokady rozproszonej, rankingu, kolejki albo szyny komunikatów, a nie jako
źródła prawdy.

### Dlaczego polecenia Redisa są atomowe? {mid}

Serwer wykonuje polecenia po kolei w głównym wątku, więc pojedyncze polecenie, takie jak `INCR`, nie może się przeplatać z innym: pięć równoległych inkrementacji dało w teście dokładnie 5. Przy
operacjach wieloetapowych `MULTI/EXEC` wykonuje paczkę bez przeplatania (opcjonalnie z `WATCH` do optymistycznych sprawdzeń), a skrypty albo funkcje Lua działają atomowo na serwerze.

### Czym jest wzorzec cache-aside? {junior}

Aplikacja najpierw sprawdza cache; przy trafieniu zwraca zapisaną wartość, a przy braku wczytuje ją z bazy, zapisuje wynik w cache z TTL i go zwraca. Przy aktualizacjach zapisuje do bazy
i unieważnia (usuwa) wpis w cache, żeby następny odczyt go przeładował. Jest prosty i utrzymuje bazę jako źródło prawdy, kosztem sporadycznych nieaktualnych odczytów i braków po unieważnieniu.

### Czym jest cache stampede i jak mu zapobiegać? {senior}

Gdy popularny klucz wygaśnie, wiele równoległych żądań naraz trafia na brak i wszystkie go odbudowują, przeciążając bazę. Zapobieganie: pozwolić odbudować tylko jednemu żądaniu (blokada albo
łączenie żądań w procesie, jak robi `HybridCache`), odświeżać wpisy przed wygaśnięciem, dodawać losowy rozrzut do TTL, żeby klucze nie wygasały razem, i serwować lekko nieaktualne dane w trakcie
odświeżania.

### Jak zaimplementować prostą blokadę rozproszoną w Redisie i jakie ma ograniczenia? {senior}

`SET lock:klucz <unikalny-token> NX EX <sekundy>` przejmuje blokadę tylko wtedy, gdy klucz nie istnieje, i automatycznie ją wygasza (w teście drugi worker nic nie dostał, a pierwszy pozostał
właścicielem); zwalnia się ją, usuwając klucz tylko wtedy, gdy nadal zawiera twój token (atomowo, skryptem). Ograniczenia: jeśli posiadacz zatrzyma się dłużej niż TTL, inny proces może przejąć
blokadę, choć pierwszy nadal pracuje, a przełączenie awaryjne może zgubić klucz. Przy operacjach krytycznych dla poprawności używa się tokenów fencing albo ograniczeń w bazie danych.

### Co się dzieje, gdy Redisowi zabraknie pamięci? {mid}

Zależy to od `maxmemory-policy`. Przy domyślnym `noeviction` polecenia zapisu zawodzą z „OOM command not allowed when used memory > 'maxmemory'” (sprawdzone przy limicie 2 MB), a odczyty nadal
działają. Przy `allkeys-lru`, `allkeys-lfu`, `volatile-*` albo `allkeys-random` Redis wyrzuca klucze, żeby zrobić miejsce: w teście z `allkeys-lru` zostało 20 z 400 wartości. Cache powinny używać
polityki wyrzucania; magazyny z niezbędnymi danymi potrzebują wystarczającej pamięci i `noeviction`.

### Czy Redis utrwala dane? {mid}

Opcjonalnie. Migawki RDB okresowo zapisują zbiór danych na dysk (domyślna konfiguracja w teście to `save 3600 1 300 100 60 10000`), a plik append-only (AOF, domyślnie wyłączony) zapisuje każdy
zapis dla lepszej trwałości kosztem wydajności. Replikacja i usługi zarządzane dodają wysoką dostępność. Czyste cache mogą wyłączyć trwałość, bo dane da się odbudować.

### Kiedy użyć strumienia Redisa zamiast listy albo pub/sub? {senior}

Pub/sub dostarcza komunikaty tylko aktualnie podłączonym subskrybentom i niczego nie przechowuje. Lista może działać jak prosta kolejka, ale nie ma grup konsumentów ani potwierdzeń. Strumienie
to dziennik append-only z identyfikatorami, grupami konsumentów, listami oczekujących per konsument i `XACK`, więc komunikaty przetrwają awarie konsumentów i można je przetworzyć ponownie (w teście
odczytany komunikat pozostał oczekujący do potwierdzenia). Przy dużej skali trwałej komunikacji dedykowany broker nadal bywa lepszy.

### Co zmieniło się w licencjonowaniu Redisa i czym jest Valkey? {mid}

W 2024 roku Redis przeszedł z BSD na podwójną licencję source-available RSALv2/SSPLv1 (7.4), które nie są zatwierdzone przez OSI, a społeczność sforkowała ostatnią wersję na BSD jako Valkey pod
Linux Foundation, przyjęty przez kilku dostawców chmury. W Redisie 8 dodano AGPLv3 jako trzecią opcję licencyjną. Zespoły wybierają między Redisem, Valkey i usługami zarządzanymi według licencji,
funkcji i wsparcia dostawcy.

### Która struktura danych Redisa pasuje do rankingu i dlaczego? {junior}

Zbiór posortowany: każdy element ma wynik, a Redis trzyma elementy uporządkowane według wyniku, więc `ZADD` aktualizuje wynik gracza, a `ZREVRANGE board 0 9 WITHSCORES` zwraca pierwszą dziesiątkę
w czasie logarytmicznym (w teście dwójka najlepszych to `bob 300, cid 200`). `ZRANK`/`ZREVRANK` zwracają pozycję gracza bez przeglądania wszystkich.
