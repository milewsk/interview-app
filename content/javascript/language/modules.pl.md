# Moduły: ES Modules i CommonJS {mid}

Moduł to plik z własnym zakresem: jego zmienne nie trafiają do zakresu globalnego, a na zewnątrz udostępnia się
tylko to, co zostanie **wyeksportowane**. W ekosystemie JS współistnieją dwa systemy.

## ES Modules (ESM): standard języka

```js
// math.js
export const PI = 3.14
export function add(a, b) { return a + b }
export default function multiply(a, b) { return a * b }

// app.js
import multiply, { add, PI as pi } from './math.js'
import * as math from './math.js'
const { heavy } = await import('./heavy.js')     // import dynamiczny zwraca promise
```

Cechy:

- **Statyczna struktura**: `import`/`export` są na najwyższym poziomie i znane przed wykonaniem kodu. Dzięki
  temu bundlery robią **tree-shaking** (usuwają nieużywane eksporty), a narzędzia wykrywają błędy importu.
- **Żywe wiązania (live bindings)**: import to widok na zmienną eksportującą, a nie kopia wartości. Zmiana po
  stronie modułu jest widoczna u importującego. Do importu nie można przypisać (`TypeError`).
- Moduły zawsze działają w **trybie ścisłym**, `this` na najwyższym poziomie to `undefined`.
- **Top-level await**: `await` na najwyższym poziomie modułu. Moduły importujące poczekają na jego zakończenie.
- Każdy moduł jest wykonywany **raz**. Kolejne importy dostają tę samą instancję (singleton), co bywa
  wykorzystywane do współdzielonego stanu.
- `import.meta` daje metadane modułu (`import.meta.url`, w Vite `import.meta.env` i `import.meta.glob`,
  w Node `import.meta.dirname`).
- W przeglądarce: `<script type="module">` (odroczony domyślnie, jak `defer`) i dynamiczny `import()` do code
  splittingu.

## CommonJS (CJS): historyczny format Node

```js
// math.cjs
function add(a, b) { return a + b }
module.exports = { add }            // albo exports.add = add

// app.cjs
const { add } = require('./math.cjs')
```

- `require` jest **synchroniczne i dynamiczne** (można je wywołać warunkowo, ze zmienną ścieżką), co utrudnia
  analizę statyczną i tree-shaking.
- Eksportowana jest **wartość obiektu `module.exports`** w chwili odczytu. Prymityw skopiowany do obiektu nie
  aktualizuje się po późniejszej zmianie w module.
- Dostępne są `__dirname`, `__filename` i `module`, których w ESM nie ma.

## ESM i CJS w Node

- Format wyznacza rozszerzenie (`.mjs` / `.cjs`) albo pole `"type": "module"` w `package.json` dla plików `.js`.
- ESM może importować CJS (`module.exports` staje się eksportem domyślnym). Od Node 22.12 (i w 24)
  `require()` może ładować synchroniczne moduły ESM (bez top-level await).
- Biblioteki publikują często oba formaty i wskazują je polem `"exports"` w `package.json` (warunki
  `import` / `require`).

## Zależności cykliczne

Gdy A importuje B, a B importuje A, jeden z modułów zobaczy drugi **niedokończony**. W ESM odczyt jeszcze
niezainicjalizowanego `let`/`const` rzuca `ReferenceError` (TDZ), a w CJS dostaje się częściowy obiekt
`module.exports`. Rozwiązania: wydzielenie wspólnego kodu do trzeciego modułu, odczyt w funkcjach wywoływanych
później zamiast na najwyższym poziomie, odwrócenie zależności.

## Named czy default export

Eksporty nazwane ułatwiają refaktoryzację (IDE zmienia nazwy wszędzie), wymuszają spójne nazwy i lepiej
współpracują z tree-shakingiem. Eksport domyślny pozwala nazwać import dowolnie, co sprzyja niespójności.
Wiele zespołów preferuje eksporty nazwane. `React.lazy` wymaga jednak eksportu domyślnego (albo `then`).

## Źródła

- [JavaScript modules (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [import (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)
- [Modules: ECMAScript modules (Node.js docs)](https://nodejs.org/api/esm.html)
- [Modules: CommonJS modules, loading ESM with require (Node.js docs)](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)

## Pytania

### Czym różnią się ES Modules od CommonJS? {mid}

ESM (`import`/`export`) to standard języka o statycznej strukturze znanej przed wykonaniem, z żywymi wiązaniami, trybem ścisłym,
top-level await i asynchronicznym ładowaniem, działający w przeglądarkach i Node. CommonJS (`require`/`module.exports`) to historyczny
format Node: synchroniczny i dynamiczny, eksportuje wartość obiektu `module.exports` i ma `__dirname`. Statyczność ESM umożliwia
tree-shaking.

### Czym jest tree-shaking i dlaczego wymaga ESM? {mid}

To usuwanie przez bundler nieużywanego kodu z wynikowego pakietu. Działa, bo w ESM importy i eksporty są statyczne: bundler przed
wykonaniem wie, które eksporty są używane. W CommonJS `require` może być wywołane warunkowo lub z dynamiczną ścieżką, a `module.exports`
modyfikowane w runtime, więc bezpieczne usunięcie kodu jest trudne. Przeszkadzają też efekty uboczne przy imporcie (`sideEffects` w
`package.json`).

### Czym są „żywe wiązania” w ESM? {senior}

Import w ESM to referencja do zmiennej w module eksportującym, a nie kopia jej wartości. Jeśli moduł zmieni wyeksportowane `let count`,
importujący zobaczy nową wartość. W CommonJS obiekt `module.exports` zawiera wartość z chwili przypisania, więc prymityw się nie
zaktualizuje. Import jest tylko do odczytu: przypisanie do niego rzuca `TypeError`.

### Do czego służy dynamiczny `import()`? {mid}

Ładuje moduł w czasie działania i zwraca promise z jego przestrzenią nazw. Pozwala na **code splitting** (bundler tworzy osobny chunk
ładowany na żądanie, np. `React.lazy`), warunkowe ładowanie (np. polyfill tylko gdy potrzebny) i import ze ścieżką znaną dopiero
w runtime. Działa także w skryptach, które nie są modułami, i w CommonJS.

### Czy moduł jest wykonywany przy każdym imporcie? {junior}

Nie. Moduł jest wykonywany raz, przy pierwszym imporcie, a wynik jest cache'owany. Każdy kolejny import (także dynamiczny) dostaje tę samą
instancję. Dlatego zmienna na najwyższym poziomie modułu jest w praktyce singletonem współdzielonym przez całą aplikację (w testach czasem
wymaga resetowania).

### Czym jest top-level await i jakie ma konsekwencje? {mid}

`await` użyte na najwyższym poziomie modułu ESM, bez opakowywania w funkcję async, np. do wczytania konfiguracji. Moduły, które go
importują, czekają na jego zakończenie, zanim same się wykonają, więc długie operacje opóźniają start całej aplikacji. Nie działa
w CommonJS, a moduł z top-level await nie może zostać załadowany przez `require()`.

### Co się dzieje przy zależności cyklicznej między modułami? {senior}

Jeden z modułów zaczyna się wykonywać, zanim drugi skończy, więc widzi go niekompletnym. W ESM odczyt nie zainicjalizowanego jeszcze `let`
lub `const` rzuca `ReferenceError`, a funkcje zadeklarowane przez `function` są dostępne dzięki hoistingowi. W CJS dostaje się częściowy
`module.exports`. Rozwiązania: wydzielić wspólną część do osobnego modułu, odwoływać się do importu wewnątrz funkcji wywoływanych później,
przeprojektować zależności.

### Jak Node rozpoznaje, czy plik jest ESM, czy CJS? {mid}

Po rozszerzeniu: `.mjs` to zawsze ESM, `.cjs` to zawsze CommonJS. Dla `.js` decyduje najbliższy `package.json`: `"type": "module"` oznacza
ESM, a brak pola lub `"commonjs"` oznacza CJS. Biblioteki wskazują warianty dla obu systemów polem `"exports"` z warunkami `import`
i `require`.

### Eksport nazwany czy domyślny? {junior}

Eksport nazwany wymusza tę samą nazwę przy imporcie (łatwiejsze wyszukiwanie i refaktoryzacja), pozwala eksportować wiele rzeczy i dobrze
współpracuje z automatycznymi importami w IDE. Domyślny można zaimportować pod dowolną nazwą, co z czasem daje niespójności. Wiele zespołów
używa wyłącznie nazwanych, z wyjątkiem miejsc, które wymagają domyślnego (np. `React.lazy`, pliki routingu frameworków).

### Dlaczego w module ESM nie ma `__dirname` i czym go zastąpić? {mid}

`__dirname`, `__filename`, `require` i `module` to zmienne wstrzykiwane przez wrapper CommonJS, którego ESM nie używa. W ESM dostępne jest
`import.meta.url` (URL pliku), a w nowszych wersjach Node `import.meta.dirname` i `import.meta.filename`. W starszych wylicza się je przez
`fileURLToPath(import.meta.url)`. `require` można utworzyć przez `createRequire(import.meta.url)`.
