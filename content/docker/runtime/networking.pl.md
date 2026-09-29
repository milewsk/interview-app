# Sieć {mid}

Każdy kontener dostaje własną przestrzeń nazw sieci: własne interfejsy, adres IP i `localhost`. Docker łączy kontenery przez **sieci**
(domyślnie linuksowy bridge), zapewnia **DNS** między kontenerami w sieciach zdefiniowanych przez użytkownika i udostępnia usługi na
zewnątrz przez **publikowanie portów**. Większość problemów typu „lokalnie działa, a w Dockerze nie” to nieporozumienia sieciowe, dlatego
pytają o nie rekruterzy.

## Sieci bridge zdefiniowane przez użytkownika

```bash
docker network create backend
docker run -d --name db --network backend postgres:18-alpine
docker run -d --name api --network backend -e DB_HOST=db my-api
```

Sprawdzone:

- W sieci zdefiniowanej przez użytkownika kontener dotarł do nginx **po nazwie kontenera** i po **aliasie sieciowym**
  (`--network-alias api`); wbudowany serwer DNS to `127.0.0.11`.
- Kontener w innej sieci był nieosiągalny zarówno po nazwie („bad address”), jak i po IP (przekroczenie czasu): sieci izolują grupy kontenerów.
  Po dodaniu drugiego kontenera do pierwszej sieci przez `docker network connect` był osiągalny po nazwie.
- W **domyślnej sieci `bridge`** nazwy się nie rozwiązywały („bad address”), działały tylko adresy IP. Dlatego aplikacje powinny używać własnych
  sieci (Compose automatycznie tworzy jedną na projekt).

## Porty i `localhost`

- Wewnątrz kontenera `localhost` to **sam kontener**: żądanie do `localhost:80` z kontenera bez serwera WWW zostało odrzucone. Do innego kontenera
  sięga się po jego nazwie, a do hosta z kontenera w Docker Desktop przez **`host.docker.internal`** (sprawdzone: dotarło do serwera opublikowanego
  na `127.0.0.1:18200` hosta). Na Linuksie dodaje się `--add-host=host.docker.internal:host-gateway`.
- Publikowanie: `-p 8080:80` mapuje port 8080 hosta na port 80 kontenera na wszystkich interfejsach; `-p 127.0.0.1:8080:80` tylko na localhost
  (patrz temat o Dockerfile, gdzie `-P` wybrał losowy port). Opublikowane porty na Linuksie są realizowane regułami iptables/nftables, które mogą
  omijać firewalle hosta, takie jak `ufw`, więc gdy port nie ma być publiczny, wiąże się go z `127.0.0.1`.
- Aplikacja musi nasłuchiwać w kontenerze na **`0.0.0.0`** (wszystkich interfejsach); serwer związany z `127.0.0.1` w kontenerze nie jest
  osiągalny przez opublikowany port.

## Sterowniki sieci

| Sterownik | Zastosowanie |
|---|---|
| `bridge` | domyślny, jeden host, izolowane sieci dla aplikacji |
| `host` | kontener używa bezpośrednio stosu sieciowego hosta (bez izolacji i mapowania portów; Linux, opcjonalnie w Docker Desktop) |
| `none` | brak sieci: sprawdzone, istniał tylko interfejs `lo` |
| `overlay` | sieci wielohostowe (Swarm) |
| `macvlan`/`ipvlan` | kontenery widoczne jako urządzenia w sieci fizycznej |
| `container:<nazwa>` | współdzielenie przestrzeni nazw sieci innego kontenera (debugowanie, sidecary) |

## Źródła

- [Networking overview](https://docs.docker.com/engine/network/)
- [Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)
- [Port publishing and mapping](https://docs.docker.com/engine/network/port-publishing/)
- [Docker Desktop networking (host.docker.internal)](https://docs.docker.com/desktop/features/networking/)
- [Packet filtering and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## Pytania

### Jak kontenery na tym samym hoście się odnajdują? {junior}

Umieszcza się je w tej samej sieci zdefiniowanej przez użytkownika (`docker network create` albo domyślna sieć tworzona przez Compose) i używa nazw kontenerów albo aliasów sieciowych jako
nazw hostów; wbudowany serwer DNS Dockera (`127.0.0.11`) rozwiązuje je na bieżące adresy IP. W teście kontener dotarł do nginx po nazwie i po aliasie. Wpisywanie adresów IP na sztywno się
psuje, bo zmieniają się przy ponownym tworzeniu kontenerów.

### Dlaczego kontenery w domyślnej sieci bridge nie rozwiązują się nawzajem po nazwie? {mid}

Domyślna sieć `bridge` nie zapewnia automatycznego DNS między kontenerami (zachowanie historyczne); działają tam tylko adresy IP, co pokazał test („bad address” po nazwie, sukces po IP). Sieci
bridge zdefiniowane przez użytkownika dodają rozwiązywanie nazw, lepszą izolację (połączone są tylko kontenery, które dołączysz) i możliwość podłączania oraz odłączania kontenerów w czasie
działania, więc należy ich używać zamiast domyślnej.

### Co oznacza `localhost` wewnątrz kontenera? {junior}

Własną przestrzeń nazw sieci kontenera, a nie hosta ani innych kontenerów. Żądanie do `localhost` z jednego kontenera nie dotrze do bazy w innym kontenerze ani na twojej maszynie: w teście
zostało odrzucone, bo w tym kontenerze nic nie nasłuchiwało. Używa się nazwy innego kontenera albo `host.docker.internal`, żeby dotrzeć do hosta w Docker Desktop.

### Czym jest sieć wewnętrzna (internal)? {mid}

To sieć zdefiniowana przez użytkownika utworzona przez `docker network create --internal`: kontenery w niej mogą się ze sobą komunikować, ale sieć nie ma trasy do świata
zewnętrznego. W teście kontener w sieci wewnętrznej dotarł po nazwie do sąsiedniego nginx, a jego żądanie do publicznej strony zostało zablokowane; to samo żądanie z domyślnej
sieci się powiodło. Pasuje do baz danych i usług backendowych, które nigdy nie powinny inicjować ani odbierać ruchu z zewnątrz; usługi potrzebujące obu podłącza się do sieci
wewnętrznej i zwykłej.

### Dlaczego aplikacja w kontenerze jest nieosiągalna, choć port jest opublikowany? {mid}

Częste przyczyny: aplikacja nasłuchuje w kontenerze na `127.0.0.1` zamiast `0.0.0.0`, więc ruch przychodzący przez interfejs sieciowy kontenera jest odrzucany; zmapowano zły port kontenera (np.
80 zamiast 8080 dla obrazów .NET 8+); aplikacja się wywróciła (sprawdź `docker ps` i `docker logs`); albo port hosta blokuje firewall lub używa go inny proces. `docker port` pokazuje
rzeczywiste mapowania.

### Jak izolować grupy kontenerów? {mid}

Tworzyć osobne sieci zdefiniowane przez użytkownika, np. `frontend` i `backend`, i podłączać każdy kontener tylko do potrzebnych sieci: bazę tylko do `backend`, API do obu, reverse proxy tylko
do `frontend`. W teście kontener w jednej sieci nie mógł dotrzeć do kontenera w innej ani po nazwie, ani po IP, dopóki nie został jawnie podłączony. Sieci wewnętrzne oznacza się `--internal`,
żeby zablokować dostęp z zewnątrz.

### Jak kontener dociera do usługi działającej na hoście? {mid}

W Docker Desktop przez specjalną nazwę `host.docker.internal` (w teście kontener dotarł w ten sposób do serwera opublikowanego na localhost hosta). Na Linuksie dodaje się
`--add-host=host.docker.internal:host-gateway` (albo `extra_hosts` w Compose) lub używa sieci hosta. Usługa na hoście musi nasłuchiwać na interfejsie osiągalnym dla kontenera.

### Czym jest sieć hosta i kiedy jej używać? {senior}

Z `--network host` kontener współdzieli stos sieciowy hosta: nie ma osobnego IP ani mapowania portów, a aplikacja wiąże się bezpośrednio z portami hosta. Unika to narzutu NAT i pomaga
oprogramowaniu potrzebującemu wielu portów albo multicastu, ale usuwa izolację sieciową i może powodować konflikty portów. To funkcja Linuksa; Docker Desktop obsługuje ją tylko jako opcję do
włączenia. Większość aplikacji powinna używać sieci bridge.

### Dlaczego opublikowane porty mogą omijać firewall, taki jak `ufw` na Linuksie? {senior}

Docker publikuje porty, wstawiając własne reguły iptables (albo nftables) dla NAT i przekazywania, które są przetwarzane przed łańcuchami zarządzanymi przez narzędzia takie jak `ufw`, więc
opublikowany port może być osiągalny z internetu, nawet jeśli firewall wydaje się go blokować. Środki zaradcze: publikować tylko na `127.0.0.1` za reverse proxy, filtrować w łańcuchu
`DOCKER-USER` albo polegać na grupach bezpieczeństwa w chmurze.

### Jak debugować problemy sieciowe między kontenerami? {mid}

Sprawdzić, czy oba kontenery są w tej samej sieci (`docker network inspect`), a potem testować od środka: `docker exec` do klienta albo tymczasowy kontener w tej samej sieci (albo współdzielący
przestrzeń nazw kontenera przez `--network container:<nazwa>`) z narzędziami takimi jak `wget`, `nslookup` czy `nc`, żeby zweryfikować rozwiązywanie DNS i połączenie z właściwym portem. Potem
sprawdzić, czy serwer nasłuchuje na `0.0.0.0` i oczekiwanym porcie, i przeczytać logi obu kontenerów.
