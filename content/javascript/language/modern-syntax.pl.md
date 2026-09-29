# Nowoczesna składnia (ES2015+) {junior}

Funkcje języka, które na rozmowach padają jako „co zwróci ten kod” i które pojawiają się w każdym
nowoczesnym projekcie.

## Destrukturyzacja

```js
const user = { id: 1, name: 'Ala', address: { city: 'Kraków' }, role: undefined }

const { name, address: { city }, role = 'user', ...rest } = user
// name 'Ala', city 'Kraków', role 'user' (domyślna działa dla undefined, nie dla null), rest { id: 1 }

const [first, , third = 't', ...others] = [1, 2, undefined, 4, 5]
// first 1, third 't', others [4, 5]

let a = 1, b = 2
;[a, b] = [b, a]        // zamiana wartości

function draw({ width = 100, height = 50 } = {}) {}   // parametry jako obiekt z domyślnymi
```

## Spread i rest

- **Spread** (`...`) rozkłada iterowalny obiekt lub obiekt: `[...arr, x]`, `{ ...obj, x: 1 }`, `fn(...args)`.
  Przy obiektach późniejsze klucze nadpisują wcześniejsze. Kopia jest **płytka**.
- **Rest** zbiera pozostałe elementy: `function sum(...nums) {}`, `const { a, ...others } = obj`. Musi być
  ostatni. Zastępuje przestarzały obiekt `arguments`.

## Optional chaining i nullish coalescing

```js
user?.address?.city          // undefined zamiast TypeError, gdy address jest null/undefined
user.getName?.()             // wywołaj, jeśli metoda istnieje
list?.[0]

const port = config.port ?? 3000    // domyślna tylko dla null/undefined
const port2 = config.port || 3000   // domyślna także dla 0, '', false ⚠️
```

`??` ma sens, gdy `0`, `''` lub `false` są poprawnymi wartościami (np. port 0, pusta nazwa). `?.` zatrzymuje
całe wyrażenie (short-circuit), więc `a?.b.c` nie rzuci, gdy `a` jest `null`. Rzuci jednak, gdy `a.b`
jest `undefined`.

**Przypisania logiczne** (ES2021): `x ??= d` (przypisz, jeśli `null`/`undefined`), `x ||= d` (jeśli falsy),
`x &&= v` (jeśli truthy).

## Szablony stringów

```js
const msg = `Witaj ${name}, masz ${count} ${count === 1 ? 'wiadomość' : 'wiadomości'}`
const multi = `linia 1
linia 2`
```

**Tagged templates** przekazują fragmenty i wartości do funkcji: `` sql`SELECT * FROM users WHERE id = ${id}` ``.
Pozwala to np. bezpiecznie parametryzować zapytania, stylować (styled-components) czy tłumaczyć.

## Inne przydatne elementy

- Skrócone właściwości i metody oraz klucze obliczane: `{ name, [key]: value, greet() {} }`.
- Parametry domyślne: `function f(a, b = a * 2) {}`. Wartość domyślna liczona jest przy każdym wywołaniu
  i tylko dla `undefined`.
- Separator liczbowy: `1_000_000`.
- `Array.prototype.at(-1)`, `Object.groupBy`, `structuredClone`, `Array.prototype.findLast`.
- Operator `**` zamiast `Math.pow`.
- `Symbol` do unikalnych kluczy, `Map`/`Set`/`WeakMap`, iteratory i generatory, `class`, moduły ES.

## Źródła

- [Destructuring (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring)
- [Spread syntax (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Optional chaining (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)
- [Nullish coalescing operator (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Template literals (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

## Pytania

### Czym różni się `??` od `||`? {junior}

`a || b` zwraca `b`, gdy `a` jest **falsy** (`0`, `''`, `false`, `null`, `undefined`, `NaN`). `a ?? b` zwraca `b` tylko dla
`null` i `undefined`. `??` jest właściwe, gdy `0`, pusty string czy `false` to poprawne wartości, np. `volume ?? 50` nie nadpisze
wyciszenia (`0`), a `volume || 50` tak.

### Jak działa optional chaining (`?.`)? {junior}

Jeśli wartość po lewej to `null` lub `undefined`, całe wyrażenie zwraca `undefined` zamiast rzucać `TypeError`, a reszta łańcucha nie
jest wykonywana. Działa dla właściwości (`a?.b`), indeksów (`a?.[0]`) i wywołań (`a.fn?.()`). Nadużywany ukrywa błędy danych,
dlatego stosuje się go tam, gdzie brak wartości jest spodziewany.

### Czym różni się spread od rest? {junior}

To ta sama składnia `...` w różnych rolach. Spread **rozkłada** tablicę lub obiekt na elementy (`[...a, ...b]`, `fn(...args)`,
`{ ...obj }`). Rest **zbiera** pozostałe elementy do tablicy lub obiektu (`function f(...args)`, `const { a, ...rest } = obj`)
i musi być na końcu.

### Kiedy zadziała wartość domyślna w destrukturyzacji lub parametrze? {mid}

Tylko gdy wartość jest `undefined` (brak właściwości lub argumentu). Dla `null`, `0` czy `''` wartość domyślna **nie** jest
używana, więc `const { role = 'user' } = { role: null }` daje `null`. Wartość domyślna jest obliczana przy każdym użyciu
i może korzystać z wcześniejszych parametrów (`b = a * 2`).

### Jak zamienić wartości dwóch zmiennych bez zmiennej tymczasowej? {junior}

Destrukturyzacją tablicy: `[a, b] = [b, a]`. Prawa strona tworzy tablicę z aktualnymi wartościami, a lewa przypisuje je w odwrotnej
kolejności. Jeśli poprzednia linia nie kończy się średnikiem, a linia zaczyna się od `[`, potrzebny jest średnik przed nią, bo
inaczej JS połączy wyrażenia.

### Czy spread tworzy głęboką kopię obiektu? {junior}

Nie, płytką. `{ ...obj }` i `[...arr]` kopiują tylko pierwszy poziom, a zagnieżdżone obiekty i tablice są współdzielone przez
referencję. Zmiana `copy.nested.x` zmieni też oryginał. Do głębokiej kopii służy `structuredClone`.

### Czym są tagged templates i do czego się przydają? {mid}

To wywołanie funkcji z szablonem: `` tag`tekst ${a} i ${b}` `` przekazuje do `tag` tablicę stałych fragmentów i osobno wartości.
Funkcja może je dowolnie przetworzyć, np. zabezpieczyć wartości przed SQL injection (parametryzacja), budować style (styled-components),
zapytania GraphQL (`gql`) czy tłumaczenia. `String.raw` to wbudowany tag zwracający surowy tekst.

### Co zwróci `a?.b.c`, gdy `a` jest `null`, a co, gdy `a.b` jest `undefined`? {mid}

Gdy `a` jest `null`, całe wyrażenie zwraca `undefined`, bo `?.` przerywa cały łańcuch (short-circuit). Gdy `a` istnieje, ale `a.b` jest
`undefined`, odczyt `.c` rzuci `TypeError`, bo po `b` nie ma `?.`. Zabezpieczenie obu poziomów wymaga `a?.b?.c`.

### Czym są operatory przypisania logicznego (`??=`, `||=`, `&&=`)? {mid}

Skróty łączące operator logiczny z przypisaniem (ES2021): `x ??= d` przypisuje `d`, gdy `x` jest `null`/`undefined`; `x ||= d`, gdy `x`
jest falsy; `x &&= v`, gdy `x` jest truthy. Przypisanie następuje tylko warunkowo, więc np. setter nie jest wywoływany niepotrzebnie.
Przydają się do leniwej inicjalizacji: `cache[key] ??= compute(key)`.

### Dlaczego zamiast `arguments` używa się parametru rest? {junior}

`arguments` to obiekt podobny do tablicy, a nie tablica, więc nie ma `map` czy `filter`. Nie istnieje w funkcjach strzałkowych, a w trybie
nieścisłym jest powiązany z parametrami, co daje zaskakujące efekty. `...args` to prawdziwa tablica, działa wszędzie i jawnie pokazuje
w sygnaturze, że funkcja przyjmuje zmienną liczbę argumentów.
