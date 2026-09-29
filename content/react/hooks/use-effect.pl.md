# useEffect {mid}

`useEffect` to „furtka” (escape hatch) do synchronizacji komponentu z **systemem zewnętrznym**,
czyli czymś, czym React nie zarządza: połączeniem sieciowym, subskrypcją, timerem, API przeglądarki,
widżetem spoza Reacta. Jeśli nie ma systemu zewnętrznego, efekt zwykle nie jest potrzebny.

```tsx
useEffect(() => {
  const connection = createConnection(serverUrl, roomId) // setup
  connection.connect()
  return () => connection.disconnect() // cleanup
}, [serverUrl, roomId]) // zależności
```

## Model mentalny: synchronizacja, nie cykl życia

Nie myśl o efekcie w kategoriach „po zamontowaniu” i „przed odmontowaniem”. Efekt opisuje,
**jak zacząć** synchronizację (setup) i **jak ją zakończyć** (cleanup). React sam decyduje, kiedy
to zrobić:

1. montowanie: `setup` z wartościami A,
2. zmiana zależności na B: `cleanup` z wartościami A, potem `setup` z wartościami B,
3. odmontowanie: `cleanup` z wartościami B.

Cleanup „widzi” wartości z renderu, w którym powstał efekt (to zwykłe domknięcie).

## Kiedy efekt się uruchamia

- **Po renderze i zatwierdzeniu zmian w DOM** (commit), zwykle po narysowaniu ekranu przez
  przeglądarkę, więc nie blokuje malowania.
- Jeśli render został wywołany interakcją (np. kliknięciem), React może uruchomić efekt jeszcze
  przed malowaniem, żeby wynik zdarzenia był od razu widoczny.
- `useLayoutEffect` działa synchronicznie po zmianach DOM, ale **przed** malowaniem. Służy do
  pomiarów layoutu (np. pozycji tooltipa), żeby uniknąć migania. Blokuje malowanie, więc używaj
  go oszczędnie.
- `useInsertionEffect` jest przeznaczony dla bibliotek CSS-in-JS (wstrzykiwanie stylów przed
  efektami layoutu).

## Tablica zależności

| Zależności | Kiedy uruchamia się efekt                     |
| ---------- | --------------------------------------------- |
| brak       | po każdym renderze                            |
| `[]`       | tylko po zamontowaniu                         |
| `[a, b]`   | po zamontowaniu i gdy `a` lub `b` się zmieni  |

- Każda zależność jest porównywana przez `Object.is` z wartością z poprzedniego renderu.
- W tablicy muszą się znaleźć **wszystkie wartości reaktywne** użyte w efekcie: propsy, stan
  i wszystko, co jest wyliczane w ciele komponentu. Pilnuje tego reguła lintera
  `react-hooks/exhaustive-deps`. Zależności nie „wybierasz”, one wynikają z kodu.
- Chcesz mniej zależności? **Zmień kod** tak, żeby wartość nie była potrzebna, zamiast ją
  pomijać i wyciszać linter.

### Pułapka: obiekty i funkcje jako zależności

Obiekt lub funkcja utworzone w ciele komponentu są **nowe przy każdym renderze**, więc efekt
uruchamia się za każdym razem:

```tsx
const options = { serverUrl, roomId } // 🔴 nowy obiekt przy każdym renderze
useEffect(() => {
  const connection = createConnection(options)
  connection.connect()
  return () => connection.disconnect()
}, [options]) // ponowne łączenie po każdym renderze
```

Rozwiązania, od najlepszego:

1. utwórz obiekt **wewnątrz** efektu i zależ od wartości prymitywnych (`[serverUrl, roomId]`),
2. przenieś stałe obiekty i funkcje **poza komponent**,
3. w ostateczności ustabilizuj referencję przez `useMemo` lub `useCallback`.

## Pobieranie danych i race condition

Gdy zależność zmienia się szybko (np. wpisywanie w wyszukiwarkę), odpowiedzi mogą przyjść
w innej kolejności niż zapytania. Starsza odpowiedź nadpisze wtedy nowszą. Cleanup to naprawia:

```tsx
useEffect(() => {
  let ignore = false
  fetchResults(query).then((json) => {
    if (!ignore) setResults(json)
  })
  return () => {
    ignore = true
  }
}, [query])
```

Albo z anulowaniem samego zapytania:

```tsx
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then((res) => res.json())
    .then(setResults)
    .catch((error) => {
      if (error.name !== 'AbortError') setError(error)
    })
  return () => controller.abort()
}, [query])
```

W prawdziwych aplikacjach zamiast ręcznego fetchowania w efektach lepiej użyć biblioteki
(TanStack Query, SWR) albo mechanizmu routera lub frameworka (np. `loader` w React Router).
Dają cache, deduplikację i obsługę wyścigów.

## Funkcje async w efekcie

Efekt musi zwrócić funkcję cleanup albo nic. Funkcja `async` zawsze zwraca promise, więc nie
można jej przekazać bezpośrednio. Zdefiniuj ją w środku i wywołaj:

```tsx
useEffect(() => {
  async function load() {
    const data = await fetchUser(id)
    setUser(data)
  }
  load()
}, [id])
```

## useEffectEvent: najnowsze wartości bez ponownej synchronizacji

Czasem efekt powinien **odczytać** aktualną wartość, ale nie **reagować** na jej zmianę.
Przykład: po połączeniu z pokojem pokazujemy powiadomienie w aktualnym motywie, ale zmiana
motywu nie powinna zrywać połączenia. Od Reacta 19.2 służy do tego `useEffectEvent`:

```tsx
const onConnected = useEffectEvent(() => {
  showNotification('Połączono!', theme) // zawsze aktualny theme
})

useEffect(() => {
  const connection = createConnection(serverUrl, roomId)
  connection.on('connected', () => onConnected())
  connection.connect()
  return () => connection.disconnect()
}, [roomId]) // theme i onConnected nie są zależnościami
```

Zdarzenia efektu wywołuj tylko z wnętrza efektów i nie przekazuj ich do innych komponentów.
Wcześniej stosowano do tego `useRef` przechowujący najnowszą wartość.

## Cleanup i StrictMode

W developmencie `StrictMode` montuje każdy komponent dwa razy (setup → cleanup → setup), żeby
ujawnić brakujący cleanup. Poprawnie napisany efekt zachowuje się tak samo przy jednym i przy
podwójnym uruchomieniu. W produkcji to się nie dzieje.

## Kiedy efekt NIE jest potrzebny

- **Dane wyliczane z propsów lub stanu**: licz w trakcie renderu (kosztowne obliczenia opakuj w `useMemo`).
- **Reset stanu przy zmianie propsa**: użyj `key`.
- **Logika wywołana zdarzeniem** (wysłanie formularza, powiadomienie po zakupie): umieść ją w handlerze.
- **Łańcuchy efektów**, gdzie jeden ustawia stan wyzwalający kolejny: wylicz wszystko w jednym handlerze.
- **Powiadamianie rodzica o zmianie**: wywołaj callback rodzica w tym samym handlerze, który zmienia stan.
- **Subskrypcja zewnętrznego store'u**: użyj `useSyncExternalStore`.

```tsx
// 🔴 zbędny stan i efekt: dodatkowy render z nieaktualną wartością
const [fullName, setFullName] = useState('')
useEffect(() => setFullName(`${first} ${last}`), [first, last])

// ✅ wyliczenie w renderze
const fullName = `${first} ${last}`
```

## Źródła

- [useEffect (react.dev)](https://react.dev/reference/react/useEffect)
- [Synchronizing with Effects (react.dev)](https://react.dev/learn/synchronizing-with-effects)
- [You Might Not Need an Effect (react.dev)](https://react.dev/learn/you-might-not-need-an-effect)
- [Separating Events from Effects (react.dev)](https://react.dev/learn/separating-events-from-effects)
- [useEffectEvent (react.dev)](https://react.dev/reference/react/useEffectEvent)

## Pytania

### Kiedy dokładnie uruchamia się `useEffect` i czym różni się od `useLayoutEffect`? {mid}

`useEffect` uruchamia się po zatwierdzeniu renderu w DOM, zwykle po narysowaniu ekranu, więc nie
blokuje malowania. Jeśli render wywołała interakcja, React może uruchomić go przed malowaniem.
`useLayoutEffect` działa synchronicznie po zmianach DOM, ale zawsze **przed** malowaniem. Nadaje się
do pomiarów layoutu i korekt pozycji, które inaczej dałyby widoczne mignięcie. Kosztem jest
blokowanie malowania.

### Do czego służy funkcja cleanup i w jakiej kolejności React ją wywołuje? {mid}

Cofa to, co zrobił setup: zamyka połączenia, usuwa listenery, czyści timery, anuluje zapytania.
Przy zmianie zależności React najpierw wywołuje cleanup **poprzedniego** efektu (ze starymi
wartościami), a potem setup nowego. Przy odmontowaniu wywołuje ostatni cleanup.

### Dlaczego w trybie deweloperskim efekt uruchamia się dwa razy? {junior}

`StrictMode` w developmencie symuluje odmontowanie i ponowne zamontowanie komponentu (setup →
cleanup → setup). Sprawdza w ten sposób, czy cleanup poprawnie cofa setup. Jeśli podwójne
uruchomienie coś psuje (np. dwa połączenia albo dwa wysłane zapytania analityczne), brakuje
cleanupu. W produkcji efekt uruchamia się raz.

### Czym jest race condition przy pobieraniu danych w efekcie i jak jej uniknąć? {mid}

Przy szybkich zmianach zależności (np. `query`) odpowiedzi mogą przyjść w innej kolejności niż
zapytania i starsza nadpisze nowszą. Rozwiązanie to cleanup: flaga `ignore` ustawiana na `true`,
żeby zignorować spóźnioną odpowiedź, albo `AbortController.abort()`, który anuluje zapytanie.
W praktyce lepiej użyć biblioteki do pobierania danych albo loadera routera.

### Dlaczego efekt z obiektem w zależnościach uruchamia się po każdym renderze? {mid}

Zależności są porównywane przez `Object.is`, czyli po referencji. Obiekt lub funkcja utworzone
w ciele komponentu to nowa referencja przy każdym renderze. Należy przenieść tworzenie obiektu do
efektu i zależeć od prymitywów, przenieść go poza komponent albo ustabilizować przez
`useMemo`/`useCallback`.

### Dlaczego nie można napisać `useEffect(async () => { ... })`? {junior}

React oczekuje, że efekt zwróci funkcję cleanup albo `undefined`. Funkcja `async` zawsze zwraca
promise, więc React nie miałby czego wywołać jako cleanup (w developmencie wypisze ostrzeżenie).
Funkcję async definiuje się wewnątrz efektu i wywołuje, a wyścigi obsługuje w cleanupie.

### Jak odczytać w efekcie najnowszą wartość propsa, nie dodając jej do zależności? {senior}

Za pomocą `useEffectEvent` (React 19.2+). Funkcja utworzona tym hookiem zawsze widzi najnowsze
propsy i stan, ale nie jest wartością reaktywną, więc nie trafia do zależności i jej zmiana nie
restartuje efektu. W starszych wersjach stosowano `useRef` aktualizowany przy każdym renderze.

### Czy można pominąć zależność i wyciszyć ostrzeżenie lintera? {mid}

Nie powinno się tego robić. Efekt użyje wtedy nieaktualnej wartości z domknięcia (stale closure),
co prowadzi do trudnych do wykrycia błędów. Należy zmienić kod tak, żeby zależność nie była
potrzebna: użyć updatera `setX(x => ...)`, przenieść obiekt do efektu, wydzielić zdarzenie efektu
albo przenieść logikę do handlera.

### Kiedy **nie** potrzebujesz `useEffect`? {mid}

Gdy nie synchronizujesz się z systemem zewnętrznym. Wartości wyliczalne z propsów lub stanu licz
w renderze. Reset stanu przy zmianie propsa rób przez `key`. Logikę wynikającą ze zdarzeń
(kliknięcie, wysłanie formularza) umieść w handlerach. Do subskrypcji zewnętrznych store'ów użyj
`useSyncExternalStore`. Zbędne efekty powodują dodatkowe rendery i chwilowo niespójny UI.

```tsx
// ❌ zbędny stan i efekt
const [fullName, setFullName] = useState('')
useEffect(() => setFullName(`${first} ${last}`), [first, last])

// ✅ wyliczenie w renderze
const fullName = `${first} ${last}`
```

### W jakiej kolejności React uruchamia efekty rodzica i dziecka? {mid}

Render idzie od góry (rodzic, potem dziecko), ale efekty przy montowaniu wykonują się **od dołu**:
najpierw `useLayoutEffect` dziecka, potem rodzica, a po nich `useEffect` dziecka i rodzica. Dzięki
temu rodzic w swoim efekcie może polegać na tym, że efekty dzieci (np. pomiary, podpięte refy) już się
wykonały. Najpierw zawsze idą wszystkie efekty layoutu, dopiero potem efekty zwykłe. Na kolejności
cleanupów przy odmontowaniu nie należy budować logiki.
