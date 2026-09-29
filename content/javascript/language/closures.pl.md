# Domknięcia (closures) {mid}

Domknięcie to funkcja **razem ze środowiskiem leksykalnym**, w którym została utworzona. Dzięki
temu funkcja ma dostęp do zmiennych z zakresu zewnętrznego także wtedy, gdy ten zakres już
zakończył działanie. W JavaScripcie **każda** funkcja jest domknięciem. Termin ma jednak znaczenie
praktyczne dopiero wtedy, gdy funkcja „przeżywa” zakres, w którym powstała.

```js
function makeCounter() {
  let count = 0
  return () => ++count
}

const next = makeCounter()
next() // 1
next() // 2
```

## Zakres leksykalny (statyczny)

O tym, jakie zmienne widzi funkcja, decyduje **miejsce jej zdefiniowania** w kodzie, a nie
miejsce wywołania:

```js
const x = 'global'

function outer() {
  const x = 'outer'
  return function inner() {
    return x
  }
}

function call(fn) {
  const x = 'call site'
  return fn()
}

call(outer()) // 'outer'
```

Przy odwołaniu do zmiennej silnik szuka jej po **łańcuchu zakresów**: najpierw w bieżącej funkcji,
potem w funkcji otaczającej i tak dalej aż do zakresu globalnego.

## Jak to działa w silniku

- Każde **wywołanie** funkcji tworzy nowe środowisko (environment record) z jej zmiennymi.
- Funkcja utworzona w środku ma ukryte odwołanie (`[[Environment]]`) do tego środowiska.
- Środowisko żyje tak długo, jak długo istnieje osiągalna funkcja, która go potrzebuje. Potem
  sprząta je garbage collector.

Z tego wynikają dwie ważne właściwości.

**Każde wywołanie ma własny stan.** Liczniki z dwóch wywołań `makeCounter()` są niezależne:

```js
const a = makeCounter()
const b = makeCounter()
a() // 1
a() // 2
b() // 1
```

**Domknięcie przechwytuje zmienną (wiązanie), a nie jej wartość w chwili utworzenia:**

```js
let n = 1
const read = () => n
n = 2
read() // 2
```

## Pętle: `var` kontra `let`

`var` ma zasięg funkcyjny: w całej pętli istnieje **jedna** zmienna. `let` w nagłówku pętli
`for` tworzy **nowe wiązanie w każdej iteracji**, więc każde domknięcie dostaje własną kopię.

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i)) // 3 3 3
for (let j = 0; j < 3; j++) setTimeout(() => console.log(j)) // 0 1 2
```

## Typowe wzorce

**Prywatny stan i moduły.** Przed klasami i modułami ES stosowano wzorzec modułu na IIFE:

```js
const wallet = (() => {
  let balance = 0 // niedostępne z zewnątrz
  return {
    deposit: (amount) => (balance += amount),
    getBalance: () => balance,
  }
})()
```

**Fabryki funkcji i częściowa aplikacja:**

```js
const multiply = (a) => (b) => a * b
const double = multiply(2)
double(5) // 10
```

**`once`: funkcja wykonywana tylko raz:**

```js
function once(fn) {
  let called = false
  let result
  return function (...args) {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}
```

**Memoizacja:**

```js
function memoize(fn) {
  const cache = new Map()
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg))
    return cache.get(arg)
  }
}
```

**Debounce**, czyli wywołanie dopiero po ustaniu serii zdarzeń (np. wpisywania):

```js
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}
```

## Domknięcia w React: stale closure

Każdy render komponentu to nowe wywołanie funkcji, więc handlery i efekty domykają propsy i stan
**z konkretnego renderu**. Jeśli callback żyje dłużej niż render, widzi przestarzałe wartości:

```tsx
function Timer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds(seconds + 1), 1000) // 🔴 seconds zawsze 0
    return () => clearInterval(id)
  }, [])
  return <p>{seconds}</p> // utknie na 1
}
```

Poprawka: `setSeconds((s) => s + 1)` (updater nie potrzebuje wartości z domknięcia) albo poprawne
zależności efektu.

## Domknięcia a pamięć

Dopóki funkcja jest osiągalna (np. zarejestrowana jako listener), jej środowisko z przechwyconymi
zmiennymi nie zostanie zwolnione. Silniki optymalizują to i zachowują tylko zmienne faktycznie
używane przez funkcje wewnętrzne. W V8 wszystkie funkcje utworzone w tym samym zakresie
współdzielą jednak **jeden obiekt kontekstu**. Mała, długo żyjąca funkcja może więc trzymać
w pamięci duży obiekt używany przez inną funkcję z tego samego zakresu.

## Źródła

- [Closures (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)
- [let (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let)
- [State as a snapshot (react.dev)](https://react.dev/learn/state-as-a-snapshot)

## Pytania

### Wyjaśnij własnymi słowami, czym jest domknięcie. {junior}

To funkcja, która pamięta środowisko (zmienne), w którym została utworzona, i ma do niego dostęp
także po zakończeniu zewnętrznej funkcji. Wynika to z zakresu leksykalnego: widoczność zmiennych
określa miejsce definicji funkcji w kodzie, a środowisko żyje tak długo, jak długo odwołuje się
do niego osiągalna funkcja.

### Co wypisze ten kod i jak go naprawić bez użycia `let`? {junior}

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i))
}
```

Wypisze `3, 3, 3`. `var` ma zasięg funkcyjny, więc wszystkie callbacki domykają **tę samą** zmienną
`i`, która po zakończeniu pętli wynosi `3`. Bez `let` można utworzyć nowy zakres dla każdej
iteracji przez IIFE albo przekazać wartość jako argument:

```js
for (var i = 0; i < 3; i++) {
  ;((j) => setTimeout(() => console.log(j)))(i)
}
// albo: setTimeout((j) => console.log(j), 0, i)
```

### Co zwrócą kolejne wywołania: `a()`, `a()`, `b()`, jeśli `a` i `b` pochodzą z dwóch wywołań `makeCounter()`? {junior}

`1`, `2`, `1`. Każde wywołanie `makeCounter()` tworzy **nowe** środowisko z własną zmienną `count`,
więc liczniki są od siebie niezależne.

### Zaimplementuj funkcję `once(fn)`. {mid}

Domknięcie przechowuje flagę i wynik pierwszego wywołania:

```js
function once(fn) {
  let called = false
  let result
  return function (...args) {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}
```

`fn.apply(this, args)` zachowuje `this` i argumenty, więc `once` działa też dla metod obiektów.

### Zaimplementuj `debounce`. Czym różni się od `throttle`? {mid}

```js
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}
```

**Debounce** wywołuje funkcję dopiero wtedy, gdy przez `delay` ms nie było kolejnego zdarzenia.
Przydaje się w wyszukiwarce przy wpisywaniu. **Throttle** wywołuje ją najwyżej raz na `delay` ms,
także w trakcie ciągłej serii zdarzeń. Przydaje się przy obsłudze scrolla i resize.

### Czym jest „stale closure” w React i jak go uniknąć? {mid}

Callback utworzony w jednym renderze domyka propsy i stan **z tego renderu**. Jeśli żyje dłużej
(interwał, subskrypcja, efekt z niepełnymi zależnościami), widzi przestarzałe wartości. Sposoby:
kompletne zależności efektu, updater `setX(x => x + 1)` zamiast odczytu z domknięcia,
`useEffectEvent` do odczytu najnowszych wartości albo `useRef`.

### Czy domknięcia mogą powodować wycieki pamięci? {senior}

Tak. Dopóki funkcja jest osiągalna, jej środowisko z przechwyconymi zmiennymi zostaje w pamięci.
Typowy przykład to listener lub interwał, którego nigdy nie usunięto, a który domyka duży obiekt
albo węzeł DOM. W V8 funkcje z tego samego zakresu współdzielą kontekst, więc żyjąca funkcja
może trzymać zmienne używane tylko przez inną. Rozwiązanie: sprzątanie (`removeEventListener`,
`clearInterval`, cleanup efektu) i nieprzechwytywanie niepotrzebnie dużych obiektów.

### Jak uzyskać prywatne dane w JavaScripcie? {junior}

Klasycznie przez domknięcia: zmienne w zakresie funkcji są niedostępne z zewnątrz, a udostępnia
się tylko zwrócone funkcje (wzorzec modułu). Współcześnie w klasach są też pola prywatne `#field`,
wymuszane przez język. Moduły ES również ukrywają wszystko, czego nie wyeksportowano.

### Co zwróci `call(outer())`, jeśli `outer` definiuje `x = 'outer'` i zwraca funkcję odczytującą `x`, a `call` ma własne `x = 'call site'`? {junior}

`'outer'`. JavaScript ma **zakres leksykalny**: funkcja widzi zmienne z miejsca, w którym została
**zdefiniowana**, a nie z miejsca wywołania. Zmienna `x` wewnątrz `call` nie jest dla zwróconej
funkcji widoczna. Zakresu dynamicznego (zależnego od wywołującego) JavaScript nie ma, choć podobnie
zachowuje się `this` w zwykłych funkcjach.

### Zaimplementuj `memoize`. Jakie ma ograniczenia? {mid}

```js
function memoize(fn) {
  const cache = new Map()
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg))
    return cache.get(arg)
  }
}
```

Domknięcie przechowuje `Map` z wynikami. Ograniczenia: klucze obiektowe porównywane są po referencji
(dwa identyczne literały to dwa wpisy), obsługiwany jest tylko pierwszy argument (inne są ignorowane,
co daje błędne wyniki), cache rośnie bez limitu (wyciek pamięci, ratunkiem jest limit LRU albo
`WeakMap` dla kluczy obiektowych), a funkcja musi być czysta.
