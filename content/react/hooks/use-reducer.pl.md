# useReducer {mid}

`useReducer` przenosi logikę aktualizacji stanu do **czystej funkcji** poza komponentem. Komponent
opisuje, **co się stało** (akcja), a reducer decyduje, **jak zmienia się stan**.

```tsx
type State = { items: Item[]; filter: 'all' | 'done' }
type Action =
  | { type: 'added'; text: string }
  | { type: 'toggled'; id: number }
  | { type: 'filterChanged'; filter: State['filter'] }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added':
      return { ...state, items: [...state.items, { id: Date.now(), text: action.text, done: false }] }
    case 'toggled':
      return { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, done: !i.done } : i)) }
    case 'filterChanged':
      return { ...state, filter: action.filter }
  }
}

function TodoApp() {
  const [state, dispatch] = useReducer(reducer, { items: [], filter: 'all' })
  return <AddTodo onAdd={(text) => dispatch({ type: 'added', text })} />
}
```

## Zasady

- Reducer musi być **czysty**: zwraca nowy stan na podstawie poprzedniego i akcji, bez mutacji, zapytań,
  losowości (`Date.now()` w przykładzie to uproszczenie, lepiej przekazać `id` w akcji) i efektów ubocznych.
  W `StrictMode` React wywołuje go **dwukrotnie**, żeby wykryć nieczystość.
- Stan jest **niemutowalny**: kopiuje się każdy poziom na ścieżce zmiany. Przy głęboko zagnieżdżonych
  danych pomaga Immer (`useImmerReducer`).
- Jeśli reducer zwróci **ten sam obiekt** (`Object.is`), React pomija render.
- `dispatch` ma **stałą tożsamość**, więc można go bezpiecznie przekazywać do dzieci, kontekstu i zależności
  efektów bez `useCallback`.
- Akcje nazywa się jak zdarzenia w czasie przeszłym (`added`, `filterChanged`), a nie jak polecenia
  (`setItems`). Opisują, co zrobił użytkownik.
- Trzeci argument to **leniwa inicjalizacja**: `useReducer(reducer, userId, createInitialState)`.
  `createInitialState(userId)` wykona się tylko przy montowaniu.

## `useReducer` czy `useState`

| `useState` | `useReducer` |
| --- | --- |
| prosta, niezależna wartość | kilka powiązanych pól zmienianych razem |
| aktualizacje rozproszone po handlerach | logika w jednym miejscu, łatwa do przeczytania |
| mało kodu | więcej kodu, ale reducer da się testować bez Reacta |
| | następny stan zależy od rodzaju zdarzenia |

`useState` jest w React zaimplementowany jako szczególny przypadek `useReducer`.

## Reducer + kontekst

Przy stanie potrzebnym w wielu miejscach łączy się `useReducer` z dwoma kontekstami: jeden ze stanem,
drugi z `dispatch`. Komponenty, które tylko wysyłają akcje, nie renderują się przy zmianie stanu, bo
`dispatch` jest stabilny. To lekka alternatywa dla zewnętrznej biblioteki. Przy częstych aktualizacjach
i wielu konsumentach lepiej jednak sprawdza się store z selektorami.

## Testowanie

Reducer to czysta funkcja, więc testuje się go jak zwykłą funkcję, bez renderowania:

```ts
expect(reducer(initial, { type: 'added', text: 'x' }).items).toHaveLength(1)
```

## Źródła

- [useReducer (react.dev)](https://react.dev/reference/react/useReducer)
- [Extracting state logic into a reducer (react.dev)](https://react.dev/learn/extracting-state-logic-into-a-reducer)
- [Scaling up with reducer and context (react.dev)](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [use-immer (GitHub)](https://github.com/immerjs/use-immer)

## Pytania

### Czym jest `useReducer` i jak działa? {junior}

To hook, który zarządza stanem przez funkcję `reducer(state, action) => newState`. Komponent wywołuje
`dispatch(action)` z opisem zdarzenia, React wywołuje reducer z bieżącym stanem i tą akcją, a zwrócona
wartość staje się nowym stanem i wywołuje render. Logika aktualizacji jest zebrana w jednym miejscu, poza
komponentem.

### Kiedy wybrać `useReducer` zamiast `useState`? {mid}

Gdy stan ma kilka powiązanych pól zmienianych razem, gdy następny stan zależy od rodzaju zdarzenia, gdy
logika aktualizacji rozrasta się i jest rozproszona po handlerach, albo gdy chcemy ją testować w izolacji.
Dla prostych, niezależnych wartości `useState` jest czytelniejszy i krótszy.

### Dlaczego reducer musi być czysty? {mid}

React może wywołać go wielokrotnie: w `StrictMode` w developmencie robi to celowo dwa razy, a przy renderowaniu
współbieżnym może powtórzyć lub porzucić pracę. Mutacja stanu, zapytanie HTTP czy losowość w reducerze
dałyby niespójne wyniki i zdublowane efekty. Efekty uboczne należą do handlerów zdarzeń i efektów, a wartości
losowe czy czas przekazuje się w akcji.

### Czy `dispatch` trzeba opakowywać w `useCallback`? {junior}

Nie. React gwarantuje, że `dispatch` ma tę samą tożsamość przez cały czas życia komponentu. Można go przekazywać
do dzieci w `memo`, do kontekstu i do tablic zależności efektów bez obaw o zbędne rendery czy ponowne
uruchamianie efektów.

### Co się stanie, jeśli reducer zmodyfikuje obiekt stanu i go zwróci? {mid}

React porówna stary i nowy stan przez `Object.is`. To ta sama referencja, więc uzna, że nic się nie zmieniło,
i pominie render, a UI nie pokaże zmiany. Dodatkowo mutacja może zepsuć inne mechanizmy polegające na
niezmienności (memoizację, porównania w efektach). Zawsze zwraca się nową kopię albo używa Immera.

### Jak zainicjalizować stan kosztownym obliczeniem w `useReducer`? {mid}

Trzecim argumentem: `useReducer(reducer, initialArg, init)`. React wywoła `init(initialArg)` tylko przy
pierwszym renderze. Wywołanie `useReducer(reducer, createInitialState(x))` liczyłoby stan przy każdym
renderze, a wynik i tak byłby ignorowany po montowaniu.

### Jak nazywać akcje i jaki mają mieć kształt? {junior}

Jako zdarzenia opisujące, co się stało (`added`, `itemRemoved`, `filterChanged`), a nie polecenia (`setItems`).
Akcja to obiekt z polem `type` i danymi potrzebnymi do obliczenia stanu. W TypeScript opisuje się je unią
dyskryminowaną, dzięki czemu reducer ma zawężone typy w każdej gałęzi, a kompilator wykryje nieobsłużoną akcję.

### Jak współdzielić stan z `useReducer` w wielu komponentach? {mid}

Umieścić `useReducer` w komponencie wysoko w drzewie i udostępnić stan oraz `dispatch` przez kontekst, najlepiej
w dwóch osobnych kontekstach. Komponenty, które tylko wysyłają akcje, korzystają z kontekstu `dispatch` (stabilnego)
i nie renderują się przy każdej zmianie stanu. Przy większej skali lepszy jest store z selektorami (Redux Toolkit,
Zustand).

### Jak testować logikę opartą na `useReducer`? {junior}

Reducer to zwykła czysta funkcja, więc testuje się go bez Reacta: podaje stan i akcję, a potem sprawdza zwrócony
stan. Testy są szybkie i deterministyczne. Integrację z komponentem (czy kliknięcie wysyła właściwą akcję
i wynik jest widoczny) sprawdza się osobno, testując zachowanie komponentu przez React Testing Library.

### Jaki jest związek między `useReducer` a Reduksem? {mid}

Oba opierają się na tym samym wzorcu: czysty reducer, akcje z `type`, niezmienny stan i `dispatch`. `useReducer`
to jednak stan **lokalny** komponentu, bez middleware (np. do asynchronicznych akcji), DevTools z historią
i selektorów ograniczających rendery. Redux (dziś Redux Toolkit) to globalny store z subskrypcjami. Znajomość
jednego ułatwia pracę z drugim.
