# Obiekty, referencje i kopiowanie {mid}

Zmienna z obiektem (także tablicą, funkcją, datą) przechowuje **referencję**. Przypisanie i przekazanie do
funkcji kopiuje referencję, a nie obiekt, więc zmiana przez jedną zmienną jest widoczna przez drugą.

```js
const a = { count: 1 }
const b = a
b.count = 2          // a.count === 2: ten sam obiekt

function mutate(obj) { obj.x = 1 }          // zmienia obiekt wywołującego
function reassign(obj) { obj = { x: 2 } }   // zmienia tylko lokalną kopię referencji
```

JavaScript zawsze przekazuje argumenty **przez wartość**, ale dla obiektów tą wartością jest referencja.

## Kopia płytka i głęboka

**Płytka** kopia tworzy nowy obiekt najwyższego poziomu, ale zagnieżdżone obiekty są **współdzielone**:

```js
const orig = { a: 1, nested: { b: 2 } }
const copy = { ...orig }            // albo Object.assign({}, orig), [...arr], arr.slice()
copy.a = 9                          // orig.a nadal 1
copy.nested.b = 99                  // orig.nested.b === 99 ⚠️
```

**Głęboka** kopia kopiuje wszystkie poziomy:

| Metoda | Zalety | Ograniczenia |
| --- | --- | --- |
| `structuredClone(obj)` | wbudowana, obsługuje `Date`, `Map`, `Set`, typed arrays, **cykle** | nie kopiuje funkcji (rzuca `DataCloneError`), gubi prototyp klas i gettery |
| `JSON.parse(JSON.stringify(obj))` | proste, szybkie dla czystych danych | `Date` staje się stringiem, gubi `undefined`, funkcje i `Symbol`, `NaN`/`Infinity` staje się `null`, **rzuca przy cyklach** |
| biblioteki (`lodash.cloneDeep`) | elastyczne | dodatkowa zależność |

W praktyce głębokie kopie są rzadko potrzebne. Przy **niezmiennych aktualizacjach** (React, Redux) kopiuje się
tylko ścieżkę do zmienianej wartości:

```js
const next = { ...state, user: { ...state.user, address: { ...state.user.address, city: 'Kraków' } } }
```

Przy głębokich strukturach pomaga Immer, który pozwala pisać „mutacje” na szkicu i tworzy nową wersję
z nienaruszonymi referencjami tam, gdzie nic się nie zmieniło (structural sharing).

## Niezmienność na poziomie języka

- `Object.freeze(obj)`: nie można dodawać, usuwać ani zmieniać właściwości. Działa **płytko**
  (zagnieżdżone obiekty zostają mutowalne). W trybie nieścisłym zapis jest cicho ignorowany, a w ścisłym
  (moduły ES) rzuca `TypeError`.
- `Object.seal(obj)`: można zmieniać istniejące właściwości, ale nie dodawać ani usuwać.
- `Object.preventExtensions(obj)`: tylko zakaz dodawania.

## Porównywanie obiektów

`===` porównuje referencje: `{ a: 1 } === { a: 1 }` to `false`. Porównanie zawartości wymaga własnej funkcji
(płytkiej lub głębokiej) albo biblioteki. `JSON.stringify` jako porównanie zawodzi przy różnej kolejności kluczy.

## Klucze i słowniki

- Klucze zwykłego obiektu to stringi (lub symbole). Obiekt jako klucz zamienia się w `'[object Object]'`.
- Kolejność kluczy: najpierw klucze „całkowitoliczbowe” rosnąco, potem stringi w kolejności dodania.
- **`Map`** przyjmuje klucze dowolnego typu (także obiekty), zachowuje kolejność wstawiania, ma `size`, nie ma
  kolizji z `Object.prototype` i jest wydajniejsza przy częstym dodawaniu i usuwaniu.
- `Object.keys/values/entries` i `Object.fromEntries` pozwalają przekształcać obiekty jak tablice.

## Źródła

- [structuredClone (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)
- [Object.freeze (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)
- [Shallow copy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Shallow_copy)
- [Deep copy (MDN glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Deep_copy)
- [Map (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)

## Pytania

### Czy JavaScript przekazuje obiekty przez referencję? {junior}

Formalnie wszystko jest przekazywane przez wartość, ale dla obiektów tą wartością jest referencja. Funkcja może więc zmienić
zawartość przekazanego obiektu (widać to u wywołującego), ale przypisanie parametrowi nowego obiektu (`obj = {}`) zmienia
tylko lokalną kopię referencji i nie wpływa na wywołującego.

### Czym różni się kopia płytka od głębokiej? {junior}

Płytka kopia (`{...obj}`, `Object.assign`, `[...arr]`, `slice`) tworzy nowy obiekt najwyższego poziomu, ale zagnieżdżone obiekty
są współdzielone z oryginałem, więc ich zmiana jest widoczna w obu. Głęboka kopia rekurencyjnie kopiuje wszystkie poziomy, więc
kopia jest całkowicie niezależna.

### Jak zrobić głęboką kopię obiektu i jakie są pułapki? {mid}

Najlepiej przez `structuredClone`: obsługuje `Date`, `Map`, `Set` i cykle, ale nie kopiuje funkcji i gubi prototypy klas.
`JSON.parse(JSON.stringify(x))` zamienia daty na stringi, gubi `undefined`, funkcje i symbole, zamienia `NaN` na `null` i rzuca
przy cyklach. Często jednak głęboka kopia jest zbędna, bo wystarczy niezmienna aktualizacja kopiująca tylko zmienianą ścieżkę.

### Czy `Object.freeze` zamraża obiekt całkowicie? {mid}

Nie, działa płytko: blokuje dodawanie, usuwanie i zmianę właściwości najwyższego poziomu, ale zagnieżdżone obiekty pozostają
mutowalne. Pełne zamrożenie wymaga rekurencji (deep freeze). W trybie nieścisłym próba zapisu jest cicho ignorowana, a w trybie
ścisłym (moduły, klasy) rzuca `TypeError`.

### Dlaczego `{ a: 1 } === { a: 1 }` zwraca `false`? {junior}

Operator `===` dla obiektów porównuje referencje, a nie zawartość. Każdy literał tworzy nowy obiekt w pamięci, więc to dwa różne
obiekty. Porównanie zawartości wymaga funkcji porównującej właściwości (płytko lub rekurencyjnie) albo biblioteki, np.
`lodash.isEqual`.

### Czym różni się `Map` od zwykłego obiektu jako słownika? {mid}

`Map` przyjmuje klucze dowolnego typu (obiekty, funkcje), a obiekt tylko stringi i symbole. `Map` zachowuje kolejność wstawiania,
ma `size`, jest iterowalna, nie ma odziedziczonych kluczy z `Object.prototype` (brak kolizji, np. z `constructor`) i jest
optymalizowana pod częste dodawanie i usuwanie. Obiekt jest wygodniejszy dla stałych struktur i serializacji do JSON.

### Na czym polega niezmienna aktualizacja zagnieżdżonego obiektu? {mid}

Tworzy się nowe obiekty na całej ścieżce od korzenia do zmienianej wartości, a pozostałe gałęzie przekazuje przez referencję,
np. `{ ...state, user: { ...state.user, name } }`. Zmienione obiekty mają nowe referencje, co pozwala szybko wykrywać zmiany
(React, `memo`, selektory), a niezmienione są współdzielone. Przy głębokich strukturach upraszcza to Immer.

### Co się stanie po użyciu obiektu jako klucza w zwykłym obiekcie? {mid}

Klucz zostanie skonwertowany na string, czyli `'[object Object]'`. Wszystkie obiekty-klucze trafią więc pod ten sam klucz
i będą się nadpisywać. Do kluczy obiektowych służy `Map` albo `WeakMap`, gdy klucz nie powinien blokować zwolnienia obiektu przez GC.

### W jakiej kolejności `Object.keys` zwraca klucze? {mid}

Najpierw klucze będące indeksami całkowitymi (np. `'1'`, `'2'`) w kolejności rosnącej, potem pozostałe klucze stringowe
w kolejności dodania. Symbole są pomijane (zwraca je `Object.getOwnPropertySymbols`). Jeśli ważna jest kolejność wstawiania
dowolnych kluczy, lepiej użyć `Map`.

### Czym różnią się `Object.freeze`, `Object.seal` i `Object.preventExtensions`? {senior}

`preventExtensions` blokuje tylko dodawanie nowych właściwości. `seal` dodatkowo blokuje usuwanie i zmianę konfiguracji, ale
pozwala zmieniać wartości istniejących właściwości. `freeze` blokuje także zmianę wartości, więc obiekt jest tylko do odczytu.
Wszystkie działają płytko i można je sprawdzić przez `Object.isExtensible`, `isSealed` i `isFrozen`.
