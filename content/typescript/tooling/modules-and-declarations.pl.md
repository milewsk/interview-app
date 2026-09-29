# Moduły i pliki deklaracji {mid}

TypeScript potrzebuje typów dla wszystkiego, co importuje. Twoje pliki `.ts` dostarczają je bezpośrednio; biblioteki JavaScript dostarczają je przez
**pliki deklaracji** (`.d.ts`), dołączone do pakietu albo z **DefinitelyTyped** (`@types/...`). To, jak kompilator znajduje te pliki, zależy od
rozwiązywania modułów i mapy `exports` pakietu. Umiejętność naprawienia „Could not find a declaration file” i wiedza o tym, jak biblioteki publikują
typy, to standard na poziomie mid. Przykłady sprawdzałem w TypeScript 7.0 (`moduleResolution: bundler`).

## Pliki deklaracji

Plik `.d.ts` zawiera tylko typy: `declare function`, interfejsy, aliasy typów, `declare module`, bez implementacji. Sprawdzone: kompilacja

```ts
export interface Money { amount: number; currency: string }
export function format(m: Money): string { return `${m.amount} ${m.currency}`; }
const internalHelper = 1;
```

z `--declaration --emitDeclarationOnly` dała `money.d.ts` z interfejsem i `export declare function format(m: Money): string;`, bez nieeksportowanego
pomocnika. Biblioteki napisane w TypeScripcie publikują takie pliki; `declarationMap` pozwala edytorom przechodzić do oryginalnego źródła.

## Biblioteki bez typów i moduły ambient

Import pakietu JavaScript bez typów zakończył się przy `strict` błędem **TS7016** („Could not find a declaration file for module 'untyped-lib'”). Rozwiązania,
w kolejności preferencji: zainstalować `@types/untyped-lib`, jeśli istnieje; w przeciwnym razie napisać deklarację:

```ts
// src/untyped-lib.d.ts
declare module "untyped-lib" {
  export function slugify(s: string): string;
}
declare module "*.css";      // importy nie-kodu obsługiwane przez bundler
```

Po ich dodaniu błąd zniknął. Skrót `declare module "untyped-lib";` typuje wszystko jako `any` (szybko, ale niebezpiecznie).

## Importy efektów ubocznych

`import "./setup.css"` i `import "./missing-side-effect"` zakończyły się błędem **TS2882** („Cannot find module or type declarations for side-effect import”),
bo `noUncheckedSideEffectImports` jest domyślnie włączone od TypeScript 6.0: literówki w importach efektów ubocznych nie są już po cichu ignorowane. Import CSS
naprawiła deklaracja `declare module "*.css"`; naprawdę brakujący plik pozostał błędem.

## `exports` pakietu i typy

Nowoczesne pakiety deklarują punkty wejścia w `exports` w `package.json`, z warunkiem `types` wskazującym deklaracje:

```json
{ "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } } }
```

`import { add } from "typed-pkg"` rozwiązał się do `dist/index.d.ts`, a głęboki import pliku, który istnieje, ale nie jest eksportowany (`typed-pkg/dist/internal`),
zakończył się **TS2307**: `exports` definiuje publiczne API pakietu i blokuje wszystko inne (przy rozwiązywaniu `bundler`/`nodenext`; dawne rozwiązywanie `node10`,
usunięte w 7.0, ignorowało `exports`). Warunek `types` powinien być pierwszy.

## ESM i CommonJS

TypeScript obsługuje oba systemy modułów; z `nodenext` stosuje reguły Node per plik (`"type": "module"`, `.mts`/`.cts`). Domyślne importy z modułów CommonJS
opierają się na interop, który od 6.0 jest zawsze włączony: `esModuleInterop: false` zostało zgłoszone jako przestarzałe w 6.0 (TS5107) i jako usunięte w 7.0 (TS5108). Biblioteki dostarczające oba formaty potrzebują
osobnych deklaracji albo starannych warunków `exports`, żeby każdy konsument dostał pasujące typy.

## Źródła

- [Declaration files: introduction](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)
- [Modules: reference (exports, resolution)](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
- [Publishing types (package.json exports)](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)
- [noUncheckedSideEffectImports](https://www.typescriptlang.org/tsconfig/#noUncheckedSideEffectImports)
- [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)

## Pytania

### Czym jest plik `.d.ts`? {junior}

To plik deklaracji zawierający tylko informacje o typach (sygnatury funkcji, interfejsy, aliasy typów, deklaracje modułów) i żadnego kodu wykonywalnego. Opisuje kształt kodu JavaScript dla kompilatora
i edytora: biblioteki napisane w TypeScripcie generują je przez `declaration: true` (w teście wyemitowane zostały tylko eksportowany interfejs i sygnatura funkcji), a biblioteki JavaScript dostają je
pisane ręcznie, często z DefinitelyTyped.

### Jak naprawić „Could not find a declaration file for module”? {junior}

To TS7016, zgłaszany przy `noImplicitAny`, gdy pakiet JavaScript nie ma typów. Najpierw sprawdza się typy dostarczane przez sam pakiet albo `@types/<nazwa>` z DefinitelyTyped. Jeśli ich nie ma,
pisze się deklarację w projekcie, `declare module "untyped-lib" { export function slugify(s: string): string; }` (co w teście usunęło błąd), a w ostateczności `declare module "untyped-lib";`, które
typuje wszystko jako `any`.

### Czym jest DefinitelyTyped? {junior}

To społecznościowe repozytorium deklaracji typów dla pakietów JavaScript, które nie dostarczają własnych, publikowanych w npm pod zakresem `@types` (`@types/lodash`, `@types/node`). Kompilator
automatycznie znajduje zainstalowane pakiety `@types` przy rozwiązywaniu importów. Od TypeScript 6.0 `types` ma domyślnie wartość `[]`, więc globalne pakiety `@types` (np. globalne typy `@types/node`)
trzeba jawnie wymienić w `compilerOptions.types`.

### Jak typować importy nie-kodu, np. CSS albo obrazów? {mid}

Wieloznacznymi deklaracjami modułów ambient: `declare module "*.css";` (albo z eksportowanym typem, np. dla CSS modules `const classes: Record<string, string>; export default classes;`) i
`declare module "*.svg" { const src: string; export default src; }`. Bundlery, jak Vite, dostarczają takie deklaracje (`vite/client`). W teście import CSS kończył się TS2882, dopóki nie dodano
deklaracji `*.css`.

### Co robi `noUncheckedSideEffectImports`? {mid}

Sprawia, że kompilator sprawdza, czy importy efektów ubocznych (`import "./polyfills"`), które nie wprowadzają żadnych powiązań, faktycznie rozwiązują się do modułu albo deklaracji. Wcześniej takie
importy były po cichu akceptowane nawet z literówkami. Od TypeScript 6.0 jest domyślnie włączone: w teście zarówno import CSS bez deklaracji, jak i brakujący plik zostały zgłoszone z TS2882.

### Czym jest pole `exports` w `package.json` i jak TypeScript go używa? {senior}

Wymienia publiczne punkty wejścia pakietu i warunki (`import`, `require`, `types`, `default`) oraz blokuje każdą inną ścieżkę. Przy rozwiązywaniu `bundler` albo `nodenext` TypeScript się do niego stosuje
i używa warunku `types`, żeby znaleźć deklaracje: w teście główny punkt wejścia się rozwiązał, a głęboki import istniejącego, nieeksportowanego pliku zakończył się TS2307. Autorzy bibliotek muszą dodać
`types` (jako pierwsze) dla każdego wejścia, bo inaczej konsumenci dostaną „Cannot find module”, choć JavaScript istnieje.

### Gdzie TypeScript szuka typów pakietu? {mid}

Dla importu takiego jak `"lib"` czyta `package.json` pakietu: warunek `types` w `exports`, jeśli pole `exports` istnieje, w przeciwnym razie pole `types` (albo `typings`) najwyższego poziomu
albo plik `.d.ts` obok punktu wejścia JavaScript. Jeśli pakiet nie ma typów, sięga do `node_modules/@types/lib`. W teście zarówno pakiet z samym polem `types`, jak i pakiet tylko z JavaScriptem
z pasującym pakietem `@types` rozwiązały się do swoich deklaracji, nawet przy domyślnym w TypeScript 6 `types: []`, które ogranicza tylko automatycznie dołączane typy globalne.

### Jak biblioteka powinna publikować swoje typy? {senior}

Generować pliki `.d.ts` ze źródeł TypeScript (`declaration`, opcjonalnie `declarationMap`), wskazywać je warunkiem `types` w każdym wpisie `exports` (jako pierwszym) oraz polem `types` najwyższego poziomu
dla starszych narzędzi i testować je z ustawieniami modułów używanymi przez konsumentów (`bundler`, `nodenext`, ESM i CommonJS). Narzędzia takie jak `publint` i „Are the types wrong?” sprawdzają pakiet pod
kątem niezgodności między JavaScriptem a deklaracjami.

### Czy pliki TypeScript mogą importować pliki JavaScript? {mid}

Tak, z `allowJs`: kompilator dołącza pliki JavaScript, wywodzi ich typy i może je sprawdzać przez `checkJs` z adnotacjami JSDoc (`/** @param {string} s */`). To typowy sposób stopniowej migracji projektu.
Bez `allowJs` import lokalnego pliku `.js` bez deklaracji jest błędem przy `noImplicitAny` (w teście TS7016; z `allowJs` się skompilował).

### Czym jest `import type` i dlaczego istnieje? {mid}

`import type { User } from "./user"` importuje tylko typ i zawsze jest usuwany z wyniku, więc nie może powodować efektów ubocznych w czasie działania ani problemów z cyklicznymi zależnościami, a narzędzia
kompilujące jeden plik naraz wiedzą, że można go bezpiecznie usunąć. Przy `verbatimModuleSyntax` jest wymagany dla importów tylko typów. `export type` działa tak samo przy reeksportach.
