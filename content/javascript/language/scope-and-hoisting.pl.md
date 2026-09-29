# Zakres, hoisting i `var` / `let` / `const` {junior}

**Zakres** (scope) określa, gdzie w kodzie widoczna jest zmienna. JavaScript ma zakres **leksykalny**:
o widoczności decyduje miejsce zapisania kodu, a nie miejsce wywołania. Rodzaje zakresu:

- **globalny**: poza funkcjami i modułami (w module ES najwyższy poziom to zakres modułu),
- **funkcji**: każda funkcja tworzy własny,
- **bloku** (`{ }` w `if`, `for`, samodzielny blok): tylko dla `let`, `const` i `class`.

Zmienna jest wyszukiwana od zakresu bieżącego w górę, przez **łańcuch zakresów**. Wewnętrzna deklaracja
o tej samej nazwie **przesłania** (shadowing) zewnętrzną.

## `var`, `let`, `const`

| | `var` | `let` | `const` |
| --- | --- | --- | --- |
| zakres | funkcji | bloku | bloku |
| hoisting | tak, inicjalizowana `undefined` | tak, ale w TDZ | tak, ale w TDZ |
| ponowna deklaracja w tym samym zakresie | dozwolona | błąd | błąd |
| ponowne przypisanie | tak | tak | nie (`TypeError`) |
| właściwość `window` w skrypcie globalnym | tak | nie | nie |

`const` blokuje **ponowne przypisanie**, a nie mutację: `const obj = {}; obj.x = 1` jest poprawne. Do
zamrożenia obiektu służy `Object.freeze` (płytko).

Dobra praktyka: `const` domyślnie, `let`, gdy wartość się zmienia, i nigdy `var`.

## Hoisting

Przed wykonaniem kodu silnik rejestruje deklaracje w ich zakresie, więc zachowują się tak, jakby były
„podniesione” na początek:

```js
console.log(a)      // undefined: var jest podniesiona i zainicjalizowana undefined
var a = 1

console.log(b)      // ReferenceError: Cannot access 'b' before initialization
let b = 2

greet()             // działa: deklaracja funkcji jest podniesiona w całości
function greet() {}

fn()                // TypeError: fn is not a function (var fn = undefined w tym momencie)
var fn = function () {}
```

## Temporal Dead Zone (TDZ)

`let`, `const` i `class` też są podnoszone, ale do chwili wykonania deklaracji znajdują się w **TDZ**:
każdy dostęp rzuca `ReferenceError`. Dotyczy to także przesłaniania:

```js
let x = 'outer'
function f() {
  console.log(x)    // ReferenceError: to już wewnętrzne x, jeszcze w TDZ
  let x = 'inner'
}
```

TDZ wykrywa użycie zmiennej przed inicjalizacją, które przy `var` cicho dawało `undefined`.

## Zmienne globalne i tryb ścisły

- Przypisanie do niezadeklarowanej zmiennej w trybie **nieścisłym** tworzy zmienną globalną, a w **ścisłym**
  (moduły ES, klasy, `'use strict'`) rzuca `ReferenceError`.
- `var` na najwyższym poziomie klasycznego skryptu tworzy właściwość `window`, a `let`/`const` nie. W modułach
  ES zmienne są lokalne dla modułu.
- IIFE (`(function () { ... })()`) była sposobem na własny zakres przed modułami i `let`.

## Źródła

- [Scope (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Scope)
- [Hoisting (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Hoisting)
- [let: temporal dead zone (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#temporal_dead_zone_tdz)
- [const (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const)

## Pytania

### Czym różnią się `var`, `let` i `const`? {junior}

`var` ma zakres funkcji, jest podnoszona i inicjalizowana `undefined`, a jej ponowna deklaracja jest dozwolona. `let`
i `const` mają zakres bloku, są w TDZ do chwili deklaracji i nie można ich zadeklarować ponownie w tym samym zakresie.
`const` dodatkowo nie pozwala na ponowne przypisanie, choć obiekt, na który wskazuje, można modyfikować.

### Czym jest hoisting? {junior}

To zachowanie, w którym deklaracje są rejestrowane w swoim zakresie przed wykonaniem kodu, jakby „podniesione” na
początek. Deklaracje funkcji są dostępne w całości (można je wywołać przed miejscem zapisu). `var` jest dostępna, ale ma
wartość `undefined`. `let`, `const` i `class` też są podnoszone, ale do deklaracji są w TDZ.

### Czym jest Temporal Dead Zone? {mid}

To okres od początku zakresu do wykonania deklaracji `let`, `const` lub `class`, w którym zmienna już istnieje, ale
dostęp do niej rzuca `ReferenceError`. Dzięki temu użycie przed inicjalizacją jest wykrywane jako błąd, zamiast cicho
dawać `undefined` jak przy `var`. TDZ obowiązuje też, gdy zmienna wewnętrzna przesłania zewnętrzną o tej samej nazwie.

### Co wypisze `console.log(a); var a = 1`, a co z `let`? {junior}

Z `var` wypisze `undefined`, bo deklaracja jest podniesiona i zainicjalizowana `undefined`, a przypisanie `1` następuje
później. Z `let` rzuci `ReferenceError: Cannot access 'a' before initialization`, bo zmienna jest w TDZ.

### Czy obiekt zadeklarowany przez `const` jest niemutowalny? {junior}

Nie. `const` blokuje tylko ponowne przypisanie zmiennej (`obj = {}` rzuci `TypeError`), a zawartość obiektu lub tablicy
można zmieniać (`obj.x = 1`, `arr.push(2)`). Niemutowalność daje `Object.freeze` (płytko, bez zagnieżdżonych obiektów)
albo konwencja niezmiennych aktualizacji.

### Czym różni się deklaracja funkcji od wyrażenia funkcyjnego pod względem hoistingu? {mid}

Deklaracja `function f() {}` jest podnoszona w całości, więc można ją wywołać przed miejscem zapisu. Wyrażenie
`var f = function () {}` podnosi tylko zmienną (`undefined`), więc wcześniejsze wywołanie rzuca `TypeError: f is not a
function`. Przy `const f = () => {}` wcześniejsze wywołanie rzuca `ReferenceError`, bo zmienna jest w TDZ.

### Czym jest zakres leksykalny i łańcuch zakresów? {mid}

Zakres leksykalny oznacza, że widoczność zmiennych wynika z miejsca zapisania kodu. Funkcja widzi zmienne z zakresów, w
których ją zdefiniowano. Gdy zmiennej nie ma w bieżącym zakresie, silnik szuka jej w zakresie otaczającym i dalej w górę
aż do globalnego (łańcuch zakresów). Na tym opierają się domknięcia.

### Co się stanie po przypisaniu wartości do niezadeklarowanej zmiennej? {junior}

W trybie nieścisłym powstanie zmienna globalna (właściwość obiektu globalnego), co jest częstym źródłem błędów i kolizji.
W trybie ścisłym, domyślnym w modułach ES i klasach, rzucony zostanie `ReferenceError`. To jeden z powodów, by pisać kod
w modułach lub z `'use strict'`.

### Dlaczego `var` w pętli z callbackami daje nieoczekiwane wyniki? {mid}

`var` ma zakres funkcji, więc w całej pętli istnieje jedna zmienna, a wszystkie callbacki (np. `setTimeout`) widzą jej
końcową wartość. `let` w nagłówku `for` tworzy nowe wiązanie dla każdej iteracji, więc każdy callback ma własną wartość.
To klasyczne zadanie rekrutacyjne łączące zakres z domknięciami.

### Czym jest przesłanianie zmiennych (shadowing)? {junior}

Deklaracja zmiennej o tej samej nazwie w zakresie wewnętrznym zasłania zmienną zewnętrzną: wewnątrz bloku lub funkcji
odwołania dotyczą wewnętrznej, a zewnętrzna pozostaje niezmieniona. Jest to dozwolone, ale łatwo o pomyłkę, dlatego
lintery mogą to zgłaszać (`no-shadow`).
