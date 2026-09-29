# Jak działa React Native {mid}

Aplikacja React Native to natywna aplikacja iOS/Android, która osadza **silnik JavaScript** (Hermes) uruchamiający twój kod
React. React oblicza, jak ma wyglądać UI, a **renderer** zamienia to na prawdziwe natywne widoki. Sposób, w jaki JavaScript
i kod natywny ze sobą rozmawiają, to rdzeń architektury, a zmienił się on zasadniczo wraz z **New Architecture**, która jest
domyślna od 0.76 i **jedyna** od 0.82.

## Elementy układanki

- **Silnik JavaScript: Hermes.** Domyślny od RN 0.70; **Hermes V1** jest domyślny od 0.84. W buildach release twój JS jest
  **kompilowany do bajtkodu Hermesa (`.hbc`) w czasie budowania**, więc aplikacja pomija parsowanie i kompilację przy starcie,
  co poprawia czas uruchomienia i zużycie pamięci. Sprawdzone: kompilator `hermesc` dołączony do RN 0.87 (Hermes release 1.0.0,
  bajtkod w wersji 98) skompilował mały skrypt do pliku `.hbc` o rozmiarze 719 bajtów i potrafił zrzucić jego instrukcje
  bajtkodu. `global.HermesInternal` pokazuje, że działa Hermes. JavaScriptCore jest teraz dostępny tylko jako pakiet społeczności.
- **Metro**: bundler, który rozwiązuje moduły (także pliki `.ios`/`.android`), transformuje kod Babelem i w trybie deweloperskim
  serwuje bundle z Fast Refresh.
- **Wątki**: **wątek UI (główny)** jako jedyny może dotykać natywnych widoków; **wątek JavaScript** wykonuje fazę renderowania
  Reacta, a w New Architecture także layout. Gdy wątek JS jest zajęty, aplikacja nadal przewija się natywnie, ale przestaje
  reagować na aktualizacje sterowane z JS i na naciśnięcia.

## Stary most i dlaczego go zastąpiono

W starej architekturze JS i kod natywny komunikowały się przez **asynchroniczny most** (bridge): każde wywołanie było
serializowane do JSON, grupowane w partie i przesyłane. To oznaczało:

- brak wywołań synchronicznych (np. nie dało się zmierzyć widoku i ustawić innego przed narysowaniem, co powodowało skoki);
- koszt serializacji dużych danych (obrazy, klatki z kamery, duże listy);
- inicjalizację wszystkich modułów natywnych przy starcie, nawet nieużywanych;
- brak obsługi współbieżnych funkcji Reacta.

## New Architecture

- **JSI (JavaScript Interface)**: API w C++, które pozwala JS trzymać referencje do obiektów C++ i wywoływać ich metody
  **bezpośrednio, synchronicznie, bez serializacji**. Wszystko inne jest na nim zbudowane. Przykład z dokumentacji: VisionCamera
  przetwarza przez JSI klatki kamery po około 30 MB (około 2 GB na sekundę).
- **Fabric**: nowy renderer, w dużej części w C++, wspólny dla obu platform. Jego pipeline:
  1. **Render**: React tworzy drzewo elementów w JS, a renderer tworzy **niemutowalne Shadow Tree** w C++;
  2. **Commit**: nowe drzewo zostaje awansowane na następne, a **Yoga** liczy layout (w C++, poza komponentami mierzonymi przez
     platformę, jak `Text`);
  3. **Mount**: renderer porównuje poprzednie i następne drzewo w C++ i stosuje atomowe mutacje (`createView`, `updateView`,
     `removeView`...) na widokach hosta w wątku UI.
- **Turbo Native Modules**: moduły natywne dostępne przez JSI, **wczytywane leniwie** przy pierwszym użyciu, z typowanymi
  interfejsami.
- **Codegen**: generuje w czasie budowania kod łączący w C++ ze specyfikacji modułów i komponentów w TypeScript/Flow, więc JS
  i kod natywny zgadzają się co do typów.
- **Tryb bridgeless**: most jest całkowicie usunięty; warstwy interop utrzymują działanie większości starszych bibliotek.

Co to daje programiście: **synchroniczny layout** (`useLayoutEffect` może zmierzyć i zaktualizować widok, zanim użytkownik
zobaczy klatkę), **funkcje współbieżne** Reacta 18/19 (transitions, Suspense, automatyczne grupowanie aktualizacji) oraz API
węzłów w stylu DOM na refach od 0.82 (`getBoundingClientRect()`, `parentNode`, `children`).

## Oś czasu do zapamiętania

0.68: New Architecture opcjonalna → 0.70: Hermes domyślny → 0.76: New Architecture domyślna → 0.82: tylko New Architecture
(`newArchEnabled=false` jest ignorowane) → 0.84: Hermes V1 domyślny, stary kod usunięty z buildów iOS, prekompilowane binaria
iOS domyślnie.

## Źródła

- [About the New Architecture](https://reactnative.dev/architecture/landing-page)
- [Render, Commit, and Mount](https://reactnative.dev/architecture/render-pipeline)
- [Threading model](https://reactnative.dev/architecture/threading-model)
- [Using Hermes](https://reactnative.dev/docs/hermes)
- [React Native 0.82: A New Era](https://reactnative.dev/blog/2025/10/08/react-native-0.82)
- [React Native 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84)

## Pytania

### Jak React Native zamienia komponenty React na natywne UI? {junior}

Twój JavaScript działa w osadzonym silniku (Hermes). React renderuje komponenty do drzewa elementów, a renderer React Native (Fabric) zamienia je na drzewo natywnych widoków: buduje
shadow tree w C++, liczy layout przez Yogę, a potem tworzy albo aktualizuje odpowiadające widoki iOS i Androida w wątku UI. Aktualizacje przechodzą przez ten sam pipeline
i stosują tylko różnice.

### Czym był most (bridge) i jakie miał problemy? {mid}

W starej architekturze JS i kod natywny komunikowały się tylko przez asynchroniczny most, wysyłając grupowane komunikaty serializowane do JSON. Wywołania nie mogły być synchroniczne,
więc mierzenie i poprawianie layoutu powodowało widoczne skoki; duże dane płaciły koszt serializacji; wszystkie moduły natywne były inicjalizowane przy starcie; a konstrukcja nie
pozwalała obsłużyć współbieżnego renderowania Reacta. New Architecture zastąpiła go przez JSI.

### Czym jest JSI? {mid}

JavaScript Interface to lekkie API w C++ między silnikiem JS a kodem natywnym. Pozwala JavaScriptowi trzymać referencje do obiektów hosta w C++ i wywoływać ich metody bezpośrednio
i synchronicznie, bez serializacji do JSON, a kodowi natywnemu wywoływać funkcje JS. Fabric, Turbo Native Modules i biblioteki takie jak Reanimated czy VisionCamera są na nim
zbudowane. Uniezależnia też RN od konkretnego silnika JS.

### Czym jest Fabric i jakie są fazy jego pipeline'u renderowania? {senior}

Fabric to renderer New Architecture, zaimplementowany głównie we wspólnym C++. Render: React tworzy drzewo elementów w JS, a renderer niemutowalne shadow tree w C++. Commit: nowe
drzewo staje się następnym, a Yoga oblicza layout. Mount: renderer porównuje poprzednie i następne drzewo i stosuje listę mutacji widoków do widoków hosta w wątku UI. Ponieważ drzewa
są niemutowalne, renderowanie można przerwać i wykonać w różnych wątkach, co umożliwia współbieżne funkcje Reacta i synchroniczne aktualizacje.

### Czym jest tryb bridgeless? {mid}

To działanie React Native z całkowicie usuniętym starym mostem: cała komunikacja między JS a kodem natywnym, łącznie z wywołaniami modułów, zdarzeniami i timerami, przechodzi
przez JSI, zamiast utrzymywać most dla kompatybilności. Stał się domyślny przy włączonej New Architecture w RN 0.74, a warstwy interop pozwalają wielu starym modułom i
komponentom działać bez zmian. Od 0.82 nie ma powrotu, bo New Architecture jest jedyną opcją.

### Czym jest Hermes i dlaczego jest domyślnym silnikiem? {mid}

Hermes to silnik JavaScript zbudowany przez Metę dla React Native. Jego główną zaletą jest kompilacja z wyprzedzeniem: buildy release zawierają prekompilowany bajtkod (`.hbc`), więc
aplikacja nie parsuje i nie kompiluje JavaScriptu przy starcie, co skraca uruchamianie i zmniejsza zużycie pamięci. Jest domyślny od 0.70, Hermes V1 (z ulepszeniami kompilatora i VM)
od 0.84, a debugowanie obsługuje React Native DevTools. `global.HermesInternal` pokazuje, czy jest aktywny.

### Które wątki mają znaczenie w aplikacji React Native? {mid}

Wątek UI (główny), który jako jedyny może tworzyć i aktualizować natywne widoki i obsługuje natywny dotyk oraz przewijanie, oraz wątek JavaScript, który wykonuje twój kod React, fazę
renderowania i layout. Zdarzenia o wysokim priorytecie mogą wykonać pipeline synchronicznie w wątku UI. Długie zadanie w wątku JS (ciężkie obliczenia, ogromne rendery) zamraża UI
sterowane z JS, choć natywne przewijanie może nadal działać, dlatego ciężką pracę przenosi się poza ten wątek albo dzieli na części.

### Co New Architecture zmienia dla twórców aplikacji? {mid}

Synchroniczny odczyt layoutu, więc `useLayoutEffect` może zmierzyć widoki i zaktualizować je przed narysowaniem bez skoków; obsługę współbieżnego Reacta (transitions, Suspense,
automatyczne grupowanie aktualizacji); szybszy start dzięki leniwym modułom natywnym; API w stylu DOM na refach (`getBoundingClientRect`, `parentNode`); oraz nowe możliwości stylów, jak
`boxShadow` i `filter`. Większość kodu aplikacji się nie zmienia; główna praca migracyjna to upewnienie się, że zależności natywne ją obsługują.

### Co dzieje się z bibliotekami napisanymi pod starą architekturę? {senior}

Od 0.82 New Architecture jest jedyna: ustawienie `newArchEnabled=false` albo `RCT_NEW_ARCH_ENABLED=0` jest ignorowane. Warstwy interop tłumaczą wywołania wielu starych modułów
i komponentów natywnych, więc sporo starszych bibliotek nadal działa, a zespół RN zapowiada, że zostaną na dającą się przewidzieć przyszłość. Biblioteki polegające na wewnętrznych
elementach usuniętych ze starą architekturą trzeba zaktualizować, zastąpić albo zgłosić opiekunom; sprawdzanie kompatybilności (np. w React Native Directory) jest częścią każdej
aktualizacji.

### Czym jest Metro? {junior}

Metro to bundler JavaScriptu dla React Native. Rozwiązuje moduły (także rozszerzenia platformowe, jak `.ios.tsx`), transformuje kod Babelem (TypeScript, JSX), tworzy bundle, który
wczytuje aplikacja, a w trybie deweloperskim serwuje go z lokalnego serwera z Fast Refresh, więc zmiany pojawiają się w działającej aplikacji z zachowaniem stanu komponentów.
W buildach release bundle jest osadzony w aplikacji i skompilowany do bajtkodu Hermesa.
