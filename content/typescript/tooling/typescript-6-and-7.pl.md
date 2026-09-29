# TypeScript 6 i 7 {mid}

TypeScript 6.0 (marzec 2026) był ostatnim wydaniem opartym na oryginalnym kodzie w JavaScripcie i wydaniem pomostowym: zmienił wartości domyślne i oznaczył stare opcje
jako przestarzałe. TypeScript 7.0 (lipiec 2026) to **natywny port napisany w Go**: ten sam język i to samo polecenie `tsc`, ale według zespołu TypeScriptu zwykle 8–12 razy
szybsze pełne budowanie, a przestarzałe opcje usunięto. Wiedza o tym, co się zmieniło, ma znaczenie przy aktualizacji projektów i wyjaśnia, dlaczego „stare” pliki tsconfig
nagle przestają działać. Poniższe zachowanie sprawdzałem w TypeScript 6.0.3 i 7.0.2.

## TypeScript 6.0: nowe wartości domyślne

| Opcja | Przed 6.0 | 6.0 |
|---|---|---|
| `strict` | `false` | `true` |
| `module` | `commonjs` | `esnext` |
| `target` | `es5` | najnowszy standard (`es2025`) |
| `types` | każdy pakiet `@types` w `node_modules` | `[]` |
| `rootDir` | wywodzony z plików wejściowych | katalog pliku tsconfig |
| `noUncheckedSideEffectImports` | `false` | `true` |

Bez żadnej konfiguracji nietypowany parametr dał TS7006 (strict) zarówno w 6.0, jak i w 7.0. Domyślne `es2025` sprawiło, że `RegExp.escape` skompilował się bez flag,
a nowsze API otypowane w 6.0, takie jak `Map.prototype.getOrInsert` i `Temporal`, wymagały `target`/`lib` `esnext` (bez tego TS2550 i TS2304).

## Przestarzałe w 6.0, usunięte w 7.0

TypeScript 6.0 zgłasza przestarzałe opcje jako błędy, które wycisza `"ignoreDeprecations": "6.0"`; TypeScript 7.0 je odrzuca. Sprawdzone przykłady:

| Opcja | 6.0 | 7.0 |
|---|---|---|
| `baseUrl`, `outFile` | TS5101 „deprecated” | TS5102 „has been removed” |
| `target: es5`, `moduleResolution: node10`, `module: amd` | TS5107 „deprecated” | TS5108 „has been removed” |
| `esModuleInterop: false` | TS5107 | TS5108 |

Pełna lista obejmuje też `downlevelIteration`, `moduleResolution: classic`, `module: umd/systemjs/none`, `alwaysStrict: false` i `allowSyntheticDefaultImports: false`. Ścieżka
aktualizacji: najpierw przejść na 6.0 i naprawić każde ostrzeżenie o przestarzałej opcji bez `ignoreDeprecations`, potem przełączyć się na 7.0.

## TypeScript 7.0: natywny kompilator

- **Szybkość**: kod natywny i wielowątkowość ze współdzieloną pamięcią. Sprawdzanie typów tej aplikacji trwało około 1,76 s z `tsc` 6.0 i 0,30 s z 7.0 (mały projekt, w którym
  dominuje czas startu; zespół podaje 8–12 razy przy dużych buildach). Liczbę wątków sprawdzających ustawia się przez `--checkers` (domyślnie 4), a `--singleThreaded` wyłącza
  równoległość.
- **Ten sam język**: system typów został przeniesiony, a nie zaprojektowany od nowa; kod kompilujący się czysto w 6.0 bez przestarzałych opcji powinien zachowywać się tak samo.
  Kolejność typów w 7.0 jest deterministyczna na potrzeby równoległego sprawdzania; `--stableTypeOrdering` w 6.0 ją naśladuje, żeby pomóc znaleźć różnice.
- **Brak programistycznego API w 7.0**: narzędzia zbudowane na API kompilatora TypeScript (część linterów, sprawdzanie szablonów we Vue, Svelte, Astro czy Angularze) nadal
  potrzebują 6.0; nowe, inne API jest planowane w 7.1. Pakiet `@typescript/typescript6` (`tsc6`) pozwala zainstalować 6.0 i 7.0 obok siebie.
- **Edytor**: nowy serwer językowy oparty na Language Server Protocol, według ogłoszenia z mniejszą liczbą błędów i awarii niż serwer 6.0.
- **Sprawdzanie JavaScriptu**: obsługa JSDoc w plikach `.js` jest bardziej rygorystyczna i porzuca niektóre dawne wzorce (np. `@enum` i typy funkcji w stylu Closure).

## Źródła

- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [A 10x faster TypeScript (native port announcement)](https://devblogs.microsoft.com/typescript/typescript-native-port/)
- [TSConfig reference](https://www.typescriptlang.org/tsconfig/)

## Pytania

### Czym jest TypeScript 7 i czym różni się od wcześniejszych wersji? {junior}

To port kompilatora i usługi językowej TypeScriptu z TypeScriptu/JavaScriptu do Go, kompilowany do kodu natywnego i używający wielu wątków. Język, pakiet npm `typescript` i polecenie `tsc` pozostają
takie same, ale budowanie jest dużo szybsze (według zespołu 8–12 razy przy pełnych buildach; w teście na tej małej aplikacji około 6 razy). Opcje oznaczone jako przestarzałe w 6.0 zostały usunięte.

### Dlaczego kompilator przepisano w Go zamiast optymalizować wersję w JavaScripcie? {mid}

JavaScript ogranicza kompilator w sposób, którego optymalizacje nie naprawią: jednowątkowe wykonanie bez współdzielonej pamięci, rozgrzewanie JIT i narzut odśmiecania przy ogromnych grafach obiektów.
Go daje kod natywny, współbieżność ze współdzieloną pamięcią i kontrolę nad układem pamięci, a jego struktura jest na tyle bliska istniejącemu kodowi, że pozwoliła przenosić go plik po pliku zamiast
projektować od nowa. Dzięki temu zachowanie systemu typów pozostaje takie samo, a równoległe sprawdzanie staje się możliwe.

### Które zmiany wartości domyślnych w TypeScript 6.0 najczęściej psują istniejący projekt? {mid}

`types: []` (globalne `@types`, np. globalne typy Node albo Jest, nie są już dołączane automatycznie, więc nazwy takie jak `process` czy `describe` przestają się rozwiązywać, dopóki nie wpisze się ich
do `types`), `strict: true` (projekty polegające na nieścisłej wartości domyślnej dostają wiele błędów), `module: esnext` (kod polegający na emisji CommonJS), `rootDir` ustawiony na katalog tsconfig
(może zmienić się struktura katalogu wynikowego) oraz `noUncheckedSideEffectImports` (importy CSS albo polyfilli bez deklaracji kończą się TS2882). Jawne ustawienie tych opcji zapobiega niespodziankom.

### Co robi `ignoreDeprecations: "6.0"` i dlaczego nie należy na nim polegać? {mid}

Wycisza błędy TypeScript 6.0 dla przestarzałych opcji, takich jak `baseUrl`, `target: es5` czy `moduleResolution: node10`. To tymczasowe wyjście awaryjne: w 7.0 te same opcje są błędami, których nie
da się wyciszyć (w teście „has been removed”, TS5102/TS5108). Projekty powinny używać go tylko przez krótki czas i naprawić konfigurację przed aktualizacją.

### Jak zaktualizować projekt z TypeScript 5.x do 7? {mid}

Najpierw przejść przez 6.0: zaktualizować, jawnie ustawić zmienione wartości domyślne (`types`, `rootDir`, `module`), naprawić nowe błędy ścisłości i usunąć każdą przestarzałą opcję bez
`ignoreDeprecations` (`baseUrl` na `paths` albo importy w package.json, `node10` na `bundler`/`nodenext`, wynik ES5 na nowoczesny target). Gdy 6.0 buduje się czysto, przełączyć się na 7.0 i porównać
wyniki; sprawdzić, czy narzędzia zależne od API kompilatora nadal działają, albo zostawić dla nich `@typescript/typescript6`.

### Które narzędzia nie mogą jeszcze używać TypeScript 7.0 i dlaczego? {senior}

Narzędzia wywołujące bezpośrednio API kompilatora TypeScript, takie jak reguły lintera świadome typów i sprawdzanie typów w szablonach Vue, Svelte, Astro, MDX czy Angulara, bo 7.0 nie ma
programistycznego API (nowe, inne API jest planowane w 7.1). Nadal używają 6.0, które można zainstalować obok 7.0 jako `@typescript/typescript6` z poleceniem `tsc6`. Transpilery takie jak esbuild, SWC
czy Babel nie są dotknięte, bo nie używają kompilatora TypeScript.

### Czy TypeScript 7 zmienia system typów? {mid}

Nie, celem jest to samo zachowanie: sprawdzanie typów to port, więc projekt budujący się w 6.0 bez przestarzałych opcji powinien zgłaszać te same błędy. Widoczną różnicą jest deterministyczna
kolejność typów, potrzebna do równoległego sprawdzania, która może zmienić kolejność składników unii w komunikatach albo w wyemitowanych deklaracjach; `--stableTypeOrdering` w 6.0 ją naśladuje
(kosztem wydajności), żeby znaleźć takie różnice przed aktualizacją.

### Jak TypeScript 7 wykorzystuje wiele wątków? {senior}

Sprawdza typy plików równolegle kilkoma wątkami sprawdzającymi ze współdzieloną pamięcią, domyślnie 4, co można zmienić przez `--checkers` (więcej może pomóc dużym projektom kosztem pamięci), buduje
niezależne project references równolegle (`--builders`) i może zostać zmuszony do jednego wątku przez `--singleThreaded`, np. żeby ograniczyć pamięć w CI albo do debugowania. W teście 7.0 przyjął
`--checkers 8`.

### Dlaczego TypeScript 6.0 domyślnie ustawia `target` na najnowszą wersję ECMAScript? {mid}

Bo wszystkie obecne przeglądarki i wersje Node obsługują nowoczesny JavaScript, a obniżanie do starych targetów należy teraz do bundlerów albo dedykowanych narzędzi. Z domyślnym `es2025` API takie jak
`RegExp.escape` przechodzi sprawdzanie typów bez konfiguracji (sprawdzone). Funkcje nowsze niż wartość domyślna, jak `Map.prototype.getOrInsert` czy `Temporal`, nadal wymagają `lib`/`target` `esnext`
(bez tego w teście TS2550 i TS2304), a projekt działający na starszych środowiskach powinien jawnie ustawić `target` i `lib`.

### Jak powinien wyglądać pipeline CI po przejściu na TypeScript 7? {senior}

Uruchamiać `tsc --noEmit` (7.0) jako osobny krok sprawdzania typów, bo bundlery nie sprawdzają typów, i trzymać ustaloną wersję TypeScriptu w lockfile. Jeśli narzędzia nadal potrzebują API
kompilatora, uruchamiać je obok z `@typescript/typescript6`. Szybsze sprawdzanie sprawia, że praktyczne staje się sprawdzanie typów przy każdym commicie i w hookach pre-commit: według ogłoszenia
Slack skrócił sprawdzanie typów w CI z około 7,5 minuty do 1,25 minuty.
