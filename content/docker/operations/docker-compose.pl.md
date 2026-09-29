# Docker Compose {mid}

**Docker Compose** opisuje aplikację wielokontenerową w jednym pliku YAML (`compose.yaml`): usługi, sieci, wolumeny, konfigurację
i zależności startowe. Jedno polecenie (`docker compose up`) tworzy i uruchamia wszystko, co czyni go standardowym narzędziem dla lokalnych
środowisk deweloperskich, testów integracyjnych i prostych wdrożeń na jednym hoście. Przykłady uruchamiałem na Compose v2.32 (wtyczka
`docker compose`; stary `docker-compose` v1 w Pythonie jest wycofany).

## Plik compose

```yaml
name: shop
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}          # interpolowane z powłoki albo .env
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 15

  migrate:
    image: postgres:18-alpine
    command: ["psql", "-h", "db", "-U", "postgres", "-c", "create table if not exists items(id int); insert into items values (1);"]
    depends_on:
      db:
        condition: service_healthy               # czekaj na healthcheck, nie tylko na start

  web:
    image: nginx:1.30-alpine
    ports:
      - "127.0.0.1:${WEB_PORT:-18300}:80"        # wartość domyślna, gdy WEB_PORT nie jest ustawione
    depends_on:
      migrate:
        condition: service_completed_successfully

  tools:
    image: busybox:1.38
    profiles: [tools]                            # uruchamiana tylko z --profile tools

volumes:
  pgdata:
```

## Co zostało sprawdzone

- `docker compose up -d --wait` trwało około 9 s i respektowało zależności: `db` stało się **healthy**, potem `migrate` wykonał się i zakończył
  kodem 0, a potem wystartował `web` (znaczniki czasu startu w tej kolejności). `--wait` wraca dopiero, gdy usługi działają albo są zdrowe, co
  przydaje się w CI.
- Compose utworzył sieć `shop_default` (tu `iprep-compose_default`) i wolumen `<projekt>_pgdata`; `web` rozwiązał `db` po **nazwie usługi**.
- `${DB_PASSWORD}` pochodziło z pliku `.env`; `DB_PASSWORD=from-shell docker compose config` pokazało, że wartość z powłoki wygrywa z `.env`.
  `docker compose config` wypisuje w pełni rozwiązaną konfigurację i jest pierwszym krokiem debugowania.
- `compose.override.yaml` został **dołączony automatycznie** (jego zmienna środowiskowa pojawiła się w `web`); z samym `-f compose.yaml` nie.
- Usługa `tools` nie wystartowała przy zwykłym `up`; uruchomiło ją `docker compose --profile tools run --rm tools`.
- Zmiana konfiguracji tylko `web` i ponowne `up` **odtworzyły wyłącznie `web`**; `db` działało dalej w tym samym kontenerze.
- `docker compose down` usunęło kontenery i sieć, ale **zachowało wolumen** (dane nadal były po `up`); `down -v` go usunęło.
- Jednorazowa usługa `migrate` **uruchamiała się ponownie przy każdym `up`** (w tabeli skończyło się na 3 wierszach), więc kroki migracji muszą być
  idempotentne albo uruchamiane jawnie (`docker compose run`).

## Dobre praktyki

- `depends_on` bez warunku ustala tylko kolejność **startu**; gotowość zapewnia `condition: service_healthy` z healthcheckiem, a aplikacje i tak
  powinny ponawiać połączenia.
- Sekrety trzyma się poza `compose.yaml` i poza gitem: `.env` (ignorowany), pliki per środowisko albo `secrets` w Compose (montowane jako pliki
  w `/run/secrets`). Sprawdzone: sekret z pliku był czytelny w `/run/secrets/db_password`, a jego wartość, w przeciwieństwie do zwykłej zmiennej
  środowiskowej, nie pojawiła się w `docker inspect`.
- Różnice między środowiskami obsługują pliki override albo profile: zamontowany kod i porty debugowania w developmencie, limity zasobów i polityki
  restartu w produkcji.
- Compose Watch (`docker compose watch`) synchronizuje pliki albo przebudowuje obraz po zmianie w developmencie.

## Źródła

- [Docker Compose overview](https://docs.docker.com/compose/)
- [Compose file reference: services](https://docs.docker.com/reference/compose-file/services/)
- [Control startup order](https://docs.docker.com/compose/how-tos/startup-order/)
- [Environment variable precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
- [Merge Compose files](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
- [Using profiles](https://docs.docker.com/compose/how-tos/profiles/)

## Pytania

### Do czego służy Docker Compose? {junior}

Do definiowania i uruchamiania aplikacji wielokontenerowych jednym deklaratywnym plikiem: usługi (obraz albo build, porty, zmienne środowiskowe, wolumeny, zależności), sieci i wolumeny.
`docker compose up` tworzy wszystko, a `down` usuwa. Zwykle używa się go do lokalnych środowisk deweloperskich (API + baza + cache), testów integracyjnych w CI i prostych wdrożeń na jednym
hoście; przy produkcji na wielu hostach przejmują orkiestratory, jak Kubernetes.

### Jak usługi w Compose komunikują się ze sobą? {junior}

Compose tworzy domyślną sieć projektu (`<projekt>_default`) i podłącza do niej wszystkie usługi, a każda usługa jest osiągalna po nazwie usługi przez DNS Dockera: w teście `web` rozwiązał
`db` na jego IP. Connection string używa więc `Host=db`, a nie `localhost`. Porty trzeba publikować tylko dla dostępu z hosta.

### Czy `depends_on` czeka, aż zależność będzie gotowa? {mid}

Domyślnie nie: sprawia tylko, że Compose uruchamia zależność pierwszą. `condition: service_healthy` czeka, aż healthcheck zależności przejdzie, a `condition: service_completed_successfully`
czeka, aż jednorazowa usługa zakończy się kodem 0; w teście `web` wystartował dopiero, gdy `db` był zdrowy, a `migrate` się zakończył. Aplikacje i tak powinny ponawiać połączenia, bo zależności
mogą się później restartować.

### Jak działają zmienne środowiskowe i `.env` w Compose? {mid}

`${VAR}` w pliku compose jest interpolowane ze środowiska powłoki i pliku `.env` projektu (z wartościami domyślnymi w rodzaju `${WEB_PORT:-18300}`); wartość ustawiona w powłoce wygrywa z `.env`,
co pokazał test. Zmienne dla kontenera ustawia się przez `environment` albo `env_file`. `docker compose config` pokazuje wynik po interpolacji. Pliki `.env` z sekretami muszą być poza systemem
kontroli wersji.

### Co dzieje się z wolumenami po `docker compose down`? {junior}

`down` zatrzymuje i usuwa kontenery i sieci, ale zachowuje nazwane wolumeny, więc bazy danych przetrwają: w teście dane nadal były po `down` i `up`. `down -v` usuwa też nazwane wolumeny
projektu (i anonimowe), co kasuje dane. `--rmi` może usunąć obrazy zbudowane albo pobrane dla projektu.

### Do czego służą pliki override i profile w Compose? {mid}

`compose.override.yaml` jest automatycznie nakładany na `compose.yaml` (w teście zmienna z niego pojawiła się w kontenerze), a więcej plików można łączyć przez `-f`. Dzięki temu bazowy plik
jest wspólny, a ustawienia zależne od środowiska (bind mounty w developmencie, porty debugowania, limity w produkcji) są w osobnych plikach. Profile oznaczają usługi opcjonalne (narzędzia
debugowania, seedery), które startują tylko z `--profile`; w teście usługa `tools` została pominięta przy zwykłym `up`.

### Co robi `docker compose up`, gdy zmieni się konfiguracja? {mid}

Porównuje pożądaną konfigurację z działającymi kontenerami i odtwarza tylko usługi, których konfiguracja (albo obraz) się zmieniła, zostawiając pozostałe: w teście zmiana środowiska `web`
odtworzyła `web`, a `db` zachowało swój kontener. Usługi, których zależności odtworzono, też mogą zostać zrestartowane. `--force-recreate` odtwarza wszystko, `--no-recreate` nic.

### Jak uruchamiać migracje bazy danych w Compose? {senior}

Jako jednorazową usługę, która zależy od zdrowej bazy i od której aplikacja zależy przez `service_completed_successfully`, albo jawnie przez `docker compose run --rm migrate` w skrypcie
wdrożeniowym. Uwaga: jednorazowa usługa uruchamia się ponownie przy każdym `up`: w teście nieidempotentny insert wykonał się trzy razy. Narzędzia migracji (bundle migracji EF Core, Flyway,
Liquibase) śledzą zastosowane migracje, więc ich ponowne uruchomienie jest bezpieczne.

### Czy Docker Compose nadaje się do produkcji? {senior}

Na jednym hoście tak, przy zachowaniu ostrożności: polityki restartu, limity zasobów, healthchecki, konfiguracja logowania, sekrety i reverse proxy z TLS. Brakuje mu planowania na wielu hostach,
samonaprawiania między maszynami, aktualizacji kroczących z automatycznym wycofaniem i autoskalowania, i tu wchodzi Kubernetes albo zarządzane platformy kontenerowe. Wiele małych systemów dobrze
działa na Compose za proxy.

### Jak obsługiwać sekrety w Compose? {mid}

Nie wpisywać ich na sztywno w `compose.yaml`: przekazywać je ze środowiska albo ignorowanego pliku `.env` lub używać `secrets` w Compose, które montują plik albo wartość środowiskową w kontenerze
pod `/run/secrets/<nazwa>` zamiast wystawiać je jako zmienną środowiskową widoczną w `docker inspect`. W produkcji pobiera się je z menedżera sekretów. Każdy sekret, który trafił do gita, trzeba
zmienić.
