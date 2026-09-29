# Prototypy i klasy {mid}

JavaScript ma **dziedziczenie prototypowe**: każdy obiekt ma ukryte łącze `[[Prototype]]` do innego obiektu
(lub `null`). Gdy właściwości nie ma w obiekcie, silnik szuka jej w prototypie, potem w prototypie prototypu
i tak dalej. To **łańcuch prototypów**. Składnia `class` to czytelniejszy zapis tego samego mechanizmu.

```js
const animal = { speak() { return `${this.name} wydaje dźwięk` } }
const dog = Object.create(animal)       // [[Prototype]] dog → animal
dog.name = 'Rex'

dog.speak()                              // 'Rex wydaje dźwięk' (metoda z prototypu, this = dog)
Object.getPrototypeOf(dog) === animal    // true
dog.hasOwnProperty('speak')              // false: to nie jest własna właściwość
'speak' in dog                           // true: in sprawdza cały łańcuch
```

Łańcuch zwykłego obiektu kończy się na `Object.prototype` (skąd pochodzą `toString`, `hasOwnProperty`), a jego
prototypem jest `null`. `Object.create(null)` tworzy obiekt **bez prototypu**, np. jako bezpieczny słownik.

## Funkcje konstruktorów (przed ES2015)

```js
function Person(name) { this.name = name }
Person.prototype.greet = function () { return 'Cześć, ' + this.name }

const p = new Person('Ala')
Object.getPrototypeOf(p) === Person.prototype   // true
```

`new` tworzy pusty obiekt z `[[Prototype]]` ustawionym na `Person.prototype`, wywołuje funkcję z `this`
wskazującym ten obiekt i zwraca go. Metody leżą na prototypie, więc są **współdzielone** przez wszystkie
instancje, a nie kopiowane.

## Klasy (ES2015+)

```js
class Animal {
  #secret = 42                     // pole prywatne (ES2022), niedostępne spoza klasy
  static count = 0                 // pole statyczne (na samej klasie)
  name                             // pole publiczne: osobne w każdej instancji

  constructor(name) {
    this.name = name
    Animal.count++
  }

  speak() { return `${this.name} mówi` }     // metoda na Animal.prototype
  get secret() { return this.#secret }        // getter
  static create(name) { return new this(name) }
}

class Dog extends Animal {
  speak() { return super.speak() + ' (hau)' } // wywołanie metody rodzica
}
```

- Klasa to w praktyce funkcja konstruktora (`typeof Animal === 'function'`), a metody trafiają na prototyp.
- Klasy **nie są podnoszone** w użyteczny sposób (są w TDZ) i działają w **trybie ścisłym**. Wywołanie bez
  `new` rzuca `TypeError`.
- W podklasie z konstruktorem trzeba wywołać `super(...)` **przed** użyciem `this` (inaczej `ReferenceError`).
- `extends` ustawia dwa łańcuchy: `Dog.prototype → Animal.prototype` (metody instancji) oraz `Dog → Animal`
  (metody i pola statyczne są dziedziczone).
- **Pola prywatne `#x`** są wymuszane przez język: odwołanie spoza klasy to błąd składni już przy parsowaniu.
  `#x in obj` sprawdza, czy obiekt ma to pole.
- Pola klasy (`name`, `handler = () => {}`) są tworzone w **każdej instancji**, a metody raz na prototypie.

## `instanceof` i sprawdzanie typów

`obj instanceof C` sprawdza, czy `C.prototype` występuje w łańcuchu prototypów `obj`. Zawodzi między różnymi
realmami (np. obiekt z iframe) i przy zmianie prototypu, dlatego tablice sprawdza się przez `Array.isArray`.

## Kompozycja zamiast głębokiego dziedziczenia

Długie hierarchie klas są kruche („problem banana i goryla”). Częściej lepsza jest **kompozycja**: obiekt
składa się z mniejszych obiektów lub funkcji, a zachowanie przekazuje się jako zależność. Rozszerzanie
prototypów wbudowanych typów (`Array.prototype.last = ...`, tzw. monkey patching) grozi konfliktami
z przyszłymi wersjami języka i bibliotekami.

## Źródła

- [Inheritance and the prototype chain (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)
- [Classes (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)
- [Private properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_properties)
- [Object.create (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create)

## Pytania

### Czym jest łańcuch prototypów? {junior}

Każdy obiekt ma ukryte łącze `[[Prototype]]` do innego obiektu. Przy odczycie właściwości, której obiekt nie ma, silnik szuka
jej w prototypie, potem w jego prototypie i tak dalej, aż do `null`. Tak obiekty „dziedziczą” metody, np. każda tablica ma
`map` z `Array.prototype`, a każdy obiekt `toString` z `Object.prototype`.

### Czy klasy w JavaScript to „prawdziwe” klasy jak w Javie czy C#? {mid}

Nie. `class` to składnia nad prototypami: klasa jest funkcją konstruktora, metody lądują na jej `prototype`, a dziedziczenie
to łączenie prototypów. Klasy wnoszą jednak realne różnice względem funkcji konstruktorów: tryb ścisły, obowiązkowe `new`,
TDZ, `super`, pola publiczne, statyczne i prywatne (`#`), których nie da się podrobić zwykłymi funkcjami.

### Co robi operator `new`? {mid}

Tworzy nowy obiekt, ustawia jego `[[Prototype]]` na `Constructor.prototype`, wywołuje konstruktor z `this` wskazującym ten
obiekt i zwraca go (chyba że konstruktor jawnie zwróci inny obiekt). Dzięki temu metody z prototypu są współdzielone przez
wszystkie instancje.

### Dlaczego metody definiuje się na prototypie, a nie w konstruktorze? {mid}

Metoda na prototypie istnieje w pamięci raz i jest współdzielona przez wszystkie instancje. Funkcja przypisana w konstruktorze
(`this.greet = function () {}`, a także pole klasy ze strzałką) tworzy osobną kopię w każdej instancji, co przy wielu obiektach
zużywa więcej pamięci. Metodę na prototypie można też nadpisać w podklasie i wywołać przez `super`.

### Czym różni się `hasOwnProperty` od operatora `in`? {junior}

`obj.hasOwnProperty('x')` (lepiej `Object.hasOwn(obj, 'x')`) sprawdza tylko **własne** właściwości obiektu. `'x' in obj`
sprawdza cały łańcuch prototypów, więc zwraca `true` także dla odziedziczonych metod, np. `'toString' in {}`. Pętla
`for...in` również przechodzi po odziedziczonych, wyliczalnych właściwościach, a `Object.keys` tylko po własnych.

### Dlaczego w konstruktorze podklasy trzeba wywołać `super()` przed użyciem `this`? {mid}

W klasach pochodnych obiekt jest tworzony przez konstruktor klasy bazowej. Dopóki `super()` go nie utworzy, `this` nie jest
zainicjalizowane i odwołanie do niego rzuca `ReferenceError`. Jeśli podklasa nie definiuje konstruktora, domyślny wywołuje
`super(...args)` automatycznie.

### Czym są pola prywatne `#` i czym różnią się od konwencji `_nazwa`? {mid}

`#field` to prawdziwa prywatność wymuszana przez język: odwołanie spoza ciała klasy jest błędem składni, a pole nie pojawia się
w `Object.keys`, JSON ani przy refleksji. Konwencja `_nazwa` to tylko sygnał dla programistów, a pole pozostaje w pełni
dostępne. `#x in obj` pozwala bezpiecznie sprawdzić, czy obiekt ma pole prywatne danej klasy.

### Jak działa `instanceof` i kiedy zawodzi? {mid}

Sprawdza, czy `Constructor.prototype` występuje gdziekolwiek w łańcuchu prototypów obiektu. Zawodzi dla obiektów z innego
realmu (iframe, worker, `vm` w Node), bo mają one własne `Array` czy `Object`, a także po ręcznej zmianie prototypu oraz dla
prymitywów. Dlatego do tablic używa się `Array.isArray`, a do własnych typów czasem sprawdzania kształtu (duck typing).

### Do czego służy `Object.create(null)`? {mid}

Tworzy obiekt bez prototypu, więc bez odziedziczonych właściwości typu `toString`, `constructor` czy `__proto__`. Przydaje się
jako słownik z kluczami od użytkownika, bo nie ma ryzyka kolizji z nazwami z `Object.prototype` ani ataków prototype pollution.
Współcześnie do słowników częściej używa się `Map`.

### Dlaczego nie rozszerza się prototypów wbudowanych obiektów? {senior}

Dopisanie np. `Array.prototype.last` wpływa na cały kod w aplikacji i bibliotekach. Grozi to konfliktem z inną biblioteką
robiącą to samo inaczej oraz z przyszłymi wersjami języka: tak było z `Array.prototype.flatten`, przemianowanym na `flat`, bo
popularna biblioteka zepsułaby strony (tzw. „smooshgate”). Zamiast tego pisze się funkcje pomocnicze albo używa polyfilli
zgodnych ze specyfikacją.
