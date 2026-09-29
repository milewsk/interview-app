# Wolumeny i przechowywanie danych {mid}

Warstwa zapisywalna kontenera znika razem z kontenerem, więc wszystko, co ma przetrwać (pliki baz danych, przesłane pliki) albo być
współdzielone, trafia do **montowania**. Docker ma trzy rodzaje: **wolumeny** (zarządzane przez Dockera), **bind mounty** (ścieżka
hosta) i **tmpfs** (pamięć). Wybór właściwego i wiedza o tym, jak zachowują się przy pierwszym użyciu, to częsty temat rozmów, zwłaszcza
przy bazach danych w kontenerach.

## Wolumeny nazwane

```bash
docker volume create pgdata
docker run -d -e POSTGRES_PASSWORD=pw -v pgdata:/var/lib/postgresql postgres:18-alpine
```

Sprawdzone z PostgreSQL 18: tabela utworzona w pierwszym kontenerze nadal istniała (`42`) po **usunięciu** kontenera i uruchomieniu nowego
na tym samym wolumenie. Nowy kontener zalogował „Database directory appears to contain a database; Skipping initialization”, a przekazany mu
inny `POSTGRES_PASSWORD` **nie miał wpływu**: zmienne `POSTGRES_*` obrazu działają tylko przy inicjalizacji pustego katalogu danych. Uwaga:
obraz `postgres:18` przeniósł dane: deklaruje `VOLUME /var/lib/postgresql` z `PGDATA=/var/lib/postgresql/18/docker`, a wolumen zamontowany
w starej ścieżce `/var/lib/postgresql/data` sprawił, że kontener **zakończył się kodem 1** z błędem wyjaśniającym nowy układ katalogów zależny
od wersji głównej (sprawdzone).

- Wolumeny żyją w obszarze przechowywania Dockera, działają tak samo na każdym systemie i mogą używać sterowników (NFS, magazyny w chmurze).
- **Pusty wolumen jest wypełniany** zawartością obrazu przy pierwszym montowaniu: nowy wolumen zamontowany w `/usr/share/nginx/html` nginx
  zawierał `50x.html` i `index.html` z obrazu.
- Usunięcie kontenera zachowuje jego nazwane wolumeny; usuwa je `docker volume rm` albo `docker volume prune`.

## Wolumeny anonimowe

Jeśli obraz deklaruje `VOLUME`, a nic się tam nie zamontuje, Docker tworzy **wolumen anonimowy** z losową nazwą: uruchomienie
`postgres:18-alpine` bez `-v` zwiększyło liczbę wolumenów o jeden. `docker rm -v` usuwa go razem z kontenerem; w przeciwnym razie takie
wolumeny niezauważenie się gromadzą.

## Bind mounty

`-v /sciezka/hosta:/sciezka/kontenera` (albo `--mount type=bind,...`) mapuje katalog hosta do kontenera, co jest idealne w **developmencie**
(kod na żywo, pliki konfiguracyjne), ale wiąże kontener z układem katalogów i uprawnieniami hosta. Sprawdzone:

- pliki zapisane przez kontener pojawiły się na hoście, a pliki hosta były widoczne w kontenerze;
- **pusty katalog hosta przesłania** zawartość obrazu pod tą ścieżką (katalog HTML nginx był pusty), inaczej niż wolumen, który jest
  wypełniany;
- `:ro` uczyniło montowanie tylko do odczytu („Read-only file system”).

W Docker Desktop bind mounty z systemu plików Windows albo macOS przechodzą przez granicę maszyny wirtualnej i są wolniejsze niż wolumeny;
przy intensywnym I/O (np. `node_modules`) pliki trzyma się w wolumenie albo w systemie plików WSL 2. Na Linuksie właściciel plików jest
określany numerycznym UID, więc użytkownik kontenera bez uprawnień roota może nie móc pisać do katalogu hosta należącego do kogoś innego.

## tmpfs i kontenery tylko do odczytu

`--tmpfs /scratch:size=16m` daje katalog w pamięci (pokazał system plików 16 MB), który znika po zatrzymaniu kontenera, co pasuje do plików
tymczasowych albo wrażliwych. Z `--read-only` główny system plików jest tylko do odczytu (zapis do `/etc` się nie powiódł), a tmpfs w `/tmp`
pozostaje zapisywalny, co jest przydatnym połączeniem utwardzającym.

## Kopie zapasowe

Wolumen kopiuje się jednorazowym kontenerem:
`docker run --rm -v pgdata:/src:ro -v "$PWD":/backup alpine tar -czf /backup/pgdata.tgz -C /src .` (sprawdzone: archiwum 4,8 MB). Dla baz
danych lepsze są ich własne narzędzia (`pg_dump`) albo wcześniejsze wstrzymanie zapisów, bo kopiowanie plików działającej bazy może dać
niespójną migawkę.

## Źródła

- [Volumes](https://docs.docker.com/engine/storage/volumes/)
- [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/)
- [postgres image: PGDATA and PostgreSQL 18](https://hub.docker.com/_/postgres)
- [WSL 2 best practices (Docker Desktop)](https://docs.docker.com/desktop/features/wsl/best-practices/)

## Pytania

### Czym różni się wolumen od bind mounta i tmpfs? {junior}

Wolumen to magazyn zarządzany przez Dockera (tworzony przez `docker volume create` albo przy pierwszym użyciu), niezależny od struktury katalogów hosta i przenośny między systemami.
Bind mount mapuje istniejącą ścieżkę hosta do kontenera, więc obie strony widzą te same pliki. Montowanie tmpfs żyje w pamięci i znika po zatrzymaniu kontenera. Wolumeny to domyślny wybór
dla danych trwałych, bind mounty dla developmentu i konfiguracji, tmpfs dla plików tymczasowych albo wrażliwych.

### Jak utrwalić dane bazy danych w Dockerze? {junior}

Zamontować nazwany wolumen w katalogu danych bazy, np. `-v pgdata:/var/lib/postgresql` dla PostgreSQL 18. Dane przetrwają usunięcie i ponowne utworzenie kontenera: w teście nowy kontener
na tym samym wolumenie nadal miał tabelę i wartość utworzone przez poprzedni. Bez wolumenu dane żyją w warstwie zapisywalnej (albo wolumenie anonimowym) i łatwo je stracić.

### Dlaczego zmiana `POSTGRES_PASSWORD` nie zmieniła hasła do bazy? {mid}

Oficjalny obraz używa `POSTGRES_PASSWORD`, `POSTGRES_USER` i `POSTGRES_DB` tylko przy inicjalizacji pustego katalogu danych. Przy istniejącym wolumenie loguje „Skipping initialization”
i je ignoruje, co pokazał test z innym hasłem. Poświadczenia zmienia się przez SQL (`ALTER USER`), a w developmencie można usunąć wolumen, żeby zainicjalizować bazę od nowa.

### Co się dzieje, gdy zamontuje się pusty wolumen, a co przy pustym bind mouncie nad katalogiem, który ma pliki w obrazie? {mid}

Pusty nazwany wolumen jest przy pierwszym montowaniu wypełniany plikami obrazu spod tej ścieżki: nowy wolumen na katalogu HTML nginx zawierał `index.html` i `50x.html` z obrazu. Bind mount
zawsze pokazuje zawartość katalogu hosta, więc pusty katalog hosta przesłania pliki obrazu: ta sama ścieżka była pusta. To wyjaśnia niespodzianki w stylu „zniknęła mi konfiguracja” przy
bind mountach.

### Czym są wolumeny anonimowe i dlaczego mogą być problemem? {mid}

To wolumeny z wygenerowanymi nazwami, które Docker tworzy, gdy obraz deklaruje `VOLUME`, a nic się tam nie zamontuje (tak robi obraz `postgres`). Zostają po zatrzymaniu kontenera i nie są
wyraźnie z niczym powiązane, więc się gromadzą i marnują miejsce na dysku; w teście uruchomienie PostgreSQL bez `-v` dodało jeden taki wolumen. Należy używać wolumenów nazwanych, usuwać
kontenery przez `docker rm -v` i świadomie sprzątać nieużywane wolumeny.

### Dlaczego bind mounty są wolne w Docker Desktop i co z tym zrobić? {mid}

Na Windowsie i macOS kontenery działają w maszynie wirtualnej z Linuksem, więc bind mount z systemu plików hosta przechodzi przez warstwę współdzielenia plików między hostem a VM, co jest
dużo wolniejsze niż natywny dostęp do dysku, zwłaszcza przy wielu małych plikach, jak `node_modules`. Ciężkie katalogi trzyma się w nazwanych wolumenach, a na Windowsie projekt w systemie
plików WSL 2, jak zaleca dokumentacja Dockera.

### Jak uczynić montowanie tylko do odczytu i po co? {junior}

Dodać `:ro` do `-v` (albo `readonly` przy `--mount`): zapisy kończą się wtedy błędem „Read-only file system”, co pokazał test. Stosuje się to do konfiguracji, sekretów i kodu źródłowego,
których kontener nie powinien zmieniać. W połączeniu z `--read-only` dla głównego systemu plików i tmpfs dla `/tmp` ogranicza to, co może zmienić przejęty proces.

### Jak zrobić kopię zapasową wolumenu Dockera? {mid}

Uruchomić tymczasowy kontener, który montuje wolumen (tylko do odczytu) i katalog hosta, i zarchiwizować zawartość wolumenu:
`docker run --rm -v pgdata:/src:ro -v "$PWD":/backup alpine tar -czf /backup/pgdata.tgz -C /src .`. Odtwarza się w ten sam sposób w odwrotnym kierunku. Dla baz danych używa się ich
narzędzi do zrzutów albo najpierw zatrzymuje bazę, bo kopiowanie plików działającej bazy może nie dać spójnej kopii.

### Dlaczego kontener może nie móc pisać do katalogu zamontowanego przez bind mount? {senior}

Na Linuksie uprawnienia są sprawdzane po numerycznych UID i GID, a użytkownik kontenera (np. UID 1654 w obrazach .NET albo 1000 w obrazach Node) może nie być właścicielem katalogu hosta ani
mieć do niego prawa zapisu, bo należy on do twojego użytkownika na hoście albo do roota. Rozwiązania: ustawić odpowiedniego właściciela katalogu na hoście, uruchomić kontener z
`--user $(id -u):$(id -g)` albo użyć nazwanego wolumenu zainicjalizowanego z właściwym właścicielem. Współdzielenie plików w Docker Desktop ukrywa wiele z tych problemów, które potem
pojawiają się na serwerach z Linuksem.

### Czy uruchamiać bazę danych w kontenerze w produkcji? {senior}

To częste w developmencie, testach i CI i możliwe w produkcji przy zachowaniu ostrożności: dane na trwałym wolumenie, limity zasobów, kopie zapasowe i testy odtwarzania, monitoring
i planowane aktualizacje (np. obraz PostgreSQL 18 zmienił ścieżkę danych). Wiele zespołów woli w produkcji zarządzane usługi baz danych, żeby oddać kopie zapasowe, wysoką dostępność
i łatanie, a kontenerów używa dla usług bezstanowych.
