# Unie i zawężanie {mid}

**Typ unii** (`A | B`) mówi, że wartość jest jednym z kilku typów. Zanim użyje się składowych specyficznych dla jednego z nich, kod musi **zawęzić**
unię sprawdzeniami, które kompilator rozumie: `typeof`, `instanceof`, `in`, równością, prawdziwością (truthiness), **właściwościami wyróżniającymi**
i własnymi **type guardami**. Unie z wyróżnikiem ze **sprawdzaniem kompletności** to jeden z najcenniejszych wzorców TypeScriptu. Przykłady sprawdzałem
w TypeScript 7.0.

## Unie z wyróżnikiem i kompletność

```ts
type Shape =
  | { kind: "circle"; r: number }
  | { kind: "square"; side: number }
  | { kind: "rect"; w: number; h: number };

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;       // tutaj s to wariant circle
    case "square": return s.side ** 2;
    default: {
      const _exhaustive: never = s;                  // błąd: rect nie jest obsłużony
      return _exhaustive;
    }
  }
}
```

Każdy wariant ma literalne `kind`; jego sprawdzenie zawęża `s` do tego wariantu. Ponieważ `rect` nie został obsłużony, kompilator zgłosił „Type
'{ kind: "rect"; ... }' is not assignable to type 'never'”: dodanie nowego wariantu zamienia każdy niekompletny `switch` w błąd kompilacji. Ten sam kształt
modeluje wyniki: `{ ok: true; value } | { ok: false; error }`.

## Techniki zawężania (wszystkie skompilowały się zgodnie z oczekiwaniami)

- `typeof x === "string"`, `x === null`, `Array.isArray(x)`: prymitywy, null, tablice.
- `"swim" in a`: sprawdzanie właściwości w uniach obiektów.
- `x instanceof Date`: klasy (nie interfejsy, których nie ma w czasie działania).
- Warunek niemożliwy zostawia `never`: w `if (typeof x === "boolean")` dla `string | number` `x` jest `never`.
- **Prawdziwość** usuwa `null`/`undefined`, ale też `0` i `""`: `n ? n.toFixed() : "none"` zwróciło w czasie działania `"none"` dla `0`, co jest klasycznym
  błędem; porównuje się przez `!== undefined`.

## Type guardy i funkcje asercji

```ts
function isDate(v: unknown): v is Date { return v instanceof Date; }        // predykat typu
function assertNum(v: unknown): asserts v is number {                         // funkcja asercji
  if (typeof v !== "number") throw new Error("not a number");
}
```

Predykat typu zawęża w gałęzi wywołującej, a funkcja asercji w pozostałej części zakresu. Kompilator im **ufa**: guard `lie(v): v is string`, który zawsze
zwraca `true`, się skompilował, a wywołanie `val.toUpperCase()` na liczbie 42 rzuciło w czasie działania `TypeError: val.toUpperCase is not a function`.
Guardy powinny być proste i przetestowane.

## `satisfies`

`const colors = { red: "#f00", green: "#0f0" } satisfies Record<string, string>` sprawdza obiekt względem typu, ale zachowuje jego **wywiedziony** typ:
`colors.blue` było błędem (TS2339), bo klucze to dokładnie `red` i `green`. Z adnotacją `const colors2: Record<string, string>` obiekt staje się otwartym
słownikiem, a `colors2.blue.toUpperCase()` skompilowało się bez żadnego błędu (i wywróciłoby się w czasie działania), chyba że włączone jest
`noUncheckedIndexedAccess`.

## Źródła

- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Using type predicates](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
- [Assertion functions (TypeScript 3.7)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions)
- [The satisfies operator (TypeScript 4.9)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator)

## Pytania

### Czym jest typ unii? {junior}

To typ, który pozwala wartości być jednym z kilku typów, zapisywany `A | B`, np. `string | null` albo `"light" | "dark"`. Można używać tylko składowych wspólnych dla wszystkich wariantów, dopóki nie
zawęzi się unii do konkretnego wariantu sprawdzeniem, które rozumie kompilator. Unie typów literalnych to lekka alternatywa TypeScriptu dla enumów.

### Czym jest zawężanie? {junior}

To analiza przepływu sterowania w kompilatorze, która doprecyzowuje typ zmiennej w gałęzi na podstawie sprawdzeń: po `typeof x === "string"` zmienna jest `string` w tej gałęzi; po `x === null` jest
`null`; po `"swim" in a` jest wariantem z `swim`. Działa też z `instanceof`, `Array.isArray`, równością z literałami, prawdziwością i wczesnymi powrotami.

### Czym jest unia z wyróżnikiem? {mid}

To unia typów obiektowych, które mają wspólną właściwość o innym typie literalnym w każdym wariancie (wyróżnik), np. `kind: "circle" | "square"` albo `ok: true | false`. Sprawdzenie wyróżnika zawęża
do jednego wariantu, więc dostępne są jego specyficzne właściwości. To standardowy sposób modelowania stanów, zdarzeń, wyników API i akcji reducera.

### Jak sprawić, żeby kompilator pilnował obsłużenia każdego przypadku unii? {mid}

Użyć `switch` na wyróżniku, a w gałęzi `default` przypisać wartość do zmiennej typu `never` (albo przekazać ją do funkcji przyjmującej `never`). Jeśli wszystkie warianty są obsłużone, wartość jest
tam `never`; jeśli któregoś brakuje, jest tym wariantem i przypisanie zawodzi: w teście nieobsłużony `rect` dał „is not assignable to type 'never'”. Dodanie nowego wariantu oznacza wtedy każdy
niekompletny `switch`.

### Czym jest type guard zdefiniowany przez użytkownika? {mid}

To funkcja zwracająca predykat typu, `function isDate(v: unknown): v is Date`, która zawęża argument w gałęzi, w której zwraca true. Stosuje się ją przy sprawdzeniach, których kompilator nie potrafi
wywnioskować, np. walidacji nieznanych danych. Kompilator ufa predykatowi całkowicie: w teście guard, który zawsze zwracał true, pozwolił traktować liczbę jak napis, co wywróciło się w czasie
działania.

### Czym różni się predykat typu od funkcji asercji? {senior}

Predykat typu (`v is T`) zwraca wartość logiczną i zawęża tylko wewnątrz `if`, który go używa. Funkcja asercji (`asserts v is T` albo `asserts condition`) nic nie zwraca i rzuca wyjątek, gdy sprawdzenie
zawiedzie; po wywołaniu wartość jest zawężona do końca zakresu, jak w `assertNum(v); return v * 2`. Funkcje asercji pasują do warunków wstępnych i walidacji na wejściu do funkcji.

### Dlaczego zawężanie przez prawdziwość jest ryzykowne? {junior}

`if (x)` usuwa `null` i `undefined`, ale też poprawne wartości fałszywe: `0`, `""`, `false`, `NaN`. W teście `n ? n.toFixed() : "none"` zwróciło „none” dla `0`. Dla opcjonalnych liczb i napisów
porównuje się jawnie (`x !== undefined`, `x != null`) albo używa `??` zamiast `||` przy wartościach domyślnych.

### Co robi operator `satisfies`? {mid}

Sprawdza, czy wyrażenie jest zgodne z typem, nie zmieniając jego wywiedzionego typu. `{ red: "#f00" } satisfies Record<string, string>` waliduje wartości, ale zachowuje dokładne klucze, więc odwołanie
do brakującego klucza jest błędem (sprawdzone); adnotacja `: Record<string, string>` poszerzyłaby go do otwartego słownika, w którym kompiluje się dowolny klucz. Idealnie pasuje do obiektów
konfiguracyjnych i tablic wyszukiwania.

### Jak działa zawężanie przez `in`? {mid}

`"prop" in obj` zawęża unię do wariantów, które mają (albo mogą mieć) tę właściwość, np. `if ("swim" in a) a.swim(); else a.fly()`. Działa na uniach obiektów bez wspólnego wyróżnika. Sprawdza
właściwość w czasie działania, łącznie z dziedziczonymi, więc jest wiarygodne dla kształtów, ale nie do rozróżniania typów o wspólnych nazwach właściwości.

### Jak modelować wynik operacji, która może się nie powieść, bez wyjątków? {mid}

Unią z wyróżnikiem, np. `type Result<T> = { ok: true; value: T } | { ok: false; error: string }`. Wywołujący muszą sprawdzić `ok` przed dostępem do `value` albo `error`, więc kompilator wymusza
obsługę błędów, inaczej niż wyjątki, które w TypeScripcie nie są częścią sygnatur funkcji. Przydaje się przy spodziewanych niepowodzeniach (walidacja, parsowanie); nieoczekiwane błędy nadal się rzuca.
