# Testowanie i debugowanie {mid}

Testowanie aplikacji React Native podąża za tą samą piramidą co na webie: **analiza statyczna** (TypeScript, ESLint), **testy
jednostkowe i komponentów** w Jest z **React Native Testing Library** i kilka **testów end-to-end** na prawdziwych urządzeniach albo
symulatorach. Elementy specyficzne dla RN to preset Jest, **mockowanie modułów natywnych** i narzędzia E2E rozumiejące aplikacje mobilne.
Do debugowania **React Native DevTools** zastąpiły starsze zdalne debugowanie i Flippera.

## Konfiguracja Jest

```js
// jest.config.js
module.exports = {
  preset: '@react-native/jest-preset',            // od RN 0.85; wcześniej preset: 'react-native'
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  ],
  setupFiles: ['./jest.setup.js'],                // mocki modułów natywnych
};
```

Wszystko w tej grupie było sprawdzane w takiej konfiguracji (RN 0.87, Jest 29, RNTL 14):

- Preset mockuje natywne komponenty i część modułów; domyślna platforma to **iOS**. Druga konfiguracja z
  `haste.defaultPlatform: 'android'` uruchomiła te same testy na plikach `.android.js` i z zachowaniem Androida (np. `BackHandler`).
- Biblioteki dostarczające nieprzetranspilowany kod trzeba dodać do **`transformIgnorePatterns`**: React Navigation tego wymagał.
- **Moduły natywne trzeba mockować**: `react-native-safe-area-context` dostarcza mock Jest, AsyncStorage eksportuje go pod
  `@react-native-async-storage/async-storage/jest`, a MMKV zawodziło z „The native NitroModules Turbo/Native-Module could not be found”,
  dopóki nie zamockowano `react-native-nitro-modules` (wtedy MMKV przełączyło się na implementację w pamięci).
- **Sztuczne timery** Jest deterministycznie sterują animacjami `Animated` i timeoutami.

## React Native Testing Library

```tsx
test('user can add an item', async () => {
  await render(<ShoppingList />);                           // RNTL 14: render zwraca Promise
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('Item'), 'Milk');
  await user.press(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByText('Milk')).toBeTruthy();
});
```

- Wyszukuje się elementy tak jak użytkownik: `getByRole` (z `name`), `getByText`, `getByLabelText`, `getByPlaceholderText`; `testID` to
  ostateczność. Dokumentacja RN zaleca asercje na wyrenderowanym tekście i dostępności, a nie na propsach czy stanie.
- **`userEvent`** symuluje realistyczne interakcje: `press` dało `pressIn, pressOut, press`, a `longPress` dało
  `pressIn, longPress, pressOut`. `fireEvent` wywołuje pojedynczy handler (`fireEvent.changeText`, `fireEvent.press`), co jest
  szybsze, ale mniej realistyczne.
- W **RNTL 14** `render` i `renderHook` zwracają **Promise** (sprawdzone w definicjach typów), więc testy na nie czekają przez `await`.
- Testy wymagające nawigacji albo danych opakowuje się w prawdziwe providery (`NavigationContainer`, `QueryClientProvider`) zamiast
  mockować hooki. Testy snapshotowe są odradzane poza małymi, stabilnymi komponentami: dokumentacja zauważa, że snapshot uznaje się za
  poprawny w chwili utworzenia, nawet jeśli wynik jest błędny.

## Testy end-to-end

- **Detox** (Wix): framework **gray-box**, który monitoruje aplikację (sieć, animacje, timery, wątek JS) i przechodzi dalej dopiero,
  gdy aplikacja jest bezczynna, co ogranicza niestabilność; testy pisze się w JS z Jest.
- **Maestro**: automatyzacja UI typu black-box z **przepływami w YAML**, szybka do napisania, działa z dowolną aplikacją, także React
  Native i webową.
- Appium dla szerszych farm urządzeń. Krytyczne przepływy (logowanie, zakup, płatności) pokrywa się testami E2E, a resztę szybszymi
  testami w Jest.

## Debugowanie

- **React Native DevTools** (klawisz `j` w terminalu Metro albo „Open DevTools” w Dev Menu): **Console**, **Sources** z breakpointami,
  snapshoty sterty w **Memory**, panele **Network** i **Performance** (od 0.83) oraz **Components** i **Profiler** Reacta.
- **Dev Menu** (potrząśnięcie, `Cmd+M`/`Ctrl+M` na emulatorze Androida, `Ctrl+Cmd+Z` na symulatorze iOS), **LogBox** dla błędów
  i ostrzeżeń (błąd składni pokazuje ekran, którego nie da się zamknąć do czasu poprawki), nakładka **Perf Monitor**. W buildach
  release są **wyłączone**.
- Problemy natywne: `adb logcat` i Android Studio, konsola i debugger Xcode. W produkcji: raportowanie awarii i błędów (Sentry,
  Crashlytics) z wgranymi **source mapami**, żeby stosy wywołań z Hermesa wskazywały na twój kod źródłowy.

## Źródła

- [Testing overview](https://reactnative.dev/docs/testing-overview)
- [React Native Testing Library](https://oss.callstack.com/react-native-testing-library/)
- [Debugging basics](https://reactnative.dev/docs/debugging)
- [React Native DevTools](https://reactnative.dev/docs/react-native-devtools)
- [How Detox works](https://wix.github.io/Detox/docs/articles/how-detox-works)
- [Maestro](https://docs.maestro.dev/)

## Pytania

### Jak skonfigurować Jest w projekcie React Native? {junior}

Użyć presetu Jest dla React Native (`@react-native/jest-preset` od RN 0.85, wcześniej `preset: 'react-native'`), który konfiguruje Babela, środowisko RN i mocki natywnych komponentów.
Biblioteki dostarczające nieprzetranspilowany kod dodać do `transformIgnorePatterns`, a mocki modułów natywnych do plików setup. Projekty Expo używają presetu `jest-expo`. Potem pisać testy
z React Native Testing Library.

### Dlaczego moduły natywne trzeba mockować w Jest? {mid}

Jest działa w Node, gdzie nie ma środowiska iOS ani Androida, więc moduły natywne nie istnieją; biblioteka, która szuka swojego modułu natywnego przy imporcie, rzuca wyjątek. W teście MMKV
zawodziło z „The native NitroModules ... could not be found”, dopóki nie zamockowano modułu Nitro. Wiele bibliotek dostarcza gotowe mocki Jest (safe-area-context, AsyncStorage, Reanimated),
a dla pozostałych pisze się fabryki `jest.mock`. Samo zachowanie natywne trzeba pokryć testami E2E.

### Jak wyszukiwać elementy w React Native Testing Library? {junior}

Tak, jak postrzega je użytkownik: po roli i dostępnej nazwie (`getByRole('button', { name: 'Save' })`), widocznym tekście (`getByText`), etykiecie (`getByLabelText`), placeholderze albo
wyświetlanej wartości. `getBy*` rzuca wyjątek, gdy elementu brak, `queryBy*` zwraca `null` (do sprawdzania braku), a `findBy*` czeka na asynchroniczne pojawienie się. `testID` to wyjście
awaryjne, gdy nic widocznego dla użytkownika nie identyfikuje elementu.

### Czym różni się `fireEvent` od `userEvent`? {mid}

`fireEvent` wywołuje bezpośrednio jeden handler zdarzenia, np. `onPress` albo `onChangeText`. `userEvent` symuluje pełną interakcję: naciśnięcie wywołuje `pressIn`, `pressOut` i `press` (w teście
długie przytrzymanie dało `pressIn, longPress, pressOut` bez `press`), a pisanie wprowadza znaki po kolei ze zdarzeniami fokusu i zmiany. `userEvent` wyłapuje więcej błędów; `fireEvent` jest
prostszy i wystarcza do własnych zdarzeń.

### Dlaczego testy snapshotowe są odradzane? {mid}

Snapshot jest uznawany za poprawny w chwili pierwszego zapisu, nawet jeśli wynik jest błędny; duże snapshoty zmieniają się przy każdym refaktoringu i są aktualizowane przez `--updateSnapshot`
bez prawdziwego przeglądu, więc wykrywają zmiany, a nie błędy. Jawne asercje na tym, co widzi użytkownik, mają większą wartość. Małe snapshoty stabilnych, prezentacyjnych komponentów nadal
mogą się przydać.

### Jak testować kod, który zachowuje się inaczej na iOS i Androidzie? {senior}

Uruchamiać zestaw testów dla obu platform: preset domyślnie używa iOS, a drugi projekt Jest z `haste.defaultPlatform: 'android'` rozwiązuje pliki `.android` i ustawia `Platform.OS` na
`android`. W teście ten sam import wskazał plik iOS w jednej konfiguracji i plik Androida w drugiej, a zachowanie tylko androidowe, jak `BackHandler`, dało się przetestować. Różnice natywne
nadal wymagają testów E2E na obu platformach.

### Jakich narzędzi E2E używa się w React Native? {mid}

Detox, framework gray-box, który synchronizuje się z aplikacją (sieć, animacje, timery, wątek JS) i wykonuje następny krok dopiero, gdy aplikacja jest bezczynna, z testami pisanymi w JS i Jest;
Maestro, narzędzie black-box z przepływami w YAML, które łatwo wdrożyć; oraz Appium dla szerokiego pokrycia urządzeń. Testy E2E są wolne i bywają niestabilne, więc pokrywają tylko krytyczne
ścieżki użytkownika.

### Jak debugować aplikację React Native? {junior}

Otworzyć React Native DevTools klawiszem `j` w terminalu Metro albo z Dev Menu, a potem używać konsoli, breakpointów w Sources, drzewa Components i Profilera Reacta oraz paneli Memory, Network
i Performance. LogBox pokazuje błędy i ostrzeżenia w aplikacji, a Fast Refresh zachowuje stan podczas edycji. Przy awariach natywnych używa się `adb logcat` albo konsoli Xcode.

### Co zmieniło się w narzędziach debugowania React Native w ostatnich latach? {mid}

Standardowym debuggerem zostało React Native DevTools, zbudowane na Chrome DevTools i podłączone bezpośrednio do Hermesa, ze zintegrowanym React DevTools, a nowsze wersje dodały panele Network
i Performance (0.83). Starsze podejścia, zdalne debugowanie JS w Chrome (które uruchamiało JS w przeglądarce zamiast na urządzeniu) i Flipper, nie są już zalecaną drogą.

### Jak badać awarie w produkcji? {senior}

Zintegrować raportowanie awarii (Sentry, Firebase Crashlytics, Bugsnag) dla błędów JS i awarii natywnych, wgrywać source mapy dla każdego wydania (i aktualizacji OTA), żeby stosy wywołań
z bajtkodu Hermesa mapowały się na pliki i linie źródłowe, dołączać breadcrumbs oraz wersje aplikacji, systemu i urządzenia i śledzić odsetek sesji bez awarii per wydanie. Odtwarzać problem na
tym samym typie builda i urządzeniu, a po naprawie dodać test regresji.
