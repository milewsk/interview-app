# Style i layout {junior}

React Native nie ma plików CSS ani kaskady: style to **obiekty JavaScript** przekazywane do propa `style`, z nazwami w camelCase
(`backgroundColor`, `marginTop`) i **liczbami bez jednostek** w pikselach niezależnych od gęstości. Layout to **Flexbox** liczony
przez silnik **Yoga**, z kilkoma wartościami domyślnymi innymi niż na webie, na które nabiera się każdy, kto przychodzi z CSS.

## Obiekty stylów

```tsx
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff' },
  selected: { borderWidth: 2, borderColor: 'tomato' },
});

<View style={[styles.card, isSelected && styles.selected, { marginTop: insets.top }]} />
```

- `style` przyjmuje obiekt albo **tablicę**; późniejsze wpisy wygrywają, a wartości fałszywe (`false`, `null`, `undefined`) są
  ignorowane. Sprawdzone: `StyleSheet.flatten([{ padding: 8 }, [{ margin: 2 }, null, false], { padding: 10 }])` daje
  `{ padding: 10, margin: 2 }`.
- `StyleSheet.create` daje sprawdzanie typów, a w trybie deweloperskim **zamraża** każdy obiekt stylu, więc przypadkowa mutacja
  się nie powiedzie; w RN 0.87 zwraca **ten sam obiekt**, który się przekazało (sprawdzone w źródle i w Jest), więc sam w sobie nie jest sztuczką wydajnościową. Definiowanie stylów poza komponentem nadal
  pozwala uniknąć tworzenia nowych obiektów przy każdym renderze.
- Pomocnicze: `StyleSheet.absoluteFill` (`position: 'absolute'` ze wszystkimi krawędziami 0), `StyleSheet.hairlineWidth`
  (najcieńsza linia na urządzeniu), `StyleSheet.flatten`. `StyleSheet.absoluteFillObject` usunięto w RN 0.85 (sprawdzone:
  `undefined` w 0.87); używa się `absoluteFill`.
- Brak selektorów, pseudoklas i media queries: style zależne od stanu biorą się z propsów i stanu (`pressed`, `isSelected`),
  a responsywność z `useWindowDimensions()`.

## Różnice Flexboxa względem weba

Dokumentacja wymienia wyjątki: **`flexDirection` domyślnie `column`** (nie `row`), **`alignContent` domyślnie `flex-start`**,
**`flexShrink` domyślnie `0`** (nie `1`), a **`flex` przyjmuje tylko jedną liczbę**. Sprawdzone w Yoga (`yoga-layout` 3.2):

- W kolumnie o wysokości 300 dzieci z `flex: 1` i `flex: 2` dostały wysokości **100 i 200**: `flex` dzieli wolne miejsce
  proporcjonalnie.
- Dziecko z samą wysokością jest **rozciągane** na szerokość kontenera (domyślne `alignItems: 'stretch'`).
- Dwoje dzieci o szerokości 80 w wierszu o szerokości 100 **wyszło poza kontener** (80 + 80), bo `flexShrink` wynosi 0;
  z `flexShrink: 1` oba zmniejszyły się do 50.
- `gap: 10` rozmieściło trzy elementy o szerokości 50 na pozycjach 0, 60, 120; `justifyContent: 'space-between'` na 0, 125, 250.
- `width: '50%'` z `aspectRatio: 2` dało 200×100 w rodzicu o szerokości 400; `position: 'absolute'` z `right: 10, bottom: 10`
  umieściło pudełko 30×30 w punkcie 360,360.

Każdy element ma domyślnie `position: 'relative'`, a dzieci absolutne są pozycjonowane względem rodzica (`position: 'static'`
istnieje tylko w New Architecture).

## Jednostki, gęstość i responsywność

- Liczby to **piksele niezależne od gęstości**; `PixelRatio.get()` podaje gęstość pikseli urządzenia, a
  `PixelRatio.roundToNearestPixel` pozwala uniknąć rozmytych połówek pikseli.
- Procenty działają dla rozmiarów, marginesów i pozycji; nie ma `em`, `rem`, `vh`.
- `useWindowDimensions()` zwraca `width`, `height`, `scale` i `fontScale` i **aktualizuje się przy obrocie** albo zmianie
  rozmiaru okna (lepsze niż statyczne `Dimensions.get`).
- Tekst skaluje się z ustawionym przez użytkownika rozmiarem czcionki dostępności (`fontScale`); nie należy ustalać na sztywno
  wysokości kontenerów z tekstem, a `maxFontSizeMultiplier` używać tylko w razie potrzeby.
- Tryb ciemny: `useColorScheme()` zwraca `'light'`/`'dark'`; aplikacje zwykle mapują to na obiekt motywu.

## Cienie i różnice między platformami

Cienie były specyficzne dla platform: `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` na iOS i `elevation` na
Androidzie. New Architecture dodaje wieloplatformowe propsy **`boxShadow`** (składnia jak w CSS; cienie zewnętrzne wymagają
Androida 9+) i **`filter`**. Czcionki, domyślne kolory tekstu i niektóre propsy stylów nadal się różnią, więc testuje się na obu
platformach.

## Źródła

- [Style](https://reactnative.dev/docs/style)
- [Layout with Flexbox](https://reactnative.dev/docs/flexbox)
- [StyleSheet](https://reactnative.dev/docs/stylesheet)
- [View style props (boxShadow, filter, elevation)](https://reactnative.dev/docs/view-style-props)
- [useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions)
- [Yoga layout engine](https://www.yogalayout.dev/)

## Pytania

### Czym stylowanie w React Native różni się od CSS? {junior}

Style to obiekty JavaScript przekazywane do propa `style`, z nazwami właściwości w camelCase i liczbami bez jednostek (piksele niezależne od gęstości). Nie ma arkuszy stylów,
selektorów, kaskady, pseudoklas ani media queries; każdy komponent dostaje style jawnie, między zagnieżdżonymi `Text` dziedziczone są tylko style tekstu, a style warunkowe wynikają
ze stanu i propsów. Layout korzysta z Flexboxa z wartościami domyślnymi specyficznymi dla RN.

### Jakie są domyślne wartości Flexboxa w React Native i czym różnią się od weba? {junior}

`flexDirection` to `column` (web: `row`), `alignContent` to `flex-start` (web: `stretch`), `flexShrink` to `0` (web: `1`), a `flex` przyjmuje jedną liczbę zamiast skrótu
`grow shrink basis`. `alignItems` domyślnie ma `stretch` jak na webie, więc dzieci wypełniają oś poprzeczną. Przez `flexShrink: 0` treść, która się nie mieści, wychodzi poza kontener
zamiast się kurczyć, chyba że ustawi się `flexShrink: 1`.

### Co robi `flex: 1`? {junior}

Sprawia, że element zajmuje część wolnego miejsca wzdłuż głównej osi rodzica proporcjonalną do swojej wartości `flex`: rodzeństwo z `flex: 1` i `flex: 2` dzieli miejsce w stosunku 1:2
(w kolumnie o wysokości 300 to 100 i 200). `flex: 1` na głównym widoku ekranu sprawia, że wypełnia on ekran. Rodzic bez rozmiaru ani flex nie daje dzieciom z flex niczego do
wypełnienia, co jest najczęstszym powodem, dla którego widok „znika”.

### Jak stosować style warunkowe albo łączone? {junior}

Przekazać tablicę do `style`: `style={[styles.base, isActive && styles.active, { width }]}`. Wpisy są łączone od lewej do prawej, późniejsze wygrywają, a wartości fałszywe są
ignorowane, więc warunki można pisać w miejscu. `StyleSheet.flatten` łączy tablicę w jeden obiekt, gdy trzeba odczytać wynik (np. wyciągnąć kolor).

### Czy `StyleSheet.create` jest wymagane? Co daje? {mid}

Nie jest wymagane; zwykłe obiekty też działają. Daje sprawdzanie typów, w trybie deweloperskim zamraża obiekty stylów (więc ich mutacja się nie powiedzie) oraz utrzymuje style zdefiniowane raz poza komponentem, więc nowe
obiekty nie są tworzone przy każdym renderze. W obecnych wersjach zwraca przekazany obiekt bez zmian, więc ewentualna korzyść wydajnościowa wynika ze statycznego zdefiniowania stylów,
a nie z samego wywołania.

### Jak budować responsywne layouty w React Native? {mid}

Opierać się na Flexboxie i procentach zamiast stałych rozmiarów, odczytywać rozmiar okna przez `useWindowDimensions()` (które powoduje ponowny render przy obrocie, podzielonym ekranie
czy zmianie rozmiaru okna) i przełączać layouty na progach, używać `aspectRatio` dla multimediów i respektować skalę czcionki użytkownika. `Dimensions.get('window')` daje tylko
migawkę i sam nie aktualizuje komponentów.

### Jak działają cienie na różnych platformach? {mid}

Tradycyjnie iOS używa `shadowColor`, `shadowOffset`, `shadowOpacity` i `shadowRadius`, a Android `elevation`, które wpływa też na kolejność nakładania, więc komponent potrzebował obu
zestawów propsów. W New Architecture można używać `boxShadow` z wartościami jak w CSS na obu platformach (cienie zewnętrzne wymagają Androida 9+, wewnętrzne Androida 10+). Na iOS
cienie na widokach bez koloru tła mogą szkodzić wydajności.

### Jak działa pozycjonowanie? {mid}

Elementy mają domyślnie `position: 'relative'` i są układane przez Flexbox; `top`/`left`/`right`/`bottom` przesuwają je względem tej pozycji. `position: 'absolute'` wyjmuje element
z przepływu i pozycjonuje go względem rodzica, np. plakietkę z `right: 10, bottom: 10`. `StyleSheet.absoluteFill` pokrywa rodzica w całości. `zIndex` steruje nakładaniem wśród
rodzeństwa (a na Androidzie wpływa na nie też `elevation`).

### Jak obsłużyć tryb ciemny i motywy? {mid}

Odczytać ustawienie systemowe przez `useColorScheme()` (albo API `Appearance`) i wybrać obiekt motywu z kolorami, a potem przekazać go przez kontekst (biblioteki nawigacji i zestawy
UI dostarczają providery motywów). Trzymać kolory poza pojedynczymi stylami i odwoływać się do tokenów motywu, żeby zmiana motywu zmieniała jeden obiekt. `PlatformColor`
i `DynamicColorIOS` pozwalają używać natywnych kolorów systemowych, które dostosowują się automatycznie.

### Czym jest Yoga? {senior}

Yoga to wieloplatformowy silnik layoutu napisany w C++, którego React Native używa do implementacji Flexboxa: oblicza pozycję i rozmiar każdego widoku na podstawie stylów, a wyniki są
stosowane do natywnych widoków. Jest też dostępny jako pakiet `yoga-layout`, który zwraca te same wyniki (np. `flex: 1` i `flex: 2` w kolumnie o wysokości 300 dają 100 i 200).
W New Architecture layout jest liczony w C++ i w razie potrzeby może działać synchronicznie.
