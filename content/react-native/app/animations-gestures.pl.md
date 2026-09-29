# Animacje i gesty {senior}

Płynne animacje i gesty sprawiają, że aplikacja wydaje się natywna. Kluczowe pytanie brzmi: **który wątek wykonuje animację**.
Jeśli każda klatka jest liczona w JavaScripcie, zajęty wątek JS powoduje przycięcia. React Native daje wbudowane API **`Animated`**
(z **natywnym sterownikiem**) i `LayoutAnimation`; większość produkcyjnych aplikacji używa **Reanimated** i **Gesture Handler**
od Software Mansion, które uruchamiają animacje i śledzenie gestów w **wątku UI**.

## Animated

```tsx
const opacity = useRef(new Animated.Value(0)).current;

useEffect(() => {
  Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
}, []);

const rotate = progress.interpolate({ inputRange: [0, 100], outputRange: ['0deg', '180deg'] });
<Animated.View style={{ opacity, transform: [{ rotate }] }} />
```

- Wartości (`Animated.Value`), sterowniki (`timing`, `spring`, `decay`), kompozycja (`sequence`, `parallel`, `stagger`, `loop`)
  oraz `interpolate` do mapowania zakresów, także kolorów i kątów; `extrapolate: 'clamp'` zatrzymuje wartości poza zakresem.
- Sprawdzone w Jest ze sztucznymi timerami: liniowe `timing` trwające 300 ms od 0 do 100 po 150 ms było na **50** (opacity 0,50,
  obrót `90deg`) i zakończyło się z `finished: true`; interpolacja z `clamp` została na 10; `sequence` uruchomił drugą animację po
  pierwszej; a `stopAnimation` po 100 ms animacji trwającej 1 s wywołał callback startu z **`finished: false`** i podał bieżącą
  wartość.
- **`useNativeDriver: true`** wysyła animację raz na stronę natywną, a klatki są liczone w wątku UI, więc animacja trwa dalej, gdy
  wątek JS jest zajęty. W RN 0.87 natywny sterownik pozwala tylko na właściwości niezwiązane z layoutem: `transform`, `opacity`,
  kolory, zaokrąglenia ramek, `elevation`, `zIndex`, `filter` i kilka innych (według listy dozwolonych właściwości w źródle);
  animowanie nim `width`, `top` czy `margin` jest odrzucane („Style property ... is not supported by native animated module”).
  RN 0.85 wprowadził nowy wspólny backend animacji, który pozwala na właściwości layoutu, ale w 0.87 jest to nadal
  **eksperymentalna opcja** (flaga domyślnie wyłączona).
- `Animated.event` mapuje zdarzenia przewijania albo gestów bezpośrednio na wartości (`onScroll` z `useNativeDriver: true` dla
  zwijanych nagłówków).
- **`LayoutAnimation`** automatycznie animuje następną zmianę layoutu („odpal i zapomnij”), co przydaje się przy rozwijaniu albo
  zmianie kolejności elementów.

## Reanimated

```tsx
const offset = useSharedValue(0);
const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));   // worklet, działa w wątku UI
<Animated.View style={style} />
offset.value = withSpring(100);
```

**Shared values** żyją w wątku UI, a **worklety** (funkcje oznaczone przez plugin Babela) tam się wykonują, więc animacje
i aktualizacje sterowane gestami nie dotykają wątku JS. Reanimated 4 działa **tylko w New Architecture**, wymaga osobnego pakietu
**`react-native-worklets`** z pluginem Babela (`react-native-worklets/plugin`, na końcu listy) i dodaje **animacje i przejścia
w stylu CSS**. Animacje layoutu (`entering`, `exiting`, `layout`) animują montowanie, odmontowanie i zmiany pozycji.

## Gesture Handler

Gesture Handler rozpoznaje gesty **natywnie w wątku UI** zamiast przez system responderów JS (`PanResponder`), dzięki czemu są
płynne i współpracują z natywnymi widokami przewijanymi. Wersja 3 (RN 0.82+) ma gesty oparte na hookach:

```tsx
const pan = usePanGesture({
  onUpdate: e => { offset.value = e.translationX; },       // worklet w wątku UI z Reanimated
  onDeactivate: () => { offset.value = withSpring(0); },
});
<GestureDetector gesture={pan}><Animated.View style={style} /></GestureDetector>
```

Hooki istnieją dla stuknięcia, przeciągania, szczypania, obrotu, fling, długiego przytrzymania, hover i gestów natywnych,
z callbackami `onBegin`, `onActivate`, `onUpdate`, `onDeactivate` i `onFinalize`, oraz hooki kompozycji `useSimultaneousGestures`,
`useExclusiveGestures` i `useCompetingGestures` (np. szczypanie i obrót jednocześnie, podwójne stuknięcie przed pojedynczym).
Korzeń aplikacji potrzebuje `GestureHandlerRootView`. Starsze API budowniczego `Gesture.Pan()` jest nadal eksportowane.

## Źródła

- [Animations (React Native)](https://reactnative.dev/docs/animations)
- [Animated](https://reactnative.dev/docs/animated)
- [LayoutAnimation](https://reactnative.dev/docs/layoutanimation)
- [React Native 0.85: New Animation Backend](https://reactnative.dev/blog/2026/04/07/react-native-0.85)
- [Reanimated: getting started](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/)
- [React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler)

## Pytania

### Co robi `useNativeDriver: true`? {mid}

Serializuje konfigurację animacji i wysyła ją na stronę natywną przed startem, więc każda klatka jest liczona i stosowana w wątku UI bez przechodzenia przez JavaScript. Animacja pozostaje
płynna, nawet gdy wątek JS jest zajęty (np. renderuje nowy ekran). Ograniczenie polega na tym, że domyślnie obsługiwane są tylko właściwości niezwiązane z layoutem: `transform`,
`opacity`, kolory i kilka innych, a nie `width`, `height`, `top` czy `margin`.

### Dlaczego nie można animować `width` natywnym sterownikiem i co zrobić zamiast tego? {mid}

Właściwości layoutu wymagają przeliczania layoutu (Yoga) widoku i jego rodzeństwa w każdej klatce, czego klasyczny natywny moduł animacji nie robi, więc są odrzucane z komunikatem „not
supported by native animated module”. Zamiast tego używa się `transform: [{ scaleX }]` albo `translateX`, w małych przypadkach animuje z `useNativeDriver: false` w wątku JS, używa
`LayoutAnimation` albo Reanimated. RN 0.85 dodał eksperymentalny backend pozwalający animować właściwości layoutu natywnym sterownikiem, ale trzeba go jawnie włączyć.

### Czym różni się Animated od Reanimated? {mid}

Animated jest wbudowane w React Native: animacje deklaruje się w JS, a z natywnym sterownikiem działają w wątku UI, ale tylko dla obsługiwanych właściwości, a logika w trakcie animacji
(reakcja na gesty, warunki) wykonuje się w JS. Reanimated uruchamia worklety w wątku UI ze shared values, więc logika animacji, obsługa gestów i obliczanie stylów zostają poza wątkiem JS,
obsługuje dowolne właściwości stylów i dodaje animacje layoutu oraz animacje w stylu CSS. Większość złożonych interakcji sterowanych gestami używa Reanimated.

### Czym są worklety i shared values? {senior}

Worklet to funkcja JavaScript, którą plugin Babela przygotowuje do wykonania w osobnym runtime w wątku UI (np. funkcja przekazana do `useAnimatedStyle` albo callback gestu). Shared values
(`useSharedValue`) trzymają dane dostępne zarówno z wątku JS, jak i z wątku UI; odczyt i zapis `.value` w workletach aktualizuje animacje bez renderu Reacta. Worklety nie mogą bezpośrednio
używać wartości z wątku JS ani wywoływać funkcji JS inaczej niż przez jawne pomocniki (API w stylu `scheduleOnRN` / `runOnJS`).

### Dlaczego używać Gesture Handler zamiast `PanResponder`? {mid}

`PanResponder` działa w systemie responderów JS: każdy ruch dotyku przechodzi przez wątek JS, więc gesty się opóźniają, gdy JS jest zajęty, i kolidują z natywnymi widokami przewijanymi.
Gesture Handler rozpoznaje gesty natywnie w wątku UI, współpracuje z natywnymi komponentami (widoki przewijane, przyciski), pozwala składać gesty (równoczesne, wykluczające), a z Reanimated
aktualizuje UI bezpośrednio w wątku UI, dając płynne przeciąganie, przesuwanie i szczypanie.

### Jak łączyć kilka gestów? {senior}

Przez kompozycję: w Gesture Handler 3 `useSimultaneousGestures` pozwala gestom działać jednocześnie (szczypanie i obrót zdjęcia), `useExclusiveGestures` nadaje pierwszeństwo w kolejności
(podwójne stuknięcie wygrywa z pojedynczym), a `useCompetingGestures` sprawia, że pierwszy aktywowany gest anuluje pozostałe. Można też konfigurować relacje z gestami spoza detektora (np.
nadrzędnym widokiem przewijanym), żeby poziome przesunięcie nie blokowało pionowego przewijania.

### Kiedy przydaje się `LayoutAnimation`? {mid}

Gdy następna zmiana layoutu ma zostać automatycznie zanimowana bez animowania pojedynczych wartości: rozwijanie akordeonu, wstawianie albo usuwanie elementów listy, zmiana kolejności.
Wywołuje się `LayoutAnimation.configureNext(...)` przed aktualizacją stanu, a kod natywny animuje widoki do nowych pozycji i rozmiarów. To „odpal i zapomnij”, bez kontroli w trakcie
animacji i bez możliwości przerwania; animacje layoutu w Reanimated dają więcej kontroli.

### Jak animować nagłówek w zależności od pozycji przewinięcia? {mid}

Zmapować przesunięcie przewijania na wartość animowaną i interpolować z niej style nagłówka. W Animated:
`onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}` na `Animated.ScrollView` albo `Animated.FlatList`, a potem `translateY`
i `opacity` interpolowane ze `scrollY` z `extrapolate: 'clamp'`. W Reanimated: `useAnimatedScrollHandler` i `useAnimatedStyle`. Oba podejścia trzymają animację w wątku UI.

### Co dzieje się z przerwaną animacją? {mid}

Wywołanie `stop()` albo `stopAnimation()` lub uruchomienie nowej animacji na tej samej wartości zatrzymuje trwającą i wywołuje jej callback zakończenia z `finished: false` (w teście animacja
trwająca 1 s zatrzymana po 100 ms zgłosiła `finished: false` i swoją bieżącą wartość). Callbacki zakończenia powinny sprawdzać `finished` przed np. nawigacją albo odmontowaniem, a animacje
sprężynowe mogą płynnie kontynuować od bieżącej wartości i prędkości.

### Jak testować komponenty z animacjami? {senior}

Używać sztucznych timerów Jest, żeby przesuwać czas i sprawdzać wartości albo stan końcowy, bo animacje `Animated` działają w środowisku testowym na timerach (w teście przesunięcie o 150 ms
w liniowej animacji trwającej 300 ms dało wartość w połowie). Reanimated i Gesture Handler dostarczają konfigurację Jest i narzędzia (np. mocki i pomocniki do wywoływania gestów). Samej
płynności wizualnej nie da się przetestować w Jest; sprawdza się ją na urządzeniach, najlepiej słabszych, z monitorem wydajności.
