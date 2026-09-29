# Buildy wieloetapowe i małe obrazy {mid}

**Build wieloetapowy** (multi-stage) używa kilku etapów `FROM` w jednym Dockerfile: wcześniejsze etapy mają SDK i narzędzia
budowania i kompilują aplikację, a etap końcowy kopiuje tylko wynik budowania na mały obraz uruchomieniowy. Wynikowy obraz jest
mniejszy, szybciej się pobiera i ma mniejszą powierzchnię ataku, a nie trzeba osobnych skryptów budowania. To standardowy sposób
konteneryzacji aplikacji .NET, Node.js/React, Go i Java.

## Przykład .NET

```dockerfile
# etap budowania: pełne SDK, nigdy nie trafia do produkcji
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY api/Api.csproj api/
RUN dotnet restore api/Api.csproj
COPY api/ api/
RUN dotnet publish api/Api.csproj -c Release -o /app --no-restore

# etap końcowy: tylko runtime ASP.NET Core
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Api.dll"]
```

Sprawdzone na minimalnym API (rozmiary z `docker image ls`):

| Obraz końcowy | Rozmiar | Uwagi |
|---|---|---|
| jeden etap na `sdk:10.0` | **1,3 GB** | SDK, cache NuGet i źródła w obrazie; działa jako **root** |
| wieloetapowy na `aspnet:10.0` | **340 MB** | tylko runtime; działa jako użytkownik `app` (UID 1654) |
| wieloetapowy na `aspnet:10.0-noble-chiseled` | **180 MB** | bez powłoki i menedżera pakietów; domyślnie nie root |

Wszystkie trzy zwróciły HTTP 200. Fakty z obrazów: `ASPNETCORE_HTTP_PORTS=8080` (od .NET 8 aplikacje nasłuchują na **8080**, nie na 80),
`APP_UID=1654`, a w obrazie chiseled `docker exec ... sh` zakończyło się błędem „executable file not found”, o co właśnie chodzi: atakujący
nie ma się do czego podłączyć, ale ty też nie (debuguje się kontenerem pomocniczym).

Obraz chiseled ustawia też **`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`**, bo nie ma ICU: w teście
`1234.5m.ToString("C", CultureInfo.GetCultureInfo("pl-PL"))` zwróciło `1 234,50 zł` na `aspnet:10.0`, ale na obrazie chiseled rzuciło
`CultureNotFoundException` („Only the invariant culture is supported in globalization-invariant mode”). Aplikacje, które formatują dla
użytkowników daty, liczby albo waluty, potrzebują wariantu `-extra` albo pełnego obrazu.

## Przykład frontendu

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

Sprawdzone na małym skrypcie budującym: obraz końcowy miał **92,8 MB** (nginx) zamiast nieść obraz Node.js o rozmiarze 241 MB
i `node_modules`, i serwował zbudowany `index.html`.

## Przydatne szczegóły

- Etapy nazywa się (`AS build`) zamiast polegać na indeksach; `COPY --from=<etap>` może też kopiować z dowolnego obrazu
  (`COPY --from=nginx:1.30-alpine /etc/nginx/nginx.conf ...`).
- `docker build --target build` zatrzymuje się na etapie (sprawdzone: cel `build` dał obraz 1,3 GB z SDK), co przydaje się do uruchamiania
  testów albo debugowania; BuildKit buduje tylko etapy, od których zależy cel, a niezależne etapy buduje równolegle.
- Inne małe bazy: `-alpine` (musl libc, czasem problemy z kompatybilnością), Debian `-slim`, obrazy distroless i chiseled, `scratch` dla
  statycznych binariów (Go, .NET native AOT z `runtime-deps`).

## Źródła

- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [.NET container images](https://learn.microsoft.com/en-us/dotnet/core/docker/container-images)
- [Containerize a .NET app](https://learn.microsoft.com/en-us/dotnet/core/docker/build-container)
- [Globalization invariant mode](https://github.com/dotnet/runtime/blob/main/docs/design/features/globalization-invariant-mode.md)

## Pytania

### Czym jest build wieloetapowy i po co go używać? {junior}

To Dockerfile z kilkoma etapami `FROM`, w którym wcześniejsze etapy budują aplikację (z SDK, kompilatorami, zależnościami deweloperskimi), a etap końcowy kopiuje tylko wynik na minimalny
obraz uruchomieniowy. Dostarczany obraz jest dużo mniejszy i zawiera mniej narzędzi, których mógłby użyć atakujący: w teście API .NET zajmowało 1,3 GB zbudowane na obrazie SDK i 340 MB
(albo 180 MB w wersji chiseled) jako build wieloetapowy.

### Jak działa `COPY --from`? {mid}

Kopiuje pliki z innego etapu (po nazwie, np. `--from=build`, albo indeksie) lub z dowolnego obrazu (`--from=nginx:1.30-alpine`) zamiast z kontekstu budowania. W ten sposób wynik budowania
trafia do etapu końcowego bez narzędzi, które go wytworzyły. Nazwane etapy sprawiają, że `COPY --from` pozostaje poprawne przy zmianie kolejności etapów.

### Do czego służy `--target`? {mid}

`docker build --target <etap>` buduje do tego etapu włącznie i zwraca go jako obraz, np. etap `test` uruchamiający testy w CI, etap `dev` z hot reload albo etap `build` do debugowania
(w teście cel build dał obraz 1,3 GB z SDK). BuildKit buduje tylko etapy potrzebne celowi, więc niezwiązane etapy są pomijane.

### Dlaczego nie dostarczać do produkcji obrazu z .NET SDK? {junior}

Jest kilka razy większy (w teście 1,3 GB wobec 340 MB dla obrazu runtime), więc pobieranie i skalowanie są wolniejsze, a zawiera kompilatory, cache NuGet i kod źródłowy, których produkcja
nie potrzebuje i które zwiększają powierzchnię ataku. W teście działał też jako root, a obraz `aspnet` działa jako użytkownik `app` bez uprawnień roota po ustawieniu `USER $APP_UID`.

### Czym są obrazy chiseled albo distroless? {mid}

To minimalne obrazy zawierające tylko runtime i biblioteki potrzebne aplikacji, bez powłoki, menedżera pakietów i innych narzędzi. Obraz chiseled `aspnet:10.0` dla .NET miał w teście
180 MB, domyślnie działał jako użytkownik bez uprawnień roota, a `docker exec ... sh` zakończyło się błędem, bo nie ma powłoki. Zmniejszają rozmiar i powierzchnię ataku, ale debugowanie
wymaga narzędzi z zewnątrz (kontenerów pomocniczych albo debugujących), a mogą brakować w nich bibliotek, np. ICU.

### Jaką pułapkę z kulturami pokazał obraz chiseled .NET? {senior}

Nie ma ICU i ustawia `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`, więc aplikacja działa w trybie globalization-invariant: w teście sformatowanie ceny z `pl-PL` zwróciło `1 234,50 zł` na
zwykłym obrazie `aspnet`, ale rzuciło `CultureNotFoundException` na obrazie chiseled. Aplikacje wymagające formatowania, sortowania albo stref czasowych zależnych od kultury powinny używać
wariantu `-extra` (z ICU i tzdata) albo pełnego obrazu, a testy powinny działać na tym samym obrazie co produkcja.

### Na jakim porcie nasłuchuje kontener .NET 8+? {junior}

Na porcie 8080, ustawionym przez `ASPNETCORE_HTTP_PORTS=8080` w oficjalnych obrazach (sprawdzone w obrazie `aspnet:10.0`), żeby aplikacja mogła wszędzie działać jako użytkownik `app`
bez uprawnień roota. Na Linuksie porty poniżej 1024 zwykle wymagają uprawnień: w teście proces bez roota dostał „Permission denied” przy wiązaniu portu 80 w sieci hosta, choć domyślna sieć
bridge Dockera na to pozwoliła (Docker ustawia tam `ip_unprivileged_port_start=0`), więc wynik zależy od środowiska uruchomieniowego i jego konfiguracji. Mapuje się go przez `-p 5000:8080` albo zmienia przez
`ASPNETCORE_HTTP_PORTS`/`ASPNETCORE_URLS`; starsze przykłady wystawiające port 80 nie pasują już do obrazów.

### Jak skonteneryzować frontend w React albo Vite? {mid}

Zbudować pliki statyczne w etapie Node (`npm ci`, `npm run build`) i skopiować wynik (`dist`) do obrazu nginx (albo innego serwera statycznego) z konfiguracją nginx serwującą `index.html` dla
tras po stronie klienta. W teście końcowy obraz nginx miał 92,8 MB i serwował zbudowaną stronę, bez Node.js i `node_modules`. Konfiguracja czasu działania, np. URL API, wymaga osobnego
podejścia, bo zmienne środowiskowe z czasu budowania są wypiekane w bundle.

### Jakie są kompromisy obrazów opartych na Alpine? {mid}

Są małe, bo Alpine używa musl libc i BusyBoxa, ale musl może zachowywać się inaczej niż glibc (szczegóły rozwiązywania DNS, wydajność niektórych obciążeń, niedziałające moduły natywne albo
binaria zbudowane pod glibc). Dla .NET i Node.js obrazy Alpine są wspierane i szeroko używane, ale przy problemach z kompatybilnością natywną alternatywą są Debian `-slim`, Ubuntu chiseled
albo obrazy distroless z glibc.

### Jak uruchamiać testy w ramach buildu wieloetapowego? {senior}

Dodać po `build` etap uruchamiający testy (`FROM build AS test` + `RUN dotnet test`) i budować go w CI z `--target test`, żeby testy działały w tym samym środowisku co budowanie; etap końcowy
od niego nie zależy, więc buildy produkcyjne go pomijają. Wyniki testów można wyeksportować osobnym etapem i `--output`. Wiele zespołów nadal uruchamia testy poza Dockerem dla szybszej
informacji zwrotnej, a budowania kontenera używa tylko do pakowania.
