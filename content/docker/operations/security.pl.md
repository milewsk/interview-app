# Bezpieczeństwo kontenerów {senior}

Kontenery izolują procesy, ale wszystkie dzielą jądro hosta, a domyślne ustawienia Dockera stawiają na wygodę: procesy działają jako
**root**, obrazy mogą zawierać sekrety albo podatne pakiety, a jedna flaga (`--privileged`, zamontowany socket Dockera) może oddać host.
Zabezpieczanie kontenerów polega na ograniczaniu tego, co może zrobić przejęty proces, i tego, co zawiera obraz.

## Uruchamianie bez roota

Sprawdzone: `docker run alpine id` zwróciło `uid=0(root)`; z `--user 1000:1000` było `uid=1000`. Ustawia się `USER` w Dockerfile (obrazy .NET
dostarczają `USER $APP_UID`, UID 1654; obrazy Node użytkownika `node`), zapisywalne robi się tylko potrzebne katalogi dla tego użytkownika
i pilnuje, żeby aplikacja nasłuchiwała na porcie powyżej 1024 (patrz buildy wieloetapowe). Docker rootless albo remapowanie przestrzeni nazw
użytkowników dodatkowo mapuje roota kontenera na użytkownika hosta bez uprawnień.

## Capabilities i uprawnienia

Root w kontenerze nie ma wszystkich uprawnień roota: Docker przyznaje ograniczony zestaw linuksowych **capabilities**. Sprawdzone:

- domyślne efektywne capabilities to `00000000a80425fb`; z `--cap-drop ALL` było `0`, a `chown`, które domyślnie działało jako root,
  zakończyło się „Operation not permitted”;
- montowanie systemu plików w domyślnym kontenerze było zabronione, ale działało z `--privileged`, który udostępnił też **171** urządzeń w `/dev`
  zamiast 15.

Zatem: `--cap-drop ALL` i dodawanie z powrotem tylko potrzebnych (`--cap-add NET_BIND_SERVICE`), nigdy `--privileged` dla aplikacji, dodanie
`--security-opt no-new-privileges` (binaria setuid nie podniosą uprawnień), pozostawienie domyślnych profili seccomp i AppArmor/SELinux
oraz `--read-only` z tmpfs dla zapisywalnych ścieżek.

## Socket Dockera

Zamontowanie `/var/run/docker.sock` daje kontenerowi pełne API Dockera. Sprawdzone: skrypt Node.js w kontenerze z zamontowanym socketem
wyświetlił **wszystkie 13 kontenerów hosta**; równie dobrze mógłby uruchomić uprzywilejowany kontener montujący główny system plików hosta, więc
socket jest równoważny **rootowi na hoście**. Należy go unikać; jeśli narzędzie naprawdę go potrzebuje (agenty CI, reverse proxy obserwujące
kontenery), używa się ograniczonego proxy socketu albo konfiguracji rootless.

## Zawartość obrazu

- **Nigdy sekretów w obrazach**: token przekazany przez `--build-arg` był czytelny w `docker history` (patrz temat o Dockerfile), a `.env`
  skopiowany przez `COPY . .` trafił do obrazu bez `.dockerignore`. Używa się sekretów budowania i sekretów czasu działania.
- **Małe, zaufane bazy**: oficjalne albo zweryfikowane obrazy przypięte do wersji albo digestu; minimalne obrazy (chiseled, distroless, Alpine)
  zawierają mniej pakietów, które mogą być podatne.
- **Skanowanie i przebudowy**: skanery takie jak Docker Scout (wymaga zalogowania do Dockera; tu o nie poprosił), Trivy czy Grype wymieniają znane
  CVE w pakietach systemowych i zależnościach; obrazy regularnie przebudowuje się z `--pull`, żeby dostać poprawki obrazu bazowego, i generuje
  SBOM oraz atestacje proweniencji (`docker buildx build --sbom=true --provenance=true`).
- **Podpisywanie i weryfikacja** obrazów (Docker Content Trust / Notary, Sigstore cosign), żeby wdrożenia uruchamiały tylko to, co zbudował twój
  pipeline.

## Źródła

- [Docker Engine security](https://docs.docker.com/engine/security/)
- [Rootless mode](https://docs.docker.com/engine/security/rootless/)
- [Runtime privilege and Linux capabilities](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities)
- [Protect the Docker daemon socket](https://docs.docker.com/engine/security/protect-access/)
- [Docker Scout](https://docs.docker.com/scout/)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

## Pytania

### Dlaczego kontenery nie powinny działać jako root? {junior}

Jeśli atakujący wykorzysta aplikację, dostaje użytkownika kontenera. Jako root może zmienić wszystko w kontenerze, użyć capabilities roota, a ucieczka z kontenera albo błędna konfiguracja
(zamontowane ścieżki hosta, socket Dockera) prowadzi prosto do roota na hoście. Domyślnie kontenery działają jako root (sprawdzone: `uid=0`), więc ustawia się w obrazie `USER` bez uprawnień
roota albo uruchamia z `--user`, jak użytkownik `app` w obrazach .NET.

### Czym są capabilities Linuksa w kontekście Dockera? {mid}

To uprawnienia roota podzielone na jednostki, takie jak `CHOWN`, `NET_ADMIN`, `SYS_ADMIN` czy `NET_BIND_SERVICE`. Docker daje kontenerom ograniczony domyślny zestaw, więc root w kontenerze jest
słabszy niż root hosta: w teście montowanie systemów plików było zabronione. `--cap-drop ALL` usuwa je wszystkie (wtedy `chown` jako root się nie powiódł), a `--cap-add` dodaje konkretne z
powrotem. Zasada to najmniejsze uprawnienia: usunąć wszystko, dodać tylko to, czego aplikacja potrzebuje.

### Co robi `--privileged` i dlaczego jest niebezpieczne? {mid}

Daje kontenerowi wszystkie capabilities, dostęp do urządzeń hosta (w teście 171 wpisów w `/dev` wobec 15 domyślnie) i wyłącza ograniczenia seccomp i AppArmor, więc kontener może montować dyski
hosta, ładować moduły jądra i w praktyce kontrolować host. Służy do szczególnych przypadków, jak Docker-in-Docker albo dostęp do sprzętu, a nie do aplikacji.

### Dlaczego zamontowanie socketu Dockera w kontenerze jest ryzykowne? {mid}

Socket udostępnia pełne API Dockera, a każdy, kto może go użyć, może uruchomić uprzywilejowany kontener z zamontowanym systemem plików hosta, co oznacza roota na hoście. W teście kontener
z zamontowanym socketem wyświetlił wszystkie kontenery działające na hoście. Dostają go tylko zaufane narzędzia infrastruktury, najlepiej przez proxy przepuszczające tylko potrzebne wywołania
API.

### Jak trzymać sekrety poza obrazami? {mid}

Nigdy ich nie kopiować przez `COPY` ani nie przekazywać jako `ARG`/`ENV`: w teście argumenty budowania były widoczne w `docker history`, a pliki skopiowane bez `.dockerignore` zostają w warstwach,
nawet jeśli później się je usunie. Do sekretów czasu budowania używa się montowań sekretów BuildKit, sekrety czasu działania wstrzykuje orkiestrator albo menedżer sekretów (jako pliki lub
zmienne środowiskowe przy starcie), a `.dockerignore` utrzymuje się aktualny. Jeśli sekret kiedykolwiek trafił do wypchniętego obrazu, trzeba go zmienić.

### Jak znajdować podatności w obrazach? {mid}

Skanować je narzędziami takimi jak Docker Scout, Trivy czy Grype, które porównują pakiety systemowe i zależności aplikacji z bazami podatności, najlepiej w CI z polityką przerywającą budowanie przy
krytycznych znaleziskach. Ponieważ nowe CVE pojawiają się już po zbudowaniu, rejestry skanuje się na bieżąco, a obrazy regularnie przebudowuje z `--pull`, żeby dostać poprawki obrazu bazowego.
Mniejsze obrazy bazowe oznaczają mniej znalezisk.

### Co robi `--read-only` i co psuje jego włączenie? {mid}

Montuje główny system plików kontenera tylko do odczytu, więc przejęty proces nie zmieni binariów ani konfiguracji i nie podrzuci narzędzi do kontenera. Wiele obrazów przy
starcie oczekuje, że coś zapisze: w teście `nginx` z `--read-only` zakończył się kodem 1, bo jego entrypoint nie mógł zmienić `/etc/nginx/conf.d/default.conf`, a zadziałał po
zamontowaniu `/var/cache/nginx`, `/run` i `/tmp` jako tmpfs. `--read-only` łączy się więc z tmpfs albo wolumenami dla nielicznych ścieżek, które muszą być zapisywalne.

### Czym jest Docker rootless? {senior}

To uruchamianie demona Dockera i kontenerów jako użytkownik bez uprawnień, z użyciem przestrzeni nazw użytkowników, dzięki czemu root w kontenerze jest mapowany na zwykłego użytkownika hosta.
Ucieczka z kontenera daje wtedy atakującemu tylko uprawnienia tego użytkownika. Ma ograniczenia (niektóre funkcje sieci i przechowywania, wydajność niektórych sterowników). Pokrewną opcją jest
remapowanie przestrzeni nazw użytkowników (`userns-remap`) dla zwykłego demona.

### Jakie flagi uruchomieniowe utwardzają kontener? {senior}

`--user` (bez roota), `--cap-drop ALL` plus minimalne `--cap-add`, `--security-opt no-new-privileges`, `--read-only` z `--tmpfs` dla zapisywalnych ścieżek, limity zasobów (`--memory`,
`--pids-limit`) ograniczające odmowę usługi, brak `--privileged` i socketu Dockera, publikowanie tylko potrzebnych portów na właściwych interfejsach i pozostawione domyślne profile seccomp/AppArmor.

### Jak zapewnić, że wdrażane są tylko zaufane obrazy? {senior}

Budować obrazy w CI z przejrzanych Dockerfile, wypychać je do prywatnego rejestru i wdrażać po digeście zamiast zmiennych tagów. Podpisywać obrazy (Sigstore cosign, Notation) i weryfikować podpisy
przy wdrożeniu polityką dopuszczania, dołączać SBOM i atestacje proweniencji, ograniczać rejestry, z których wolno pobierać, i skanować obrazy przed promocją do produkcji.
