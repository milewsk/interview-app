# Przechowywanie danych w przeglądarce {mid}

Przeglądarka oferuje kilka miejsc na dane po stronie klienta. Różnią się pojemnością, czasem życia, API
(synchroniczne czy asynchroniczne), tym, czy trafiają na serwer, i tym, na co są narażone.

| Mechanizm | Pojemność | Czas życia | API | Wysyłane na serwer | Dostęp z JS |
|---|---|---|---|---|---|
| Ciasteczka | ~4 KB na ciasteczko | sesja lub `Expires`/`Max-Age` | `document.cookie`, `Set-Cookie` | tak, z każdym pasującym zapytaniem | nie przy `HttpOnly` |
| `localStorage` | ~5 MiB na origin | do usunięcia | synchroniczne, stringi | nie | tak |
| `sessionStorage` | ~5 MiB na origin | czas życia karty | synchroniczne, stringi | nie | tak |
| IndexedDB | duża (część dysku) | do usunięcia lub eksmisji | asynchroniczne, dane strukturalne | nie | tak |
| Cache API | jak IndexedDB | do usunięcia lub eksmisji | asynchroniczne, `Request`/`Response` | nie | tak (także w service workerze) |

## Web Storage: `localStorage` i `sessionStorage`

```js
localStorage.setItem('theme', 'dark')
localStorage.getItem('theme')          // 'dark'; brak klucza → null
localStorage.removeItem('theme')

localStorage.setItem('n', 1)            // zapisane jako string '1'
localStorage.setItem('o', { a: 1 })     // 🔴 '[object Object]'
localStorage.setItem('o', JSON.stringify({ a: 1 }))   // ✅
```

- Przechowuje **tylko stringi**. Wszystko inne jest konwertowane przez `String()`, więc obiekty serializuje się
  przez `JSON.stringify` i odczytuje przez `JSON.parse` (w `try/catch`, bo dane mogą być uszkodzone lub pochodzić
  ze starszej wersji aplikacji).
- API jest **synchroniczne** i blokuje główny wątek, więc nadaje się do małych ilości danych (ustawienia, szkice),
  nie do dużych kolekcji.
- Dane są przypisane do **originu** (schemat + host + port).
- `localStorage` przetrwa zamknięcie przeglądarki. `sessionStorage` jest per **karta**: przetrwa przeładowanie, ale
  nie zamknięcie karty, a nowa karta ma własną kopię (karta otwarta przez „duplikuj” dostaje kopię stanu).
- Przekroczenie limitu rzuca `QuotaExceededError`. W trybie prywatnym lub przy zablokowanym przechowywaniu wyjątek
  może rzucić już sam dostęp.
- Zdarzenie **`storage`** odpala się w **innych** kartach tego samego originu, gdy zmieni się `localStorage` (nie
  w tej, która zmieniła). Pozwala synchronizować stan między kartami (wylogowanie, motyw).

## Ciasteczka

```http
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

- Wysyłane **automatycznie** z zapytaniami do pasującej domeny i ścieżki, dlatego służą do sesji i uwierzytelniania.
  Każde ciasteczko zwiększa rozmiar każdego zapytania.
- `HttpOnly`: niewidoczne dla `document.cookie`, co chroni token sesji przed XSS (ciasteczko nadal leci z `fetch`).
- `Secure`: tylko przez HTTPS.
- `SameSite`: `Strict` (tylko zapytania z tej samej witryny), `Lax` (plus nawigacje `GET` najwyższego poziomu
  z innych witryn), `None` (zawsze; wymaga `Secure`). Przeglądarki coraz częściej domyślnie przyjmują `Lax`, gdy
  atrybutu brak. `SameSite` to główna obrona przed CSRF.
- Brak `Expires`/`Max-Age` = **ciasteczko sesyjne**, usuwane po zamknięciu przeglądarki. `Max-Age` ma pierwszeństwo
  przed `Expires`.
- `Domain` rozszerza ciasteczko na subdomeny, a bez niego ciasteczko jest „host-only”. Prefiks `__Host-` wymusza
  `Secure`, `Path=/` i brak `Domain`.
- `document.cookie` to niewygodne API: odczyt zwraca jeden string `"a=1; b=2"`, a przypisanie **dodaje lub nadpisuje
  jedno** ciasteczko, a nie zastępuje wszystkich.

## IndexedDB

Transakcyjna, **asynchroniczna** baza klucz–wartość w przeglądarce. Przechowuje obiekty strukturalne (wszystko, co
obsługuje algorytm structured clone: obiekty, tablice, `Date`, `Map`, `Blob`, …), obsługuje indeksy, zakresy kluczy
i transakcje oraz działa w web workerach. To podstawa aplikacji offline i dużych cache'y. Natywne API jest oparte na
zdarzeniach i rozwlekłe, więc w praktyce używa się nakładek, jak `idb` czy Dexie.

## Limity i usuwanie danych

- Web Storage: około 5 MiB na `localStorage` i 5 MiB na `sessionStorage` na origin.
- IndexedDB i Cache API: część miejsca na dysku (np. w Chrome do 60% dysku na origin). Domyślnie przechowywanie jest
  **best-effort**: przy braku miejsca przeglądarka może usunąć najdawniej używany origin (LRU), kasując wszystkie
  jego dane naraz.
- `navigator.storage.estimate()` zwraca zużycie i limit, a `navigator.storage.persist()` prosi o trwałe przechowywanie.
- Safari z ochroną przed śledzeniem usuwa dane zapisywane skryptami (w tym `localStorage` i IndexedDB) originów bez
  interakcji użytkownika w ciągu ostatnich 7 dni.

Wniosek: magazyn po stronie klienta to **cache**, nie źródło prawdy. Ważne dane muszą istnieć też na serwerze.

## Bezpieczeństwo

Wszystko, co JS może odczytać (`localStorage`, `sessionStorage`, IndexedDB, ciasteczka bez `HttpOnly`), może zostać
wykradzione przez atak XSS. Dlatego nie trzyma się tam sekretów, a wybór miejsca na token uwierzytelniający to
kompromis: ciasteczko `HttpOnly` jest odporne na kradzież przez XSS, ale wymaga ochrony przed CSRF, a token w pamięci
czy `localStorage` omija CSRF, ale jest narażony na XSS.

## Źródła

- [Web Storage API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Set-Cookie (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [Using HTTP cookies (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- [IndexedDB API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Storage quotas and eviction criteria (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Pytania

### Czym różni się `localStorage` od `sessionStorage`? {junior}

Oba przechowują stringi per origin i mają to samo synchroniczne API. `localStorage` przetrwa zamknięcie przeglądarki i jest wspólny dla wszystkich
kart originu. `sessionStorage` jest per karta: przetrwa przeładowanie, ale znika po zamknięciu karty, a każda karta ma własną kopię.
`sessionStorage` pasuje do tymczasowego stanu jednej karty, np. wieloetapowego formularza.

### Jak zapisać obiekt w `localStorage`? {junior}

Zserializować go przez `JSON.stringify` i odczytać przez `JSON.parse`, bo Web Storage przechowuje tylko stringi: `setItem('o', {a: 1})` zapisze
`"[object Object]"`. Odczyt warto opakować w `try/catch` i obsłużyć brak lub stary format danych. `Date`, `Map`, `Set` czy `undefined` nie
przetrwają przejścia przez JSON bez zmian.

### Czym różnią się ciasteczka od `localStorage`? {junior}

Ciasteczka są automatycznie wysyłane na serwer z każdym pasującym zapytaniem, są małe (~4 KB każde), mogą mieć datę wygaśnięcia i można je ukryć
przed JS flagą `HttpOnly`. `localStorage` jest większy (~5 MiB), nigdy nie trafia na serwer, zawsze jest czytelny dla JS z danego originu i trwa do
usunięcia. Ciasteczka pasują do sesji, a `localStorage` do preferencji i cache'u po stronie klienta.

### Co oznaczają flagi `HttpOnly`, `Secure` i `SameSite`? {mid}

`HttpOnly` ukrywa ciasteczko przed `document.cookie`, więc skrypt XSS go nie odczyta, choć nadal jest wysyłane z zapytaniami. `Secure` wysyła je
tylko przez HTTPS. `SameSite` steruje wysyłką między witrynami: `Strict` tylko z tej samej witryny, `Lax` dodatkowo przy nawigacjach `GET`
najwyższego poziomu, `None` zawsze (wymaga `Secure`). Ciasteczko sesyjne powinno mieć wszystkie trzy, zwykle z `SameSite=Lax` lub `Strict`.

### Gdzie przechowywać token uwierzytelniający w przeglądarce? {mid}

To kompromis. Ciasteczko `HttpOnly; Secure; SameSite` nie da się wykraść przez XSS, ale skoro leci automatycznie, potrzebna jest ochrona przed
CSRF (`SameSite`, tokeny). `localStorage` nie jest wysyłany automatycznie, więc nie ma CSRF, ale każdy skrypt XSS może odczytać i wykraść token.
Częstym kompromisem jest krótko żyjący access token w pamięci plus refresh token w ciasteczku `HttpOnly`. W każdym wariancie podstawą jest ochrona
przed XSS.

### Kiedy wybrać IndexedDB zamiast `localStorage`? {mid}

Przy większych ilościach danych, obiektach strukturalnych (bez ręcznej serializacji), danych binarnych (`Blob`), zapytaniach po indeksach,
transakcjach i pracy w web workerach, np. w aplikacji offline albo dużym cache'u danych. `localStorage` jest synchroniczny i blokuje główny wątek,
przechowuje tylko stringi i ma limit ~5 MiB, więc nadaje się tylko do drobnych ustawień. IndexedDB jest asynchroniczne, a w praktyce używa się go
przez nakładkę (`idb`, Dexie).

### Jak zsynchronizować stan między kartami tej samej aplikacji? {mid}

Nasłuchiwać zdarzenia `storage` na `window`: odpala się w **innych** kartach originu, gdy zmieni się `localStorage` (nie w karcie, która zmieniła),
i zawiera `key`, `oldValue` i `newValue`. Tak można np. wylogować wszystkie karty. Alternatywą jest API `BroadcastChannel`, które wysyła dowolne
wiadomości między kontekstami tego samego originu.

### Czy dane w magazynie przeglądarki mogą zniknąć same? {mid}

Tak. Domyślnie przechowywanie jest best-effort: przy braku miejsca na dysku przeglądarka może usunąć cały magazyn najdawniej używanego originu.
Użytkownik może wyczyścić dane, tryb prywatny usuwa je po zakończeniu sesji, a Safari z ochroną przed śledzeniem usuwa dane zapisywane skryptami
po 7 dniach bez interakcji. `navigator.storage.persist()` prosi o trwałe przechowywanie, ale dane klienta i tak warto traktować jak cache.

### Co się stanie po przekroczeniu limitu `localStorage`? {mid}

`setItem` rzuci `QuotaExceededError`. Dlatego zapisy warto opakować w `try/catch` z planem awaryjnym (np. wyczyszczenie starego cache'u albo
działanie bez trwałości). Sam dostęp do `localStorage` też może rzucić wyjątek, gdy przechowywanie jest zablokowane w ustawieniach, więc kod
produkcyjny nie zakłada, że jest zawsze dostępny.

### Jak ustawić i usunąć ciasteczko z poziomu JavaScriptu? {junior}

Ustawienie: `document.cookie = 'theme=dark; Path=/; Max-Age=31536000; SameSite=Lax'`. Przypisanie dodaje lub nadpisuje jedno ciasteczko, a nie
zastępuje wszystkich. Usunięcie: ustawić to samo ciasteczko (ta sama nazwa, `Path` i `Domain`) z `Max-Age=0` albo datą `Expires` w przeszłości.
Ciasteczka `HttpOnly` nie da się ustawić ani usunąć z JS, tylko przez serwer.
