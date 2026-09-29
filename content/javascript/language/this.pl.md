# `this` i sposoby wiązania {mid}

W JavaScripcie `this` **nie zależy od miejsca zdefiniowania funkcji** (poza funkcjami
strzałkowymi), tylko od **sposobu jej wywołania**. To samo `function` może dostać inne `this`
przy każdym wywołaniu.

```js
'use strict'
const user = {
  name: 'Ala',
  hi() { return this?.name },
}

user.hi()                   // 'Ala': wywołanie jako metoda
const hi = user.hi
hi()                        // undefined: „zgubione” this
hi.call({ name: 'Ola' })    // 'Ola'
```

## Cztery reguły (od najwyższego priorytetu)

1. **`new`**: `this` to nowo tworzony obiekt.
2. **Jawne wiązanie**: `fn.call(obj, a, b)`, `fn.apply(obj, [a, b])` albo `fn.bind(obj)`, które
   zwraca nową funkcję z na stałe ustawionym `this`.
3. **Wiązanie niejawne**: wywołanie `obj.fn()` sprawia, że `this === obj`. Liczy się obiekt
   **bezpośrednio przed kropką** w momencie wywołania.
4. **Domyślne**: zwykłe wywołanie `fn()` daje `undefined` w trybie ścisłym (moduły ES i klasy są
   zawsze w trybie ścisłym), a w trybie nieścisłym obiekt globalny (`globalThis`).

Szczegóły priorytetów:

- `bind` jest **trwałe**: kolejne `bind`, `call` czy `apply` na funkcji związanej nie zmienią już `this`,
- **`new` wygrywa z `bind`**: `new (Person.bind(obj))('X')` tworzy nowy obiekt i ignoruje `obj`.

## Funkcje strzałkowe

Funkcja strzałkowa **nie ma własnego `this`**. Bierze je leksykalnie z otaczającego zakresu, tak
jak zwykłą zmienną. Dlatego:

- `call`, `apply` i `bind` nie zmienią jej `this`,
- nie może być konstruktorem (`new` rzuca `TypeError`),
- **nie nadaje się na metodę w literale obiektu**, bo jej `this` to zakres, w którym powstał
  obiekt (w module ES `undefined`), a nie sam obiekt,
- idealnie nadaje się na **callback wewnątrz metody**:

```js
const timer = {
  name: 'T',
  start() {
    setTimeout(function () { console.log(this.name) })  // 🔴 this ≠ timer
    setTimeout(() => console.log(this.name))             // ✅ 'T'
  },
}
```

W przeglądarce `this` w zwykłym callbacku `setTimeout` to `window`, a w Node obiekt `Timeout`.
W żadnym przypadku nie jest to obiekt, w którym zdefiniowano metodę.

## Klasy: zgubione `this` w callbackach

Metody klas są w trybie ścisłym, więc „odczepiona” metoda ma `this === undefined` i odwołanie
do pola rzuca `TypeError`. Klasyczny przypadek to przekazanie metody jako handlera:

```js
class Counter {
  count = 0
  inc() { this.count++ }              // metoda na prototypie
  incArrow = () => { this.count++ }   // pole: osobna funkcja w każdej instancji
}

const c = new Counter()
button.addEventListener('click', c.inc)             // 🔴 TypeError przy kliknięciu
button.addEventListener('click', c.inc.bind(c))     // ✅
button.addEventListener('click', () => c.inc())     // ✅
button.addEventListener('click', c.incArrow)        // ✅
```

Pole ze strzałką jest wygodne, ale każda instancja dostaje **własną kopię funkcji**, nie leży ona
na prototypie i nie da się jej nadpisać w podklasie przez `super.method()`.

## `this` w obsłudze zdarzeń DOM

W `addEventListener` ze zwykłą funkcją `this` to element, na którym zarejestrowano listener
(to samo co `event.currentTarget`). W funkcji strzałkowej `this` pochodzi z otoczenia, więc do
elementu sięga się przez `event.currentTarget`.

## `this` na najwyższym poziomie

- moduł ES: `undefined`,
- skrypt w przeglądarce: `window`,
- moduł CommonJS w Node: `module.exports`.

Niezależnie od środowiska obiekt globalny jest dostępny jako `globalThis`.

## Źródła

- [this (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)
- [Function.prototype.bind (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind)
- [Arrow function expressions (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)
- [Public class fields (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Public_class_fields)

## Pytania

### Od czego zależy wartość `this` w zwykłej funkcji? {junior}

Od sposobu wywołania, a nie miejsca definicji. `new Fn()` daje nowy obiekt, `call`/`apply`/`bind`
podany obiekt, `obj.fn()` obiekt przed kropką, a zwykłe `fn()` daje `undefined` w trybie ścisłym
(lub `globalThis` w nieścisłym). Wyjątkiem są funkcje strzałkowe, które biorą `this` leksykalnie
z otoczenia.

### Czym różnią się `call`, `apply` i `bind`? {junior}

`call` i `apply` **od razu wywołują** funkcję z podanym `this`. `call` przyjmuje argumenty po
kolei (`fn.call(obj, a, b)`), a `apply` jako tablicę (`fn.apply(obj, [a, b])`). `bind` **nie wywołuje**
funkcji, tylko zwraca nową z na stałe ustawionym `this` (i opcjonalnie początkowymi argumentami),
co przydaje się przy przekazywaniu metod jako callbacków.

### Co wypisze `const hi = user.hi; hi()` i dlaczego? {junior}

W trybie ścisłym `this` wynosi `undefined`, więc `this.name` rzuci `TypeError` (a przy `this?.name`
zwróci `undefined`). W trybie nieścisłym `this` to obiekt globalny. Przypisanie metody do zmiennej
zrywa związek z obiektem, bo przy wywołaniu `hi()` przed kropką nie ma żadnego obiektu.

### Dlaczego funkcja strzałkowa nie nadaje się na metodę w literale obiektu? {mid}

Nie ma własnego `this`. Bierze je z zakresu, w którym powstał literał, np. z modułu (`undefined`)
albo z funkcji otaczającej, a nie z obiektu, na którym jest wywołana. `obj.arrow()` nie ustawi więc
`this` na `obj`. Metody definiuje się skróconą składnią `method() {}`.

### Czy można zmienić `this` funkcji po `bind`? {mid}

Nie. Funkcja zwrócona przez `bind` ma `this` ustawione na stałe: kolejne `bind`, `call` i `apply`
tego nie zmienią. Jedynym wyjątkiem jest `new`. Wywołanie związanej funkcji jako konstruktora
tworzy nowy obiekt i ignoruje związane `this`.

### Dlaczego przekazanie metody klasy jako handlera (`onClick={this.handle}`, `addEventListener('click', obj.handle)`) psuje `this`? {mid}

Przekazujemy samą funkcję, bez obiektu. Później wywołuje ją przeglądarka lub React bez
kontekstu `obj.`, a kod klas jest w trybie ścisłym, więc `this` wynosi `undefined` (w
`addEventListener` jest nim element DOM). Rozwiązania: `bind` w konstruktorze, pole klasy ze
strzałką albo opakowanie w strzałkę `() => obj.handle()`.

### Jakie są wady pól klasy ze strzałką (`handle = () => {}`) w porównaniu z metodami? {senior}

Każda instancja dostaje własną kopię funkcji, co przy wielu instancjach zużywa więcej pamięci.
Funkcja nie leży na prototypie, więc nie da się jej nadpisać metodą w podklasie ani wywołać przez
`super.handle()`. Trudniej ją też mockować przez prototyp w testach. W zamian `this` jest zawsze
związane z instancją.

### Co jest `this` w callbacku `setTimeout` wewnątrz metody obiektu? {mid}

Dla zwykłej funkcji nie jest to obiekt z metodą: w przeglądarce jest to `window`, a w Node obiekt
`Timeout`. Callback wywołuje środowisko, a nie nasz obiekt. Dla funkcji strzałkowej `this`
pochodzi z metody, czyli jest nim obiekt. Dlatego wewnątrz metod callbacki pisze się zwykle jako
strzałki.

### Jaki jest priorytet reguł wiązania `this`? {mid}

Od najwyższego: `new` (nowy obiekt), wiązanie jawne (`bind`/`call`/`apply`), wiązanie niejawne
(`obj.fn()`), wiązanie domyślne (`undefined` lub `globalThis`). Funkcje strzałkowe stoją poza tym
systemem, bo ich `this` jest zawsze leksykalne.

### Czym jest `this` na najwyższym poziomie modułu ES, skryptu i modułu CommonJS? {mid}

W module ES jest to `undefined`, bo moduły są w trybie ścisłym. W klasycznym skrypcie przeglądarki
jest to `window`, a w module CommonJS w Node `module.exports`. Do obiektu globalnego w każdym
środowisku odwołuje się przez `globalThis`.
