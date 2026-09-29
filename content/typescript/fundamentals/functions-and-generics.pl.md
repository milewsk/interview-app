# Funkcje i typy generyczne {mid}

To w funkcjach wyłapuje się najwięcej błędów typów: typy parametrów i wyników, przeciążenia, `this` i zgodność callbacków. **Typy generyczne** pozwalają
funkcji albo typowi działać z wieloma typami przy zachowaniu związku między wejściem a wyjściem (`first<T>(xs: T[]): T`), zamiast uciekać w `any`.
Przykłady sprawdzałem w TypeScript 7.0.

## Typy funkcji i parametry

```ts
type Formatter = (value: number) => string;
function greet(name: string, greeting = "Hi", ...rest: string[]) { ... }   // parametr domyślny i resztowy
function withThis(this: HTMLElement) { return this.tagName; }             // typowany this
withThis();                  // błąd TS2684: 'this' context of type 'void' is not assignable to 'HTMLElement'
```

- **Wynik `void` w typie funkcji** oznacza „wartość zwracana jest ignorowana”, więc `const cb: () => void = () => 42` się kompiluje (dlatego
  `forEach(x => arr.push(x))` jest w porządku).
- **Wariancja parametrów**: przy `strictFunctionTypes` (część `strict`) właściwość typu funkcyjnego przyjmuje tylko funkcje, których parametry są takie same
  albo **szersze**: handler przyjmujący `Event` został przyjęty tam, gdzie oczekiwano `(e: MouseEvent) => void`, ale handler przyjmujący `MouseEvent` został
  odrzucony dla `(e: Event) => void` (TS2322). **Metody** zadeklarowane składnią metody są sprawdzane biwariantnie: `{ handle(e: MouseEvent) {} }` zostało
  przyjęte dla `handle(e: Event): void`.

## Przeciążenia

```ts
function parse(v: string): number;
function parse(v: number): string;
function parse(v: string | number): string | number { ... }     // sygnatura implementacji, niewywoływalna
parse("1");      // number
parse(2);        // string
parse(Math.random() > 0.5 ? "1" : 2);   // błąd TS2769: No overload matches this call
```

Przeciążenia dają dokładne typy wyników dla każdego wejścia, ale wywołanie z argumentem typu unii nie pasuje do żadnego z nich. Jedna sygnatura z unią albo
generyczny/warunkowy typ wyniku jest często prostsza.

## Typy generyczne

```ts
function first<T>(xs: T[]): T | undefined { return xs[0]; }              // T wywiedzione: first([1, 2]) -> number | undefined
function longest<T extends { length: number }>(a: T, b: T): T { ... }    // ograniczenie
function getProp<T, K extends keyof T>(o: T, k: K): T[K] { return o[k]; } // klucz i dostęp indeksowany
function tupleConst<const T>(x: T) { return x; }                          // parametr typu const (TS 5.0)
```

Sprawdzone: `longest(1, 2)` zawiodło (number nie ma `length`); `getProp({ name: "Ann", age: 3 }, "age")` zwróciło `number`, a `"email"` zawiodło, bo to nie
klucz; `tupleConst(["a", "b"])` wywiodło `readonly ["a", "b"]` zamiast `string[]`. Parametry typu mogą mieć **wartości domyślne** (`<T = string>`), a typy
generyczne działają dla typów, interfejsów i klas (`Box<T>`, `Repository<TEntity>`).

## Źródła

- [More on functions (handbook)](https://www.typescriptlang.org/docs/handbook/2/functions.html)
- [Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [strictFunctionTypes](https://www.typescriptlang.org/tsconfig/#strictFunctionTypes)
- [const type parameters (TypeScript 5.0)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#const-type-parameters)
- [Why functions returning non-void are assignable to void functions (FAQ)](https://github.com/microsoft/TypeScript/wiki/FAQ#why-are-functions-returning-non-void-assignable-to-function-returning-void)

## Pytania

### Dlaczego używać typów generycznych zamiast `any`? {junior}

Typy generyczne zachowują związek między typami: `function first<T>(xs: T[]): T | undefined` zwraca `number | undefined` dla `number[]` i `string | undefined` dla `string[]`, a wersja z `any` straciłaby
tę informację i przyjęłaby każde błędne użycie. Wywołujący zwykle nie podaje argumentu typu; jest on wywodzony z argumentów.

### Czym są ograniczenia typów generycznych? {mid}

`T extends Something` ogranicza, jakie typy można podstawić pod parametr typu, więc funkcja może polegać na ich składowych: `longest<T extends { length: number }>` działa z napisami i tablicami,
a odrzuca liczby (sprawdzone). `K extends keyof T` ogranicza parametr do kluczy innego typu, co daje bezpieczny typowo dostęp do właściwości zwracający `T[K]`.

### Jak działa `keyof` z typami dostępu indeksowanego w funkcji generycznej? {mid}

W `function getProp<T, K extends keyof T>(o: T, k: K): T[K]` `keyof T` to unia nazw właściwości `T`, a `T[K]` to typ właściwości o nazwie `K`. Zatem `getProp(user, "age")` zwraca `number`,
`getProp(user, "name")` zwraca `string`, a nieistniejący klucz, np. `"email"`, to błąd kompilacji (sprawdzone). Na tym wzorcu opierają się typowane `pick`, `groupBy`, pomocniki formularzy i ORM-y.

### Czym są przeciążenia funkcji i jakie jest ich główne ograniczenie? {mid}

To kilka sygnatur wywołania, po których następuje jedna implementacja, co pozwala, żeby typ wyniku zależał od dopasowanej sygnatury (`parse(string): number`, `parse(number): string`). Sygnatura
implementacji nie jest widoczna dla wywołujących. Ograniczenie: wywołanie musi pasować do jednego przeciążenia, więc argument typu `string | number` kończy się „No overload matches this call”
(sprawdzone). Gdy logika na to pozwala, unie albo typy warunkowe mogą zastąpić przeciążenia.

### Dlaczego funkcję zwracającą wartość można przypisać do `() => void`? {mid}

W typie funkcji wynik `void` oznacza, że wywołujący zignoruje wynik, a nie że funkcja nie może niczego zwracać, więc funkcje zwracające wartości są dozwolone: `const cb: () => void = () => 42` się
skompilowało. Dzięki temu działają callbacki takie jak `arr.forEach(x => other.push(x))`, choć `push` zwraca liczbę. Deklaracja funkcji z jawnym typem wyniku `: void` nie może jednak zwracać wartości.

### Co sprawdza `strictFunctionTypes`? {senior}

Sprawdza parametry funkcji kontrawariantnie: funkcja przypisywana do typu funkcji musi przyjmować co najmniej typy parametrów obiecane przez ten typ. Handler dowolnego `Event` można użyć tam, gdzie
oczekiwany jest handler `MouseEvent`, ale handlera `MouseEvent` nie można użyć tam, gdzie może trafić dowolne `Event` (w teście TS2322). Z powodów historycznych parametry metod zadeklarowanych składnią
metody pozostają biwariantne, więc metoda przyjmująca `MouseEvent` została przyjęta dla `handle(e: Event)`.

### Jak typować `this` w funkcji? {mid}

Zadeklarować sztuczny pierwszy parametr o nazwie `this`: `function withThis(this: HTMLElement) { ... }`. Jest usuwany z wyniku i sprawia, że kompilator sprawdza wywołania: wywołanie bez właściwego
kontekstu zakończyło się w teście TS2684. Przydaje się przy handlerach zdarzeń i funkcjach przeznaczonych do dołączenia jako metody; przy `noImplicitThis` (część `strict`) nietypowane użycie `this`
jest błędem.

### Czym są parametry typu `const`? {senior}

To modyfikator parametru typu (`function f<const T>(x: T)`, TypeScript 5.0), który sprawia, że inferencja zachowuje się tak, jakby argument zapisano z `as const`: `f(["a", "b"])` daje
`readonly ["a", "b"]` zamiast `string[]` (sprawdzone). Biblioteki używają go w definicjach tras, nazwach zdarzeń i konfiguracji, żeby wywołujący dostawali typy literalne bez samodzielnego pisania
`as const`.

### Czym są domyślne parametry typu? {mid}

Parametry typu mogą mieć wartości domyślne używane, gdy nie podano argumentu i nie da się go wywieść: `interface Response<T = unknown> { data: T }` albo `class Cache<TValue = string>`. Są częste
w typach bibliotek, np. w wariantach `useState<S = undefined>()` Reacta albo `EventEmitter<Events = {}>`, żeby proste użycia nie wymagały jawnych argumentów typu.

### Czym różnią się parametry opcjonalne od parametrów z wartością domyślną? {junior}

`name?: string` czyni parametr opcjonalnym, a jego typem wewnątrz funkcji jest `string | undefined`. `greeting = "Hi"` też czyni go opcjonalnym dla wywołujących, ale wewnątrz funkcji jego typem jest
`string`, bo `undefined` jest zastępowane wartością domyślną. Jawne przekazanie `undefined` w obu przypadkach używa wartości domyślnej. Parametry opcjonalne i domyślne muszą występować po wymaganych
(chyba że wartości domyślnych używa się z jawnym `undefined`), a parametry resztowe (`...rest: string[]`) są na końcu.
