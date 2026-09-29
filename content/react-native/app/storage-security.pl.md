# Przechowywanie danych i bezpieczeństwo {mid}

Aplikacje mobilne trzymają dane na urządzeniu: ustawienia, cache danych z serwera, szkice, tokeny. Kluczowa umiejętność na
rozmowie to wybór **właściwego miejsca przechowywania do wrażliwości i rozmiaru danych** oraz świadomość, że **wszystko, co
trafia do bundle'a aplikacji, da się odczytać**. Webowy nawyk trzymania tokenu w `localStorage` przekłada się na mobile na
realną podatność.

## Opcje przechowywania

| Magazyn | API | Szyfrowanie | Zastosowanie |
|---|---|---|---|
| **AsyncStorage** | asynchroniczne, tylko napisy | **nie** | małe dane niewrażliwe: ustawienia, flagi, utrwalony stan UI |
| **MMKV** | **synchroniczne**, wartości typowane | opcjonalny klucz szyfrowania | szybkie odczyty klucz-wartość przy starcie, utrwalone cache i store'y |
| **SecureStore / Keychain / Keystore** | asynchroniczne (i warianty synchroniczne) | **tak** | tokeny, hasła, klucze: małe sekrety |
| **SQLite** (`expo-sqlite`, op-sqlite) | SQL | opcjonalne (SQLCipher) | dane strukturalne i duże, bazy offline |
| **System plików** (`expo-file-system`) | pliki | nie | obrazy, pobrane pliki, eksporty |

**AsyncStorage** to według jego własnego opisu „asynchronous, unencrypted, persistent key-value storage”. Wersja 3 przechowuje
dane w SQLite i dodaje **osobne bazy**: `createAsyncStorage('users')` tworzy izolowaną instancję (eksport domyślny to dawny
wspólny magazyn), a metody wsadowe to `getMany`/`setMany`/`removeMany`. Sprawdzone na mocku Jest dostarczanym przez bibliotekę: dwie
instancje trzymały różne wartości pod tym samym kluczem, `getMany(['x', 'y', 'missing'])` zwróciło
`{ x: "1", y: "2", missing: null }`, a obiekty trzeba zapisywać jako napisy JSON.

**MMKV** (v4, zbudowane na Nitro Modules) to synchroniczny magazyn klucz-wartość: `createMMKV({ id })`, `set(key, value)`,
`getString`/`getNumber`/`getBoolean` (zwracające `undefined` dla brakujących kluczy) oraz hooki Reacta, jak `useMMKVString`.
Synchroniczny dostęp oznacza brak stanu ładowania dla małych wartości odczytywanych przy starcie (motyw, flaga zalogowania).
W Jest MMKV automatycznie przełącza się na mock w pamięci, ale jego moduł natywny trzeba zamockować.

## Przechowywanie sekretów

- Używa się bezpiecznego magazynu platformy: **Keychain** na iOS i magazynu szyfrowanego przez **Keystore** na Androidzie,
  przez `expo-secure-store` albo `react-native-keychain`. Przewodnik bezpieczeństwa React Native mówi wprost, że AsyncStorage
  **nie** służy do tokenów ani sekretów.
- Uwagi o SecureStore z dokumentacji Expo: duże wartości mogą zostać odrzucone (niektóre wersje iOS historycznie odmawiały wartości
  powyżej około 2048 bajtów), dane są **usuwane przy odinstalowaniu na Androidzie, ale na iOS mogą przetrwać** ponowną instalację
  z tym samym bundle ID, a `requireAuthentication` może wymagać biometrii do odczytu wartości.
- **Nigdy nie umieszcza się w aplikacji tajnych kluczy API**: dokumentacja ostrzega, że wszystko w kodzie można odczytać, analizując
  bundle, a dotyczy to także wartości z plików `.env` wbudowanych w czasie budowania. Między aplikacją a usługami wymagającymi
  sekretów stawia się backend (np. funkcję serverless).

## Inne podstawy bezpieczeństwa

- **HTTPS** wszędzie (wymuszane przez ATS i domyślne ustawienia Androida); w aplikacjach wysokiego ryzyka rozważa się **przypinanie
  certyfikatów** i planuje ich rotację.
- **OAuth 2 z PKCE** do logowania (np. `expo-auth-session`, `react-native-app-auth`), z użyciem przeglądarki systemowej, a nie WebView.
- **Deep linki nie są bezpieczne**: inna aplikacja może zarejestrować ten sam własny schemat, więc nie przekazuje się w nich tokenów
  ani danych wrażliwych; lepsze są universal links / App Links, a parametry trzeba walidować.
- Nie loguje się danych wrażliwych, usuwa `console.log` w produkcji, zaciemnianie (bajtkod Hermesa) nie jest ochroną, a tam, gdzie
  ryzyko to uzasadnia, rozważa się wykrywanie roota/jailbreaka, blokadę zrzutów ekranu i monity biometryczne. Standardową listą
  kontrolną jest **OWASP Mobile Top 10**.

## Źródła

- [Security (React Native)](https://reactnative.dev/docs/security)
- [Async Storage](https://github.com/react-native-async-storage/async-storage)
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
- [SecureStore (Expo)](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)

## Pytania

### Gdzie przechowywać token uwierzytelniający w aplikacji React Native? {junior}

W bezpiecznym magazynie platformy: Keychain na iOS albo szyfrowanym magazynie opartym na Keystore na Androidzie, przez biblioteki takie jak `expo-secure-store` czy
`react-native-keychain`. Nie w AsyncStorage, MMKV bez szyfrowania ani zwykłych plikach, które są nieszyfrowane i można je odczytać z kopii zapasowych albo na zrootowanych urządzeniach.
Przewodnik bezpieczeństwa React Native wymienia przechowywanie tokenów jako coś, do czego AsyncStorage nie wolno używać.

### Czym jest AsyncStorage i jakie ma ograniczenia? {junior}

To trwały magazyn klucz-wartość z asynchronicznym API, który przechowuje tylko napisy (obiekty trzeba serializować do JSON). Jest nieszyfrowany, więc nie nadaje się do sekretów,
a każdy odczyt jest asynchroniczny, więc wartości potrzebne przy starcie wymagają stanu ładowania. Pasuje do małych danych niewrażliwych, jak ustawienia. Wersja 3 używa SQLite, obsługuje
osobne bazy przez `createAsyncStorage(name)` i zmienia nazwy metod wsadowych na `getMany`/`setMany`/`removeMany`.

### Dlaczego zespoły wybierają MMKV zamiast AsyncStorage? {mid}

MMKV jest dużo szybsze i synchroniczne: `storage.getString('theme')` zwraca wynik od razu, więc nie ma asynchronicznego stanu ładowania dla wartości czytanych przy starcie albo
renderowaniu. Przechowuje wartości typowane (napisy, liczby, wartości logiczne, bufory), obsługuje wiele instancji i opcjonalne szyfrowanie oraz ma hooki Reacta. Jest popularne jako
warstwa utrwalania dla store'ów (Zustand, Redux) i cache zapytań. To moduł natywny, więc wymaga development builda zamiast Expo Go.

### Dlaczego nie umieszczać kluczy API w aplikacji, nawet w zmiennych środowiskowych? {mid}

Wszystko, co trafia do aplikacji, łącznie z wartościami wstrzykniętymi z plików `.env` w czasie budowania, ląduje w bundle'u JavaScript albo w binariach natywnych, które każdy może
wyciągnąć i odczytać. Bajtkod Hermesa ani zaciemnianie tego nie zmieniają. Tajne klucze należą do serwera: aplikacja wywołuje twój backend (albo funkcję serverless), który dodaje klucz
i wywołuje usługę zewnętrzną. W aplikacji mogą być tylko publiczne, ograniczone klucze (np. klucz do map ograniczony do bundle ID aplikacji).

### Czym różni się działanie SecureStore na iOS i Androidzie? {mid}

Na iOS zapisuje wartości w Keychain (jako elementy typu generic password), a na Androidzie w SharedPreferences szyfrowanych kluczami z Android Keystore. Zachowanie też się różni: dane są
usuwane przy odinstalowaniu aplikacji na Androidzie, ale na iOS mogą przetrwać ponowną instalację, więc aplikacje czasem czyszczą elementy Keychain przy pierwszym uruchomieniu po
instalacji. Jest przeznaczony do małych wartości; duże mogą zostać odrzucone.

### Dlaczego deep linki są zagrożeniem bezpieczeństwa? {mid}

Własne schematy URL nie mają właściciela: inna aplikacja może zarejestrować ten sam schemat i odbierać linki przeznaczone dla twojej, więc dane w linku mogą zostać przechwycone. Nie
umieszcza się w deep linkach tokenów ani danych wrażliwych, waliduje i oczyszcza ich parametry i nie wykonuje wrażliwych akcji z linku bez potwierdzenia. Do logowania używa się OAuth
z PKCE, a preferuje universal links / App Links, które są weryfikowane względem twojej domeny.

### Czym jest PKCE i dlaczego stosuje się go przy logowaniu w aplikacjach mobilnych? {senior}

Proof Key for Code Exchange to rozszerzenie OAuth 2: aplikacja tworzy losowy code verifier, wysyła jego skrót (code challenge) z żądaniem autoryzacji i musi przedstawić oryginalny
verifier przy wymianie kodu autoryzacyjnego na tokeny. Aplikacja mobilna nie może przechowywać client secret, a przekierowanie może zostać przechwycone, więc PKCE zapewnia, że kod może
wymienić tylko aplikacja, która rozpoczęła przepływ. Biblioteki takie jak `expo-auth-session` i `react-native-app-auth` implementują go z przeglądarką systemową.

### Czym jest przypinanie certyfikatów i jakie ma kompromisy? {senior}

Aplikacja ufa tylko konkretnym certyfikatom albo kluczom publicznym twojego API zamiast dowolnemu certyfikatowi podpisanemu przez zaufany urząd, co chroni przed atakami
man-in-the-middle z fałszywymi albo zainstalowanymi przez użytkownika certyfikatami. Wadą jest utrzymanie: gdy certyfikat albo klucz się zmieni, aplikacje z przypięciem nie połączą się do
czasu aktualizacji, więc przypina się klucze publiczne, dodaje zapasowe przypięcia i starannie planuje rotację. Stosuje się je zwykle w aplikacjach bankowych i innych wysokiego ryzyka.

### Jak przechowywać lokalnie dużą ilość danych strukturalnych? {mid}

Użyć SQLite przez `expo-sqlite` albo op-sqlite (opcjonalnie z ORM-em, np. Drizzle) albo zbudowanej na nim bazy, jak WatermelonDB, dla dużych, synchronizowanych zbiorów danych. Magazyny
klucz-wartość nie są przeznaczone do zapytań, relacji ani dużych kolekcji. Pliki (obrazy, pobrane pliki) trzyma się w systemie plików, a w bazie tylko ich ścieżki.

### Jakie środki bezpieczeństwa zastosujesz w aplikacji bankowej? {senior}

Bezpieczny magazyn tokenów z ochroną biometryczną, krótko żyjące tokeny dostępu z odświeżaniem, OAuth z PKCE, HTTPS z przypinaniem certyfikatów, brak danych wrażliwych w logach, deep
linkach i bundle'u, wykrywanie roota/jailbreaka i modyfikacji aplikacji, blokadę zrzutów i nagrywania ekranu na wrażliwych ekranach, automatyczne wylogowanie po bezczynności,
autoryzację wymuszaną przez backend dla wszystkiego oraz regularne przeglądy według OWASP Mobile Top 10 i testy penetracyjne.
