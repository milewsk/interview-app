# useRef i refy {mid}

`useRef(initialValue)` zwraca obiekt `{ current }`, który **przetrwa między renderami**, a jego
zmiana **nie powoduje renderu**. Ma dwa główne zastosowania:

1. **referencja do elementu DOM** (focus, pomiar, przewijanie, integracja z bibliotekami spoza Reacta),
2. **wartość „pamiętana”, ale niewpływająca na UI**: id timera, poprzednia wartość, flaga, instancja
   obiektu.

```tsx
function SearchBox() {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>Szukaj</button>
    </>
  )
}
```

## Ref a stan

| | `useState` | `useRef` |
| --- | --- | --- |
| zmiana powoduje render | tak | nie |
| wartość w bieżącym renderze | migawka (niezmienna) | `current` zmienia się od razu |
| odczyt w trakcie renderu | tak | **nie** (poza leniwą inicjalizacją) |
| przeznaczenie | dane wyświetlane w UI | dane „pod spodem”, DOM |

Jeśli wartość jest wyświetlana, powinna być stanem. Ref zmieniony w handlerze nie pojawi się na
ekranie, dopóki coś innego nie wywoła renderu.

## Zasady

- **Nie czytaj ani nie zapisuj `ref.current` w trakcie renderu** (poza jednorazową inicjalizacją).
  Render musi być czysty, a zmiany refa nie są widoczne dla Reacta. Czytaj i zapisuj w handlerach
  i efektach.
- Ref do DOM ma wartość `null` podczas pierwszego renderu. React ustawia `current` dopiero po
  zatwierdzeniu zmian w DOM i zeruje je przy odmontowaniu.
- Leniwa inicjalizacja kosztownego obiektu:

```tsx
const playerRef = useRef<VideoPlayer | null>(null)
if (playerRef.current === null) playerRef.current = new VideoPlayer() // tylko raz
```

## Przykłady wartości spoza UI

```tsx
// id interwału do zatrzymania
const intervalRef = useRef<number | null>(null)
function start() { intervalRef.current = window.setInterval(tick, 1000) }
function stop() { if (intervalRef.current) clearInterval(intervalRef.current) }

// najnowsza wartość dla długo żyjącego callbacku (alternatywa: useEffectEvent)
const latestOnMessage = useRef(onMessage)
useEffect(() => { latestOnMessage.current = onMessage })
```

## Przekazywanie refa do własnego komponentu (React 19)

Od React 19 `ref` jest **zwykłym propem** komponentu funkcyjnego, więc `forwardRef` nie jest już
potrzebny (zostanie wycofany w przyszłych wersjach):

```tsx
function TextInput({ ref, ...props }: { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}

<TextInput ref={inputRef} />
```

W React 18 i starszych trzeba było opakować komponent w `forwardRef((props, ref) => ...)`.

## Callback ref

Zamiast obiektu można przekazać funkcję. React wywoła ją z elementem po zamontowaniu. Od React 19
funkcja może **zwrócić cleanup**, wywoływany przy odłączeniu (wcześniej React wywoływał ją ponownie
z `null`):

```tsx
<div
  ref={(node) => {
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    return () => observer.disconnect()
  }}
/>
```

Callback refy przydają się do pomiarów, list elementów (np. `Map` id → węzeł) i podłączania
obserwatorów. Uwaga: funkcja strzałkowa w JSX to nowa funkcja przy każdym renderze, więc React
odłącza starą i podłącza nową przy każdej aktualizacji. Stabilną funkcję zapewnia `useCallback`.

## `useImperativeHandle`

Pozwala wystawić rodzicowi **ograniczone API** zamiast całego węzła DOM:

```tsx
function VideoPlayer({ ref }: { ref?: React.Ref<{ play(): void; pause(): void }> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }))
  return <video ref={videoRef} />
}
```

Refy to furtka. Jeśli coś da się wyrazić propsami (np. `isOpen`), deklaratywne podejście jest lepsze
niż imperatywne `ref.current.open()`.

## Źródła

- [useRef (react.dev)](https://react.dev/reference/react/useRef)
- [Referencing values with refs (react.dev)](https://react.dev/learn/referencing-values-with-refs)
- [Manipulating the DOM with refs (react.dev)](https://react.dev/learn/manipulating-the-dom-with-refs)
- [React 19: ref as a prop, cleanup functions for refs](https://react.dev/blog/2024/12/05/react-19)
- [useImperativeHandle (react.dev)](https://react.dev/reference/react/useImperativeHandle)

## Pytania

### Czym różni się `useRef` od `useState`? {junior}

Zmiana stanu planuje ponowny render, a w bieżącym renderze wartość jest migawką. Zmiana `ref.current`
**nie powoduje renderu** i jest widoczna od razu. Ref służy do danych niewpływających na UI (id timera,
poprzednia wartość, instancja obiektu) oraz do elementów DOM. Wszystko, co jest wyświetlane, powinno być
stanem.

### Dlaczego nie powinno się czytać ani zapisywać `ref.current` w trakcie renderu? {mid}

Render ma być czystą funkcją propsów i stanu. React nie śledzi zmian refa, więc UI zależne od `ref.current`
nie zaktualizuje się przy jego zmianie, a zapis w renderze łamie czystość (w `StrictMode` render wykonuje
się dwukrotnie, a przy funkcjach współbieżnych może zostać porzucony). Wyjątkiem jest jednorazowa leniwa
inicjalizacja (`if (ref.current === null) ref.current = ...`). Refy czyta się i zapisuje w handlerach
i efektach.

### Kiedy `ref.current` wskazujący na element DOM jest dostępny? {mid}

Po zatwierdzeniu zmian w DOM. Podczas pierwszego renderu ma wartość `null`, a React ustawia go przed
uruchomieniem `useLayoutEffect`/`useEffect`. Przy odmontowaniu elementu React zeruje `current` (albo
wywołuje cleanup callback refa). Dlatego w handlerach i efektach używa się `ref.current?.`, a nie odczytu
w JSX.

### Jak przekazać ref do własnego komponentu funkcyjnego? {mid}

Od React 19 `ref` jest zwykłym propem: komponent przyjmuje `{ ref }` i przekazuje go dalej do elementu
DOM, np. `<input ref={ref} />`. W React 18 i starszych trzeba było użyć `forwardRef((props, ref) => ...)`,
który w przyszłych wersjach zostanie wycofany. Aby wystawić tylko wybrane metody zamiast całego węzła,
używa się `useImperativeHandle`.

### Czym jest callback ref i co zmieniło się w React 19? {senior}

Zamiast obiektu przekazuje się funkcję, którą React wywołuje z węzłem DOM po podłączeniu. Przydaje się
do pomiarów, list dynamicznych elementów i obserwatorów. Od React 19 funkcja może zwrócić cleanup,
wywoływany przy odłączeniu. Wcześniej React wywoływał ją ponownie z `null`, a gdy zwraca cleanup, ten krok
jest pomijany. Nowa funkcja w każdym renderze powoduje odłączenie i ponowne podłączenie, więc warto ją
ustabilizować przez `useCallback`.

### Do czego służy `useImperativeHandle`? {mid}

Pozwala określić, co rodzic zobaczy w `ref.current` komponentu dziecka: zamiast pełnego węzła DOM
wystawia się ograniczone API, np. `{ focus, scrollToTop }`. Hermetyzuje to implementację i zapobiega
dowolnym manipulacjom DOM przez rodzica. Stosuje się go oszczędnie, bo deklaratywne propsy są zwykle
lepsze.

### Jak zapamiętać poprzednią wartość propsa? {mid}

Tradycyjnie refem aktualizowanym w efekcie: `useEffect(() => { prevRef.current = value })`, gdzie
w renderze `prevRef.current` zawiera wartość z poprzedniego renderu. Odczyt refa w renderze narusza
jednak zasady. Jeśli poprzednia wartość wpływa na UI, bezpieczniejszy jest stan porównywany w trakcie
renderu (`if (value !== prevValue) { setPrevValue(value); ... }`), co zaleca dokumentacja Reacta.

### Jak użyć refa do przechowania id interwału i dlaczego nie stanu? {junior}

`const intervalRef = useRef<number | null>(null)`. W `start` zapisuje się `intervalRef.current =
setInterval(...)`, a w `stop` wywołuje `clearInterval(intervalRef.current)`. Id nie jest wyświetlane,
więc stan powodowałby zbędne rendery. Zwykła zmienna w komponencie nie przetrwałaby między renderami,
a zmienna poza komponentem byłaby wspólna dla wszystkich instancji.

### Jak trzymać refy do wielu elementów listy? {senior}

Nie można wywoływać `useRef` w pętli, bo narusza to zasady hooków. Stosuje się jeden ref z kolekcją
(np. `useRef(new Map())`) i callback ref dla każdego elementu: `ref={(node) => { map.set(item.id, node);
return () => map.delete(item.id) }}`. Dzięki cleanupowi z React 19 usuwanie odłączonych elementów jest
proste. Alternatywą jest wydzielenie komponentu elementu z własnym refem.

### Kiedy ref to zły wybór? {mid}

Gdy wartość wpływa na to, co widać na ekranie: zmiana refa nie wywoła renderu i UI pokaże stare dane.
Także wtedy, gdy imperatywne wywołania (`ref.current.open()`) zastępują to, co można wyrazić propsem
(`isOpen`). Refy to furtka do świata poza Reactem (DOM, timery, zewnętrzne biblioteki), a nie zamiennik
stanu.
