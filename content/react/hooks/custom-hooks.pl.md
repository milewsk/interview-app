# Własne hooki {mid}

Własny hook to zwykła funkcja, której nazwa zaczyna się od `use` i która wywołuje inne hooki. Pozwala
wydzielić i ponownie użyć **logikę ze stanem i efektami**: subskrypcje, pobieranie danych, obsługę
formularza, synchronizację z przeglądarką.

```tsx
function useOnlineStatus() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback)
      window.addEventListener('offline', callback)
      return () => {
        window.removeEventListener('online', callback)
        window.removeEventListener('offline', callback)
      }
    },
    () => navigator.onLine,     // wartość na kliencie
    () => true,                 // wartość przy SSR
  )
}

function StatusBar() {
  const isOnline = useOnlineStatus()
  return <p>{isOnline ? '✅ Online' : '❌ Offline'}</p>
}
```

## Zasady

- Nazwa **musi** zaczynać się od `use`. Po tym linter (`eslint-plugin-react-hooks`) rozpoznaje hook
  i sprawdza w nim zasady hooków (wywołania tylko na najwyższym poziomie, bez warunków).
- Hook **współdzieli logikę, a nie stan**. Każde wywołanie ma własny, niezależny stan. Dwa komponenty
  wywołujące `useToggle()` mają dwa osobne przełączniki. Do współdzielenia stanu służy podniesienie go,
  kontekst albo store.
- Hook jest wywoływany przy **każdym renderze** komponentu i dostaje jego aktualne propsy i stan. Jest
  częścią ciała komponentu, więc musi być tak samo czysty.
- Funkcja, która nie wywołuje żadnych hooków, nie powinna mieć prefiksu `use`. To zwykła funkcja
  pomocnicza.

## Przykłady

```tsx
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}
```

## Projektowanie API hooka

- Zwracaj **krotkę** (`[value, setValue] as const`), gdy wartości są dwie i użytkownik ma je nazywać po
  swojemu. Przy większej liczbie zwracaj **obiekt** z nazwanymi polami.
- Funkcje zwracane z hooka opakuj w `useCallback` (a obiekty w `useMemo`), jeśli mogą trafić do
  zależności efektów lub propsów komponentów w `memo`.
- Hooki mają opisywać **konkretny cel** (`useChatRoom`, `useOnlineStatus`). Antywzorcem są „hooki cyklu
  życia” w rodzaju `useMount(fn)` czy `useEffectOnce`, które ukrywają zależności i omijają linter.
- Zanim napiszesz `useFetch`, rozważ bibliotekę (TanStack Query, SWR). Rozwiązuje cache, deduplikację,
  wyścigi i ponawianie, czego prosty hook zwykle nie robi.

## Testowanie

`renderHook` z React Testing Library renderuje hook w komponencie testowym:

```tsx
const { result } = renderHook(() => useCounter())
act(() => result.current.increment())
expect(result.current.count).toBe(1)
```

Często lepiej jednak testować komponent, który używa hooka, bo test sprawdza wtedy zachowanie widoczne
dla użytkownika.

## Źródła

- [Reusing logic with custom Hooks (react.dev)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Rules of Hooks (react.dev)](https://react.dev/reference/rules/rules-of-hooks)
- [useSyncExternalStore (react.dev)](https://react.dev/reference/react/useSyncExternalStore)
- [renderHook (Testing Library)](https://testing-library.com/docs/react-testing-library/api/#renderhook)

## Pytania

### Czym jest własny hook i po co go tworzyć? {junior}

To funkcja o nazwie zaczynającej się od `use`, która wywołuje inne hooki. Wydziela logikę ze stanem
i efektami (subskrypcje, pobieranie danych, obsługę formularzy) tak, aby można jej było użyć w wielu
komponentach bez kopiowania kodu. Komponenty stają się krótsze i opisują, **co** robią, a nie **jak**.

### Czy dwa komponenty używające tego samego hooka współdzielą stan? {junior}

Nie. Hook współdzieli **logikę**, a każde wywołanie tworzy własny, niezależny stan i efekty, tak jakby
kod hooka był wklejony w każdy komponent. Aby komponenty korzystały z tego samego stanu, trzeba go podnieść
do wspólnego rodzica, udostępnić przez kontekst albo trzymać w zewnętrznym store.

### Dlaczego nazwa hooka musi zaczynać się od `use`? {mid}

To konwencja, na której opierają się narzędzia: linter rozpoznaje po niej hooki i sprawdza w nich zasady
(brak wywołań warunkowych, kompletne zależności), a React Compiler traktuje je inaczej niż zwykłe funkcje.
Czytelnik od razu wie, że funkcja może mieć stan i efekty oraz musi być wywoływana na najwyższym poziomie
komponentu.

### Czy funkcja pomocnicza bez hooków w środku powinna nazywać się `useX`? {junior}

Nie. Prefiks `use` jest dla funkcji, które wywołują hooki. Zwykła funkcja (np. formatowanie daty, filtr
listy) powinna mieć zwykłą nazwę, bo wtedy można jej używać wszędzie, także warunkowo i poza komponentami.
Oznaczenie jej jako hooka niepotrzebnie ograniczałoby miejsca użycia.

### Co zwracać z hooka: krotkę czy obiekt? {mid}

Krotkę (`[value, setValue] as const`), gdy są dwie ściśle powiązane wartości, a użytkownik ma je swobodnie
nazwać, tak jak w `useState`. Obiekt, gdy wartości jest więcej lub są opcjonalne, bo nazwane pola są
czytelniejsze i odporne na zmianę kolejności. W TypeScript krotka wymaga `as const`.

### Dlaczego funkcje zwracane z własnego hooka warto opakować w `useCallback`? {mid}

Użytkownicy hooka mogą umieścić zwróconą funkcję w tablicy zależności efektu albo przekazać ją do komponentu
w `memo`. Nowa funkcja przy każdym renderze powodowałaby ponowne uruchamianie efektu lub zbędne rendery.
Stabilizacja w hooku oszczędza wszystkim użytkownikom pilnowania tego samodzielnie.

### Czemu `useMount` / `useEffectOnce` uważa się za antywzorzec? {senior}

Ukrywają `useEffect` z pustą tablicą zależności, więc linter nie sprawdza, czy efekt nie używa wartości
reaktywnych. Prowadzi to do nieaktualnych domknięć i błędów przy zmianie propsów. Myślą też kategoriami cyklu
życia, a nie synchronizacji. Hook powinien mieć konkretny cel (`useChatConnection(roomId)`) i jawne zależności.

### Jak napisać hook subskrybujący zewnętrzne źródło danych (np. status online, szerokość okna)? {mid}

Najlepiej przez `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`. `subscribe` rejestruje
listener i zwraca funkcję wypisującą, a `getSnapshot` zwraca bieżącą wartość. Ta wartość musi być stabilna,
czyli dla tych samych danych zwracać tę samą referencję. React sam zadba o spójność przy renderowaniu
współbieżnym i o hydrację. Kombinacja `useEffect` + `useState` jest bardziej podatna na błędy.

### Jak testować własne hooki? {mid}

Przez `renderHook` z React Testing Library: `const { result } = renderHook(() => useCounter())`, akcje
w `act()` i asercje na `result.current`. Parametry zmienia się przez `rerender(newProps)`, a kontekst podaje
opcją `wrapper`. Hooki silnie związane z UI często lepiej testować pośrednio, przez komponent, który z nich
korzysta.

### Kiedy nie pisać własnego `useFetch`? {mid}

Prawie zawsze, gdy aplikacja poważnie pobiera dane. Prosty `useFetch` zwykle nie obsługuje cache,
deduplikacji zapytań, anulowania, wyścigów, ponawiania, odświeżania w tle ani unieważniania po mutacjach.
Biblioteki (TanStack Query, SWR, RTK Query) albo loadery routera rozwiązują to kompleksowo. Własny hook
ma sens dla prostych, jednorazowych przypadków.
