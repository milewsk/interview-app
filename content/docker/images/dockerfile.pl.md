# Podstawy Dockerfile {junior}

**Dockerfile** to przepis na obraz: obraz bazowy (`FROM`), a po nim instrukcje, które dodają pliki, wykonują polecenia i ustawiają
metadane. Na rozmowach lubi się szczegóły, które powodują prawdziwe błędy: `CMD` a `ENTRYPOINT`, **forma shell a exec** i sygnały,
`ARG` a `ENV`, `COPY` a `ADD`, `EXPOSE` oraz to, co trafia do **kontekstu budowania**.

## Typowy Dockerfile

```dockerfile
FROM node:24-alpine                 # obraz bazowy: przypnij konkretny tag (albo digest)
WORKDIR /app                        # tworzy katalog i ustawia go dla kolejnych instrukcji
COPY package*.json ./               # najpierw zależności, dla lepszego cache
RUN npm ci --omit=dev
COPY . .                            # potem kod źródłowy
ENV NODE_ENV=production             # dostępne przy budowaniu i w czasie działania
EXPOSE 3000                         # tylko dokumentacja
USER node                           # nie uruchamiaj jako root
CMD ["node", "server.js"]           # forma exec
```

## `ENTRYPOINT` i `CMD`

Przy `ENTRYPOINT ["echo", "hello"]` i `CMD ["world"]`, sprawdzone: `docker run img` wypisał `hello world`, `docker run img you` wypisał
`hello you` (argumenty zastępują `CMD`), a `--entrypoint ls img /etc/alpine-release` zastąpiło entrypoint. `ENTRYPOINT` to stały program
wykonywalny, `CMD` to domyślne argumenty (albo domyślne polecenie, gdy entrypointu nie ma). Częsty wzorzec to skrypt entrypointu, który
przygotowuje środowisko i kończy się `exec "$@"`.

## Forma exec a forma shell

- **Forma exec** `CMD ["node", "/app.js"]`: program działa bezpośrednio jako **PID 1** i odbiera sygnały.
- **Forma shell** `CMD node /app.js`: zapisywana jako `["/bin/sh","-c","node /app.js"]` (sprawdzone w `docker image inspect`).

Sprawdzone na aplikacji Node obsługującej `SIGTERM`: przy `CMD node /app.js; echo app ended` PID 1 był `/bin/sh`, `docker stop` nie dotarł do
Node, a kontener został zabity po **11 s z kodem 137**; w formie exec Node dostał `SIGTERM`, zalogował go i zakończył się z **kodem 0 po 1 s**.
Powłoka BusyBox w Alpine wykonuje `exec` dla ostatniego prostego polecenia (`CMD node /app.js`, a nawet `echo starting && node /app.js`
kończyły się z Node jako PID 1), co ukrywa problem, dopóki nie zmieni się polecenie albo obraz bazowy nie użyje innej powłoki. Należy
używać formy exec.

## `ARG` a `ENV`

`ARG` to zmienna **czasu budowania** (`--build-arg`), a `ARG` przed `FROM` może parametryzować obraz bazowy; `ENV` jest ustawiana w obrazie
i widoczna w działającym kontenerze (można ją nadpisać przez `-e`). Sprawdzone: z `--build-arg APP_VERSION=2.5.0` krok `RUN` widział `2.5.0`,
ale w czasie działania `APP_VERSION` była pusta, a `APP_ENV` z `ENV` miała wartość `production` (i `staging` z `-e APP_ENV=staging`). Żadna
z nich nie jest bezpieczna dla sekretów: token przekazany przez `--build-arg` pojawił się jawnym tekstem w `docker history --no-trunc`
(`NPM_TOKEN=...`), a ten sam token podany jako montowanie sekretu BuildKit (`RUN --mount=type=secret,id=npm_token`) nie zostawił śladu ani
w historii, ani w zapisanym obrazie.

## `COPY` a `ADD`, `.dockerignore`, `EXPOSE`

- `ADD` rozpakowuje lokalne archiwa tar i potrafi pobierać URL-e; `COPY` tylko kopiuje. Sprawdzone: `ADD arch.tar /added/` dało rozpakowany
  `a.txt`, a `COPY arch.tar /copied/` plik tar. Lepiej używać `COPY`, chyba że potrzeba tych funkcji.
- **Kontekst budowania** (katalog przekazany do `docker build`) jest wysyłany do buildera. Bez `.dockerignore` przesłane zostało 60 MB
  `node_modules`, a `COPY . .` umieściło w obrazie `node_modules` i **plik `.env` z sekretem**; z `node_modules`, `.env` i `*.tar`
  (plus `!arch.tar`) w `.dockerignore` żaden z nich tam nie trafił.
- `EXPOSE` tylko dokumentuje porty. Sprawdzone z nginx (`EXPOSE 80`): bez `-p` żaden port nie został opublikowany; `-P` opublikowało go na
  losowym porcie hosta (`0.0.0.0:32768`), a `-p 127.0.0.1:18080:80` udostępniło go pod `127.0.0.1:18080` (HTTP 200) i tylko lokalnie.

## Źródła

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Building best practices](https://docs.docker.com/build/building/best-practices/)
- [Build context and .dockerignore](https://docs.docker.com/build/concepts/context/)
- [Build secrets](https://docs.docker.com/build/building/secrets/)

## Pytania

### Czym różni się `CMD` od `ENTRYPOINT`? {junior}

`ENTRYPOINT` ustawia program wykonywalny, który zawsze się uruchamia; `CMD` dostarcza mu domyślne argumenty albo jest domyślnym poleceniem, gdy entrypointu nie ma. Argumenty przekazane
do `docker run` zastępują `CMD`, ale nie `ENTRYPOINT` (do nadpisania potrzeba `--entrypoint`). W teście `ENTRYPOINT ["echo", "hello"]` z `CMD ["world"]` wypisało `hello world`,
a `docker run img you` wypisało `hello you`.

### Dlaczego używać formy exec w `CMD` i `ENTRYPOINT`? {mid}

W formie exec (`["node", "app.js"]`) aplikacja działa jako PID 1 i odbiera sygnały, takie jak `SIGTERM` z `docker stop`, więc może się łagodnie zamknąć. W formie shell (`node app.js`)
uruchamia ją `/bin/sh -c`, a jeśli powłoka zostanie PID 1, nie przekazuje sygnałów: w teście aplikacja nigdy nie dostała `SIGTERM` i została zabita po 10 sekundach z kodem 137. Niektóre
powłoki wykonują `exec` dla ostatniego polecenia i ukrywają problem, więc należy polegać na formie exec.

### Czym różni się `ARG` od `ENV`? {junior}

`ARG` definiuje zmienną dostępną tylko podczas budowania (ustawianą przez `--build-arg`, a przed `FROM` używalną w odwołaniu do obrazu bazowego). `ENV` ustawia zmienną środowiskową
zapisaną w obrazie i dostępną zarówno w późniejszych krokach budowania, jak i w działających kontenerach, gdzie można ją nadpisać przez `-e`. W teście argument budowania był widoczny
w kroku `RUN`, ale pusty w czasie działania.

### Dlaczego nie przekazywać sekretów przez `ARG` ani `ENV`? {mid}

Argumenty budowania i zmienne środowiskowe są zapisywane w obrazie: wartości `ENV` są w konfiguracji obrazu, a argumenty budowania mogą pojawić się w historii i metadanych proweniencji,
więc każdy, kto może pobrać obraz, może je odczytać (w teście token z argumentu budowania dało się odczytać przez `docker history --no-trunc`). Do sekretów czasu budowania używa się montowań sekretów BuildKit (`RUN --mount=type=secret,id=npm_token ...`), a sekrety czasu
działania wstrzykuje się ze środowiska albo menedżera sekretów przy starcie kontenera.

### Kiedy użyć `ADD` zamiast `COPY`? {mid}

Tylko wtedy, gdy potrzeba jego dodatkowego zachowania: automatycznego rozpakowania lokalnego archiwum tar do obrazu (w teście `ADD arch.tar` dało rozpakowany plik, a `COPY` skopiował
archiwum) albo pobrania zdalnego URL-a czy repozytorium Git. Do zwykłych plików lepszy jest `COPY`, bo jest jawny i przewidywalny.

### Czym jest kontekst budowania i dlaczego `.dockerignore` ma znaczenie? {mid}

Kontekst budowania to zbiór plików (zwykle bieżący katalog) wysyłany do buildera i jedyne pliki, których może użyć `COPY`. Bez `.dockerignore` duże foldery, jak `node_modules` czy
`bin/obj`, spowalniają każde budowanie, a `COPY . .` może umieścić sekrety w obrazie: w teście plik `.env` trafił do obrazu, dopóki nie dodano go do `.dockerignore`. Wpisuje się tam
wyniki budowania, zależności, foldery systemu kontroli wersji i pliki z sekretami.

### Czy `EXPOSE` publikuje port? {junior}

Nie. `EXPOSE` dokumentuje, na którym porcie aplikacja nasłuchuje, i jest używany przez `-P`. Porty publikuje się przez `-p host:kontener` (albo `-P`, który mapuje zadeklarowane porty
na losowe porty hosta). W teście nginx z `EXPOSE 80` nie miał opublikowanego portu bez `-p`, `-P` zmapował go na port hosta 32768, a `-p 127.0.0.1:18080:80` udostępnił go tylko lokalnie.

### Co robi `WORKDIR` i dlaczego używać go zamiast `RUN cd`? {junior}

Ustawia katalog roboczy dla kolejnych instrukcji `RUN`, `CMD`, `ENTRYPOINT`, `COPY` i `ADD`, tworząc go w razie potrzeby. Każde `RUN` uruchamia nową powłokę, więc `RUN cd /app` nie wpływa
na późniejsze instrukcje. Bezwzględne ścieżki w `WORKDIR` ułatwiają czytanie Dockerfile i sprawiają, że katalog startowy kontenera jest przewidywalny.

### Dlaczego przypinać wersję obrazu bazowego? {mid}

`FROM node:latest` albo `FROM node` może się zmienić bez twojej wiedzy: ponowne budowanie może przynieść nową wersję główną i zepsuć aplikację, a dwa buildy tego samego commita mogą
dać różne obrazy. Przypina się konkretny tag (`node:24-alpine`), a dla pełnej powtarzalności digest (`node:24-alpine@sha256:...`), i aktualizuje świadomie (np. przez Dependabota albo
Renovate), żeby dostawać poprawki bezpieczeństwa.

### Czym jest skrypt entrypointu i dlaczego kończy się `exec "$@"`? {senior}

To skrypt powłoki ustawiony jako `ENTRYPOINT`, który przygotowuje kontener przy starcie (czeka na zależności, generuje konfigurację, uruchamia migracje), a potem uruchamia główne polecenie
przekazane jako argumenty `CMD`. Zakończenie przez `exec "$@"` zastępuje powłokę aplikacją, więc aplikacja staje się PID 1 i odbiera sygnały bezpośrednio; bez `exec` powłoka skryptu
zostaje PID 1 i, jak pokazał test z formą shell, `docker stop` po upływie czasu przechodzi do `SIGKILL`.
