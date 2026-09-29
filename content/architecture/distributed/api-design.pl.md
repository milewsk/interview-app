# Projektowanie API HTTP {mid}

Większość serwisów udostępnia API HTTP, a rozmowy często zawierają pytania „zaprojektuj endpoint do...”. Dobre API
**poprawnie używa semantyki HTTP** (metod, kodów statusu, nagłówków), ma przewidywalne nazewnictwo zasobów, spójnie
raportuje błędy, obsługuje paginację i współbieżność i ewoluuje bez psucia klientów.

## Zasoby i metody

Modeluje się **zasoby** (rzeczowniki), a metodami wyraża akcje: `GET /orders/42`, `POST /orders`, `DELETE /orders/42`,
`GET /customers/7/orders`. Unika się czasowników w URL-ach, jak `/getOrder`; dla prawdziwych operacji biznesowych, które nie
są CRUD-em, dopuszczalny jest podzasób albo endpoint akcji (`POST /orders/42/cancellation`).

| Metoda | Cel | Bezpieczna | Idempotentna |
|---|---|---|---|
| `GET` | odczyt zasobu | tak | tak |
| `POST` | utworzenie zasobu / uruchomienie przetwarzania | nie | **nie** |
| `PUT` | zastąpienie całego zasobu (albo utworzenie pod znanym URI) | nie | tak |
| `PATCH` | częściowa aktualizacja | nie | niekoniecznie |
| `DELETE` | usunięcie zasobu | nie | tak |

**Bezpieczna** (RFC 9110) oznacza tylko do odczytu: `GET`, `HEAD`, `OPTIONS`, `TRACE`. **Idempotentna** oznacza, że zamierzony
efekt kilku identycznych żądań jest taki sam jak jednego: metody bezpieczne plus `PUT` i `DELETE`. Ma to znaczenie przy
ponowieniach: klienci i proxy mogą bezpiecznie ponawiać żądania idempotentne. W teście dwukrotne usunięcie tego samego
produktu dało oba razy `204`, a powtórzenie tego samego `PUT` zostawiło zasób w tym samym stanie (zmieniły się tylko metadane
serwera, jak licznik wersji, na co trzeba uważać).

## Kody statusu

| Kod | Użycie |
|---|---|
| `200 OK` | sukces z treścią |
| `201 Created` | utworzono; nagłówek `Location` wskazuje nowy zasób |
| `204 No Content` | sukces bez treści (np. `DELETE`) |
| `304 Not Modified` | warunkowy `GET`, a zasób się nie zmienił |
| `400 Bad Request` | zniekształcone albo niepoprawne dane |
| `401 Unauthorized` / `403 Forbidden` | nieuwierzytelniony / uwierzytelniony, ale bez uprawnień |
| `404 Not Found` | zasób nie istnieje |
| `405 Method Not Allowed` | metoda nieobsługiwana dla zasobu (sprawdzone dla `PATCH`) |
| `409 Conflict` | konflikt z bieżącym stanem (duplikat, niedozwolone przejście stanu) |
| `412 Precondition Failed` | `If-Match` się nie zgadza: równoległa modyfikacja |
| `422 Unprocessable Content` | poprawne składniowo, ale semantycznie błędne (część API używa go do walidacji) |
| `429 Too Many Requests` | przekroczony limit żądań, z `Retry-After` |
| `500` / `503` | błąd serwera / chwilowa niedostępność |

## Błędy: Problem Details

Błędy zwraca się w spójnym, czytelnym maszynowo formacie: **Problem Details** (RFC 9457, `application/problem+json`) z polami
`type`, `title`, `status`, `detail`, `instance` i rozszerzeniami. ASP.NET Core obsługuje go przez `AddProblemDetails()`,
`Results.Problem()` i `Results.ValidationProblem()`: w teście brakujący produkt zwrócił `404` z `application/problem+json`,
a niepoprawne dane `400` z obiektem `errors` per pole. Nie ujawnia się śladów stosu ani wewnętrznych komunikatów.

## Paginacja, filtrowanie, sortowanie

`GET /orders?status=paid&sort=-createdAt&pageSize=20&cursor=eyJpZCI6MTIzfQ`. Zawsze ogranicza się rozmiar strony. Paginacja
kursorowa (keyset) jest stabilna i szybka przy dużych lub zmieniających się danych; offsetowa jest prostsza i pozwala na numery
stron. W odpowiedzi zwraca się następny kursor albo link.

## Współbieżność i cache z ETagami

- Serwer zwraca `ETag` (wersję reprezentacji). Klient wysyła `If-None-Match: "1"`, żeby dostać `304 Not Modified` zamiast treści
  (cache, sprawdzone).
- Przy aktualizacjach klient wysyła `If-Match: "<etag>"`; jeśli zasób w międzyczasie się zmienił, serwer odpowiada
  `412 Precondition Failed` (sprawdzone), co zapobiega utraconym aktualizacjom (optymistyczna współbieżność przez HTTP).

## Klucze idempotencji

`POST` nie jest idempotentny, więc ponowione „utwórz zamówienie” może utworzyć dwa zamówienia. Klienci wysyłają nagłówek
`Idempotency-Key` (unikalna wartość na operację logiczną), a serwer zapisuje wynik per klucz i dla powtórzeń zwraca tę samą
odpowiedź: w teście dwa `POST` z tym samym kluczem zwróciły `201` z `Location: /products/2`, a utworzono tylko jeden produkt.
Szkic IETF standaryzuje ten nagłówek.

## Wersjonowanie i ewolucja

- Preferuje się **zmiany zgodne wstecz**: dodawanie opcjonalnych pól i nowych endpointów; bez zmiany nazw, usuwania pól czy
  zmiany ich znaczenia. Klienci powinni ignorować nieznane pola.
- Gdy zmiany łamiące są nieuniknione, wersjonuje się: w URL (`/v2/orders`, najbardziej widoczne), parametrze zapytania
  (`?api-version=2026-01-01`, używane w Azure) albo nagłówku / typie mediów. Stare wersje działają przez okres wycofywania.
- API dokumentuje się przez **OpenAPI** (ASP.NET Core generuje go przez `AddOpenApi()` w .NET 9+).

## REST, gRPC, GraphQL

- **REST/JSON przez HTTP**: uniwersalny, cache'owalny, łatwy do użycia z przeglądarek; domyślny wybór dla publicznych API.
- **gRPC**: binarny Protobuf przez HTTP/2, silnie typowane kontrakty, strumieniowanie, wysoka wydajność; świetny do wewnętrznej
  komunikacji między serwisami.
- **GraphQL**: klienci odpytują dokładnie potrzebne pola z jednego endpointu; dobry przy zróżnicowanych potrzebach frontendu,
  ale cache, autoryzacja per pole i kontrola kosztu zapytań są trudniejsze.

## Źródła

- [RFC 9110: HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Web API design best practices (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
- [Microsoft REST API guidelines](https://github.com/microsoft/api-guidelines)
- [Handle errors in ASP.NET Core APIs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling-api)
- [The Idempotency-Key HTTP header field (IETF draft)](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)

## Pytania

### Co oznaczają „bezpieczna” i „idempotentna” w odniesieniu do metod HTTP? {mid}

Metoda bezpieczna jest tylko do odczytu: nie powinna zmieniać stanu serwera (`GET`, `HEAD`, `OPTIONS`, `TRACE`). Metoda idempotentna ma ten sam zamierzony efekt niezależnie
od tego, czy żądanie wysłano raz, czy kilka razy: metody bezpieczne plus `PUT` i `DELETE`. `POST` nie jest ani jednym, ani drugim, a `PATCH` nie musi być idempotentny.
Idempotentność decyduje o tym, czy żądanie można bezpiecznie ponowić po timeoucie.

### Czym różni się `PUT` od `PATCH`? {mid}

`PUT` zastępuje cały zasób wysłaną reprezentacją: brakujące pola są resetowane, a dwukrotne wysłanie tego samego żądania daje ten sam wynik, więc jest idempotentny. `PATCH`
stosuje częściową modyfikację opisaną w treści (np. JSON Merge Patch albo JSON Patch) i nie musi być idempotentny (np. „dodaj 1 do ilości”). `PATCH` jest wygodny do aktualizacji
kilku pól bez wysyłania całego zasobu.

### Jaki kod statusu powinien zwrócić `POST` tworzący zasób? {junior}

`201 Created` z nagłówkiem `Location` zawierającym URI nowego zasobu i zwykle jego reprezentacją w treści. Jeśli żądanie zostało przyjęte do asynchronicznego przetworzenia,
a nie zakończone, `202 Accepted` z linkiem do sprawdzania statusu. Zwrócenie `200 OK` przy tworzeniu działa, ale ukrywa semantykę, na której polegają klienci i narzędzia.

### Czym różnią się `401` i `403`? {junior}

`401 Unauthorized` oznacza, że żądaniu brakuje poprawnego uwierzytelnienia (brak tokenu, wygasły albo niepoprawny), a klient powinien się uwierzytelnić i spróbować ponownie;
odpowiedź zawiera nagłówek `WWW-Authenticate`. `403 Forbidden` oznacza, że klient jest uwierzytelniony, ale nie ma uprawnień do tego zasobu lub akcji, a ponowne uwierzytelnienie
nie pomoże. Czasem zamiast `403` zwraca się `404`, żeby nie zdradzać, że zasób istnieje.

### Jak API powinno raportować błędy? {mid}

Odpowiednim kodem statusu i spójną, czytelną maszynowo treścią, najlepiej Problem Details (RFC 9457, `application/problem+json`): `type`, `title`, `status`, `detail`, `instance`
plus rozszerzenia, jak `errors` walidacji per pole albo identyfikator śledzenia. ASP.NET Core tworzy je przez `AddProblemDetails()`, `Results.Problem` i `Results.ValidationProblem`.
Treść błędu nie może ujawniać śladów stosu ani szczegółów wewnętrznych.

### Jak sprawić, żeby `POST` dało się bezpiecznie ponowić? {senior}

Kluczami idempotencji: klient generuje unikalny klucz na operację logiczną i wysyła go w nagłówku `Idempotency-Key`; serwer zapisuje klucz razem z wynikiem (najlepiej w tej samej
transakcji co operację), a dla powtórzonych żądań z tym samym kluczem zwraca zapisaną odpowiedź zamiast ponownie wykonywać operację. Klucze wygasają po jakimś czasie, a żądanie
z tym samym kluczem, ale inną treścią, powinno być odrzucane. Podejście spopularyzowały API płatności.

### Jak zapobiec utraconym aktualizacjom w API REST? {senior}

Optymistyczną współbieżnością z ETagami: `GET` zwraca `ETag` reprezentujący wersję zasobu, a klient odsyła go w `If-Match` przy aktualizacji. Jeśli ktoś inny w międzyczasie zmienił
zasób, ETag się nie zgadza i serwer odpowiada `412 Precondition Failed`, więc klient musi przeładować zasób i ponownie nałożyć swoją zmianę. ETag zwykle odpowiada wersji wiersza
albo tokenowi współbieżności w bazie.

### Jak można wersjonować API i jak uniknąć potrzeby wersjonowania? {mid}

Przez ścieżkę URL (`/v2/...`), parametr zapytania (`?api-version=...`) albo nagłówek lub typ mediów. Każdy ma kompromisy w widoczności i cache; wersjonowanie w URL jest najbardziej
jawne. Wersjonowanie jest potrzebne tylko przy zmianach łamiących, więc pierwszą strategią jest zgodna ewolucja: dodawać opcjonalne pola i endpointy, nigdy nie usuwać ani nie
zmieniać nazw pól czy ich znaczenia, a klienci ignorują nieznane pola. Stare wersje wycofuje się z wyprzedzeniem.

### Jak API powinno implementować paginację? {mid}

Zawsze ograniczać rozmiar strony i przyjmować parametr limitu, zwracać elementy ze sposobem na pobranie następnej strony (kursor albo link `next`) i opcjonalnie łączną liczbę, jeśli
jest tania. Paginacja kursorowa (keyset) oparta na kluczu sortowania jest stabilna przy zmianach danych i szybka na dużych kolekcjach; offsetowa (`page`, `pageSize`) jest prostsza
i pozwala skakać do numerów stron, ale zwalnia i może pomijać lub duplikować elementy, gdy dane się zmieniają.

### Kiedy wybrać gRPC zamiast REST? {mid}

Do wewnętrznej komunikacji między serwisami, gdzie liczą się wydajność i silne kontrakty: gRPC używa zwartego binarnego Protobufa przez HTTP/2, generuje typowane klienty, obsługuje
dwukierunkowe strumieniowanie i deadline'y. REST z JSON-em jest lepszy dla publicznych API i przeglądarek, bo jest powszechnie wspierany, czytelny dla ludzi, cache'owalny i łatwy
do eksploracji; gRPC w przeglądarkach wymaga gRPC-Web.
