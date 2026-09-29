# useMemo, useCallback i React.memo {mid}

Trzy narzędzia do **memoizacji**, czyli zapamiętywania wyniku między renderami. Są
**optymalizacjami wydajności**, a nie mechanizmem poprawności: kod musi działać tak samo bez nich.

```tsx
const visibleTodos = useMemo(() => filterTodos(todos, tab), [todos, tab]) // wartość
const handleSubmit = useCallback((data) => post(url, data), [url])      // funkcja
const List = memo(function List({ items, onSelect }) { /* ... */ })     // komponent
```

## Po co to w ogóle

Przy każdym renderze funkcja komponentu wykonuje się od nowa, więc:

1. kosztowne obliczenia liczą się ponownie,
2. obiekty, tablice i funkcje tworzone w komponencie to **nowe referencje** przy każdym renderze.

Punkt 2 ma znaczenie tylko wtedy, gdy referencja jest **porównywana**: w propsach komponentu
opakowanego w `memo` albo w tablicy zależności `useEffect`, `useMemo` czy `useCallback`. React
porównuje wartości przez `Object.is`, czyli obiekty i funkcje po referencji.

## `useMemo`

Zapamiętuje **wynik** funkcji i przelicza go tylko wtedy, gdy zmieni się któraś zależność.

Ma sens, gdy:

- obliczenie jest zauważalnie wolne (np. filtrowanie tysięcy elementów), a zależności zmieniają się
  rzadko,
- wynik trafia jako prop do komponentu w `memo`,
- wynik jest zależnością innego hooka.

W innych przypadkach nie pomaga, a jedynie zaciemnia kod. W `StrictMode` (dev) React wywołuje funkcję
dwa razy, żeby wykryć nieczystość. Zapamiętana wartość to optymalizacja, a nie gwarancja: React może
porzucić cache (np. gdy komponent zawiesi się przy pierwszym montowaniu). Jeśli wartość musi przetrwać,
potrzebny jest stan albo ref.

## `useCallback`

Zapamiętuje **samą funkcję**, a nie wynik jej wywołania. `useCallback(fn, deps)` to dokładnie
`useMemo(() => fn, deps)`. Sam z siebie **niczego nie przyspiesza**: funkcja i tak jest tworzona przy
każdym renderze, a React tylko zwraca poprzednią referencję. Przydaje się, gdy funkcja trafia:

- do dziecka opakowanego w `memo`,
- do tablicy zależności efektu (u siebie lub w dziecku),
- jako wynik własnego hooka, którego użytkownicy mogą jej użyć w zależnościach.

## `React.memo`

Opakowany komponent pomija render, jeśli **wszystkie propsy są płytko równe** (`Object.is` dla
każdego). Wystarczy jeden nowy obiekt, tablica lub funkcja w propsach, żeby memoizacja przestała działać:

```tsx
const Child = memo(Child)

<Child onClick={() => save()} />         // 🔴 nowa funkcja: render za każdym razem
<Child style={{ color: 'red' }} />       // 🔴 nowy obiekt: render za każdym razem
<Child onClick={handleClick} />          // ✅ gdy handleClick pochodzi z useCallback
```

`memo` nie blokuje renderów wywołanych zmianą **własnego stanu** komponentu ani zmianą **kontekstu**,
z którego korzysta. Można podać własną funkcję porównującą `memo(C, (prev, next) => ...)`, ale łatwo
w niej o błąd, np. pominięcie funkcji z nowym domknięciem.

## Zanim sięgniesz po memoizację

Często lepsze są zmiany struktury:

- **przenieś stan niżej**: stan używany tylko przez fragment UI umieść w mniejszym komponencie,
- **przekazuj JSX jako `children`**: elementy utworzone wyżej nie renderują się ponownie, gdy zmienia
  się stan wrappera,
- trzymaj render czysty i unikaj zbędnych efektów aktualizujących stan.

## React Compiler

React Compiler (stabilny od wersji 1.0, październik 2025) automatycznie memoizuje komponenty i wartości
w czasie budowania, więc w nowym kodzie ręczne `useMemo`/`useCallback`/`memo` są rzadko potrzebne.
Zespół Reacta zaleca, by w istniejącym kodzie **nie usuwać** ręcznej memoizacji bez testów (może to
zmienić wynik kompilacji), a `useMemo`/`useCallback` traktować jako furtkę, gdy potrzebna jest pełna
kontrola, np. nad zależnościami efektu. Kompilator obsługuje React 17+. Reguły lintera oparte na
kompilatorze są w `eslint-plugin-react-hooks`.

## Źródła

- [useMemo (react.dev)](https://react.dev/reference/react/useMemo)
- [useCallback (react.dev)](https://react.dev/reference/react/useCallback)
- [memo (react.dev)](https://react.dev/reference/react/memo)
- [React Compiler v1.0 (react.dev blog)](https://react.dev/blog/2025/10/07/react-compiler-1)

## Pytania

### Czym różni się `useMemo` od `useCallback`? {junior}

`useMemo` zapamiętuje **wynik** wywołania funkcji, a `useCallback` zapamiętuje **samą funkcję**.
`useCallback(fn, deps)` jest równoważne `useMemo(() => fn, deps)`. Oba zwracają tę samą referencję,
dopóki zależności (porównywane przez `Object.is`) się nie zmienią.

### Czy warto opakować każdą funkcję w `useCallback`, a każdą wartość w `useMemo`? {mid}

Nie. Memoizacja pomaga tylko wtedy, gdy obliczenie jest kosztowne albo referencja jest porównywana
(prop komponentu w `memo`, zależność hooka). W innych przypadkach nie daje korzyści, a dodaje koszt
porównywania zależności i pogarsza czytelność. `useCallback` bez `memo` w dziecku i bez użycia w
zależnościach jest bezużyteczny, bo funkcja i tak jest tworzona przy każdym renderze.

### Dlaczego komponent w `React.memo` nadal się renderuje? {mid}

Najczęściej któryś prop to nowa referencja przy każdym renderze rodzica: funkcja strzałkowa w JSX,
literał obiektu lub tablicy, a nawet `children` jako JSX (każdy element to nowy obiekt). Inne powody:
zmienia się stan samego komponentu albo kontekst, z którego korzysta (`useContext`), bo `memo` porównuje
tylko propsy. Rozwiązania: `useCallback`/`useMemo` dla przekazywanych wartości albo zmiana struktury.

### Jak ograniczyć zbędne rendery bez memoizacji? {mid}

Przenieść stan niżej, do komponentu, który go faktycznie używa, dzięki czemu reszta drzewa się nie
renderuje. Przekazywać ciężkie poddrzewa jako `children` (lub inne propsy z JSX): elementy utworzone
przez rodzica wyżej nie renderują się ponownie przy zmianie stanu wrappera. Dzielić duże konteksty
i unikać efektów, które tylko kopiują dane do stanu.

### Czy `useMemo` gwarantuje, że obliczenie nie wykona się ponownie? {senior}

Nie. To wyłącznie optymalizacja. React może porzucić cache, np. w developmencie przy edycji pliku czy
gdy komponent zawiesi się (Suspense) przy pierwszym montowaniu. W `StrictMode` funkcja wykonuje się dwa
razy. Kod nie może polegać na `useMemo` semantycznie. Jeśli wartość musi być utworzona dokładnie raz,
używa się leniwie inicjalizowanego stanu (`useState(() => create())`) albo refa.

### Po co `useCallback` przy funkcji używanej w `useEffect`? {mid}

Funkcja zdefiniowana w komponencie jest nowa przy każdym renderze. Jeśli jest zależnością efektu, efekt
uruchamiałby się po każdym renderze. `useCallback` stabilizuje referencję, więc efekt reaguje tylko na
zmianę faktycznych zależności funkcji. Często prostsze jest jednak przeniesienie funkcji **do środka
efektu** albo poza komponent.

### Jak działa porównanie propsów w `React.memo` i kiedy użyć własnej funkcji porównującej? {mid}

Domyślnie `memo` porównuje każdy prop przez `Object.is`, czyli płytko: prymitywy po wartości, obiekty
i funkcje po referencji. Drugi argument `memo(Component, arePropsEqual)` pozwala napisać własne
porównanie, np. tylko po `id`. Trzeba jednak uwzględnić **wszystkie** propsy wpływające na wynik, także
funkcje. Pominięcie callbacku sprawi, że komponent użyje nieaktualnego domknięcia. Głębokie porównanie
bywa droższe niż sam render.

### Co zmienia React Compiler w kontekście memoizacji? {mid}

Kompilator analizuje komponenty i hooki w czasie budowania i automatycznie memoizuje wartości, funkcje
i JSX, więc w nowym kodzie ręczne `useMemo`, `useCallback` i `memo` są rzadko potrzebne. Wymaga, by kod
przestrzegał zasad Reacta (czysty render, brak mutacji propsów i stanu). Istniejącej memoizacji nie
należy usuwać bez testów. `useMemo`/`useCallback` zostają jako furtka do precyzyjnej kontroli. Działa
z React 17+ i jest stabilny od wersji 1.0 (2025).

### Czy przekazanie `children` łamie `React.memo`? {senior}

Tak, jeśli `children` to JSX tworzony w renderze rodzica. Każdy element JSX to nowy obiekt, więc płytkie
porównanie propsów uzna je za różne i `memo` nic nie da. Rozwiązania: zmemoizować element (`useMemo`
wokół JSX), przekazywać dane zamiast JSX albo przenieść `memo` na komponent, który faktycznie jest
kosztowny.

### Dlaczego `useMemo` może przeliczać się przy każdym renderze, choć jego wejścia wyglądają na niezmienione? {mid}

Zależności są porównywane przez `Object.is`, więc obiekt, tablica albo funkcja utworzone podczas renderu są za każdym razem nową wartością:
`useMemo(() => filter(items, options), [items, options])` przelicza się przy każdym renderze, jeśli `options` to obiekt w miejscu, np. `{ sort: 'asc' }`. Należy zależeć od
wartości prymitywnych (`options.sort`), zmemoizować samą zależność albo utworzyć ją poza komponentem. To samo dotyczy `useCallback`, `useEffect` i propsów `React.memo`.
