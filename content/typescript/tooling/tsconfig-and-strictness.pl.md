# tsconfig i tryb strict {mid}

`tsconfig.json` decyduje, jak ściśle TypeScript sprawdza kod oraz jak rozwiązuje i emituje moduły. Większość prawdziwych problemów z TypeScriptem
(„w edytorze działa, w CI nie”, „nie można znaleźć modułu”, awarie przez `undefined`) wynika z tych ustawień. TypeScript 6.0 zmienił kilka wartości
domyślnych, a TypeScript 7.0 usunął przestarzałe opcje, więc starsze konfiguracje wymagają uwagi. Poniższe zachowanie sprawdzałem w TypeScript 6.0.3
i 7.0.2.

## `strict` i dodatkowe sprawdzenia

`strict: true` włącza rodzinę sprawdzeń: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`,
`noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`, `strictBuiltinIteratorReturn`. **Od TypeScript 6.0 `strict` jest domyślnie włączony**:
kompilacja `function f(x) { ... }` bez flag i bez tsconfig zgłosiła `TS7006: Parameter 'x' implicitly has an 'any' type` zarówno w 6.0, jak i w 7.0.

Sprawdzenia **spoza** `strict`, które warto włączyć:

- **`noUncheckedIndexedAccess`**: odczyty przez sygnatury indeksu i indeksy tablic zawierają `undefined`. Dla `dict["missing"].toFixed()` na `Record<string, number>`
  domyślnie kod skompilował się bez błędów; z flagą pojawił się `TS2532: Object is possibly 'undefined'`.
- **`exactOptionalPropertyTypes`**: `retries?: number` nie przyjmuje już jawnego `undefined` (`TS2375`; bez flagi 0 błędów), co odróżnia „brak” od „ustawione na
  undefined”.
- `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`/`noUnusedParameters`.

## Moduły i ich rozwiązywanie

- **`module`/`moduleResolution: "bundler"`** dla kodu budowanego przez Vite, webpacka albo esbuild: względne importy bez rozszerzenia są w porządku.
- **`nodenext`** dla kodu uruchamianego bezpośrednio przez Node: stosuje reguły Node, więc w plikach ESM (`"type": "module"`) względne importy wymagają
  **rozszerzenia z czasu działania**: `import { x } from "./lib"` zakończył się TS2835 („Relative import paths need explicit file extensions...”), a `"./lib.js"`
  (wskazujący `lib.ts`) przeszedł. W plikach CommonJS ten sam import bez rozszerzenia został przyjęty.
- **`verbatimModuleSyntax`**: importy i eksporty są zachowywane albo usuwane dokładnie tak, jak je zapisano, więc importy tylko typów trzeba tak oznaczyć:
  import interfejsu jako wartości zakończył się TS1484 („'Opts' is a type and must be imported using a type-only import”). Dzięki temu transpilery pracujące
  per plik (esbuild, SWC, type stripping w Node) działają poprawnie; opcja zastępuje `importsNotUsedAsValues` i `preserveValueImports`.
- `skipLibCheck: true` pomija sprawdzanie plików `.d.ts` zależności, przyspieszając budowanie.

## Opcje przestarzałe i usunięte

TypeScript 6.0 zgłasza przestarzałe opcje jako błędy (do wyciszenia przez `"ignoreDeprecations": "6.0"`), a 7.0 je usuwa. Sprawdzone:

| Opcja | TypeScript 6.0 | TypeScript 7.0 |
|---|---|---|
| `baseUrl` | TS5101 „deprecated and will stop functioning” | TS5102 „has been removed” |
| `moduleResolution: node10` | TS5107 przestarzała | TS5108 usunięta |
| `target: es5` | TS5107 przestarzała | TS5108 usunięta |

Aliasy ścieżek oparte na `baseUrl` zastępuje się przez `paths` (względem tsconfig) albo `imports` w package.json (`#/...`), `node10` przez `bundler` albo
`nodenext`, a wynik ES5 nowoczesnym targetem (obniżanie wersji, jeśli nadal potrzebne, należy do osobnego narzędzia).

## Źródła

- [TSConfig reference](https://www.typescriptlang.org/tsconfig/)
- [strict](https://www.typescriptlang.org/tsconfig/#strict)
- [noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
- [Modules: choosing compiler options](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
- [verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax)
- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)

## Pytania

### Co włącza `strict` i czy jest domyślnie włączony? {junior}

Grupę sprawdzeń obejmującą `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables` i `alwaysStrict`. Od TypeScript 6.0
jest domyślnie włączony: bez żadnej konfiguracji nietypowany parametr dał TS7006 zarówno w 6.0, jak i w 7.0. Nowe projekty powinny go mieć włączonego; starsze włączają sprawdzenia stopniowo.

### Co robi `noUncheckedIndexedAccess` i dlaczego nie jest częścią `strict`? {mid}

Dodaje `undefined` do typu odczytów przez sygnatury indeksu i indeksy tablic, więc `dict["missing"].toFixed()` jest zgłaszane jako możliwe undefined (sprawdzone) zamiast się skompilować i wywrócić.
Nie jest częścią `strict`, bo jest uciążliwe w kodzie, który indeksuje tablice w pętlach albo już sprawdził klucze, i wymaga dodatkowych sprawdzeń albo `!`. Wyłapuje realną klasę błędów, więc wiele
zespołów je włącza.

### Czym jest `exactOptionalPropertyTypes`? {senior}

Z tą opcją opcjonalna właściwość `retries?: number` oznacza „może jej nie być”, ale nie „może być `undefined`”: przypisanie `{ retries: undefined }` kończy się TS2375 (bez flagi się kompilowało). Ma to
znaczenie tam, gdzie „brak” i „jawnie undefined” działają inaczej, np. `Object.keys`, rozwijanie wartości domyślnych (`{ ...defaults, ...opts }` nadpisujące `undefined`) albo ładunki PATCH. Żeby
dopuścić oba, deklaruje się `retries?: number | undefined`.

### Czym różni się `moduleResolution: bundler` od `nodenext`? {mid}

`bundler` modeluje narzędzia takie jak Vite i webpack: obsługiwane są względne importy bez rozszerzenia i `exports` z `package.json`, a ostateczny wynik ustala bundler. `nodenext` dokładnie modeluje
Node: rozróżnia pliki ESM i CommonJS według `type` w `package.json` i rozszerzenia pliku, a w ESM wymaga względnych importów z rozszerzeniem z czasu działania (brak rozszerzenia dał w teście TS2835,
`./lib.js` zadziałało). `bundler` stosuje się w aplikacjach frontendowych, a `nodenext` w kodzie wykonywanym przez Node albo publikowanych bibliotekach.

### Dlaczego względne importy w projektach Node ESM kończą się `.js`, choć plik to `.ts`? {mid}

Bo TypeScript nie przepisuje ścieżek importów: wyemitowany JavaScript zachowuje specyfikator w zapisanej postaci, a loader ESM w Node wymaga prawdziwej nazwy pliku wynikowego, czyli `lib.js`.
TypeScript w czasie kompilacji rozwiązuje `./lib.js` na `lib.ts` (sprawdzone). Nowsze opcje (`rewriteRelativeImportExtensions`, `allowImportingTsExtensions`) pozwalają pisać `.ts` w specyfikatorach
dla narzędzi uruchamiających TypeScript bezpośrednio.

### Co robi `verbatimModuleSyntax`? {senior}

Sprawia, że TypeScript zachowuje albo usuwa importy i eksporty dokładnie tak, jak je zapisano: wszystko, co zaimportowano bez `type`, zostaje w wyniku, a wszystko z `type` jest usuwane. Typ zaimportowany
jako wartość jest więc błędem (w teście TS1484), a pisze się `import type { Opts }` albo `import { type Opts }`. Gwarantuje to poprawny wynik narzędziom transpilującym jeden plik naraz (esbuild, SWC,
Babel, type stripping w Node), które nie mogą wiedzieć, czy nazwa jest typem.

### Co robi `paths` i czy zmienia importy w wyniku? {mid}

`paths` mapuje specyfikatory importów na pliki na potrzeby sprawdzania typów, np. `"@lib/*": ["./src/lib/*"]`, więc `import { x } from "@lib/util"` rozwiązuje się do `src/lib/util.ts`. Niczego nie
przepisuje: w teście wyemitowany `main.js` nadal zawierał `from "@lib/util"`. Ten sam alias musi rozwiązać bundler (aliasy Vite, plugin tsconfig-paths) albo środowisko uruchomieniowe (`imports`
w package.json z `#/...`), inaczej kod przechodzi sprawdzanie typów, ale pada w czasie działania. Ponieważ `baseUrl` usunięto w 7.0, wpisy `paths` pisze się względem pliku tsconfig.

### Czym są project references? {senior}

To sposób podziału dużego kodu na mniejsze projekty TypeScript: projekt wymienia swoje zależności w `references`, a każdy projekt, do którego się odwołuje, ustawia `composite: true` (co wymaga
emisji deklaracji; jej wyłączenie dało w teście TS6304). `tsc -b` buduje wtedy projekty w kolejności zależności i pomija te, które są aktualne: w teście pierwsze uruchomienie zbudowało `core`, a potem
`app`, a drugie zgłosiło oba jako aktualne. Przyspiesza to budowanie i edytory w monorepo oraz wymusza granice między pakietami.

### Czym jest `skipLibCheck` i czy bezpiecznie go włączać? {mid}

Pomija sprawdzanie typów w plikach deklaracji (`.d.ts`), głównie tych z `node_modules`, co przyspiesza kompilację i unika błędów wynikających z kolidujących albo zepsutych typów zewnętrznych. Twój kod
nadal jest w pełni sprawdzany względem tych deklaracji. Jest powszechnie włączany; ryzykiem jest przeoczenie rzeczywistych niespójności między typami bibliotek, co rzadko dotyka aplikacji.

### Jak stopniowo migrować projekt JavaScript do TypeScriptu? {senior}

Włączyć `allowJs` (i opcjonalnie `checkJs` z typami w JSDoc), żeby JS i TS współistniały, zacząć od luźnych ustawień, zmieniać pliki na `.ts` moduł po module, zaczynając od liści albo typów bazowych,
a potem stopniowo włączać sprawdzenia `strict` (np. `noImplicitAny`, potem `strictNullChecks`), oszczędnie używając `// @ts-expect-error` dla znanych problemów. Sprawdzanie typów w CI (`tsc --noEmit`)
dodaje się wcześnie, żeby zyski nie przepadły w trakcie migracji.
