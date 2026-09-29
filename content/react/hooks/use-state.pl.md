# useState {junior}

`useState` dodaje do komponentu funkcyjnego lokalny stan. Zwraca parę: **aktualną wartość**
i **funkcję ustawiającą** (setter), która planuje aktualizację i ponowny render.

```tsx
const [count, setCount] = useState(0)

return <button onClick={() => setCount(count + 1)}>{count}</button>
```

## Jak to działa pod spodem

React przechowuje stan **poza funkcją komponentu**, w wewnętrznej strukturze (fiber) powiązanej
z konkretnym miejscem komponentu w drzewie. Przy każdym renderze funkcja komponentu wykonuje się
od nowa, a `useState` zwraca wartość zapamiętaną przez Reacta.

Hooki **nie mają nazw ani kluczy**. React rozpoznaje je wyłącznie po **kolejności wywołań**.
Stąd zasady hooków (Rules of Hooks):

- wywołuj hooki tylko na najwyższym poziomie komponentu lub własnego hooka,
- nigdy w warunkach, pętlach, po wczesnym `return` ani w zagnieżdżonych funkcjach.

```tsx
// 🔴 kolejność hooków zmienia się między renderami
if (isLoggedIn) {
  const [name, setName] = useState('')
}
```

## Stan jako migawka (snapshot)

Każdy render ma **własną, niezmienną kopię** stanu. Setter nie zmienia zmiennej `count`
w bieżącym renderze. Zapisuje jedynie żądanie zmiany, a nowa wartość pojawi się dopiero
w następnym renderze.

```tsx
function handleClick() {
  setCount(count + 1)
  console.log(count) // wciąż stara wartość, np. 0
  setTimeout(() => alert(count), 3000) // też 0: domknięcie „pamięta” render
}
```

## Kolejka aktualizacji i batching

Od Reacta 18 działa **automatyczny batching**. Wiele wywołań setterów w jednym zdarzeniu
(także w `setTimeout`, promise'ach i natywnych listenerach) daje **jeden** render.

Setter przyjmuje wartość albo **funkcję aktualizującą** (updater). React przetwarza kolejkę
w kolejności wywołań: wartość zastępuje stan, a funkcja dostaje wynik poprzedniego kroku.

```tsx
// number === 0
setNumber(number + 5) // zastąp: 5
setNumber((n) => n + 1) // 5 + 1 = 6
// następny render: number === 6
```

Konwencja: parametr updatera nazywa się od pierwszej litery stanu (`c` dla `count`)
albo `prev` (`prevCount`).

Jeśli wyjątkowo potrzebujesz, żeby DOM zaktualizował się synchronicznie (np. przed przewinięciem
do nowego elementu listy), użyj `flushSync` z `react-dom`.

## Kiedy React pomija render

React porównuje nowy stan z poprzednim przez `Object.is`. Jeśli są równe, pomija ponowny render
komponentu i jego dzieci. Czasem musi jeszcze raz wywołać sam komponent, zanim zdecyduje
o pominięciu, ale nie wpływa to na wynik.

Konsekwencja: **mutacja obiektu w miejscu nie wywoła renderu**, bo referencja się nie zmienia.

## Aktualizacja obiektów i tablic (niemutowalność)

Stan traktuj jak tylko do odczytu. Zawsze twórz nową wartość:

```tsx
// obiekt
setUser({ ...user, name: 'Ala' })
// zagnieżdżony obiekt: kopiujesz każdy poziom na ścieżce zmiany
setUser({ ...user, address: { ...user.address, city: 'Kraków' } })

// tablice
setItems([...items, newItem]) // dodanie
setItems(items.filter((i) => i.id !== id)) // usunięcie
setItems(items.map((i) => (i.id === id ? { ...i, done: true } : i))) // zmiana elementu
setItems(items.toSorted((a, b) => a.order - b.order)) // sortowanie kopii (ES2023)
```

Metody mutujące (`push`, `splice`, `sort`, `reverse`, przypisanie `arr[i] = x`) wywołuj tylko
na kopii. Przy głęboko zagnieżdżonym stanie pomocna jest biblioteka Immer (`useImmer`)
albo spłaszczenie struktury danych.

## Leniwa inicjalizacja

Wartość początkowa jest używana tylko przy pierwszym renderze. Jeśli jej wyliczenie jest kosztowne,
przekaż **funkcję**, a nie jej wynik:

```tsx
const [todos, setTodos] = useState(createInitialTodos()) // 🔴 wywołanie przy każdym renderze
const [todos, setTodos] = useState(createInitialTodos) // ✅ tylko raz
```

## Resetowanie stanu przez `key`

Stan jest przypisany do **pozycji komponentu w drzewie**. Ten sam komponent w tym samym miejscu
zachowuje stan, nawet gdy zmieniają się propsy. Zmiana `key` każe Reactowi utworzyć komponent
od nowa, z czystym stanem:

```tsx
<ProfileForm key={userId} userId={userId} />
```

## Czego nie trzymać w stanie

- **Wartości, które da się wyliczyć** z propsów lub innego stanu. Wylicz je w trakcie renderu
  (ewentualnie z `useMemo`), zamiast synchronizować efektem.
- **Kopii propsów**. `useState(props.color)` zapamięta tylko pierwszą wartość. Jeśli to celowe,
  nazwij prop `initialColor`.
- **Wartości, które nie wpływają na wygląd** (id timera, poprzednia wartość do porównań). Do tego
  służy `useRef`, którego zmiana nie powoduje renderu.

## useState a useReducer

`useReducer` sprawdza się, gdy kilka wartości zmienia się razem, gdy następny stan zależy
od typu zdarzenia albo gdy logika aktualizacji rośnie i chcesz ją testować jako czystą funkcję
poza komponentem.

## Źródła

- [useState (react.dev)](https://react.dev/reference/react/useState)
- [State as a snapshot (react.dev)](https://react.dev/learn/state-as-a-snapshot)
- [Queueing a series of state updates (react.dev)](https://react.dev/learn/queueing-a-series-of-state-updates)
- [Updating objects in state (react.dev)](https://react.dev/learn/updating-objects-in-state)
- [Preserving and resetting state (react.dev)](https://react.dev/learn/preserving-and-resetting-state)

## Pytania

### Dlaczego `setCount(count + 1)` wywołane dwa razy w jednym handlerze zwiększa licznik tylko o 1? {junior}

Oba wywołania widzą tę samą wartość `count` z bieżącego renderu (migawka), więc obie aktualizacje
ustawiają `count + 1`. React grupuje je w jeden render. Rozwiązaniem jest updater, który dostaje
najnowszy stan z kolejki:

```tsx
setCount((c) => c + 1)
setCount((c) => c + 1) // +2
```

### Jaka będzie wartość `number` po kliknięciu, jeśli handler wywołuje `setNumber(number + 5)`, a potem `setNumber(n => n + 1)`? {mid}

Przy `number === 0` wynik to **6**. React przetwarza kolejkę po kolei: `number + 5` to zwykła wartość,
więc zastępuje stan (`5`), a updater dostaje ten wynik i zwraca `5 + 1`. Gdyby na końcu było
jeszcze `setNumber(42)`, wynik wyniósłby 42, bo wartość zastępuje wszystko, co było wcześniej.

### Czy setter z `useState` jest synchroniczny? {junior}

Nie. Setter **kolejkuje** aktualizację, a zmienna w bieżącym renderze nigdy się nie zmienia
(to stała z domknięcia). Nowa wartość jest dostępna w następnym renderze. Jeśli potrzebujesz jej
od razu, wylicz ją wcześniej do zmiennej (`const next = count + 1; setCount(next); use(next)`).

### Czym różni się `useState(expensive())` od `useState(() => expensive())`? {mid}

W pierwszym przypadku `expensive()` wykonuje się przy **każdym** renderze, choć wynik jest używany
tylko przy pierwszym. W drugim React wywoła funkcję inicjalizującą tylko raz. W trybie `StrictMode`
w developmencie wywoła ją dwukrotnie, żeby wykryć nieczyste funkcje.

### Dlaczego mutowanie obiektu w stanie nie powoduje rerenderu? {junior}

React porównuje poprzedni i nowy stan przez `Object.is`. Po mutacji referencja jest ta sama, więc
React uznaje stan za niezmieniony i pomija render. Nawet jeśli render nastąpi z innego powodu,
mutacja psuje założenia reszty kodu, np. porównania w `memo`, `useMemo` i zależności efektów.
Należy utworzyć nową kopię, np. `setUser({ ...user, name })`.

### Czy wywołanie settera z tą samą wartością spowoduje render? {mid}

Zwykle nie. Jeśli `Object.is(nowy, stary)` zwraca `true`, React pomija render komponentu i jego dzieci.
Może jednak jeszcze raz wywołać funkcję komponentu, zanim zdecyduje o pominięciu. Dlatego render
musi być czysty i nie wolno polegać na tym, ile razy się wykona.

### Dlaczego nie można wywoływać hooków warunkowo? {junior}

React przypisuje stan do hooków **według kolejności wywołań** w komponencie. Jeśli w jednym renderze
hook zostanie pominięty, wszystkie kolejne dostaną stan „przesunięty” o jedną pozycję. Dlatego hooki
muszą być wywoływane w tej samej kolejności przy każdym renderze.

### Jak zresetować stan komponentu, gdy zmienia się prop (np. `userId`)? {mid}

Najprościej nadać komponentowi `key={userId}`. React potraktuje go jako nowy komponent i utworzy
stan od zera. Nie jest potrzebny efekt, który resetowałby stan, bo taki efekt powoduje dodatkowy
render z nieaktualnymi danymi.

### Co oznacza błąd „Too many re-renders”? {junior}

Setter został wywołany **bezwarunkowo w trakcie renderu**, więc każdy render planuje następny.
Najczęstsza przyczyna to `onClick={setOpen(true)}` zamiast `onClick={() => setOpen(true)}`.

### Kiedy wybrać `useReducer` zamiast `useState`? {mid}

Gdy stan ma kilka powiązanych pól zmienianych razem, gdy przejścia zależą od rodzaju akcji
(`'added'`, `'deleted'`…) albo gdy chcesz wydzielić i przetestować logikę aktualizacji jako czystą
funkcję. Przy prostych, niezależnych wartościach `useState` jest czytelniejszy.
