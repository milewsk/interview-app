# Rejestry, tagi i buildy w CI {mid}

Obrazy dystrybuuje się przez **rejestry** (Docker Hub, GitHub Container Registry, Azure Container Registry, Amazon ECR, własne instancje).
Pipeline CI buduje obraz, taguje go i wypycha, a wdrożenia go pobierają. Pytania na rozmowach dotyczą **tagów a digestów**, strategii
tagowania, obrazów **wieloplatformowych** i przyspieszania buildów **zdalnym cache**.

## Tagi się przesuwają, digesty nie

Sprawdzone na lokalnym rejestrze (`registry:3`): obraz wypchnięto jako `1.0.0` i `latest`, a potem przebudowany obraz jako `1.1.0` i `latest`.

- Rejestr pokazał tagi `1.0.0`, `1.1.0`, `latest`; po usunięciu kopii lokalnych pobranie `:latest` zwróciło **1.1.0**: tag się przesunął.
- Pobranie `iprep-app@sha256:cf39...` (digestu zapisanego dla 1.0.0) nadal zwróciło **1.0.0**.

Wdraża się więc po digeście (albo niezmiennych tagach wersji), dla powtarzalności i wycofań, a `latest` traktuje jako wygodę dla ludzi.
Praktyczny schemat tagowania: wersja semantyczna (`1.4.2` oraz `1.4` i `1`), SHA commita Git dla śledzenia pochodzenia i opcjonalnie gałąź
dla środowisk podglądowych. Wiele rejestrów pozwala uczynić tagi niezmiennymi.

## Obrazy wieloplatformowe

Nazwa obrazu może wskazywać **indeks** (listę manifestów) z osobnym obrazem dla każdej platformy.
`docker buildx imagetools inspect alpine:3.24` wypisał `linux/amd64`, `linux/arm/v6`, `linux/arm/v7`, `linux/arm64/v8` (plus manifesty
atestacji widoczne jako `unknown/unknown`), a klient wybiera właściwy. Sprawdzone:

- `docker buildx build --platform linux/amd64,linux/arm64 ... --push` utworzył indeks z obiema platformami;
- `docker run --platform linux/arm64 alpine uname -m` wypisał `aarch64` na maszynie x86, przez emulację QEMU. Buildy emulowane są wolne; natywne
  runnery ARM albo kompilacja skrośna (np. `dotnet publish -r linux-arm64` w etapie budowania amd64) są szybsze.

Ma to znaczenie dla laptopów z Apple Silicon, instancji ARM w chmurze (AWS Graviton, Azure Cobalt) i mieszanych klastrów.

## Cache budowania w CI

Runnery CI często startują puste, więc każde budowanie powtarzałoby wszystkie kroki. Sprawdzone ze świeżymi builderami BuildKit (symulującymi
nowe runnery) na projekcie Node.js:

| Build | Czas | `npm ci` |
|---|---|---|
| świeży builder, `--cache-to type=registry,ref=.../cache:main,mode=max` | 17 s | wykonane (2,4 s) |
| kolejny świeży builder, bez cache | 16 s | wykonane |
| kolejny świeży builder, `--cache-from type=registry,ref=.../cache:main` | **9 s** | **CACHED** |

`mode=max` eksportuje też etapy pośrednie. GitHub Actions ma dedykowany backend (`type=gha`).

```yaml
# GitHub Actions (szkic)
- uses: docker/setup-buildx-action@v3
- uses: docker/login-action@v3
  with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
- uses: docker/build-push-action@v6
  with:
    push: true
    platforms: linux/amd64,linux/arm64
    tags: ghcr.io/acme/api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

## Higiena rejestru

Uwierzytelnia się przez `docker login` i credential helpery, a nie konfigurację jawnym tekstem; w CI używa się krótkotrwałych poświadczeń
(OIDC), gdzie rejestr to obsługuje; ustawia się polityki retencji usuwające stare nieotagowane obrazy; skanuje obrazy przy wypychaniu i pamięta
o limitach pobrań Docker Hub dla nieuwierzytelnionych pobrań w CI (mirror albo uwierzytelnienie).

## Źródła

- [Docker Hub and registries](https://docs.docker.com/docker-hub/)
- [Image tags and digests: docker image pull](https://docs.docker.com/reference/cli/docker/image/pull/)
- [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
- [Cache storage backends](https://docs.docker.com/build/cache/backends/)
- [GitHub Actions with Docker](https://docs.docker.com/build/ci/github-actions/)
- [Distribution registry (registry image)](https://distribution.github.io/distribution/)

## Pytania

### Czym jest rejestr kontenerów? {junior}

To serwer, który przechowuje i dystrybuuje obrazy, zorganizowane w repozytoria z tagami. `docker push` wysyła warstwy i manifest obrazu, `docker pull` pobiera to, czego brakuje, a warstwy
wspólne z obrazami obecnymi lokalnie są używane ponownie (pobrania w teście zgłosiły „Already exists” dla warstwy bazowej). Przykłady: Docker Hub, GHCR, ACR, ECR, Harbor albo otwartoźródłowy
obraz `registry` do samodzielnego hostowania.

### Dlaczego wdrażanie `latest` to zły pomysł? {junior}

`latest` to tylko przesuwalny tag, a nie „najnowsza stabilna wersja”: w teście `:latest` wskazywał 1.0.0, a po następnym wypchnięciu 1.1.0. Wdrożenia go używające nie są powtarzalne, wycofanie
nie wie, do czego wrócić, a różne węzły mogą uruchamiać różne wersje zależnie od tego, kiedy pobrały obraz. Wdraża się jawne tagi wersji albo, lepiej, digesty.

### Czym jest digest obrazu i kiedy go używać? {mid}

To skrót SHA-256 manifestu obrazu, identyfikujący dokładnie jedną zawartość obrazu. Pobranie po digeście zawsze zwraca ten sam obraz: w teście digest 1.0.0 nadal zwracał 1.0.0 po przesunięciu
`latest` na 1.1.0. Digestów używa się w produkcyjnych manifestach wdrożeniowych, dla obrazów bazowych w Dockerfile, gdy potrzebna jest pełna powtarzalność, i w politykach bezpieczeństwa.

### Jak tagować obrazy w pipeline CI? {mid}

SHA commita Git przy każdym buildzie (śledzenie dokładnego źródła), tagi wersji semantycznej przy wydaniach (`1.4.2` i ewentualnie `1.4`/`1` dla odbiorców chcących aktualizacji) oraz opcjonalnie
tagi gałęzi albo środowiska dla podglądów. Wdrożenia produkcyjne odwołują się do tagu SHA albo digestu. Włączenie niezmienności tagów w rejestrze chroni przed nadpisaniem wydanych wersji.

### Czym jest obraz wieloplatformowy? {mid}

To indeks obrazu (lista manifestów), który pod jedną nazwą wskazuje osobne obrazy dla różnych kombinacji system/architektura, np. `linux/amd64` i `linux/arm64`; klient pobiera wariant dla swojej
platformy. `docker buildx build --platform linux/amd64,linux/arm64 --push` buduje i wypycha oba (sprawdzone), używając emulacji albo kompilacji skrośnej dla nienatywnego. Jest potrzebny dla laptopów
ARM i serwerów ARM w chmurze.

### Dlaczego emulowane buildy wieloplatformowe są wolne i jak je przyspieszyć? {senior}

Budowanie dla obcej architektury wykonuje każdą instrukcję `RUN` przez emulację QEMU (w teście maszyna x86 uruchomiła tak kontener arm64), co przy kompilatorach i instalacji pakietów może być
wielokrotnie wolniejsze. Szybsze opcje: natywne buildery dla każdej architektury (runnery CI na ARM, zdalne buildery) albo kompilacja skrośna w etapie budowania działającym na natywnej platformie
(`FROM --platform=$BUILDPLATFORM` i celowanie w `$TARGETARCH`, np. `dotnet publish -r linux-arm64`), zostawiając na platformę tylko etap końcowy.

### Jak utrzymać szybkie buildy Dockera w CI? {mid}

Ustawić kolejność instrukcji w Dockerfile pod cache i eksportować cache budowania między przebiegami: `--cache-to`/`--cache-from` z rejestrem albo backendem cache systemu CI. W teście ze świeżymi
builderami import cache z rejestru sprawił, że instalacja zależności była `CACHED`, a build skrócił się z około 16 do 9 sekund. Pomagają też `.dockerignore`, małe obrazy bazowe i buildy
wieloetapowe pomijające nieużywane etapy.

### Jak CI powinno uwierzytelniać się w rejestrze? {mid}

Poświadczeniami ograniczonymi do potrzebnych repozytoriów i uprawnień, trzymanymi jako sekrety CI, albo lepiej krótkotrwałymi tokenami uzyskiwanymi przez federację OIDC (obsługiwaną przez
GitHub Actions z GHCR oraz rejestrami AWS, Azure i GCP), żeby nie przechowywać długotrwałego hasła. `docker login` zapisuje poświadczenia dla klienta Dockera; credential helpery trzymają je
w pęku kluczy systemu.

### Czym są limity pobrań Docker Hub i dlaczego wpływają na CI? {mid}

Docker Hub ogranicza liczbę pobrań obrazów, z ostrzejszymi limitami dla anonimowych użytkowników, więc systemy CI pobierające obrazy bazowe przy każdym buildzie ze współdzielonych adresów IP mogą
przekroczyć limit i zawieść. Rozwiązania: uwierzytelniać pobrania, używać pull-through cache albo mirrora albo kopiować obrazy bazowe do własnego rejestru.

### Czym jest pull-through cache albo mirror? {senior}

To rejestr pośredniczący w dostępie do innego rejestru: przy pierwszym żądaniu pobiera obraz z góry i go zapisuje, a kolejne żądania obsługuje lokalnie. Przyspiesza buildy i wdrożenia,
zmniejsza ruch zewnętrzny i chroni przed awariami oraz limitami źródła. Oferują to rejestry w chmurze (ACR, ECR, GAR), Harbor albo otwartoźródłowy obraz `registry` w trybie proxy.
