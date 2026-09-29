# Kontenery w produkcji {senior}

Uruchamianie kontenerów w produkcji to mniej polecenia Dockera, a bardziej cechy, które muszą mieć aplikacja i platforma: **konfiguracja ze
środowiska**, **bezstanowe** procesy, które można zastąpić i skalować, **logi** na stdout z rotacją, **limity zasobów**, healthchecki i łagodne
zamykanie oraz **orkiestrator**, który planuje, restartuje i aktualizuje kontenery na wielu maszynach. To idee stojące za Twelve-Factor App
i Kubernetesem.

## Konfiguracja ze środowiska

Ten sam obraz powinien działać w każdym środowisku; różni się tylko konfiguracja. ASP.NET Core czyta zmienne środowiskowe ponad
`appsettings.json`, z `__` jako separatorem sekcji. Sprawdzone na kontenerze .NET 10: bez zmiennych `/config` zwrócił
`Greeting=from appsettings; Db=(unset)`; z `-e Greeting__Text="from env"` i `-e ConnectionStrings__Default="Host=db;Database=shop"` zwrócił
wartości ze środowiska. Sekrety pochodzą z magazynu sekretów orkiestratora albo menedżera sekretów, a nie z obrazu.

## Logi

Aplikacje piszą na stdout/stderr, a platforma je zbiera. Domyślny sterownik `json-file` (sprawdzony jako domyślny w demonie) **nie rotuje logów,
jeśli się tego nie skonfiguruje**, co może zapełnić dyski. Sprawdzone: z `--log-opt max-size=10k --log-opt max-file=2` kontener, który wypisał
3000 wierszy, zachował tylko ostatnie **218** (od „line 2783”). Rotację konfiguruje się per kontener albo dla całego demona (`log-opts`
w `daemon.json`), używa sterownika `local` albo wysyła logi do centralnego systemu (Fluent Bit, OpenTelemetry Collector, logowanie w chmurze),
najlepiej jako strukturalny JSON.

## Procesy bezstanowe i skalowanie

Stan należy do baz danych, cache i magazynów obiektów, a nie do kontenera, więc każdą instancję można zabić i zastąpić. Sprawdzone:
`docker compose up --scale web=3` uruchomił trzy repliki, a nazwa usługi `web` rozwiązała się na **trzy adresy IP** (DNS round robin).
Prawdziwe równoważenie obciążenia, routing uwzględniający zdrowie instancji i aktualizacje kroczące zapewnia reverse proxy albo orkiestrator.

## Zasoby

Bez limitów kontener może użyć całego hosta: `docker stats` pokazał limit pamięci kontenera .NET równy **15,31 GiB** hosta. Ustawia się limity
pamięci i CPU (`--memory`, `--cpus`, `deploy.resources` w Compose, requests i limits w Kubernetesie); środowiska uruchomieniowe, takie jak .NET,
dobierają stertę GC do limitu kontenera. Trzeba obserwować zabicia przez OOM (kod 137, `OOMKilled`).

## Orkiestracja

Przy więcej niż jednym hoście potrzebny jest orkiestrator. Pojęcia Kubernetesa w skrócie: **Pod** uruchamia jeden albo więcej kontenerów;
**Deployment** utrzymuje N replik i wykonuje **aktualizacje kroczące** z wycofaniem; **Service** daje im stałą nazwę i równoważenie obciążenia;
**ConfigMap** i **Secret** dostarczają konfigurację; **sondy liveness/readiness** zastępują `HEALTHCHECK`; **requests/limits** sterują
planowaniem. Zarządzane alternatywy (Azure Container Apps, AWS ECS/Fargate, Google Cloud Run) uruchamiają kontenery bez zarządzania klastrem.

Strategie wdrożeń: aktualizacja krocząca (domyślna), blue-green (przełączenie ruchu między dwoma pełnymi środowiskami), canary (najpierw mała
część ruchu). Wszystkie wymagają migracji bazy zgodnych wstecz, bo stara i nowa wersja działają jednocześnie.

## Źródła

- [The Twelve-Factor App: config](https://12factor.net/config)
- [Configure logging drivers](https://docs.docker.com/engine/logging/configure/)
- [JSON File logging driver](https://docs.docker.com/engine/logging/drivers/json-file/)
- [Configuration in ASP.NET Core: environment variables](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/#non-prefixed-environment-variables)
- [Kubernetes overview](https://kubernetes.io/docs/concepts/overview/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

## Pytania

### Dlaczego w każdym środowisku używać tego samego obrazu? {junior}

Żeby to, co zostało przetestowane, było dokładnie tym, co działa w produkcji: budowanie osobno dla każdego środowiska może przynieść inne wersje zależności albo ustawienia budowania. Różnice
między środowiskami (connection stringi, URL-e, flagi funkcji, poziomy logowania) pochodzą z konfiguracji wstrzykiwanej w czasie działania, jak zaleca Twelve-Factor App; obraz jest promowany
z testów do produkcji po tagu albo digeście.

### Jak konfigurować aplikację ASP.NET Core w kontenerze? {mid}

Zmiennymi środowiskowymi, które nadpisują `appsettings.json`; zagnieżdżone klucze używają podwójnego podkreślenia, np. `ConnectionStrings__Default` albo `Logging__LogLevel__Default`. W teście
`Greeting__Text` i `ConnectionStrings__Default` przekazane przez `-e` zastąpiły wartości z `appsettings.json`. Sekrety montuje się z magazynu sekretów orkiestratora albo odczytuje przy starcie
z menedżera sekretów (np. Azure Key Vault).

### Dlaczego logi kontenerów wymagają rotacji? {mid}

Domyślny sterownik `json-file` zapisuje logi na dysk hosta bez limitu rozmiaru, jeśli nie skonfiguruje się rotacji, więc gadatliwy kontener może zapełnić dysk i położyć host. Z `max-size`
i `max-file` przechowywane są tylko ostatnie logi (w teście zostało 218 z 3000 wierszy). W produkcji logi wysyła się też do centralnego systemu, bo giną razem z kontenerem, a potrzebne jest
wyszukiwanie po wszystkich instancjach.

### Co oznacza „bezstanowy” w odniesieniu do kontenerów i dlaczego to ważne? {mid}

Kontener nie przechowuje danych, które muszą go przetrwać: sesje, przesłane pliki i cache żyją w usługach zewnętrznych (baza danych, Redis, magazyn obiektów). Wtedy każdą instancję można zabić,
zrestartować, przenieść albo przeskalować bez utraty danych, co zakładają orkiestratory, gdy zastępują niezdrowe instancje albo wykonują aktualizacje kroczące. Usługi stanowe (bazy danych)
wymagają wolumenów i szczególnej ostrożności.

### Jak działa skalowanie usługi w Docker Compose i jakie ma ograniczenia? {mid}

`docker compose up --scale web=3` uruchamia trzy kontenery usługi na jednym hoście, a nazwa usługi rozwiązuje się na wszystkie ich IP (sprawdzone: trzy adresy), więc klienci dostają prosty DNS
round robin. Nie da się opublikować tego samego portu hosta dla wszystkich replik, nie ma równoważenia obciążenia uwzględniającego zdrowie ani logiki aktualizacji kroczących, a wszystko działa na
jednej maszynie, więc do prawdziwego skalowania potrzebne jest reverse proxy albo orkiestrator.

### Co się dzieje, gdy nie ustawi się limitów pamięci? {mid}

Kontener może użyć całej pamięci hosta (w teście `docker stats` pokazał jako jego limit 15,31 GiB hosta), więc jedna cieknąca usługa może zagłodzić inne albo wywołać OOM killer hosta, który może
zabić niezwiązany proces. Z limitami zabijany jest tylko winny kontener (kod 137), a środowiska uruchomieniowe, takie jak .NET, dopasowują do nich sterty. Orkiestratory też potrzebują requests
i limits, żeby sensownie planować kontenery.

### Jakie podstawowe obiekty Kubernetesa powinien znać programista? {mid}

Pod (jeden albo więcej kontenerów współdzielących sieć i przechowywanie, jednostka planowania), Deployment (deklaruje pożądaną liczbę replik i obsługuje aktualizacje kroczące oraz wycofania),
Service (stały wirtualny IP i nazwa DNS równoważąca obciążenie na pasujące pody), Ingress albo Gateway (routing HTTP z zewnątrz), ConfigMap i Secret (konfiguracja) oraz sondy i requests/limits
zasobów w specyfikacji poda. Namespace'y rozdzielają zespoły albo środowiska.

### Jakie są strategie wdrażania kontenerów? {senior}

Aktualizacja krocząca (stopniowa wymiana instancji, domyślna w Deploymentach Kubernetesa), blue-green (wdrożenie nowej wersji obok starej i jednorazowe przełączenie ruchu, łatwe wycofanie)
i canary (wysłanie małego procentu ruchu do nowej wersji i zwiększanie go przy monitorowaniu). Wszystkie uruchamiają starą i nową wersję jednocześnie, więc zmiany API i schematu bazy muszą być
zgodne wstecz (migracje expand-and-contract).

### Kiedy wybrać zarządzaną usługę kontenerową zamiast Kubernetesa? {senior}

Gdy chce się uruchamiać kontenery bez utrzymywania klastra: usługi takie jak Azure Container Apps, AWS ECS/Fargate czy Google Cloud Run zajmują się planowaniem, skalowaniem (często do zera),
TLS i aktualizacjami, przy mniejszym progu wejścia i koszcie dla małych i średnich obciążeń. Kubernetes opłaca się, gdy potrzeba jego ekosystemu i elastyczności (własne sieci, operatory, wiele
zespołów i usług, wiele chmur) i są ludzie, którzy go utrzymają.

### Co obejmuje gotowy do produkcji obraz kontenera i konfiguracja uruchomieniowa? {senior}

Mały, przypięty i przeskanowany obraz bazowy zbudowany wieloetapowo; użytkownika bez uprawnień roota; entrypoint w formie exec z łagodną obsługą `SIGTERM`; konfigurację i sekrety ze środowiska;
logi na stdout z rotacją albo wysyłką; endpointy health, readiness i liveness; limity zasobów; główny system plików tylko do odczytu, gdzie się da; obraz otagowany wersją i wdrażany po digeście;
oraz eksport metryk i śladów (np. OpenTelemetry).
