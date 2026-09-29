# Warstwy i cache budowania {mid}

Każda instrukcja Dockerfile, która zmienia system plików, tworzy **warstwę**, a builder (**BuildKit**, domyślny od Docker Engine 23)
używa warstwy z **cache**, gdy instrukcja i jej wejścia się nie zmieniły. Dobra kolejność instrukcji to różnica między przebudową
trwającą 2 sekundy a trwającą 2 minuty, a zrozumienie warstw wyjaśnia, dlaczego obrazy bywają nieoczekiwanie duże.

## Jak działa cache

- Krok jest używany ponownie, jeśli tekst instrukcji jest ten sam, jej warstwa nadrzędna jest ta sama, a dla `COPY`/`ADD` **sumy
  kontrolne kopiowanych plików** są te same (znaczniki czasu nie mają znaczenia). Kroki `RUN` są cache'owane po tekście polecenia,
  a nie po tym, co pobierają.
- Gdy jeden krok zostanie przebudowany, **przebudowywane są też wszystkie kolejne**.
- `--no-cache` ignoruje cache; `--pull` sprawdza, czy jest nowszy obraz bazowy; samo `RUN apt-get update` w warstwie z cache nigdy się
  nie odświeża, więc łączy się je z instalacją w jednym `RUN`.

## Kolejność od najrzadziej do najczęściej zmienianych

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./          # zmienia się rzadko
RUN npm ci --omit=dev          # z cache, dopóki plik lock się nie zmieni
COPY . .                       # zmienia się przy każdym commicie
CMD ["node", "server.js"]
```

Sprawdzone na projekcie zależnym od `express` i `lodash`: po zmianie tylko `server.js`

- Dockerfile z `COPY . .` **przed** `npm ci` ponownie uruchomił instalację (3,2 s, całe budowanie około 5,9 s);
- powyższa wersja zgłosiła `npm ci` jako **CACHED** i przebudowała obraz w około **1,6 s**.

To samo dotyczy .NET (`COPY *.csproj` + `dotnet restore` przed `COPY . .`) i innych ekosystemów.

## Warstwy a rozmiar obrazu

Pliki usunięte w późniejszej warstwie nadal istnieją we wcześniejszej. Sprawdzone: zapisanie pliku 50 MB w jednym `RUN` i usunięcie go
w następnym dało obraz **53,9 MB** (historia pokazała warstwę 50 MB), a utworzenie i usunięcie go w **tym samym** `RUN` dało **3,9 MB**,
czyli rozmiar bazy Alpine. Dlatego instalacje i sprzątanie po nich umieszcza się w jednym kroku (`apk add --no-cache ...`,
`apt-get install ... && rm -rf /var/lib/apt/lists/*`), a buildy wieloetapowe to najczystszy sposób na pozostawienie narzędzi budowania.
`docker history` i narzędzia takie jak `dive` pokazują, co zawiera każda warstwa.

## Montowania cache

`RUN --mount=type=cache,target=/root/.npm npm ci` przechowuje cache pobrań menedżera pakietów **między buildami**, nie umieszczając go
w obrazie, więc gdy plik lock się zmieni, instalacja nie zaczyna od zera. W projekcie testowym (69 małych pakietów przy szybkiej sieci)
zysk był niewielki (`npm ci` 1,1 s z rozgrzanym cache wobec 1,4 s bez niego); ma znaczenie przy dużych drzewach zależności, wolnych
rejestrach i kompilowanych zależnościach. Podobne cele: `/root/.nuget/packages`, `/root/.cache/pip`, `/var/cache/apt`.

W CI, gdzie każde budowanie może działać na świeżej maszynie, cache warstw trzeba eksportować i importować (`--cache-to`/`--cache-from`
z rejestrem albo backendem cache systemu CI).

## Źródła

- [Docker build cache](https://docs.docker.com/build/cache/)
- [Optimize cache usage in builds](https://docs.docker.com/build/cache/optimize/)
- [Understanding image layers](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- [Cache storage backends](https://docs.docker.com/build/cache/backends/)
- [BuildKit](https://docs.docker.com/build/buildkit/)

## Pytania

### Jak Docker decyduje, czy krok budowania może użyć cache? {mid}

Porównuje instrukcję z krokiem z cache zbudowanym na tej samej warstwie nadrzędnej: tekst instrukcji musi się zgadzać, a dla `COPY` i `ADD` muszą się też zgadzać sumy kontrolne plików
źródłowych. Polecenia `RUN` są dopasowywane tylko po tekście, więc `RUN apt-get update` nie zauważy nowych pakietów. Gdy jeden krok nie trafi w cache, wszystkie późniejsze są
przebudowywane.

### Dlaczego kopiować manifest zależności przed resztą kodu źródłowego? {junior}

Żeby kosztowna instalacja zależności była w warstwie zależnej tylko od manifestu i pliku lock. Przy zmianie kodu aplikacji przebudowywane jest tylko końcowe `COPY` i późniejsze kroki,
a instalacja jest brana z cache. W teście zmiana jednego pliku źródłowego przebudowała obraz w około 1,6 s przy tej kolejności, wobec około 5,9 s (ponowna instalacja pakietów), gdy
najpierw kopiowano cały projekt.

### Dlaczego usunięcie pliku w późniejszym `RUN` nie zmniejsza obrazu? {mid}

Warstwy są nakładane na siebie, a późniejsza warstwa może tylko ukryć plik (przez „whiteout”), a nie usunąć go z wcześniejszej warstwy, która nadal jest pobierana i przechowywana.
W teście utworzenie pliku 50 MB w jednym `RUN` i usunięcie go w następnym dało obraz 53,9 MB, a wykonanie obu operacji w jednym `RUN` dało 3,9 MB. Sprząta się w tym samym kroku albo
używa buildu wieloetapowego.

### Dlaczego łączyć `apt-get update` i `apt-get install` w jednym `RUN`? {mid}

Jeśli `update` jest osobnym krokiem, jego warstwa jest cache'owana bez końca, więc późniejsza zmiana linii instalacji działa na starym indeksie pakietów i może zawieść albo zainstalować
nieaktualne wersje. Połączenie ich (`RUN apt-get update && apt-get install -y --no-install-recommends pkg && rm -rf /var/lib/apt/lists/*`) odświeża indeks przy każdej zmianie instalacji
i usuwa pliki indeksu z warstwy.

### Czym jest BuildKit? {mid}

To silnik budowania za `docker build` od Docker Engine 23 (i `docker buildx`). Buduje niezależne etapy równolegle, pomija nieużywane etapy, przesyła kontekst budowania przyrostowo
i obsługuje funkcje takie jak montowania cache, montowania sekretów i SSH, eksport i import cache, buildy wieloplatformowe i atestacje. Większość nowoczesnych funkcji Dockerfile
(`RUN --mount`, heredoki) go wymaga.

### Czym jest montowanie cache i czym różni się od cache warstw? {senior}

Cache warstw używa ponownie całych kroków tylko wtedy, gdy ich wejścia się nie zmieniły. Montowanie cache (`RUN --mount=type=cache,target=...`) daje krokowi trwały katalog, np. cache
pakietów npm albo NuGet, który przetrwa między buildami, ale nie trafia do obrazu. Nawet gdy plik lock się zmieni i krok wykona się ponownie, menedżer pakietów może użyć wcześniej
pobranych pakietów. Zysk rośnie z rozmiarem zależności; w małym projekcie testowym wyniósł tylko około 0,3 s.

### Jak zachować cache budowania w CI? {senior}

Runnery CI często startują bez lokalnego cache, więc każde budowanie zaczynałoby od zera. BuildKit może eksportować cache (`--cache-to`) i importować go (`--cache-from`) przez rejestr
(`type=registry`), lokalny system plików albo backendy specyficzne dla CI, np. GitHub Actions (`type=gha`). Z `mode=max` cache'owane są też warstwy etapów pośrednich, co pomaga
buildom wieloetapowym.

### Jak ustalić, co sprawia, że obraz jest duży? {mid}

`docker history <obraz>` wyświetla warstwy z rozmiarami i instrukcjami, które je utworzyły; narzędzia takie jak `dive` pozwalają przeglądać pliki każdej warstwy. Typowi winowajcy to
narzędzia budowania i SDK pozostawione w końcowym obrazie, cache menedżerów pakietów, pliki usunięte w późniejszej warstwie, brak `.dockerignore` i duży obraz bazowy. Rozwiązania: buildy
wieloetapowe, lżejsze obrazy bazowe, sprzątanie w tym samym `RUN`.

### Kiedy używać `--no-cache` albo `--pull`? {mid}

`--pull` sprawia, że builder sprawdza nowszą wersję tagu obrazu bazowego, i tak dostaje się poprawki bezpieczeństwa w buildach cyklicznych albo wydaniowych. `--no-cache` przebudowuje
każdy krok, co przydaje się, gdy krok `RUN` z cache pobrał coś, co się od tego czasu zmieniło, albo gdy podejrzewa się nieaktualny cache. Codzienne buildy deweloperskie nie używają
żadnej z tych opcji, żeby były szybkie.

### Czy zmiana wartości `LABEL`, `ENV` albo `ARG` unieważnia cache późniejszych kroków? {senior}

To zależy od tego, czy późniejsze kroki widzą tę wartość. Sprawdzone z BuildKit: zmiana `LABEL` (tylko metadane obrazu) pozostawiła następny krok `RUN` jako **CACHED**; zmiana
wartości `ENV` spowodowała jego ponowne wykonanie, bo zmienne środowiskowe są częścią każdego późniejszego `RUN`; zmiana domyślnej wartości `ARG` przebudowała tylko `RUN`, który
odwoływał się do argumentu, a niezwiązany krok pozostał w cache. Wartości zmieniające się przy każdym buildzie, np. hash commita, deklaruje się więc możliwie późno i tylko tam, gdzie są
używane.
