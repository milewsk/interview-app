# Wydajność {senior}

Aplikacja React Native wydaje się wolna, gdy **gubi klatki** (szarpane przewijanie i animacje), z opóźnieniem reaguje na dotyk
albo **wolno startuje**. Ekrany odświeżają się z częstotliwością 60 Hz lub wyższą, więc każda klatka ma **najwyżej 16,67 ms**
(mniej na ekranach 120 Hz). Większość problemów wynika z nadmiaru pracy w **wątku JavaScript**; rozwiązania to te same techniki
Reacta co na webie plus kilka narzędzi specyficznych dla RN.

## Dwie częstotliwości klatek

- **Klatki JS**: twój kod React, logika biznesowa, obsługa dotyku i odpowiedzi sieciowe. Dokumentacja podaje, że jeśli ponowny
  render trwa 200 ms, gubi się około 12 klatek, a UI sterowane z JS i naciśnięcia zamierają.
- **Klatki UI**: wątek główny. Natywne przewijanie i **animacje sterowane natywnie** działają dalej, nawet gdy wątek JS jest
  zablokowany.

Mierzy się w **buildzie release**: tryb deweloperski dodaje sprawdzenia i ostrzeżenia, które mocno spowalniają JS, więc liczby
z buildów deweloperskich wprowadzają w błąd. Używa się Performance Monitora (menu deweloperskie), profilera w **React Native
DevTools** i narzędzi natywnych (profiler Android Studio, Xcode Instruments) do CPU, pamięci i startu.

## Unikanie zbędnych renderów

Sprawdzone w Jest: po trzech aktualizacjach stanu w rodzicu zwykłe dziecko wyrenderowało się **4** razy, dziecko z `memo` i propem
z `useCallback` **raz**, a dziecko z `memo` z funkcją strzałkową w miejscu **4** razy (nowa funkcja psuje memoizację).

- Memoizuje się kosztowne wiersze i komponenty (`React.memo`), utrzymuje stabilne callbacki i obiekty (`useCallback`, `useMemo`)
  tam, gdzie trafiają do zmemoizowanych dzieci, albo pozwala zrobić to automatycznie **React Compilerowi**.
- Stan trzyma się możliwie lokalnie; aktualizacja globalnego store'u, która przerenderowuje całe drzewo, to częsta przyczyna
  przycięć. Selektory (Zustand, Redux) sprawiają, że komponenty subskrybują tylko to, czego używają.
- Listy: strojenie `FlatList`, `getItemLayout`, zmemoizowane wiersze albo FlashList/Legend List (patrz temat o listach).

## Odciążanie wątku JS

- Długie zadania dzieli się na części, a pracę niepilną odkłada przez **`requestIdleCallback`**. `InteractionManager` został
  **usunięty z rdzenia**: w RN 0.87 odwołanie do niego rzuca „InteractionManager has been removed from react-native core. Please
  refactor long tasks into smaller ones, and use 'requestIdleCallback' instead.”
- `startTransition` służy do kosztownych aktualizacji, które mogą poczekać (np. filtrowanie dużej listy podczas pisania).
- Ciężkie obliczenia przenosi się do kodu natywnego albo biblioteki workletów czy wątków.
- `console.log` usuwa się z buildów produkcyjnych (np. `babel-plugin-transform-remove-console`); logowanie to realny koszt dla
  wątku JS.
- Animacje uruchamia się w wątku UI: `useNativeDriver: true` albo Reanimated (patrz temat o animacjach). Animuje się `transform`
  i `opacity`, a nie `width`/`height`/`top`.

## Czas startu

- Bajtkod Hermesa jest prekompilowany w czasie budowania (buildy release), więc JS nie jest parsowany przy uruchomieniu.
- **Inline requires** (domyślnie włączone w `@react-native/metro-config`, sprawdzone w 0.87: `inlineRequires: true`) odkładają
  wczytanie modułów do pierwszego użycia; ekrany i ciężkie biblioteki wczytuje się leniwie.
- Turbo Native Modules wczytują się leniwie; nie należy inicjalizować wielu SDK przed pierwszym ekranem.
- Bundle powinien być mały: usuwa się nieużywane zależności, unika ogromnych importów JSON i sprawdza skład bundle'a.

## Obrazy i pamięć

Używa się obrazów o odpowiednim rozmiarze i z cache (np. `expo-image`), nie dekoduje ogromnych obrazów na miniatury, a listenery,
timery i subskrypcje sprząta się, żeby uniknąć wycieków. Niedobór pamięci na słabszych urządzeniach z Androidem objawia się awariami,
a nie tylko spowolnieniem.

## Źródła

- [Performance overview](https://reactnative.dev/docs/performance)
- [Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- [React Native DevTools](https://reactnative.dev/docs/react-native-devtools)
- [Using Hermes](https://reactnative.dev/docs/hermes)
- [React Compiler](https://react.dev/learn/react-compiler)

## Pytania

### Czym jest budżet klatki i co się dzieje, gdy zostanie przekroczony? {junior}

Przy 60 klatkach na sekundę każda klatka ma najwyżej 16,67 ms (mniej na ekranach 90 albo 120 Hz). Jeśli praca dla klatki nie skończy się na czas, klatka zostaje pominięta, a użytkownik
widzi przycięcia: szarpane przewijanie albo animacje lub opóźnienie po stuknięciu. W React Native obserwuje się dwie częstotliwości klatek, wątku JS i wątku UI, bo gubią one klatki
z różnych powodów.

### Czym różnią się klatki JS od klatek UI? {mid}

Klatki JS odzwierciedlają wątek JavaScript, który wykonuje renderowanie Reacta, logikę biznesową, handlery zdarzeń i animacje sterowane z JS. Klatki UI odzwierciedlają wątek główny,
który rysuje natywne widoki i obsługuje natywne przewijanie oraz animacje sterowane natywnie. Zablokowany wątek JS zamraża aktualizacje sterowane z JS i opóźnia reakcje na dotyk, ale
natywne przewijanie i animacje natywne mogą dalej działać z pełną płynnością.

### Dlaczego wydajność trzeba mierzyć w buildzie release? {junior}

Buildy deweloperskie wykonują dodatkową walidację, ostrzeżenia i obsługę debugowania oraz nie używają prekompilowanego bajtkodu, co mocno spowalnia JavaScript. Problemy wydajności
w trybie deweloperskim mogą nie istnieć w produkcji, a prawdziwe wąskie gardła mogą być ukryte w ogólnym spowolnieniu. Profiluje się buildy release (albo profilujące) na prawdziwych,
najlepiej słabszych, urządzeniach.

### Jak zapobiegać zbędnym renderom w React Native? {mid}

Tak samo jak w React: `React.memo` dla komponentów, których propsy rzadko się zmieniają, stabilne callbacki i obiekty przez `useCallback` i `useMemo`, gdy trafiają do zmemoizowanych
dzieci, stan trzymany blisko miejsca użycia i selektory store'u, żeby komponenty przerenderowywały się tylko przy istotnych zmianach. React Compiler może stosować memoizację
automatycznie. W teście zmemoizowane dziecko przerenderowało się raz ze stabilnym callbackiem, a przy każdej aktualizacji z callbackiem w miejscu.

### Jak utrzymać responsywność wątku JS przy ciężkiej pracy? {senior}

Dzielić długie zadania na mniejsze części i planować pracę niepilną przez `requestIdleCallback` (InteractionManager usunięto z rdzenia), oznaczać kosztowne aktualizacje jako transitions
przez `startTransition`, przenosić ciężkie obliczenia do kodu natywnego albo bibliotek opartych na workletach, unikać synchronicznych wywołań natywnych wykonujących wolną pracę
i usuwać `console.log` z produkcji. Animacje uruchamiać w wątku UI, żeby nie zależały od wątku JS.

### Które właściwości animować, żeby animacje były płynne? {mid}

`transform` (przesunięcie, skala, obrót) i `opacity`, które można animować w wątku UI bez przeliczania layoutu. Animowanie `width`, `height`, `top`, `margin` czy `flex` wywołuje layout
w każdej klatce, a w klasycznym API `Animated` nie może korzystać z natywnego sterownika. Dla obrazu dokumentacja zaleca `transform: [{ scale }]` zamiast zmiany jego rozmiaru.

### Jak skrócić czas startu aplikacji? {senior}

Dostarczać bajtkod Hermesa (domyślnie w buildach release), mieć włączone inline requires, żeby moduły wczytywały się przy pierwszym użyciu, leniwie wczytywać ekrany i ciężkie biblioteki,
odkładać inicjalizację SDK na po wyrenderowaniu pierwszego ekranu, zmniejszać bundle i liczbę zależności, unikać dużej pracy synchronicznej (np. odczytu dużych wartości z pamięci)
przed pierwszym renderem i mierzyć czas do interaktywności na prawdziwych urządzeniach natywnymi profilerami.

### Jakich narzędzi używasz do profilowania aplikacji React Native? {mid}

Wbudowanego Performance Monitora do klatek JS i UI, React Native DevTools (profiler Reacta, podświetlanie komponentów, profilowanie JS), natywnych profilerów, takich jak profilery CPU
i pamięci w Android Studio oraz Xcode Instruments, do kodu natywnego, pamięci i startu, a także narzędzi mierzących wydajność na prawdziwych urządzeniach w powtarzanych przebiegach.
Profilowanie wykonuje się na buildach release.

### Dlaczego `console.log` jest problemem wydajnościowym? {junior}

Każde wywołanie wykonuje pracę w wątku JS, a w trybie deweloperskim wysyła dane do narzędzi debugowania; logowanie w renderach, handlerach przewijania czy pętlach może zauważalnie
spowolnić aplikację, a serializacja dużych obiektów jest kosztowna. Buildy produkcyjne powinny je usuwać, np. przez `babel-plugin-transform-remove-console`, a to, co musi zostać,
obsługiwać porządnym loggerem z poziomami.

### Co powoduje problemy z pamięcią w aplikacjach React Native i jak je znaleźć? {senior}

Typowe przyczyny to listenery, timery i subskrypcje nieusuwane przy odmontowaniu, duże obrazy dekodowane w pełnej rozdzielczości, cache bez limitów, ogromne listy renderowane bez
wirtualizacji i domknięcia trzymające referencje do dużych obiektów. Do sterty JS używa się snapshotów w React Native DevTools, a do pamięci natywnej Android Studio albo Xcode Instruments,
i testuje na urządzeniach z małą ilością pamięci, gdzie problemy objawiają się awariami.
