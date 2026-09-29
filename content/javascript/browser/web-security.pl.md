# Bezpieczeństwo frontendu: XSS, CSRF, CSP {mid}

Frontend działa w środowisku, do którego dostęp ma też atakujący. Najczęstsze tematy na rozmowach to **XSS**
(wykonanie cudzego kodu na twojej stronie), **CSRF** (wymuszenie zapytania w imieniu użytkownika), nagłówek **CSP**
i **clickjacking**. Przypomnienie, które przewija się przez wszystkie: **klient nie jest granicą zaufania**, więc
walidacja, autoryzacja i limity muszą być na serwerze.

## XSS: Cross-Site Scripting

Atakujący doprowadza do wykonania swojego skryptu w kontekście twojego originu. Skrypt może wtedy wszystko, co
użytkownik: czytać DOM, `localStorage` i ciasteczka bez `HttpOnly` oraz wysyłać zapytania z sesją użytkownika.

- **Stored** (utrwalony): ładunek zapisany w bazie (komentarz, nazwa użytkownika) i wyświetlany innym.
- **Reflected** (odbity): ładunek przychodzi w zapytaniu (np. parametr URL), a serwer wstawia go do odpowiedzi.
- **DOM-based**: sam kod frontendu wstawia dane z niezaufanego źródła (`location.hash`, `postMessage`, API)
  do niebezpiecznego miejsca (sink).

```js
el.innerHTML = `<p>Cześć, ${name}</p>`   // 🔴 name = '<img src=x onerror="stealCookies()">'
el.textContent = `Cześć, ${name}`        // ✅ zawsze tekst
```

Niebezpieczne miejsca: `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`,
`setTimeout(string)`, `href`/`src` z URL-em `javascript:`. `<script>` wstawiony przez `innerHTML` się nie wykona,
ale handler `onerror` na `<img>` już tak, więc „brak tagu script” nie jest ochroną.

### Obrona

1. **Kontekstowe kodowanie wyjścia**: frameworki robią to domyślnie. React escapuje tekst i wartości atrybutów,
   a w React 19 URL `javascript:` w `href` jest zastępowany kodem rzucającym błąd („React has blocked a javascript:
   URL…”).
2. **Unikanie surowego HTML**. Furtki to `dangerouslySetInnerHTML` (React), `v-html` (Vue), `[innerHTML]` (Angular)
   i bezpośrednie operacje na DOM przez `ref`. Jeśli trzeba wyrenderować HTML od użytkownika (np. z edytora WYSIWYG),
   sanityzuje się go sprawdzoną biblioteką, np. **DOMPurify**, nigdy własnymi wyrażeniami regularnymi.
3. **Walidacja URL-i** od użytkowników: dopuszczać tylko `http:`/`https:` (ew. `mailto:`).
4. **CSP** jako druga linia obrony (niżej) oraz ciasteczka **`HttpOnly`**, żeby udany XSS przynajmniej nie wykradł
   sesji.

## CSRF: Cross-Site Request Forgery

Użytkownik jest zalogowany w `bank.example`, a złośliwa strona zawiera formularz, który automatycznie wysyła
`POST /transfer` do banku. Przeglądarka **dołącza ciasteczko sesji automatycznie**, więc serwer widzi prawidłowe
zapytanie. Atakujący nie odczyta odpowiedzi, ale efekt uboczny (przelew) nastąpi.

Obrona:

- **`SameSite=Lax` lub `Strict`** na ciasteczkach sesji: ciasteczko nie pójdzie z zapytaniem `POST` z innej witryny.
  Wiele przeglądarek domyślnie przyjmuje `Lax`, ale warto ustawić to jawnie.
- **Tokeny CSRF** (synchronizer token lub double-submit cookie): losowa wartość w formularzu lub nagłówku, której
  obca strona nie zna.
- **Fetch Metadata**: serwer odrzuca zapytania zmieniające stan z `Sec-Fetch-Site: cross-site`. Słabszy wariant
  to sprawdzanie `Origin`/`Referer`.
- **Brak zmian stanu przez `GET`**: `SameSite=Lax` przepuszcza nawigacje `GET` najwyższego poziomu.
- API wymagające tokena w nagłówku `Authorization` (zamiast ciasteczka) nie jest podatne na klasyczny CSRF, bo
  przeglądarka sama tego nagłówka nie dołącza.

CORS nie jest obroną przed CSRF: „proste” zapytanie (np. `POST` formularza) wychodzi bez preflightu, a CORS blokuje
tylko odczyt odpowiedzi.

## CSP: Content Security Policy

Nagłówek odpowiedzi, który mówi przeglądarce, z jakich źródeł wolno ładować skrypty, style, obrazy i ramki. Gdy
polityka ma `script-src` (lub `default-src`), **domyślnie blokowane są skrypty inline, handlery inline
(`onclick="…"`), URL-e `javascript:` i `eval()`**. Nawet wstrzyknięty ładunek się wtedy nie wykona.

```http
Content-Security-Policy:
  script-src 'nonce-rAnd0m123' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none'
```

- **Ścisła CSP** (strict CSP) opiera się na **nonce** (losowa wartość generowana dla każdej odpowiedzi i dodawana
  do dozwolonych `<script nonce="…">`) albo **hashu** treści skryptu. Listy dozwolonych domen łatwo obejść (np. JSONP
  na dozwolonym CDN).
- `'strict-dynamic'`: skrypt zaufany przez nonce/hash może ładować kolejne skrypty.
- `'unsafe-inline'` i `'unsafe-eval'` w dużej mierze wyłączają ochronę.
- **`Content-Security-Policy-Report-Only`** raportuje naruszenia bez blokowania, więc politykę wdraża się stopniowo.
- `require-trusted-types-for 'script'` (Trusted Types) sprawia, że niebezpieczne miejsca, jak `innerHTML`, przyjmują
  tylko wartości przepuszczone przez zatwierdzoną politykę sanityzującą.
- CSP można ustawić przez `<meta http-equiv>`, ale bez wszystkich funkcji, np. bez `frame-ancestors` i trybu
  report-only.

## Clickjacking

Złośliwa strona ładuje twoją w niewidocznym `<iframe>` i nakłania użytkownika do kliknięcia przycisku (np. „usuń
konto”). Obrona: `Content-Security-Policy: frame-ancestors 'none'` (lub `'self'`) oraz starszy
`X-Frame-Options: DENY`.

## Inne dobre praktyki

- **HTTPS** wszędzie plus `Strict-Transport-Security` (HSTS).
- **Subresource Integrity**: `<script src="https://cdn…" integrity="sha384-…" crossorigin>` gwarantuje, że plik
  z CDN nie został zmieniony.
- **Zależności**: `npm audit`, lockfile, aktualizacje. Łańcuch dostaw to realny wektor ataku.
- **Sekrety**: wszystko w bundlu frontendu (także zmienne `VITE_*`) jest publiczne. Klucze API z uprawnieniami
  trzyma się na serwerze.
- **`postMessage`**: przy odbiorze sprawdzać `event.origin`, a przy wysyłce podawać konkretny `targetOrigin`.
- Linki `target="_blank"` do obcych stron: współczesne przeglądarki domyślnie stosują `noopener`, ale
  `rel="noopener noreferrer"` nadal dodaje się jawnie.

## Źródła

- [Cross-site scripting (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS)
- [Cross-site request forgery (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [Clickjacking (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Clickjacking)
- [Cross Site Scripting Prevention Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [CSRF Prevention Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Pytania

### Czym jest XSS i jakie są jego rodzaje? {junior}

Cross-Site Scripting to wstrzyknięcie i wykonanie skryptu atakującego w kontekście twojej strony. Skrypt ma wtedy uprawnienia użytkownika: czyta
dane i DOM oraz wysyła zapytania z jego sesją. Rodzaje: stored (ładunek zapisany na serwerze i wyświetlany innym), reflected (ładunek z zapytania
odbity w odpowiedzi) i DOM-based (kod frontendu wstawia niezaufane dane do miejsca takiego jak `innerHTML`).

### Jak React chroni przed XSS i gdzie mimo to może powstać luka? {mid}

React domyślnie escapuje tekst i wartości atrybutów, więc `{userInput}` zawsze renderuje się jako tekst, a w React 19 URL `javascript:` w `href`
jest blokowany. Luki biorą się z furtek: `dangerouslySetInnerHTML` bez sanityzacji, bezpośrednie operacje na DOM przez `ref` (`innerHTML`),
niezwalidowane URL-e (np. `data:` czy przekierowanie na obcą domenę), `eval` oraz dane użytkownika wstrzyknięte do `<script>` przy SSR. HTML od
użytkownika sanityzuje się biblioteką, np. DOMPurify.

### Dlaczego `innerHTML` z danymi użytkownika jest niebezpieczny, skoro `<script>` wstawiony w ten sposób się nie wykona? {mid}

Bo kod można uruchomić inaczej: atrybutami zdarzeń (`<img src=x onerror="…">`, `<svg onload="…">`), linkami `javascript:` czy `<iframe srcdoc>`.
Dlatego blokowanie samych tagów `<script>` albo filtrowanie wyrażeniami regularnymi jest nieskuteczne. Do tekstu używa się `textContent`, a HTML
sanityzuje sprawdzoną biblioteką, najlepiej w połączeniu z CSP i Trusted Types.

### Czym jest CSRF i jak się przed nim bronić? {mid}

Cross-Site Request Forgery to nakłonienie przeglądarki użytkownika do wysłania zapytania z jego ciasteczkami z obcej strony, np. automatyczny
formularz wysyłający przelew. Atakujący nie widzi odpowiedzi, ale akcja się wykonuje. Obrona: ciasteczka `SameSite=Lax`/`Strict`, tokeny CSRF
(synchronizer lub double-submit), sprawdzanie `Sec-Fetch-Site` lub `Origin` oraz niezmienianie stanu zapytaniami `GET`.

### Dlaczego CORS nie chroni przed CSRF? {mid}

CORS kontroluje, czy JS może **odczytać** odpowiedź z innego originu, a nie czy zapytanie zostanie wysłane. Proste zapytanie (np. `POST`
formularza z `application/x-www-form-urlencoded`) wychodzi bez preflightu, z ciasteczkami, a jego efekt uboczny na serwerze następuje, mimo że
przeglądarka potem zablokuje dostęp do odpowiedzi. CSRF nie potrzebuje odpowiedzi, więc wymaga osobnej ochrony.

### Czym jest Content Security Policy i jak ogranicza XSS? {mid}

To nagłówek odpowiedzi, który wymienia dozwolone źródła skryptów i innych zasobów. Po ustawieniu `script-src` przeglądarka blokuje skrypty inline,
handlery zdarzeń inline, URL-e `javascript:` i `eval`, więc wstrzyknięty kod się nie wykona nawet przy istniejącej luce XSS. Zalecana ścisła CSP
opiera się na nonce lub hashu (`script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`). To druga linia obrony, nie zamiennik
escapowania.

### Jak wdrożyć CSP w istniejącej aplikacji, żeby jej nie zepsuć? {mid}

Zacząć od nagłówka `Content-Security-Policy-Report-Only` z raportowaniem naruszeń (`report-to`): przeglądarka niczego nie blokuje, tylko zgłasza,
co by zablokowała. Na podstawie raportów usuwa się skrypty i handlery inline, dodaje nonce lub hashe, a dopiero potem przechodzi na egzekwujący
nagłówek `Content-Security-Policy`. Oba nagłówki mogą działać równolegle, np. przy testowaniu ostrzejszej polityki.

### Czym jest clickjacking i jak mu zapobiec? {mid}

Atakujący ładuje twoją stronę w przezroczystym `<iframe>` nad swoją i nakłania użytkownika do kliknięcia czegoś, co w rzeczywistości klika twój
przycisk (np. potwierdzenie akcji). Obrona: nagłówek `Content-Security-Policy: frame-ancestors 'none'` (lub lista dozwolonych rodziców),
a w starszych przeglądarkach `X-Frame-Options: DENY`. `frame-ancestors` nie działa, gdy CSP jest ustawione przez tag `<meta>`.

### Czy można trzymać klucz API w zmiennej środowiskowej frontendu? {junior}

Nie sekretny. Wszystko, co trafia do bundla (np. zmienne `VITE_*` czy `NEXT_PUBLIC_*`), jest publiczne, bo każdy może to odczytać w przeglądarce.
Wolno tam trzymać tylko publiczne identyfikatory (np. klucz analityki ograniczony do domeny). Klucze z uprawnieniami powinny zostać na serwerze
albo w BFF, który wykonuje zapytania w imieniu klienta i pilnuje autoryzacji oraz limitów.

### Jak bezpiecznie używać `window.postMessage`? {mid}

Przy odbiorze zawsze sprawdzać `event.origin` z listą oczekiwanych originów i walidować kształt `event.data`, bo wiadomość może wysłać dowolne
okno. Przy wysyłce podawać konkretny `targetOrigin` zamiast `'*'`, żeby dane nie trafiły do strony, która w międzyczasie zmieniła adres. Nigdy nie
wstawiać odebranych danych do miejsc takich jak `innerHTML` czy `eval`.
