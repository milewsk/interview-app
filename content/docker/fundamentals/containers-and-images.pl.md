# Kontenery i obrazy {junior}

**Kontener** to odizolowany proces (albo grupa procesów) działający na jądrze hosta, z własnym widokiem systemu plików, sieci,
drzewa procesów i limitami zasobów. **Obraz** to szablon tylko do odczytu, z którego kontener startuje: stos warstw systemu plików
plus metadane (polecenie, zmienne środowiskowe, porty). Docker spopularyzował narzędzia, a formaty są ustandaryzowane przez **OCI**
(Open Container Initiative), więc obrazy zbudowane Dockerem działają w containerd, Podmanie czy Kubernetesie. Przykłady uruchamiałem
w Docker Desktop (Engine 27.5.1, WSL2); aktualne wydanie Engine to 29.x.

## Kontenery a maszyny wirtualne

| | Kontener | Maszyna wirtualna |
|---|---|---|
| Izolacja | **namespaces** Linuksa (co proces widzi) i **cgroups** (czego może używać) | hiperwizor z wirtualnym sprzętem |
| Jądro | **wspólne** z hostem | własne jądro systemu gościa |
| Rozmiar / start | megabajty, start w około sekundę | gigabajty, rozruch w dziesiątki sekund |
| Granica bezpieczeństwa | słabsza (jedno jądro dla wszystkich) | silniejsza |

Sprawdzone:

- Kontener Alpine i kontener BusyBox zgłosiły to samo jądro, `5.15.167.4-microsoft-standard-WSL2`, a `/etc/os-release` mówił „Alpine Linux
  v3.24”: obraz dostarcza przestrzeń użytkownika, a nie jądro. Na Windowsie i macOS Docker Desktop uruchamia kontenery linuksowe w lekkiej
  maszynie wirtualnej z Linuksem.
- **PID namespace**: `ps` w kontenerze pokazało tylko jego własny proces, jako **PID 1**.
- **cgroups**: `--memory 64m --cpus 0.5` pojawiło się w kontenerze jako limit pamięci `67108864` bajtów i quota CPU `50000/100000` (ten silnik
  używa cgroup v1; współczesne hosty z Linuksem używają cgroup v2 z `memory.max` i `cpu.max`).
- `docker run --rm alpine true` (utworzenie, start, wyjście, usunięcie) zajęło na tej maszynie łącznie około 1,7 s.

## Obrazy, warstwy i warstwa zapisywalna

- Obraz jest **niemutowalny** i składa się z **warstw**, z których każda to zbiór zmian w plikach z jednego kroku budowania. `node:24-alpine`
  miał 4 warstwy; `docker history` pokazuje krok, który utworzył każdą z nich, i jej rozmiar (165 MB na instalację Node.js).
- Warstwy są **współdzielone** między obrazami i kontenerami, więc dziesięć kontenerów z jednego obrazu nie przechowuje dziesięciu kopii.
- Działający kontener dodaje cienką **warstwę zapisywalną**. Sprawdzone: po utworzeniu `/tmp/note.txt` i usunięciu `/etc/motd` `docker diff`
  pokazał `A /tmp/note.txt` i `D /etc/motd`; nowy kontener z tego samego obrazu nie widział pliku; zatrzymany kontener miał go nadal, dopóki
  nie został usunięty. Dane, które mają przetrwać, należą do **wolumenów**.
- Obrazy identyfikują **tagi** (`node:24-alpine`, przesuwalne nazwy) i **digesty** (`node@sha256:...`, skróty zawartości, które się nie
  zmieniają). Przy containerd image store (domyślnym w nowych instalacjach Engine 29, włączonym w tym Docker Desktop) ID obrazu to właśnie
  ten digest.

## Źródła

- [What is a container?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)
- [What is an image?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/)
- [Understanding image layers](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- [containerd image store](https://docs.docker.com/engine/storage/containerd/)
- [Open Container Initiative](https://opencontainers.org/)

## Pytania

### Czym różni się obraz od kontenera? {junior}

Obraz to warstwowy szablon tylko do odczytu, zawierający system plików i metadane potrzebne do uruchomienia aplikacji. Kontener to działająca (albo zatrzymana) instancja obrazu: warstwy
obrazu plus własna warstwa zapisywalna, z odizolowaną przestrzenią procesów, siecią i limitami zasobów. Z jednego obrazu można uruchomić wiele kontenerów, podobnie jak z klasy wiele
obiektów.

### Czym kontener różni się od maszyny wirtualnej? {junior}

Maszyna wirtualna emuluje sprzęt i uruchamia pełny system gościa z własnym jądrem, więc jest ciężka i wolno się uruchamia, ale jest silnie odizolowana. Kontener to tylko odizolowany
proces na jądrze hosta, korzystający z namespaces i cgroups, więc startuje w około sekundę i waży megabajty, ale wszystkie kontenery dzielą jedno jądro, co jest słabszą granicą
bezpieczeństwa. W teście dwa różne obrazy zgłosiły tę samą wersję jądra hosta.

### Czym są namespaces i cgroups? {mid}

Namespaces kontrolują, co proces widzi: własne drzewo PID (główny proces kontenera to PID 1), interfejsy sieciowe, punkty montowania, nazwę hosta, użytkowników i IPC. Grupy kontrolne
(cgroups) kontrolują, czego może używać: pamięci, CPU, I/O i liczby procesów. Docker łączy je, żeby zbudować kontener; w teście `--memory 64m --cpus 0.5` pojawiło się w kontenerze jako limit
pamięci 64 MiB i quota 50% CPU.

### Czy w kontenerze linuksowym można uruchomić Windowsa albo inne jądro Linuksa? {mid}

Nie. Kontenery dzielą jądro hosta, więc kontener linuksowy potrzebuje jądra Linuksa, a obraz dostarcza tylko przestrzeń użytkownika (biblioteki, powłokę, aplikację). Różne dystrybucje
działają, bo korzystają z tego samego interfejsu jądra: obraz Alpine na hoście z Ubuntu działa na jądrze Ubuntu. Docker Desktop na Windowsie i macOS uruchamia maszynę wirtualną z Linuksem,
żeby dostarczyć to jądro; kontenery Windows to osobna technologia wymagająca jądra Windows.

### Czym są warstwy obrazu i dlaczego mają znaczenie? {mid}

Każdy krok budowania, który zmienia pliki, tworzy warstwę, a obraz to uporządkowany stos warstw. Warstwy są adresowane zawartością i współdzielone, więc obrazy zbudowane na tej samej bazie
używają jej warstw na dysku i przy pobieraniu, a niezmienione warstwy są brane z cache budowania. Oznacza to też, że usunięcie pliku w późniejszym kroku nie zmniejsza obrazu, bo wcześniejsza
warstwa nadal go zawiera.

### Co dzieje się z plikami zapisywanymi przez kontener? {junior}

Trafiają do warstwy zapisywalnej kontenera, która istnieje tylko dla tego kontenera: w teście plik utworzony w jednym kontenerze nie był widoczny w nowym kontenerze z tego samego obrazu.
Warstwa przetrwa zatrzymania i restarty, ale jest usuwana razem z kontenerem, a zapis do niej jest wolniejszy niż do wolumenu. Dane trwałe (bazy danych, przesłane pliki) należą do
wolumenów albo bind mountów.

### Czym jest containerd image store? {senior}

To backend przechowywania, w którym Docker trzyma obrazy w containerd, używając snapshotterów containerd zamiast klasycznych sterowników grafów Dockera. Przechowuje obrazy
jako zawartość OCI, łącznie z indeksami wieloplatformowymi i atestacjami, więc jeden silnik może trzymać obrazy dla kilku architektur. Jest domyślny w nowych instalacjach
Docker Engine 29 i można go włączyć w Docker Desktop; na tej maszynie `docker info` pokazał typ sterownika `io.containerd.snapshotter.v1`, a ID obrazu było równe digestowi
jego manifestu. Rozmiary pokazywane przez `docker image ls` i `docker image inspect` mogą się różnić między tymi dwoma magazynami.

### Czym jest OCI? {mid}

Open Container Initiative definiuje otwarte standardy formatów obrazów kontenerów, środowisk uruchomieniowych i dystrybucji (rejestrów). Ponieważ obrazy Dockera są z nimi zgodne, ten sam
obraz może uruchomić Docker, containerd, Podman, CRI-O albo Kubernetes, a przechowywać dowolny zgodny rejestr. Sam Docker pod spodem używa containerd i runc (referencyjnego środowiska
uruchomieniowego OCI).

### Dlaczego nie tworzyć obrazów przez `docker commit`? {mid}

`docker commit` zapisuje warstwę zapisywalną kontenera jako nowy obraz, co czyni obraz czarną skrzynką: nikt nie wie, jak powstał, nie da się go odtworzyć, przejrzeć ani zaktualizować, gdy
obraz bazowy dostanie poprawki bezpieczeństwa, a często zawiera pozostałości plików. Obrazy buduje się z Dockerfile trzymanego w systemie kontroli wersji. `docker diff` przydaje się przy
debugowaniu, żeby zobaczyć, co kontener zmienił.

### Czy kontener jest granicą bezpieczeństwa? {senior}

Tylko częściowo. Namespaces, cgroups, capabilities, seccomp i inne mechanizmy izolują kontenery wystarczająco dla większości obciążeń, ale wszystkie kontenery dzielą jądro hosta, więc
podatność jądra albo błędna konfiguracja (kontener uprzywilejowany, zamontowany socket Dockera, działanie jako root z szerokimi capabilities) może prowadzić do przejęcia hosta. Dla
niezaufanego kodu dodaje się silniejszą izolację: kontenery rootless albo z user namespaces, gVisor, Kata Containers albo osobne maszyny wirtualne.
