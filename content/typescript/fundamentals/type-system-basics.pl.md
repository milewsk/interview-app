# Podstawy systemu typów {junior}

TypeScript dodaje do JavaScriptu **statyczny system typów**: typy są sprawdzane w czasie kompilacji i **usuwane** z wynikowego kodu, więc nie mają
kosztu ani wpływu w czasie działania. System typów jest **strukturalny** (zgodność zależy od kształtu, nie od nazw), mocno opiera się na
**inferencji** i ma kilka specjalnych typów (`any`, `unknown`, `never`), które pojawiają się na każdej rozmowie. Przykłady sprawdzałem
w TypeScript 7.0 (`tsc --strict`).

## Typowanie strukturalne

```ts
interface Point { x: number; y: number }
const p3 = { x: 1, y: 2, z: 3 };
const a: Point = p3;                        // OK: p3 ma co najmniej x i y
const b: Point = { x: 1, y: 2, z: 3 };      // błąd TS2353: 'z' does not exist in type 'Point'
class Meters { constructor(public value: number) {} }
class Seconds { constructor(public value: number) {} }
const m: Meters = new Seconds(5);           // OK: ten sam kształt
```

Typy są zgodne, gdy pasują kształty: `Seconds` zostało przyjęte tam, gdzie oczekiwano `Meters`. **Kontrola nadmiarowych właściwości** dotyczy tylko
**świeżych literałów obiektowych** (`b`) i wyłapuje literówki; ta sama dodatkowa właściwość przez zmienną (`a`) jest dozwolona. Nominalnie różne typy
robi się typami „branded” (patrz wzorce bezpieczeństwa typów).

## Inferencja i typy literalne

- `let s = "hello"` daje `string` (poszerzony, bo może się zmienić); `const c = "hello"` daje typ literalny `"hello"`.
- Właściwości obiektów są poszerzane: `{ kind: "circle" }` ma `kind: string`; z **`as const`** jest to `readonly kind: "circle"` (przypisanie `"square"`
  zakończyło się TS2322).
- `[1, "a"]` daje `(string | number)[]`: `push(true)` zawiodło; typ **krotki** `[string, number]` ustala pozycje (przypisanie `[1, "a"]` zawiodło).

## `any`, `unknown`, `never`, `null`

- **`any`** wyłącza sprawdzanie: `an.foo.bar.baz()` się skompilowało. Rozlewa się po kodzie i ukrywa błędy; należy go unikać (reguły lintera,
  `noImplicitAny` w `strict`).
- **`unknown`** to bezpieczne „cokolwiek”: `u.toFixed()` zakończyło się TS18046 („'u' is of type 'unknown'”), dopóki nie zawężono go przez
  `typeof u === "number"`. Używa się go dla niezaufanego wejścia (`JSON.parse`, zmienne w `catch`).
- **`never`** to typ pusty: typ zwracany przez funkcje, które zawsze rzucają wyjątek, i typ pozostały po obsłużeniu wszystkich przypadków (sprawdzanie
  kompletności).
- Przy **`strictNullChecks`** (część `strict`) `null` i `undefined` są osobnymi typami: `n.length` na `string | null` zakończyło się TS18047
  („possibly 'null'”).

## Asercje typów

`value as Type` każe kompilatorowi ci zaufać; w czasie działania nic nie jest sprawdzane. `document.getElementById("x") as HTMLInputElement` kompiluje się,
nawet jeśli element to `div` albo go nie ma, a `"text" as unknown as number` też się skompilowało. Zamiast asercji lepiej zawężać (type guardy); `!`
(asercja nie-null) to ten sam rodzaj obietnicy.

## Źródła

- [TypeScript Handbook: everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- [Type compatibility (structural typing)](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)
- [Type inference](https://www.typescriptlang.org/docs/handbook/type-inference.html)
- [TypeScript 3.0: the unknown type](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type)
- [Object types and excess property checks](https://www.typescriptlang.org/docs/handbook/2/objects.html)

## Pytania

### Co TypeScript dodaje do JavaScriptu i co dzieje się z typami w czasie działania? {junior}

Statyczny system typów sprawdzany przez kompilator i edytor: adnotacje typów, inferencję, interfejsy, typy generyczne i więcej, co wyłapuje błędy przed uruchomieniem kodu i napędza podpowiedzi
oraz refaktoryzację. Typy są usuwane przy kompilacji (albo wycinane przez narzędzia, np. type stripping w Node), więc w czasie działania to zwykły JavaScript: nie ma sprawdzania typów, a wartości
z zewnątrz (odpowiedzi API, dane od użytkownika) nie są automatycznie walidowane.

### Czym jest typowanie strukturalne? {junior}

Zgodność zależy od kształtu typów, a nie od ich nazw czy deklaracji: każdy obiekt z wymaganymi właściwościami zgodnych typów można przypisać. W teście instancja `Seconds` została przyjęta tam,
gdzie oczekiwano `Meters`, bo oba mają `value: number`. Różni się to od typowania nominalnego w C# czy Javie i dlatego używa się „typów branded”, gdy dwa typy o identycznym kształcie nie mogą się
mieszać.

### Dlaczego TypeScript czasem odrzuca nadmiarowe właściwości, a czasem nie? {mid}

Kontrola nadmiarowych właściwości dotyczy tylko świeżych literałów obiektowych przypisywanych bezpośrednio do typowanego celu: `const b: Point = { x: 1, y: 2, z: 3 }` kończy się TS2353, co wyłapuje
literówki, np. w nazwach opcjonalnych właściwości. Jeśli obiekt najpierw trafi do zmiennej, jest sprawdzany strukturalnie, a dodatkowe `z` jest dozwolone. To pragmatyczna heurystyka, a nie gwarancja,
że obiekty nie mają w czasie działania dodatkowych właściwości.

### Czym różni się `any` od `unknown`? {junior}

Oba przyjmują dowolną wartość, ale `any` wyłącza też sprawdzanie wszystkiego, co się z nim robi (`an.foo.bar.baz()` się skompilowało), i po cichu rozlewa się na inne zmienne. `unknown` zabrania
operacji, dopóki się go nie zawęzi (`u.toFixed()` zakończyło się TS18046, a zadziałało po `typeof u === "number"`). `unknown` stosuje się dla niezaufanych danych i w kodzie generycznym, a `any`
traktuje jako furtkę awaryjną.

### Do czego służy typ `never`? {mid}

Reprezentuje wartości, które nie mogą istnieć: typ zwracany przez funkcje, które nigdy nie wracają (rzucają wyjątek albo zapętlają się), i typ zmiennej po wykluczeniu wszystkich możliwych przypadków.
Przypisanie pozostałej wartości do `never` w gałęzi `default` instrukcji `switch` sprawia, że kompilator zgłasza każdy nieobsłużony element unii, zamieniając zapomniane przypadki w błędy kompilacji.

### Jak TypeScript wywodzi typy dla `let`, `const` i literałów obiektowych? {mid}

`let` zainicjalizowane literałem jest poszerzane do ogólnego typu (`string`), bo można je ponownie przypisać; `const` zachowuje typ literalny (`"hello"`). Właściwości obiektów i tablic też są
poszerzane, bo są mutowalne: `{ kind: "circle" }` ma `kind: string`, a `[1, "a"]` staje się `(string | number)[]`. `as const` zachowuje typy literalne i czyni właściwości tylko do odczytu, dzięki czemu
uzyskuje się dokładne typy obiektów konfiguracyjnych i krotek.

### Co zmienia `strictNullChecks`? {junior}

Czyni `null` i `undefined` osobnymi typami, których nie można przypisać do innych typów, chyba że dołączy się je jawnie (`string | null`), więc kompilator zgłasza możliwe dereferencje null:
`n.length` na `string | null` zakończyło się „'n' is possibly 'null'”. Bez tej opcji każdy typ po cichu zawiera null, jak w starszym TypeScripcie. Jest częścią `strict`, domyślnego od TypeScript 6.0.

### Czym jest asercja typu i dlaczego jest ryzykowna? {mid}

`value as SomeType` (albo `<SomeType>value`) nadpisuje typ wyrażenia wyznaczony przez kompilator bez żadnego sprawdzenia w czasie działania. Kompiluje się, gdy typy są powiązane, a podwójna asercja
przez `unknown` kompiluje się dla czegokolwiek (`"text" as unknown as number` skompilowało się w teście). Jeśli założenie jest błędne, błąd pojawia się później w czasie działania. Lepsze są type
guardy, walidacja albo lepsze typowanie źródła.

### Czym różni się krotka od typu tablicowego? {junior}

Typ tablicowy, np. `number[]` albo `(string | number)[]`, ma dowolną długość, a każdy element ma typ elementu. Krotka, np. `[string, number]`, ma stałą długość i typ na każdej pozycji, więc `[1, "a"]`
jest odrzucane (sprawdzone). Krotki są popularne przy stałych parach, np. wartości zwracanej przez `useState` albo elementach `Object.entries`, i mogą mieć elementy opcjonalne, resztowe i nazwane.

### Jak TypeScript ma się do typów JavaScriptu w czasie działania (`typeof`)? {mid}

`typeof` TypeScriptu w pozycji typu (`type T = typeof obj`) wyciąga statyczny typ wartości. Runtime'owe `typeof` JavaScriptu zwraca napisy, jak `"string"` czy `"object"`, a TypeScript używa takich
sprawdzeń do zawężania typów w kolejnych gałęziach. Interfejsy i aliasy typów nie istnieją w czasie działania, więc nie da się sprawdzić `instanceof` względem interfejsu; sprawdza się właściwości,
używa wyróżników albo waliduje schematem.
