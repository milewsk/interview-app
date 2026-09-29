# Typy i koercja {junior}

JavaScript ma **8 typów**: 7 prymitywnych (`undefined`, `null`, `boolean`, `number`, `bigint`, `string`,
`symbol`) i `object`, do którego należą też tablice, funkcje, daty i mapy. Typowanie jest
**dynamiczne** (typ ma wartość, a nie zmienna) i **słabe**: przy operacjach na różnych typach silnik
**niejawnie konwertuje** wartości (koercja).

## `typeof` i jego pułapki

```js
typeof undefined     // 'undefined'
typeof null          // 'object'   ← historyczny błąd języka
typeof NaN           // 'number'
typeof []            // 'object'   → do tablic Array.isArray([])
typeof function(){}  // 'function' (choć to obiekt)
typeof 10n           // 'bigint'
typeof niezadeklarowana // 'undefined' (bez ReferenceError)
```

Prymitywy są **niemutowalne** i porównywane po wartości, a obiekty po **referencji**
(`{} === {}` to `false`).

## Koercja

**Do stringa**: operator `+`, gdy jeden z operandów jest stringiem:

```js
1 + '2'          // '12'
[] + []          // ''  (obie tablice → '')
[] + {}          // '[object Object]'
```

**Do liczby**: pozostałe operatory arytmetyczne, porównania `<` `>`, unarny `+`:

```js
'5' - 2          // 3
'3' * '4'        // 12
true + 1         // 2
+''              // 0
Number(' 12 ')   // 12
Number('12px')   // NaN, ale parseInt('12px') → 12
Number(null)     // 0,   Number(undefined) → NaN
```

**Do boolean**: w warunkach i przy `!`, `&&`, `||`. Wartości **falsy** to tylko: `false`, `0`, `-0`, `0n`,
`''`, `null`, `undefined`, `NaN`. Wszystko inne jest truthy, także `'0'`, `'false'`, `[]` i `{}`.

## `==` a `===`

- `===` (ścisłe) nie konwertuje typów. Stosuje się je domyślnie.
- `==` (luźne) najpierw konwertuje według złożonych reguł:

```js
null == undefined   // true (i tylko ze sobą)
null == 0           // false, ale null >= 0 → true (porównanie konwertuje null do 0)
0 == ''             // true
'0' == false        // true
[] == false         // true
[] == ![]           // true
NaN == NaN          // false
```

Jedyny powszechnie akceptowany wyjątek to `x == null`, które sprawdza jednocześnie `null` i `undefined`.

`Object.is` działa jak `===` z dwiema różnicami: `Object.is(NaN, NaN)` zwraca `true`,
a `Object.is(0, -0)` zwraca `false`. Z tego porównania korzysta React.

## Liczby

- `number` to 64-bitowa liczba zmiennoprzecinkowa (IEEE 754), więc `0.1 + 0.2 === 0.30000000000000004`.
  Pieniądze liczy się w groszach (liczby całkowite) albo bibliotekami dziesiętnymi.
- Liczby całkowite są dokładne tylko do `Number.MAX_SAFE_INTEGER` (2^53 − 1), a powyżej `2 ** 53 === 2 ** 53 + 1`.
  Do większych służy `BigInt` (`10n`).
- `Number.isNaN(x)` sprawdza, czy wartość **jest** `NaN`. Globalne `isNaN('a')` najpierw konwertuje (daje `true`).

## `null` a `undefined`

`undefined` oznacza „brak wartości, bo nic nie przypisano” (niezainicjalizowana zmienna, brak właściwości,
brak argumentu, funkcja bez `return`). `null` to świadomie przypisane „brak wartości”. `??` i `?.` traktują
oba tak samo.

## Źródła

- [JavaScript data types and data structures (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures)
- [Equality comparisons and sameness (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness)
- [Type coercion (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Type_coercion)
- [Falsy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)

## Pytania

### Jakie typy danych ma JavaScript? {junior}

Siedem prymitywnych (`undefined`, `null`, `boolean`, `number`, `bigint`, `string`, `symbol`) i `object`, do którego
należą też tablice, funkcje, daty, mapy i zbiory. Prymitywy są niemutowalne i porównywane po wartości, a obiekty po
referencji.

### Dlaczego `typeof null` zwraca `'object'`? {junior}

To błąd z pierwszej implementacji języka: wartości przechowywano z tagiem typu, a `null` miał tag obiektu. Poprawka
zepsułaby istniejące strony, więc zachowanie zostało. `null` sprawdza się przez `x === null`, a tablice przez
`Array.isArray`, nie przez `typeof`.

### Czym różni się `==` od `===`? {junior}

`===` porównuje bez konwersji typów: wartości różnych typów zawsze są różne. `==` najpierw konwertuje operandy według
złożonych reguł, co daje zaskakujące wyniki (`'0' == false`, `[] == ![]`). Domyślnie używa się `===`, a jedynym
częstym wyjątkiem jest `x == null`, które jednocześnie sprawdza `null` i `undefined`.

### Jakie wartości są falsy? {junior}

`false`, `0`, `-0`, `0n`, pusty string `''`, `null`, `undefined` i `NaN`. Wszystko inne jest truthy, w tym `'0'`,
`'false'`, pusta tablica `[]` i pusty obiekt `{}`. Dlatego `if (arr)` nie sprawdza, czy tablica jest pusta; do tego
służy `arr.length > 0`.

### Co zwróci `1 + '2'` i `'5' - 2`? {junior}

`'12'` i `3`. Operator `+` z dowolnym stringiem wykonuje konkatenację, więc liczba jest konwertowana na string.
Pozostałe operatory arytmetyczne (`-`, `*`, `/`) zawsze konwertują operandy na liczby. To klasyczny przykład,
dlaczego dane z formularzy (stringi) trzeba jawnie zamieniać na liczby (`Number()`) przed obliczeniami.

### Dlaczego `0.1 + 0.2 !== 0.3`? {mid}

Liczby w JS to 64-bitowe liczby zmiennoprzecinkowe IEEE 754, a ułamki takie jak 0,1 nie mają dokładnej reprezentacji
binarnej, więc suma daje `0.30000000000000004`. Porównuje się z tolerancją (`Math.abs(a - b) < Number.EPSILON`),
a kwoty pieniężne liczy się w najmniejszej jednostce (grosze jako liczby całkowite) albo bibliotekami dziesiętnymi.

### Czym różni się `Number.isNaN` od globalnego `isNaN`? {mid}

Globalne `isNaN` najpierw konwertuje argument na liczbę, więc `isNaN('abc')` zwraca `true`, choć to string.
`Number.isNaN` zwraca `true` tylko dla wartości, która **jest** `NaN`. `NaN` jest jedyną wartością różną od siebie
(`NaN !== NaN`), dlatego nie da się go wykryć przez `===`. Można też użyć `Object.is(x, NaN)`.

### Czym różni się `null` od `undefined`? {junior}

`undefined` oznacza brak przypisanej wartości: niezainicjalizowaną zmienną, nieistniejącą właściwość, brak argumentu
czy wynik funkcji bez `return`. `null` to wartość przypisywana świadomie, gdy „tu nic nie ma”. `null == undefined`
zwraca `true`, ale `===` rozróżnia je. Operatory `??` i `?.` traktują oba tak samo.

### Czym jest `Object.is` i czym różni się od `===`? {mid}

Porównuje „tę samą wartość” jak `===`, z dwiema różnicami: `Object.is(NaN, NaN)` zwraca `true`, a `Object.is(0, -0)`
zwraca `false`. Używa go m.in. React do porównywania stanu i zależności hooków. W praktyce dla obiektów działa tak
samo jak `===`, czyli porównuje referencje.

### Kiedy potrzebny jest `BigInt`? {mid}

Gdy liczby całkowite przekraczają `Number.MAX_SAFE_INTEGER` (2^53 − 1). Powyżej tej granicy `number` traci dokładność,
np. `2 ** 53 === 2 ** 53 + 1`. Typowe przypadki to identyfikatory 64-bitowe z baz danych, kryptografia i duże liczniki.
`BigInt` (`123n`) nie łączy się w działaniach z `number` bez jawnej konwersji i nie jest serializowany przez
`JSON.stringify`, dlatego takie identyfikatory często przesyła się jako stringi.
