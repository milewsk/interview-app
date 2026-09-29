# Sieć i tryb offline {mid}

React Native dostarcza webowe API sieciowe (**`fetch`**, `XMLHttpRequest`, `WebSocket`), więc biblioteki takie jak axios
i TanStack Query działają. Sieci mobilne są jednak wolne, niestabilne i często niedostępne, aplikacje przechodzą w tło, a nie ma
przeglądarki, która zajmowałaby się zdarzeniami fokusu czy łączności. Od programisty na poziomie mid oczekuje się znajomości zasad
platform dotyczących żądań i umiejętności uczynienia aplikacji **odporną na brak sieci**.

## Zasady platform

- **Domyślnie HTTPS**: App Transport Security na iOS wymaga HTTPS (wyjątki per domena w Info.plist), a Android 9+ (API 28) blokuje
  nieszyfrowany HTTP, chyba że ustawi się `usesCleartextTraffic` albo konfigurację bezpieczeństwa sieci. Lokalne serwery deweloperskie
  po `http` potrzebują więc wyjątku.
- **Brak CORS** w aplikacjach natywnych (to reguła przeglądarki), ale dokumentacja wymienia znane problemy: `credentials: 'omit'`
  i `redirect: 'manual'` nie działają, a uwierzytelnianie oparte na ciasteczkach jest zawodne, więc aplikacje mobilne zwykle używają
  **tokenów** w nagłówkach.
- Na emulatorze Androida `localhost` komputera to **`10.0.2.2`**; fizyczne urządzenie potrzebuje adresu komputera w sieci lokalnej.
- Żądania nie są automatycznie anulowane przy odmontowaniu ekranu; służy do tego `AbortController` (albo biblioteka, która to robi).

## Stan serwera z TanStack Query

TanStack Query obsługuje cache, deduplikację, ponowienia i odświeżanie w tle, ale jego przeglądarkowe ustawienia domyślne (fokus okna,
`navigator.onLine`) trzeba podłączyć do API RN:

```ts
// status połączenia z NetInfo
onlineManager.setEventListener(setOnline =>
  NetInfo.addEventListener(state => setOnline(!!state.isConnected)));

// „fokus okna” = aplikacja wraca na pierwszy plan
AppState.addEventListener('change', status => focusManager.setFocused(status === 'active'));
```

Sprawdzone z TanStack Query 5 w Jest:

- offline zapytanie pozostało w stanie **`pending/paused`** z **0** wywołań funkcji pobierającej i wykonało się, gdy tylko wywołano
  `onlineManager.setOnline(true)`;
- `focusManager.setFocused(true)` po utracie fokusu **ponownie pobrało** nieaktualne zapytanie (wywołania wzrosły z 1 do 2);
- mutacja wykonana offline została **wstrzymana** (nic nie wysłano), a po odzyskaniu połączenia zakończyła się i wysłała `order-1`.

Dokumentacja pokazuje też odświeżanie przy **fokusie ekranu** przez `useFocusEffect` i wstrzymywanie aktualizacji na ukrytych
ekranach przez `subscribed: isFocused`.

## Wzorce offline-first

- **Utrwalanie cache** (np. persystery TanStack Query z MMKV albo AsyncStorage), żeby aplikacja przy starcie pokazywała ostatnie
  dane bez sieci.
- **Kolejkowanie zapisów**: wstrzymane mutacje wznawiają się po odzyskaniu połączenia; jeśli mają przetrwać restart aplikacji,
  też trzeba je utrwalać, a strona serwera powinna być **idempotentna** (identyfikatory generowane przez klienta, klucze
  idempotencji), bo ponowienia mogą duplikować żądania.
- **Aktualizacje optymistyczne** sprawiają, że UI reaguje od razu i wycofuje zmianę przy błędzie.
- Przy intensywnej pracy offline (duże zbiory danych, synchronizacja, rozwiązywanie konfliktów) używa się lokalnej bazy
  z synchronizacją: SQLite (`expo-sqlite`, op-sqlite), WatermelonDB albo silników synchronizacji.
- Stan połączenia pokazuje się użytkownikowi, a UI nie blokuje się na żądaniach.

## Źródła

- [Networking](https://reactnative.dev/docs/network)
- [TanStack Query: React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [NetInfo](https://github.com/react-native-netinfo/react-native-netinfo)
- [Network security configuration (Android)](https://developer.android.com/privacy-and-security/security-config)
- [Preventing insecure network connections (Apple)](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)

## Pytania

### Jakie API sieciowe są dostępne w React Native? {junior}

Wbudowane są `fetch`, `XMLHttpRequest` i `WebSocket`, zgodne z API webowymi, więc działają biblioteki na nich zbudowane (axios, TanStack Query, klienty GraphQL). Odpowiedzi obsługuje się
przez promisy albo `async/await`. Nie ma CORS, bo to reguła bezpieczeństwa przeglądarki, ale obowiązują za to zasady platform, np. wymóg HTTPS.

### Dlaczego żądanie `http://` zawodzi na urządzeniu, a działa w przeglądarce? {mid}

Obie platformy domyślnie blokują nieszyfrowany ruch: App Transport Security na iOS wymaga HTTPS, chyba że w Info.plist zadeklarowano wyjątek, a Android 9+ blokuje nieszyfrowany HTTP,
chyba że pozwala na to `usesCleartextTraffic` albo konfiguracja bezpieczeństwa sieci. Należy używać HTTPS albo dodać wąskie wyjątki tylko dla domen deweloperskich. Na emulatorze
Androida trzeba też pamiętać, że `localhost` komputera to `10.0.2.2`.

### Jak wykrywać łączność z siecią? {junior}

Przez `@react-native-community/netinfo`: `NetInfo.fetch()` dla bieżącego stanu i `NetInfo.addEventListener` dla zmian, z `isConnected`, `isInternetReachable` i typem połączenia.
Łączność nie gwarantuje, że twoje API jest osiągalne, więc żądania nadal potrzebują limitów czasu, obsługi błędów i ponowień.

### Jak skonfigurować TanStack Query dla React Native? {mid}

Podłączyć jego menedżery do natywnych API: `onlineManager.setEventListener` z listenerem NetInfo, żeby zapytania wstrzymywały się offline i odświeżały po odzyskaniu połączenia,
oraz `focusManager.setFocused` z listenera `AppState`, żeby nieaktualne dane były pobierane ponownie, gdy aplikacja wraca na pierwszy plan. Opcjonalnie odświeżać przy fokusie ekranu przez
`useFocusEffect`. W teście zapytanie offline pozostało wstrzymane bez wywołań pobierania i wykonało się po przejściu w tryb online.

### Co dzieje się z mutacjami, gdy urządzenie jest offline? {mid}

W domyślnym trybie sieciowym TanStack Query mutacja rozpoczęta offline jest wstrzymywana i wysyłana, gdy wróci łączność (w teście nic nie zostało wysłane do `setOnline(true)`, a potem
mutacja się powiodła). Wstrzymane mutacje żyją w pamięci, więc żeby przetrwały restart aplikacji, trzeba je utrwalić i wznowić, co wymaga domyślnych funkcji mutacji zarejestrowanych po
kluczu. Serwer powinien obsługiwać duplikaty, bo ponowienie po przekroczeniu czasu może ponownie wysłać żądanie, które już się powiodło.

### Co oznacza „offline-first” w aplikacji mobilnej? {mid}

Aplikacja pracuje najpierw na danych lokalnych, a sieć traktuje jako sposób synchronizacji: od razu pokazuje dane z cache albo z lokalnej pamięci, pozwala wprowadzać zmiany, które są
kolejkowane i synchronizowane później, oraz obsługuje konflikty. Techniki to utrwalanie cache zapytań, aktualizacje optymistyczne, kolejkowane mutacje z kluczami idempotencji i lokalne
bazy z synchronizacją przy większych zbiorach danych.

### Jak anulować żądania, gdy ekran się odmontowuje? {mid}

Przekazać sygnał z `AbortController` do `fetch` i wywołać `abort` w funkcji sprzątającej `useEffect`, żeby żądanie zostało anulowane i żaden stan nie był ustawiany na odmontowanym
komponencie. TanStack Query przekazuje `signal` do funkcji zapytania i anuluje zapytania, które nie są już używane; w axios też przekazuje się opcję `signal`.

### Dlaczego uwierzytelnianie oparte na ciasteczkach jest problematyczne w React Native? {senior}

Dokumentacja wymienia znane problemy z ciasteczkami: uwierzytelnianie oparte na nich jest niestabilne, `credentials: 'omit'` nie działa, a na iOS przekierowanie 302 z `Set-Cookie` może
nie zapisać ciasteczka, co przy wygasłych sesjach może powodować pętle żądań. Dlatego aplikacje mobilne zwykle używają tokenów (np. tokenów dostępu i odświeżania OAuth) wysyłanych
w nagłówku `Authorization` i bezpiecznie przechowywanych, z odświeżaniem obsługiwanym przez interceptor HTTP.

### Jak zaimplementować odświeżanie tokenu? {senior}

Przechowywać tokeny dostępu i odświeżania bezpiecznie (Keychain/Keystore), dodawać token dostępu do żądań w interceptorze, a przy odpowiedzi 401 raz wywołać endpoint odświeżania,
zakolejkować inne żądania, które w tym czasie zawiodą, ponowić je z nowym tokenem i wylogować użytkownika, jeśli odświeżenie się nie powiedzie. Kluczowa jest deduplikacja
równoległych odświeżeń: bez niej kilka równoczesnych 401 wywołuje kilka odświeżeń, które unieważniają sobie nawzajem tokeny.

### Kiedy aplikacja powinna używać lokalnej bazy zamiast cache? {senior}

Gdy aplikacja musi w pełni działać offline z dużą ilością danych, odpytywać je lokalnie (filtrowanie, sortowanie, relacje) albo synchronizować zmiany w obu kierunkach z rozwiązywaniem
konfliktów: aplikacje dla serwisantów, notatki, komunikatory. Utrwalony cache zapytań pasuje do aplikacji, które głównie wyświetlają dane z serwera. Opcje to biblioteki SQLite
(`expo-sqlite`, op-sqlite), WatermelonDB, bazy w stylu Realm i silniki synchronizacji, wybierane według rozmiaru danych, potrzeb synchronizacji i doświadczenia zespołu.
