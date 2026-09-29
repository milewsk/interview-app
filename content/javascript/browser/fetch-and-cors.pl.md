# fetch i CORS {mid}

`fetch` to standardowe API przeglądarki do zapytań HTTP (dostępne też w Node 18+). Zwraca promise obiektu
`Response`. **CORS** (Cross-Origin Resource Sharing) to mechanizm, przez który serwer pozwala stronie z innego
originu odczytać swoje odpowiedzi.

## Podstawy `fetch`

```js
const res = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ada' }),
  signal: AbortSignal.timeout(5000),
})
if (!res.ok) throw new Error(`HTTP ${res.status}`)   // 🔴 fetch NIE odrzuca przy 404/500
const user = await res.json()
```

- Promise **odrzuca się tylko przy błędzie sieci** (brak połączenia, DNS, blokada CORS, przerwanie). HTTP 404 czy
  500 **spełnia** promise normalnie: trzeba sprawdzić `res.ok` (status 200–299) albo `res.status`.
- Ciało czyta się **raz**: `json()`, `text()`, `blob()`, `arrayBuffer()`, `formData()`. Drugi odczyt rzuca
  `TypeError`. Gdy potrzebny jest dwa razy, przed odczytem używa się `res.clone()`.
- `res.json()` odrzuca się z `SyntaxError`, gdy ciało nie jest poprawnym JSON-em (np. strona błędu w HTML).
- Typ ciała ustawia `Content-Type` automatycznie: `FormData` → `multipart/form-data` (z boundary, więc tego
  nagłówka **nie** ustawia się ręcznie), `URLSearchParams` → `application/x-www-form-urlencoded`. Dla stringa
  z JSON-em trzeba samemu ustawić `Content-Type: application/json`.

## Najważniejsze opcje

| Opcja | Domyślnie | Znaczenie |
|---|---|---|
| `method` | `GET` | metoda HTTP |
| `credentials` | `same-origin` | `omit` / `same-origin` / `include`: czy wysyłać ciasteczka i uwierzytelnienie HTTP |
| `mode` | `cors` | `cors` / `same-origin` / `no-cors` |
| `redirect` | `follow` | `follow` / `error` / `manual` |
| `signal` | brak | `AbortSignal` do anulowania i timeoutów |
| `cache` | `default` | współpraca z cache HTTP (`no-store`, `reload`, …) |
| `keepalive` | `false` | żądanie przetrwa zamknięcie strony (limit ciała 64 KiB), np. analityka |

## Polityka tego samego pochodzenia

**Origin** to schemat + host + port: `https://app.example.com:443`. `https://api.example.com` to **inny origin**
(inny host), podobnie `http://` a `https://` czy inny port. Domyślnie przeglądarka pozwala skryptowi **wysłać**
zapytanie do innego originu, ale **nie pozwala odczytać odpowiedzi**, chyba że serwer zezwoli na to nagłówkami CORS.

CORS egzekwuje **przeglądarka**, nie serwer. Serwer tylko deklaruje, na co pozwala, a przeglądarka decyduje, czy
JS dostanie odpowiedź. Dlatego zapytanie z Postmana, curla czy backendu działa bez CORS i dlatego CORS **nie jest
sposobem na zabezpieczenie API** przed nieuprawnionymi klientami.

## Proste zapytania i preflight

**Proste zapytanie** idzie od razu z nagłówkiem `Origin`, a przeglądarka sprawdza w odpowiedzi
`Access-Control-Allow-Origin`. Zapytanie jest proste, gdy:

- metoda to `GET`, `HEAD` lub `POST`,
- ma tylko nagłówki z listy dozwolonych (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type`, `Range`),
- `Content-Type` to jeden z `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`.

Wszystko inne (`PUT`/`PATCH`/`DELETE`, nagłówek `Authorization`, `Content-Type: application/json`, własne nagłówki
`X-*`) najpierw wywołuje **preflight**: zapytanie `OPTIONS` z prośbą o zgodę.

```http
OPTIONS /api/orders HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: authorization, content-type

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

Dopiero po pozytywnej odpowiedzi przeglądarka wysyła właściwe zapytanie. `Access-Control-Max-Age` pozwala
zapamiętać wynik preflightu, żeby nie powtarzać go przed każdym wywołaniem.

## Poświadczenia (ciasteczka)

Domyślnie `fetch` do innego originu **nie wysyła ciasteczek** (`credentials: 'same-origin'`). Żeby je wysłać:

- klient ustawia `credentials: 'include'`,
- serwer odpowiada `Access-Control-Allow-Credentials: true` i **konkretnym originem** w `Access-Control-Allow-Origin`
  (`*` jest wtedy niedozwolone, podobnie `*` w `Allow-Headers`/`Allow-Methods`/`Expose-Headers`),
- samo ciasteczko musi móc podróżować między witrynami (`SameSite=None; Secure`, zob. temat o przechowywaniu danych).

Serwer, który odbija dowolny `Origin` razem z `Allow-Credentials: true`, to luka bezpieczeństwa: każda strona może
wtedy odczytać dane użytkownika.

## Nagłówki odpowiedzi widoczne dla JS

Domyślnie JS widzi tylko bezpieczne nagłówki odpowiedzi: `Cache-Control`, `Content-Language`, `Content-Length`,
`Content-Type`, `Expires`, `Last-Modified`, `Pragma`. Inne (np. `X-Total-Count`, `ETag`) trzeba wymienić
w `Access-Control-Expose-Headers`.

## `mode: 'no-cors'`

Nie „omija” CORS. Zwraca odpowiedź **nieprzezroczystą** (opaque): status `0`, brak dostępu do nagłówków i ciała.
Przydaje się tylko do zapytań „wyślij i zapomnij” albo cache'owania w service workerze. Gdy API nie obsługuje CORS,
rozwiązaniem jest proxy na własnym serwerze (np. `server.proxy` w serwerze deweloperskim Vite, a na produkcji
reverse proxy lub BFF).

## Źródła

- [Using the Fetch API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [RequestInit (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
- [Cross-Origin Resource Sharing (CORS) (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [Same-origin policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [Access-Control-Expose-Headers (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers)

## Pytania

### Czy `fetch` odrzuca promise przy odpowiedzi 404 lub 500? {junior}

Nie. `fetch` odrzuca się tylko przy błędzie sieci: brak połączenia, błąd DNS, blokada CORS albo przerwanie przez `AbortSignal`. Każda odpowiedź
HTTP, także 404 i 500, spełnia promise normalnie. Trzeba sprawdzić `response.ok` (true dla statusów 200–299) albo `response.status` i samemu
rzucić błąd.

### Czym jest origin i co ogranicza polityka tego samego pochodzenia? {junior}

Origin to połączenie schematu, hosta i portu, więc `https://app.example.com` i `https://api.example.com` to różne originy. Polityka tego samego
pochodzenia (same-origin policy) nie pozwala skryptowi z jednego originu odczytywać zasobów z innego: przeglądarka może wysłać zapytanie, ale JS
nie dostanie odpowiedzi, chyba że serwer zezwoli na to nagłówkami CORS.

### Czym jest CORS i kto go egzekwuje? {mid}

CORS to mechanizm nagłówków HTTP (`Access-Control-Allow-Origin` i inne), którymi serwer deklaruje, jakie originy mogą czytać jego odpowiedzi.
Egzekwuje go przeglądarka: sprawdza nagłówki i przekazuje odpowiedź do JS albo ją blokuje. Dlatego zapytania z curla, Postmana czy backendu nie
podlegają CORS, a sam CORS nie chroni API przed nieuprawnionymi klientami: do tego służą uwierzytelnianie i autoryzacja.

### Kiedy przeglądarka wysyła zapytanie preflight? {mid}

Gdy zapytanie nie jest „proste”: używa metody innej niż `GET`/`HEAD`/`POST`, dodaje nagłówek spoza listy dozwolonych (np. `Authorization`
czy `X-Request-Id`) albo ma `Content-Type` inny niż `application/x-www-form-urlencoded`, `multipart/form-data` lub `text/plain`. Typowy `POST`
z `application/json` wywołuje więc preflight. Przeglądarka wysyła `OPTIONS` z `Access-Control-Request-Method` i `-Headers`, a właściwe zapytanie
idzie dopiero po akceptacji.

### Jak wysłać ciasteczka w zapytaniu do innego originu? {mid}

Po stronie klienta `credentials: 'include'`. Po stronie serwera `Access-Control-Allow-Credentials: true` i konkretny origin
w `Access-Control-Allow-Origin`, bo `*` nie jest wtedy dozwolone. Samo ciasteczko musi pozwalać na wysyłkę między witrynami
(`SameSite=None; Secure`). Serwer powinien sprawdzać `Origin` z listą dozwolonych, a nie odbijać dowolną wartość.

### Dlaczego nie da się odczytać własnego nagłówka odpowiedzi, np. `X-Total-Count`? {mid}

W odpowiedzi z innego originu JS widzi tylko bezpieczne nagłówki (`Content-Type`, `Content-Length`, `Cache-Control`, `Content-Language`,
`Expires`, `Last-Modified`, `Pragma`). Serwer musi dodać nagłówek do `Access-Control-Expose-Headers: X-Total-Count`. Przy poświadczeniach
wartość `*` nie działa tam jako wildcard, więc nagłówki trzeba wymienić z nazwy.

### Co robi `mode: 'no-cors'` i czy rozwiązuje błędy CORS? {mid}

Nie rozwiązuje. Zapytanie zostanie wysłane, ale odpowiedź jest nieprzezroczysta: status `0`, brak dostępu do nagłówków i ciała. Nadaje się
tylko do zapytań, których odpowiedź nie jest potrzebna, albo do cache'owania w service workerze. Prawdziwe rozwiązania to poprawne nagłówki
CORS na API albo proxy na własnym originie (proxy serwera deweloperskiego, reverse proxy, BFF).

### Jak poprawnie wysłać JSON i plik przez `fetch`? {junior}

JSON: `body: JSON.stringify(dane)` plus nagłówek `Content-Type: application/json`, bo dla stringa `fetch` go nie ustawi. Plik: utworzyć
`FormData`, dodać plik (`formData.append('file', file)`) i przekazać jako `body` **bez** ustawiania `Content-Type`, bo przeglądarka sama ustawi
`multipart/form-data` z właściwym boundary. Ręczne ustawienie nagłówka psuje boundary.

### Dlaczego drugie wywołanie `response.json()` rzuca błąd? {mid}

Ciało odpowiedzi to strumień, który można odczytać tylko raz. Po pierwszym odczycie `bodyUsed` ma wartość `true`, a kolejne `json()`/`text()`
rzuca `TypeError`. Jeśli ciało jest potrzebne dwa razy (np. logowanie i parsowanie), przed pierwszym odczytem wywołuje się `response.clone()`
albo czyta się je raz jako tekst i parsuje samodzielnie.

### Jak obejść brak CORS w zewnętrznym API podczas developmentu i na produkcji? {mid}

W developmencie przez proxy serwera deweloperskiego (np. `server.proxy` w Vite), które przekazuje zapytania z własnego originu do API, więc
przeglądarka nie widzi zapytania cross-origin. Na produkcji przez reverse proxy albo backend-for-frontend na własnej domenie, co przy okazji
pozwala trzymać klucze API po stronie serwera. Wyłączanie zabezpieczeń przeglądarki czy publiczne „CORS proxy” nie są rozwiązaniem.
