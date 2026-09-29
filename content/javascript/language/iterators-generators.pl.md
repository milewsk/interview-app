# Iteratory i generatory {mid}

**Protokół iteracji** to umowa, dzięki której działają `for...of`, spread (`[...x]`), destrukturyzacja tablic,
`Array.from`, `Promise.all` czy `new Map(iterable)`:

- **iterable**: obiekt z metodą `[Symbol.iterator]()`, która zwraca iterator,
- **iterator**: obiekt z metodą `next()`, zwracającą `{ value, done }`.

Wbudowane iterowalne to m.in. `Array`, `String` (iteruje po znakach Unicode, więc emoji to jeden element),
`Map`, `Set`, `arguments`, `NodeList` i typed arrays. Zwykły obiekt **nie jest** iterowalny, więc `for...of` na
`{}` rzuca `TypeError` (do obiektów służy `Object.entries`).

```js
const range = {
  from: 1,
  to: 3,
  [Symbol.iterator]() {
    let current = this.from
    const last = this.to
    return { next: () => (current <= last ? { value: current++, done: false } : { value: undefined, done: true }) }
  },
}
[...range]   // [1, 2, 3]
```

## Generatory

Funkcja `function*` zwraca **generator**, który jest jednocześnie iteratorem i iterable. Kod wykonuje się
**leniwie**: do najbliższego `yield`, gdzie się zawiesza, a wznawia przy następnym `next()`.

```js
function* idGenerator() {
  let id = 1
  while (true) yield id++        // nieskończona sekwencja jest bezpieczna, bo wartości liczone są na żądanie
}

const ids = idGenerator()
ids.next().value   // 1
ids.next().value   // 2
```

- `next(x)` przekazuje wartość **do** generatora: staje się wynikiem wyrażenia `yield`.
- `return value` kończy generator (`{ value, done: true }`), ale `for...of` i spread **ignorują** tę wartość.
- `yield* inny` deleguje do innego iterable, co przydaje się przy rekurencji, np. przechodzeniu drzewa.
- `gen.return()` i przerwanie `for...of` (`break`) zamykają generator i uruchamiają jego bloki `finally`,
  więc można w nich sprzątać zasoby.

```js
class Tree {
  constructor(value, children = []) { this.value = value; this.children = children }
  *[Symbol.iterator]() {
    yield this.value
    for (const child of this.children) yield* child
  }
}
```

## Helpery iteratorów (ES2025)

Iteratory mają leniwe metody podobne do tablicowych: `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`,
`toArray`, `some`, `every`, `find`. W odróżnieniu od tablic nie tworzą tablic pośrednich i działają na
nieskończonych sekwencjach:

```js
idGenerator().filter((n) => n % 2).map((n) => n * 10).take(3).toArray()   // [10, 30, 50]
```

## Asynchroniczne iteratory

`async function*` łączy `await` i `yield`, a konsumuje się ją przez `for await...of`. Przydaje się do
stronicowania API, strumieni (`ReadableStream` jest async iterable) i przetwarzania danych po kawałku.

```js
async function* fetchAllPages(url) {
  while (url) {
    const res = await fetch(url).then((r) => r.json())
    yield* res.items
    url = res.next
  }
}
for await (const item of fetchAllPages('/api/items')) process(item)
```

## Źródła

- [Iteration protocols (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)
- [function* (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*)
- [Iterator helpers (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator)
- [for await...of (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)

## Pytania

### Czym jest protokół iteracji? {mid}

To umowa złożona z dwóch części: obiekt **iterable** ma metodę `[Symbol.iterator]()` zwracającą **iterator**, a iterator ma metodę
`next()`, która zwraca `{ value, done }`. Na tym protokole opierają się `for...of`, spread, destrukturyzacja tablic, `Array.from`,
`Map`/`Set` z iterable i `Promise.all`. Każdy obiekt implementujący protokół działa z nimi automatycznie.

### Dlaczego `for...of` na zwykłym obiekcie rzuca błąd? {junior}

Zwykłe obiekty nie implementują `[Symbol.iterator]`, więc nie są iterowalne. Po kluczach i wartościach iteruje się przez
`Object.keys`, `Object.values` albo `Object.entries(obj)` w `for...of`, a `for...in` zwraca klucze (także odziedziczone). Można też
dodać obiektowi własny `[Symbol.iterator]`.

### Czym jest generator i czym różni się od zwykłej funkcji? {mid}

To funkcja `function*`, która po wywołaniu nie wykonuje ciała, tylko zwraca obiekt generatora. Kod wykonuje się kawałkami: do każdego
`yield`, gdzie się wstrzymuje i oddaje wartość, a wznawia przy kolejnym `next()`. Zwykła funkcja wykonuje się od początku do końca
jednorazowo. Generator zachowuje swój stan (zmienne lokalne) między wywołaniami `next()`.

### Jak przekazać wartość do generatora? {mid}

Przez `gen.next(value)`: przekazana wartość staje się wynikiem wyrażenia `yield`, przy którym generator był wstrzymany. Pierwsze
`next()` tylko uruchamia generator do pierwszego `yield`, więc przekazana w nim wartość przepada. Tak działają dwukierunkowe
generatory, np. w bibliotece redux-saga.

### Do czego przydają się generatory w praktyce? {mid}

Do leniwych i nieskończonych sekwencji (identyfikatory, liczby, stronicowanie), do implementacji iteratorów własnych struktur (drzewa,
grafy) przez `yield*`, do przetwarzania dużych zbiorów bez tworzenia tablic pośrednich, do stronicowania API przez `async function*`
oraz jako mechanizm maszyn stanów i sterowania przepływem (np. redux-saga, historycznie `co` przed async/await).

### Czym jest `yield*`? {mid}

Deleguje iterację do innego iterable lub generatora: wszystkie jego wartości są „przepuszczane” przez bieżący generator, a wynikiem
`yield*` jest wartość zwrócona (`return`) przez delegowany generator. Upraszcza rekurencję, np. przechodzenie drzewa
(`for (const child of children) yield* child`), i łączenie sekwencji.

### Co się dzieje z generatorem po `break` w pętli `for...of`? {senior}

Pętla wywołuje `return()` na iteratorze, więc generator jest zamykany, a jego bloki `finally` się wykonują. Pozwala to sprzątać zasoby
(zamknąć plik, połączenie czy subskrypcję), nawet gdy konsument nie przeczyta wszystkich wartości. Po zamknięciu kolejne `next()` zwraca
`{ done: true }`.

### Czym są helpery iteratorów i czym różnią się od metod tablic? {senior}

To metody (ES2025) na iteratorach: `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray` i inne. Działają leniwie: przetwarzają
element po elemencie dopiero przy konsumpcji, bez tablic pośrednich, więc sprawdzają się dla dużych i nieskończonych sekwencji, np.
`gen().filter(f).map(g).take(10).toArray()`. Metody tablic wyliczają zawsze wszystkie elementy od razu.

### Jak iterować po danych przychodzących asynchronicznie? {mid}

Przez asynchroniczne iteratory: `async function*` może `await`ować i `yield`ować, a konsument używa `for await...of`. Tak iteruje się po
stronach API, strumieniach (`ReadableStream`, strumienie Node) czy zdarzeniach. `for await` czeka na każdy element po kolei, co daje
naturalną kontrolę przepływu (backpressure).

### Dlaczego `[...'a😀'].length` daje 2, a `'a😀'.length` daje 3? {mid}

`length` liczy jednostki UTF-16, a emoji spoza podstawowej płaszczyzny zajmuje dwie (parę surogatów). Iterator stringa przechodzi po
**punktach kodowych** Unicode, więc emoji jest jednym elementem. Dlatego do liczenia i dzielenia tekstu z emoji używa się spreadu lub
`Array.from`, a dla złożonych grafemów (np. flag, emoji z modyfikatorem koloru skóry) `Intl.Segmenter`.
