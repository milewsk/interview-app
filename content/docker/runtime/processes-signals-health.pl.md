# PID 1, sygnały, łagodne zamykanie i healthchecki {senior}

Kontener działa tak długo, jak jego główny proces, **PID 1**. PID 1 ma w Linuksie szczególne obowiązki: sygnały bez handlera są dla niego
**ignorowane** i musi **zbierać procesy zombie**. Błędy w tym obszarze sprawiają, że `docker stop` trwa długo, gubi się trwające żądania,
a procesy wyciekają. Healthchecki mówią z kolei Dockerowi, Compose albo orkiestratorowi, czy działający proces faktycznie pracuje.

## Sygnały i łagodne zamykanie

`docker stop` wysyła `SIGTERM` (albo `STOPSIGNAL` obrazu), czeka przez okres łaski (domyślnie 10 s), a potem wysyła `SIGKILL`. Sprawdzone:

- `sleep 300` jako PID 1 nie ma handlera `SIGTERM`, więc jądro **zignorowało** sygnał, a kontener został zabity po okresie łaski (kod **137**);
  `--stop-timeout 3` skróciło to do około 4 s.
- `CMD` w formie shell zostawił `/bin/sh` jako PID 1, który nie przekazał `SIGTERM` aplikacji (patrz temat o Dockerfile).
- Aplikacja ASP.NET Core (forma exec) dostała `SIGTERM`, zalogowała „Application is shutting down...” i zatrzymała się **w 1 s z kodem 0**. Generic
  host zatrzymuje hosted services i kończy obsługę żądań; jego `HostOptions.ShutdownTimeout` ma domyślnie **30 s** (sprawdzone na .NET 10), dłużej niż
  domyślne 10 s okresu łaski Dockera, więc gdy zamykanie może trwać długo, trzeba je zgrać (`docker stop -t`, `--stop-timeout`,
  `stop_grace_period` w Compose, `terminationGracePeriodSeconds` w Kubernetesie).

Łagodne zamknięcie oznacza: przestać przyjmować nową pracę, dokończyć albo zwrócić trwające żądania i komunikaty, opróżnić logi i zamknąć połączenia,
a potem zakończyć się kodem 0.

## Zombie i `--init`

Gdy proces potomny się kończy, rodzic musi na niego wywołać `wait()`; osierocone procesy są przepinane do PID 1. Sprawdzone: przy `sleep` jako PID 1
osierocony proces w tle pozostał **zombie** (`Z` w `ps`); z `docker run --init` PID 1 był `docker-init` (tini), który go zebrał, i zombie nie było.
Przekazuje on też sygnały: `sleep` pod `--init` zatrzymał się w 1 s z kodem 143. `--init` (albo `init: true` w Compose, albo tini/dumb-init w obrazie)
stosuje się, gdy PID 1 nie jest porządnym initem, np. przy skryptach powłoki albo aplikacjach uruchamiających procesy potomne.

## Healthchecki

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
```

Sprawdzone na nginx (z krótkimi odstępami): status przeszedł `starting` → `healthy`; po zepsuciu strony sprawdzenia zwróciły `0 1 1 1 1`, status
zmienił się na **`unhealthy`**, a `docker ps` pokazał „(unhealthy)”. Co kluczowe, kontener nadal **działał** nawet z `--restart always` (0 restartów):
**sam Docker nie restartuje kontenerów w stanie unhealthy**. Ze statusu zdrowia korzystają Compose (`depends_on: condition: service_healthy`), Swarm
oraz load balancery i monitoring; Kubernetes ignoruje `HEALTHCHECK` i używa własnych sond.

- Sprawdzenie działa **wewnątrz** kontenera, więc używane narzędzie (`wget`, `curl`) musi tam istnieć; obrazy chiseled i distroless go nie mają, więc
  sprawdza się z zewnątrz albo używa małego programu do healthchecku.
- Rozróżnia się **liveness** („proces się zawiesił, zrestartuj go”) od **readiness** („nie wysyłaj jeszcze ruchu”, np. w trakcie rozgrzewania albo gdy
  zależność nie działa). Health checki w ASP.NET Core (`MapHealthChecks`) mogą udostępniać osobne endpointy dla obu.

## Źródła

- [docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)
- [Dockerfile reference: HEALTHCHECK and STOPSIGNAL](https://docs.docker.com/reference/dockerfile/#healthcheck)
- [docker run --init](https://docs.docker.com/reference/cli/docker/container/run/#init)
- [.NET Generic Host: host shutdown](https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host#host-shutdown)
- [Health checks in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)

## Pytania

### Dlaczego PID 1 jest szczególny w kontenerze? {mid}

Pierwszy proces w przestrzeni nazw PID zachowuje się jak `init`: jądro nie stosuje do niego domyślnych akcji sygnałów, więc sygnał bez zarejestrowanego handlera (jak `SIGTERM` dla `sleep`)
jest ignorowany, a osierocone procesy są do niego przepinane, więc musi je zbierać. Aplikacje zwykle nie są pisane jak systemy init, co prowadzi do powolnego zatrzymywania (zabicie po
okresie łaski) i procesów zombie.

### Czym jest `STOPSIGNAL` i dlaczego niektóre obrazy go zmieniają? {mid}

Ustawia sygnał, który `docker stop` wysyła najpierw zamiast `SIGTERM`, dla aplikacji używających innego sygnału do łagodnego zamknięcia. Oficjalny obraz `nginx` ustawia
`SIGQUIT`, który nginx traktuje jako „dokończ bieżące żądania i zakończ się” (w teście zalogował „signal 3 (SIGQUIT) received” i „gracefully shutting down”, a potem zakończył
się kodem 0), podczas gdy `SIGTERM` zatrzymałby go od razu; obraz `postgres` używa `SIGINT` dla trybu szybkiego zamknięcia PostgreSQL. Można go też nadpisać przez
`docker run --stop-signal`.

### Czym jest łagodne zamknięcie i jak je zaimplementować? {mid}

To obsługa `SIGTERM` przez przestanie przyjmowania nowej pracy, dokończenie trwających żądań i komunikatów, zamknięcie połączeń i opróżnienie logów, a potem zakończenie procesu. W .NET robi to
generic host: wyzwala `IHostApplicationLifetime.ApplicationStopping`, zatrzymuje hosted services z tokenem anulowania i czeka najwyżej `HostOptions.ShutdownTimeout`. Aplikacja musi działać w formie
exec, żeby dostała sygnał, a okres łaski kontenera musi być wystarczająco długi.

### Dlaczego timeout zatrzymania Dockera i timeout zamykania .NET mogą się kłócić? {senior}

`HostOptions.ShutdownTimeout` w .NET ma domyślnie 30 sekund (sprawdzone na .NET 10), a `docker stop` domyślnie wysyła `SIGKILL` po 10 sekundach. Jeśli usługi w tle albo kończenie żądań trwa
dłużej niż 10 sekund, proces zostaje zabity w trakcie zamykania i praca przepada. Ustawia się okres łaski kontenera powyżej timeoutu aplikacji (`stop_grace_period` w Compose,
`terminationGracePeriodSeconds` w Kubernetesie) albo świadomie skraca timeout aplikacji.

### Czym jest proces zombie i jak pomaga `--init`? {senior}

To proces, który się zakończył, ale którego rodzic nie odebrał kodu wyjścia przez `wait()`; zajmuje wpis w tablicy procesów. W kontenerach osierocone procesy są przepinane do PID 1, a jeśli
PID 1 to aplikacja albo `sleep`, który nigdy nie wywołuje `wait()`, zombie się gromadzą: w teście osierocony proces pozostał w stanie `Z`. `docker run --init` sprawia, że PID 1 staje się
malutki init (tini, widoczny jako `docker-init`), który zbiera zombie i przekazuje sygnały aplikacji; w teście zombie nie było.

### Co robi `HEALTHCHECK`? {junior}

Definiuje polecenie, które Docker okresowo uruchamia w kontenerze; kod wyjścia 0 oznacza zdrowy, a 1 niezdrowy. Docker śledzi status (`starting`, `healthy`, `unhealthy`) według
skonfigurowanego odstępu, timeoutu, okresu startowego i liczby prób i pokazuje go w `docker ps` oraz `docker inspect`. W teście zepsuty nginx przeszedł w `unhealthy` po skonfigurowanej liczbie
nieudanych sprawdzeń.

### Czy Docker restartuje kontener w stanie unhealthy? {mid}

Nie. Sam Docker tylko zapisuje status zdrowia; polityki restartu reagują na zakończenie procesu, a nie na zdrowie. W teście niezdrowy kontener z `--restart always` działał dalej bez żadnego
restartu. Na status zdrowia reagują inne narzędzia: `depends_on` w Compose z `condition: service_healthy`, Swarm zastępujący zadania, load balancery, monitoring. Kubernetes zamiast
`HEALTHCHECK` używa własnych sond liveness i readiness.

### Czym różni się sprawdzenie liveness od readiness? {mid}

Liveness odpowiada na pytanie „czy proces nadal działa, czy trzeba go zrestartować?” i powinno sprawdzać tylko samą aplikację, bo restart nie naprawi niedziałającej bazy. Readiness odpowiada
na pytanie „czy może teraz przyjmować ruch?” i może obejmować rozgrzewanie oraz krytyczne zależności, żeby ruch trafiał gdzie indziej bez restartu. Pomylenie ich powoduje pętle restartów,
gdy zawiedzie współdzielona zależność. Health checki w ASP.NET Core mogą udostępniać oba przez tagi i osobne endpointy.

### Dlaczego healthcheck może zawodzić w minimalnym obrazie, choć aplikacja działa? {mid}

Sprawdzenie działa w kontenerze, więc wywoływane polecenie musi tam istnieć: obrazy chiseled i distroless nie mają powłoki, `curl` ani `wget`, więc sprawdzenie w rodzaju `CMD curl ...` zawodzi.
Możliwości: dostarczyć mały program do healthchecku albo tryb samej aplikacji wykonujący sprawdzenie, użyć formy exec bez powłoki albo polegać na zewnętrznych sprawdzeniach (sondach HTTP
orkiestratora).

### Jak aplikacja powinna się zachować, gdy dostanie `SIGTERM` w trakcie przetwarzania komunikatów z kolejki? {senior}

Przestać pobierać nowe komunikaty, dokończyć trwające w okresie łaski, potwierdzać tylko zakończone, a niedokończone pozwolić dostarczyć ponownie (wracają do kolejki po zamknięciu połączenia
albo wygaśnięciu timeoutu widoczności). Handlery muszą więc być idempotentne. Tokeny anulowania przekazywane z tokenu zatrzymania hosta pozwalają długim operacjom zatrzymać się czysto, zamiast
być zabitymi w połowie przez `SIGKILL`.
