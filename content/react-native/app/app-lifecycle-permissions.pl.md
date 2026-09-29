# Cykl życia aplikacji, uprawnienia i powiadomienia {mid}

Aplikacje mobilne nie tylko się otwierają i zamykają: przechodzą w **tło**, są **wstrzymywane** albo zabijane przez system,
wracają przez **powiadomienia i linki** i muszą prosić o **uprawnienia** przed użyciem kamery, lokalizacji czy powiadomień.
Programiści webowi rzadko się z tym stykają, więc to częste źródło pytań na poziomie mid.

## Stan aplikacji

`AppState.currentState` i zdarzenie `change` zwracają:

- **`active`**: aplikacja na pierwszym planie;
- **`background`**: inna aplikacja, ekran główny albo (Android) inna aktywność, np. systemowy picker;
- **`inactive`** (**tylko iOS**): przejścia, przełącznik aplikacji, Centrum powiadomień, połączenie przychodzące.

Android emituje też `focus`/`blur` (np. przy rozwinięciu szuflady powiadomień stan pozostaje `active`, ale wywołuje się `blur`),
a iOS `memoryWarning`.

```ts
useEffect(() => {
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') refreshData();          // powrót na pierwszy plan
    else pauseVideo();
  });
  return () => sub.remove();
}, []);
```

Typowe zastosowania: ponowne pobranie danych albo sprawdzenie sesji po powrocie na pierwszy plan (`focusManager` w TanStack Query),
wstrzymanie multimediów i timerów, zapis szkiców, ukrywanie wrażliwej treści w przełączniku aplikacji. W tle **JS może w każdej
chwili przestać działać**, a system może całkowicie zabić aplikację, żeby zwolnić pamięć, więc ważny stan zapisuje się wcześnie.

## Przycisk wstecz na Androidzie

`BackHandler.addEventListener('hardwareBackPress', handler)` rejestruje handler; handlery wykonują się **od ostatnio dodanego**,
a zwrócenie `true` konsumuje naciśnięcie. Sprawdzone w Jest (platforma Android): przy handlerze ekranu zwracającym `false`
i handlerze modala zwracającym `true` naciśnięcie wywołało tylko handler modala; po jego usunięciu wykonał się handler ekranu,
a potem wywołane zostało **`exitApp`**; bez handlerów naciśnięcie od razu wywołało `exitApp`. Biblioteki nawigacji rejestrują
własny handler, który cofa się w stosie.

## Linki do aplikacji

`Linking.getInitialURL()` zwraca URL, który uruchomił aplikację, zdarzenie `url` dostarcza linki w trakcie działania,
`Linking.openURL()` otwiera inne aplikacje (`tel:`, `mailto:`, `https:`), a `Linking.openSettings()` otwiera ustawienia systemowe
aplikacji (potrzebne po trwałej odmowie uprawnienia). Biblioteki nawigacji podpinają deep linki za ciebie.

## Uprawnienia

- **Android**: niebezpieczne uprawnienia (kamera, lokalizacja, kontakty, powiadomienia od Androida 13) trzeba zadeklarować
  w `AndroidManifest.xml` **i** poprosić o nie w czasie działania. `PermissionsAndroid.request` zwraca `granted`, `denied` albo
  **`never_ask_again`**, po którym systemowe okno już się nie pojawia, a użytkownik musi włączyć uprawnienie w ustawieniach.
- **iOS**: każdy chroniony zasób wymaga **opisu użycia** w Info.plist (np. `NSCameraUsageDescription`), pokazywanego w systemowym
  monicie; monit pojawia się tylko raz, a późniejsze zmiany robi się w Ustawieniach.
- Dobra praktyka: prosić **w kontekście** (gdy użytkownik stuknie „Skanuj”), najpierw wyjaśnić powód, łagodnie obsłużyć odmowę
  i zaproponować link do ustawień. Biblioteki, takie jak moduły Expo (`requestPermissionsAsync`) czy `react-native-permissions`,
  ujednolicają obie platformy.

## Powiadomienia push

Powiadomienia zdalne przechodzą przez **APNs** (Apple) i **FCM** (Google). Aplikacja prosi o uprawnienie, pobiera token urządzenia
i wysyła go do twojego serwera, który wysyła powiadomienia przez tych dostawców (albo przez usługę push Expo, która przekazuje je
dalej z tokenem Expo). Android wymaga **kanału powiadomień**, a Android 13+ uprawnienia `POST_NOTIFICATIONS` w czasie działania.
Dokumentacja Expo mówi, że push można testować na fizycznych urządzeniach, emulatorach Androida z usługami Google Play albo
symulatorach iOS z Xcode 14+. Obsługuje się trzy przypadki: powiadomienie odebrane na pierwszym planie, stuknięte w tle i stuknięte,
gdy aplikacja była zabita (otwarcie właściwego ekranu przez deep link).

## Praca w tle

Wykonywanie w tle jest ściśle ograniczone. `expo-background-task` używa **WorkManager** na Androidzie (minimalny odstęp
**15 minut**) i **BGTaskScheduler** na iOS, a **o tym, kiedy zadania się wykonają, decyduje system**; na iOS zamknięcie aplikacji
gestem w przełączniku aplikacji kończy ją i zatrzymuje jej zadania w tle do następnego uruchomienia. Do gwarantowanego dostarczania
ważnych zdarzeń używa się powiadomień push i logiki po stronie serwera zamiast odpytywania w tle.

## Źródła

- [AppState](https://reactnative.dev/docs/appstate)
- [BackHandler](https://reactnative.dev/docs/backhandler)
- [Linking](https://reactnative.dev/docs/linking)
- [PermissionsAndroid](https://reactnative.dev/docs/permissionsandroid)
- [Expo push notifications setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [BackgroundTask (Expo)](https://docs.expo.dev/versions/latest/sdk/background-task/)

## Pytania

### W jakich stanach może być aplikacja React Native? {junior}

`active` (na pierwszym planie), `background` (użytkownik jest w innej aplikacji albo na ekranie głównym, albo na Androidzie na wierzchu jest inna aktywność) oraz, tylko na iOS, `inactive`,
stan przejściowy podczas przełącznika aplikacji, Centrum powiadomień albo połączenia przychodzącego. `AppState.currentState` podaje bieżącą wartość, a zdarzenie `change` informuje
o zmianach; subskrypcje usuwa się przez `subscription.remove()`.

### Co zrobić, gdy aplikacja wraca na pierwszy plan? {mid}

Odświeżyć dane, które mogą być nieaktualne (`focusManager` w TanStack Query może to robić automatycznie), sprawdzić, czy sesja albo token są nadal ważne, wznowić multimedia czy timery,
ponownie sprawdzić uprawnienia, które użytkownik mógł zmienić w Ustawieniach, i obsłużyć oczekujący deep link albo powiadomienie. Praca powinna być lekka, bo wykonuje się przy każdym
powrocie użytkownika.

### Dlaczego nie można polegać na działaniu JavaScriptu w tle? {mid}

Gdy aplikacja przechodzi w tło, system po krótkim czasie ją wstrzymuje, żeby oszczędzać baterię, a przy braku pamięci może ją całkowicie zabić bez ostrzeżenia. Timery i praca JS się
zatrzymują. Ważny stan zapisuje się, gdy tylko aplikacja opuści pierwszy plan (albo na bieżąco), a do pracy w tle używa się mechanizmów platformy: powiadomień push, planowanych zadań
w tle (które system uruchamia, kiedy sam zdecyduje) albo wyspecjalizowanych API do lokalizacji, dźwięku i pobierania.

### Jak działa przycisk wstecz na Androidzie w React Native? {mid}

Handlery zarejestrowane przez `BackHandler.addEventListener('hardwareBackPress', ...)` są wywoływane od ostatnio dodanego; pierwszy, który zwróci `true`, konsumuje zdarzenie, a jeśli żaden
tego nie zrobi, wykonuje się zachowanie domyślne i aplikacja się zamyka (`exitApp`). W teście handler modala zwracający `true` zatrzymał naciśnięcie; po jego usunięciu handler ekranu zwrócił
`false` i aplikacja się zamknęła. Biblioteki nawigacji obsługują cofanie, więc własne handlery są do przypadków szczególnych i powinny być aktywne tylko wtedy, gdy ekran ma fokus.

### Czym różnią się uprawnienia w czasie działania na iOS i Androidzie? {mid}

Na Androidzie niebezpieczne uprawnienia trzeba zadeklarować w manifeście i poprosić o nie w czasie działania; wynik może być `granted`, `denied` albo `never_ask_again`, po którym przyznać
je można już tylko w ustawieniach. Na iOS każdy chroniony zasób wymaga opisu użycia w Info.plist, pokazywanego w monicie, a monit wyświetla się tylko raz. Obie platformy pozwalają
użytkownikom zmieniać uprawnienia w ustawieniach w dowolnym momencie, więc status sprawdza się przed użyciem.

### Co zrobić, gdy użytkownik trwale odmówi uprawnienia? {mid}

Nie blokować aplikacji ani nie pytać w kółko: wyjaśnić, czego funkcja potrzebuje i dlaczego, w miarę możliwości zaproponować alternatywny przepływ i dać przycisk otwierający ustawienia
aplikacji przez `Linking.openSettings()`. Gdy aplikacja wróci na pierwszy plan, sprawdzić uprawnienie ponownie, bo użytkownik mógł je włączyć.

### Jak działają powiadomienia push w aplikacji React Native? {mid}

Aplikacja prosi o uprawnienie do powiadomień, pobiera token push (token urządzenia z APNs/FCM albo token push Expo) i wysyła go do backendu razem z identyfikatorem użytkownika. Backend wysyła
powiadomienie przez APNs/FCM (bezpośrednio albo przez usługę, np. Expo), które dostarczają je na urządzenie. Aplikacja obsługuje powiadomienia odebrane na pierwszym planie oraz stuknięcia,
które otwierają ją z tła albo ze stanu zabitego, zwykle nawigując do ekranu na podstawie danych powiadomienia. Android potrzebuje też kanału powiadomień.

### Dlaczego na iOS trzeba deklarować opisy użycia? {junior}

iOS wymaga, żeby każda aplikacja korzystająca z chronionych zasobów (kamera, mikrofon, lokalizacja, zdjęcia, kontakty) wyjaśniła dlaczego, napisem w Info.plist, który pojawia się w monicie
o uprawnienie. Dostęp do zasobu bez niego sprawia, że system kończy aplikację, a App Review odrzuca niejasne opisy. W Expo ustawia się je w konfiguracji aplikacji albo przez config plugins.

### Jak uruchamiać zadania w tle? {senior}

Używać planistów platformy przez biblioteki takie jak `expo-background-task`: WorkManager na Androidzie (minimalny odstęp 15 minut) i BGTaskScheduler na iOS, gdzie system decyduje, kiedy
i czy zadania się wykonają, a zamknięcie aplikacji gestem przez użytkownika na iOS je zatrzymuje. Zadania muszą być krótkie i idempotentne. Do aktualizacji krytycznych czasowo wysyła się
powiadomienia push z serwera; do ciągłej pracy, jak nawigacja, dźwięk czy wysyłanie plików, używa się dedykowanych trybów i API działania w tle.

### Jak obsłużyć otwarcie aplikacji z powiadomienia? {senior}

Dołączyć do powiadomienia dane (np. URL albo ekran i identyfikator). Gdy użytkownik je stuknie, obsłużyć trzy przypadki: aplikacja na pierwszym planie (odbiera je listener), aplikacja
w tle (wywołuje się listener odpowiedzi) i aplikacja zabita (odczytanie ostatniej odpowiedzi na powiadomienie albo początkowego URL-a przy starcie). Przekierowanie robi się przez deep linking
biblioteki nawigacji i czeka z nawigacją, aż nawigacja i uwierzytelnianie będą gotowe.
