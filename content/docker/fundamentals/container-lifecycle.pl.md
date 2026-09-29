# Cykl życia kontenera i codzienne polecenia {junior}

Kontener przechodzi przez kilka **stanów**: `created` → `running` (→ `paused`) → `exited`, a na końcu zostaje usunięty. Wiedza o tym,
co naprawdę robią `run`, `stop`, `kill`, `exec` i polityki restartu oraz co oznaczają **kody wyjścia**, to podstawa debugowania
kontenerów w developmencie i produkcji.

## Cykl życia sprawdzony krok po kroku

| Polecenie | Wynik w teście |
|---|---|
| `docker create` | stan `created`: kontener istnieje, nic nie działa |
| `docker start` | `running` |
| `docker pause` / `unpause` | `paused` (procesy zamrożone przez cgroups) / znowu działa |
| `docker exec c sh -c ...` | wykonał się jako dodatkowy proces (PID 10) obok PID 1 w tym samym kontenerze |
| `docker stop` (główny proces przechwytuje `SIGTERM`) | wypisał „got TERM”, `exited`, **kod 0 po 1 s** |
| `docker stop` (`sleep 300` jako PID 1, ignoruje `SIGTERM`) | `exited`, **kod 137 po 11 s**: zabity po 10-sekundowym okresie łaski |
| `docker kill` | `exited`, **kod 137** od razu (`SIGKILL`) |
| powłoka przekraczająca `--memory 32m` | `exited`, **kod 137**, `OOMKilled: true` |
| `--restart on-failure:3` z poleceniem kończącym się kodem 1 | **3** restarty, potem pozostał `exited` z kodem 1 |
| `docker run --rm alpine sh -c 'exit 42'` | sam `docker run` zwrócił **42** |

`docker run` = pobranie (w razie potrzeby) + utworzenie + start (+ podłączenie). Częste flagi: `-d` (w tle), `-it` (interaktywny
terminal), `--rm` (usuń po zakończeniu), `--name`, `-e`, `-p`, `-v`, `--restart`, `--memory`, `--cpus`.

## Kody wyjścia

- `0`: sukces; `1` i inne małe liczby: własny błąd aplikacji.
- **`128 + sygnał`**: zabity sygnałem. **137** = 128 + 9 (`SIGKILL`: `docker kill`, upływ czasu przy zatrzymaniu albo OOM killer, więc
  trzeba sprawdzić `OOMKilled` w `docker inspect`), **143** = 128 + 15 (`SIGTERM` z domyślną akcją; sprawdzone: `sleep` uruchomiony
  z `--init` zatrzymał się w 1 s z kodem 143).
- `125`, `126`, `127`: Docker nie mógł uruchomić kontenera, polecenie nie jest wykonywalne albo polecenia nie znaleziono (sprawdzone
  nieznaną flagą, `/etc` jako poleceniem i nieistniejącym poleceniem).

## Logi, inspekcja, sprzątanie

- `docker logs -f --tail 100 c` pokazuje to, co główny proces pisze na **stdout/stderr**, więc aplikacje w kontenerach powinny logować
  tam, a nie do plików.
- `docker inspect c` zwraca pełną konfigurację i stan (`.State.ExitCode`, `.State.OOMKilled`, `.RestartCount`, montowania, sieci);
  `docker stats` pokazuje bieżące zużycie zasobów.
- `docker ps -a` wyświetla też zatrzymane kontenery; zachowują one warstwę zapisywalną i logi do `docker rm`. `docker container prune`
  usuwa wszystkie zatrzymane kontenery (więc na współdzielonych maszynach trzeba z nim uważać).

## Polityki restartu

`no` (domyślna), `on-failure[:max-retries]` (tylko niezerowe kody wyjścia), `always` (restart za każdym razem, gdy się zatrzyma; ręcznie
zatrzymany kontener wraca dopiero przy restarcie demona) i `unless-stopped` (jak `always`, ale zatrzymany kontener nie wraca nawet po
restarcie demona). Docker czeka przed każdym restartem, podwajając opóźnienie od 100 ms. Polityki restartu pasują do pojedynczych
hostów i Compose; orkiestratory, takie jak Kubernetes, same zarządzają restartami.

## Źródła

- [docker container run](https://docs.docker.com/reference/cli/docker/container/run/)
- [docker container stop](https://docs.docker.com/reference/cli/docker/container/stop/)
- [Start containers automatically (restart policies)](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)

## Pytania

### W jakich stanach może być kontener? {junior}

`created` (istnieje, ale nie wystartował), `running`, `paused` (procesy zamrożone), `restarting`, `exited` (główny proces się zakończył; kontener, jego warstwa zapisywalna i logi zostają),
`removing` i `dead`. `docker ps` pokazuje działające kontenery, a `docker ps -a` wszystkie. Kontener działa dokładnie tak długo, jak jego główny proces (PID 1).

### Co robi `docker run`? {junior}

Pobiera obraz, jeśli nie ma go lokalnie, tworzy kontener (warstwę zapisywalną, sieć, montowania, konfigurację z flag), uruchamia go i domyślnie podłącza się do jego wyjścia. `-d` uruchamia
go w tle, `-it` daje interaktywny terminal, a `--rm` usuwa go po zakończeniu. To odpowiednik `docker create` i następnie `docker start`.

### Czym różni się `docker stop` od `docker kill`? {junior}

`docker stop` wysyła `SIGTERM`, żeby aplikacja mogła się łagodnie zamknąć, a po okresie łaski (domyślnie 10 sekund, zmiana przez `-t`) wysyła `SIGKILL`. `docker kill` od razu wysyła `SIGKILL`
(albo inny sygnał przez `--signal`). W teście proces obsługujący `SIGTERM` zatrzymał się w 1 s z kodem 0, a `sleep` jako PID 1 go zignorował i został zabity po 11 s z kodem 137.

### Co oznacza kod wyjścia 137 i jak ustalić, dlaczego wystąpił? {mid}

137 to 128 + 9, więc proces został zabity przez `SIGKILL`. Przyczyny: `docker kill`, `docker stop`, którego okres łaski minął, bo proces zignorował `SIGTERM`, albo OOM killer jądra, gdy kontener
przekroczył limit pamięci. `docker inspect` pokazuje `State.OOMKilled`: w teście powłoka przekraczająca limit 32 MB zakończyła się kodem 137 i `OOMKilled: true`. Kod 143 (128 + 15) oznacza, że
proces zakończył się na `SIGTERM`.

### Jak uruchomić polecenie w działającym kontenerze? {junior}

`docker exec -it <kontener> sh` (albo `bash`, jeśli obraz go ma) uruchamia dodatkowy proces w tych samych przestrzeniach nazw co główny; w teście działał jako PID 10 obok PID 1. Służy do
debugowania i jednorazowych zadań, a nie do zmian konfiguracji, bo zmiany giną przy ponownym utworzeniu kontenera. Minimalne obrazy mogą nie mieć powłoki; wtedy uruchamia się kontener
debugujący, który dołącza do ich przestrzeni nazw: `docker run --rm -it --pid container:web --network container:web busybox` widział w teście procesy nginx i łączył się z nim przez `localhost`.

### Skąd biorą się logi kontenera? {junior}

Ze standardowego wyjścia i standardowego wyjścia błędów głównego procesu, przechwytywanych przez sterownik logowania (domyślnie `json-file` na hoście). Pokazuje je
`docker logs -f --tail 100 <kontener>`. Aplikacje w kontenerach powinny więc logować na stdout/stderr, jedno zdarzenie na linię i najlepiej w formie strukturalnej, a zbieranie i wysyłanie logów
zostawić platformie, zamiast pisać pliki logów w kontenerze.

### Jakie są polityki restartu? {mid}

`no` (domyślna) nigdy nie restartuje; `on-failure[:N]` restartuje tylko po niezerowym kodzie wyjścia, najwyżej N razy (w teście `on-failure:3` zrestartował zawodzący kontener trzy razy);
`always` restartuje go za każdym razem, gdy się zatrzyma, a ręcznie zatrzymany wraca przy restarcie demona; `unless-stopped` nie przywraca kontenerów, które zatrzymałeś. Opóźnienie przed
każdym restartem podwaja się, zaczynając od 100 ms, żeby uniknąć ciasnych pętli awarii.

### Czy zatrzymany kontener jest usuwany? {junior}

Nie. Zostaje z warstwą zapisywalną, logami i konfiguracją, można go ponownie uruchomić przez `docker start`, a jego pliki skopiować przez `docker cp`, dopóki nie usunie się go przez `docker rm`
(albo nie był uruchomiony z `--rm`). Zatrzymane kontenery się gromadzą i zajmują miejsce na dysku, więc usuwa się je albo krótko żyjące kontenery uruchamia z `--rm`.

### Co `docker run` zwraca jako kod wyjścia? {mid}

Kod wyjścia głównego procesu kontenera, co pozwala używać kontenerów w skryptach i CI: w teście `docker run --rm alpine sh -c 'exit 42'` zwrócił 42. Kody 125, 126 i 127 pochodzą od samego
Dockera: kontenera nie dało się utworzyć ani uruchomić, polecenia nie dało się wywołać albo polecenia nie znaleziono.

### Jak ograniczyć zasoby kontenera i co się dzieje, gdy je przekroczy? {mid}

Przez `--memory` (i `--memory-swap`), `--cpus`, `--pids-limit` i inne flagi, egzekwowane przez cgroups. Przekroczenie limitu pamięci powoduje, że jądro zabija proces w kontenerze (kod 137,
`OOMKilled: true`), a limity CPU tylko go dławią, spowalniając go. Bez limitów kontener może zużyć wszystkie zasoby hosta, więc kontenery produkcyjne powinny mieć limity, a środowiska
uruchomieniowe, takie jak .NET, je odczytują, np. żeby dobrać rozmiar sterty GC.
