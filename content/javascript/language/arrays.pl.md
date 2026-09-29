# Tablice i ich metody {junior}

Tablice to obiekty z indeksami liczbowymi i właściwością `length`. Najważniejsze jest rozróżnienie metod
**mutujących** (zmieniają tablicę) i **niemutujących** (zwracają nową). W kodzie React i Redux stan traktuje się
jako niezmienny, więc używa się tych drugich.

| Mutujące | Niemutujące odpowiedniki |
| --- | --- |
| `push`, `pop`, `shift`, `unshift` | `[...arr, x]`, `arr.slice(0, -1)`, `arr.slice(1)`, `[x, ...arr]` |
| `splice` | `toSpliced` (ES2023), `slice`, `filter` |
| `sort` | `toSorted` (ES2023), `[...arr].sort()` |
| `reverse` | `toReversed` (ES2023) |
| `arr[i] = x`, `fill`, `copyWithin` | `with(i, x)` (ES2023), `map` |

## Przekształcanie

```js
const users = [{ name: 'Ala', age: 30, active: true }, { name: 'Olek', age: 17, active: false }]

users.map((u) => u.name)                  // ['Ala', 'Olek']
users.filter((u) => u.active)             // tylko aktywni
users.reduce((sum, u) => sum + u.age, 0)  // 47, zawsze podawaj wartość początkową
users.find((u) => u.age > 18)             // pierwszy pasujący element albo undefined
users.findIndex((u) => u.age > 18)        // indeks albo -1 (są też findLast / findLastIndex)
users.some((u) => !u.active)              // czy którykolwiek spełnia warunek
users.every((u) => u.age > 0)             // czy wszystkie
users.flatMap((u) => u.tags ?? [])        // map + spłaszczenie o jeden poziom
Object.groupBy(users, (u) => (u.active ? 'active' : 'inactive'))  // ES2024
```

## Pułapki

```js
[3, 1, 10, 2].sort()                 // [1, 10, 2, 3]: domyślnie sortuje jako stringi!
[3, 1, 10, 2].sort((a, b) => a - b)  // [1, 2, 3, 10]
['1', '2', '3'].map(parseInt)        // [1, NaN, NaN]: map przekazuje (element, indeks), parseInt(x, radix)
[].reduce((a, b) => a + b)           // TypeError: pusta tablica bez wartości początkowej
[NaN].indexOf(NaN)                   // -1, ale [NaN].includes(NaN) → true
new Array(3).map(() => 1)            // [ <3 empty items> ]: dziury są pomijane przez map
new Array(2).fill([])                // oba elementy to TA SAMA tablica
Array.from({ length: 2 }, () => [])  // dwie różne tablice ✅
[].every(() => false)                // true (prawda pusta), [].some(...) → false
```

- `forEach` nie zwraca wartości i **nie da się go przerwać** (`break`). Do przerwania służy `for...of`, `some` lub `find`.
- `sort` jest stabilny (od ES2019): elementy równe według komparatora zachowują kolejność.
- `slice(start, end)` nie mutuje, a `splice(start, deleteCount, ...items)` mutuje i zwraca usunięte elementy.
- `at(-1)` zwraca ostatni element (czytelniej niż `arr[arr.length - 1]`).

## Tworzenie i iterowanie

- `Array.from(iterable, mapFn)`, `Array.of(...)`, spread `[...set]`.
- `for...of` iteruje po wartościach, a `for...in` po kluczach (także odziedziczonych), więc do tablic go
  się nie używa.
- Wydajność: `map`/`filter` tworzą tablice pośrednie. W bardzo gorących pętlach zwykła pętla jest szybsza,
  ale czytelność zwykle wygrywa.

## Źródła

- [Array (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
- [Array.prototype.toSorted (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted)
- [Array.prototype.reduce (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
- [Object.groupBy (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy)

## Pytania

### Które metody tablic mutują tablicę, a które nie? {junior}

Mutują: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` i przypisanie po indeksie. Nie
mutują: `map`, `filter`, `reduce`, `slice`, `concat`, `flat`, `flatMap` oraz nowe `toSorted`, `toReversed`, `toSpliced` i `with`
(ES2023). W kodzie opartym na niezmiennym stanie (React, Redux) używa się tych drugich.

### Czym różni się `map` od `forEach`? {junior}

`map` zwraca nową tablicę z wynikami callbacku, więc służy do przekształcania danych. `forEach` zwraca `undefined` i służy
tylko do efektów ubocznych. Żadnej z nich nie da się przerwać w trakcie. Gdy trzeba zakończyć wcześniej, używa się
`for...of` z `break`, `some`, `every` albo `find`.

### Dlaczego `[10, 1, 3].sort()` zwraca `[1, 10, 3]`? {junior}

Domyślnie `sort` konwertuje elementy na stringi i porównuje je leksykograficznie, a `'10'` jest przed `'3'`. Liczby sortuje się
z komparatorem: `sort((a, b) => a - b)` rosnąco. `sort` mutuje tablicę, więc do sortowania bez zmiany oryginału służy `toSorted`
albo `[...arr].sort(...)`.

### Jak działa `reduce` i dlaczego warto podawać wartość początkową? {mid}

`reduce((acc, item) => ..., initial)` przechodzi po elementach, przekazując akumulator z poprzedniego kroku, i zwraca wynik końcowy,
np. sumę, obiekt czy mapę. Bez wartości początkowej pierwszym akumulatorem jest pierwszy element, co daje błędy typów (np. przy
sumowaniu pól obiektów) i `TypeError` dla pustej tablicy. Podanie `initial` usuwa oba problemy.

### Co zwróci `['1', '2', '3'].map(parseInt)`? {mid}

`[1, NaN, NaN]`. `map` przekazuje callbackowi `(element, index, array)`, a `parseInt` przyjmuje `(string, radix)`, więc wywołania to
`parseInt('1', 0)` (radix 0 oznacza domyślny, więc 1), `parseInt('2', 1)` (niepoprawna podstawa, więc NaN) i `parseInt('3', 2)`
(cyfra 3 nie istnieje w systemie dwójkowym, więc NaN). Poprawnie: `map(Number)` albo `map((s) => parseInt(s, 10))`.

### Czym różnią się `slice` i `splice`? {junior}

`slice(start, end)` zwraca nową tablicę z fragmentem i nie zmienia oryginału. `splice(start, deleteCount, ...items)` modyfikuje tablicę:
usuwa i wstawia elementy w miejscu, a zwraca usunięte. Niemutującym odpowiednikiem `splice` jest `toSpliced` (ES2023).

### Czym różnią się `find`, `filter`, `some` i `includes`? {junior}

`find` zwraca **pierwszy** pasujący element (lub `undefined`). `filter` zwraca **tablicę** wszystkich pasujących. `some` zwraca
**boolean**, czy którykolwiek pasuje, i kończy przy pierwszym trafieniu. `includes(value)` sprawdza obecność konkretnej wartości
przez porównanie SameValueZero (wykrywa też `NaN`, w przeciwieństwie do `indexOf`).

### Dlaczego `new Array(3).fill([])` to pułapka? {mid}

`fill` wstawia tę samą wartość do każdej komórki, a dla obiektu jest to ta sama referencja, więc wszystkie elementy wskazują na jedną
tablicę i zmiana jednej zmienia „wszystkie”. Niezależne elementy tworzy `Array.from({ length: 3 }, () => [])`, który wywołuje fabrykę
dla każdej pozycji.

### Czym są nowe metody `toSorted`, `toReversed`, `toSpliced` i `with`? {mid}

To niemutujące odpowiedniki `sort`, `reverse`, `splice` i przypisania po indeksie, dodane w ES2023. Zwracają nową tablicę i zostawiają
oryginał nietknięty, co upraszcza niezmienne aktualizacje stanu, np. `items.with(index, updated)` zamiast
`items.map((x, i) => (i === index ? updated : x))`.

### Dlaczego nie używa się `for...in` do iterowania po tablicy? {junior}

`for...in` iteruje po **kluczach** (jako stringi), także odziedziczonych i dodanych do tablicy właściwościach, a kolejność nie jest
gwarantowana dla wszystkich przypadków. Do wartości tablicy służy `for...of`, metody tablicowe albo klasyczna pętla z indeksem.
`for...in` przeznaczony jest do kluczy obiektów.
