# Wzorce bezpieczeństwa typów: typy branded, enumy i niemutowalność {mid}

Poza podstawowymi adnotacjami kilka wzorców eliminuje całe klasy błędów: **typy branded**, żeby nie mieszać wartości tego samego typu prymitywnego,
**unie literałów albo obiekty `as const`** zamiast enumów, dane **readonly** oraz kompletna obsługa unii. To częste tematy na rozmowach, bo pokazują,
czy ktoś używa systemu typów do modelowania domeny, czy tylko do adnotowania. Przykłady sprawdzałem w TypeScript 7.0 i uruchamiałem w Node 24.

## Typy branded (nominalne)

TypeScript jest strukturalny, więc `UserId` i `OrderId`, które oba są `string`, są wymienne. **Brand** dodaje fantomową właściwość istniejącą tylko w typie:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
const asUserId = (s: string) => s as UserId;     // jedyne miejsce, które może je tworzyć (po walidacji)
function loadUser(id: UserId) { ... }
loadUser(asUserId("u1"));   // OK
loadUser(orderId);          // błąd: '"OrderId"' is not assignable to '"UserId"'
loadUser("raw");            // błąd: string is not assignable to UserId
```

Oba błędne użycia zostały odrzucone. W czasie działania wartość to zwykły napis. Brandy oznaczają też zwalidowane wartości (`Email`, `PositiveNumber`)
tworzone przez funkcję parsującą.

## Enumy a unie literałów

```ts
enum Color { Red, Green }            // enum numeryczny
enum Dir { Up = "UP", Down = "DOWN" } // enum napisowy
const ROLE = { Admin: "admin", User: "user" } as const;
type Role = (typeof ROLE)[keyof typeof ROLE];   // "admin" | "user"
```

Sprawdzone zachowanie:

- Enumy **nie są usuwane**: skompilowany kod zawierał IIFE budujące obiekt, a enum numeryczny ma **mapowanie odwrotne**: `JSON.stringify(Color)` dało
  `{"0":"Red","1":"Green","Red":0,"Green":1}`, a `Color[0]` dało `"Red"`; enum napisowy nie miał mapowania odwrotnego.
- `const c2: Color = 5` było błędem (enumy numeryczne we współczesnym TypeScripcie odrzucają literały spoza zakresu), a enum napisowy odrzucił literał
  `"UP"`: wywołujący muszą pisać `Dir.Up`.
- Przy **`erasableSyntaxOnly`** (TypeScript 5.8) enumy są błędami (TS1294), a **wbudowany type stripping w Node** je odrzucił:
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode`, podczas gdy plik z samymi typami i interfejsami uruchomił się
  bezpośrednio przez `node file.ts`.

Dlatego wiele projektów woli **unie literałów** i **obiekty `as const`**: zero kodu w czasie działania poza zwykłym obiektem, wartości to zwykłe napisy
(przyjazne dla JSON i API), a `"guest"` nadal jest odrzucany jako `Role`.

## Dane readonly

`readonly string[]` nie ma `push` (TS2339), a `[1, 2] as const` to krotka tylko do odczytu, której elementów nie można przypisać (TS2540). Parametry readonly stosuje
się w funkcjach, które nie powinny zmieniać wejść, pamiętając, że te sprawdzenia znikają w czasie działania (do prawdziwej niemutowalności służy `Object.freeze`).

## Źródła

- [Enums (handbook)](https://www.typescriptlang.org/docs/handbook/enums.html)
- [Objects vs enums](https://www.typescriptlang.org/docs/handbook/enums.html#objects-vs-enums)
- [erasableSyntaxOnly (TypeScript 5.8)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html#the---erasablesyntaxonly-option)
- [Node.js: running TypeScript natively](https://nodejs.org/api/typescript.html)
- [ReadonlyArray and readonly tuples](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-readonlyarray-type)

## Pytania

### Czym jest typ branded i po co go używać? {mid}

To typ prymitywny przecięty z fantomową właściwością istniejącą tylko w systemie typów, np. `type UserId = string & { readonly __brand: "UserId" }`. Ponieważ TypeScript jest strukturalny, zwykłe
napisowe identyfikatory różnych encji są wymienne; z brandami przekazanie `OrderId` albo surowego napisu tam, gdzie oczekiwany jest `UserId`, jest błędem kompilacji (sprawdzone). Wartości tworzy
funkcja, która waliduje i rzutuje, więc brand dokumentuje też, że walidacja się odbyła.

### Jak kompilowane są enumy i czym jest mapowanie odwrotne? {mid}

Zwykłe enumy kompilują się do prawdziwych obiektów JavaScript budowanych przez IIFE. Enumy numeryczne mapują też wartości z powrotem na nazwy: `Color[0]` zwróciło `"Red"`, a obiekt zserializował się
w teście jako `{"0":"Red","1":"Green","Red":0,"Green":1}`. Enumy napisowe mają tylko mapowanie nazwa-wartość. Składowe `const enum` są wstawiane w miejsce użycia i nie tworzą obiektu, ale nie działają
z kompilatorami pracującymi per plik w stylu `isolatedModules`.

### Dlaczego wiele zespołów unika enumów? {mid}

To jedna z nielicznych funkcji TypeScriptu generujących kod w czasie działania, więc nie działają z narzędziami, które tylko usuwają typy: type stripping w Node odrzucił enum z
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, a `erasableSyntaxOnly` zgłasza je jako błędy. Enumy napisowe są nominalne (zwykłe `"UP"` nie jest przyjmowane jako `Dir`), co jest niewygodne przy JSON i API,
a enumy numeryczne mają mylące mapowania odwrotne. Unie literałów albo obiekty `as const` dają to samo bezpieczeństwo ze zwykłymi wartościami.

### Jak utworzyć obiekt podobny do enuma bez `enum`? {junior}

Użyć obiektu z `as const` i wyprowadzić typ z jego wartości: `const ROLE = { Admin: "admin", User: "user" } as const; type Role = (typeof ROLE)[keyof typeof ROLE];`. Kod może używać `ROLE.Admin` jak
składowej enuma albo zwykłego napisu `"admin"`, niepoprawne wartości, jak `"guest"`, są odrzucane (sprawdzone), a po obiekcie można iterować w czasie działania, np. żeby zbudować listę wyboru.

### Co robi `erasableSyntaxOnly`? {senior}

To opcja kompilatora (TypeScript 5.8), która zgłasza błędy dla składni TypeScriptu niedającej się po prostu usunąć: enumów, przestrzeni nazw z kodem wykonywalnym, parameter properties
w konstruktorach oraz `import =`/`export =`. Taki kod mogą wtedy uruchamiać narzędzia, które tylko usuwają typy, jak wbudowana obsługa TypeScriptu w Node, bez osobnego kroku kompilacji. W teście oba
enumy zostały zgłoszone z TS1294.

### Czy Node.js może bezpośrednio uruchamiać pliki TypeScript? {mid}

Tak, nowe wersje Node (sprawdzone z Node 24) uruchamiają pliki `.ts` z type strippingiem: typy, interfejsy i adnotacje są usuwane, a reszta działa jako JavaScript, więc plik z aliasem typu i interfejsem
uruchomił się przez `node file.ts`. Nie sprawdza typów (w CI nadal uruchamia się `tsc --noEmit`) i nie obsługuje składni wymagającej transformacji, np. enumów, chyba że użyje się eksperymentalnej flagi
`--experimental-transform-types`.

### Jak uczynić parametry funkcji niemutowalnymi? {junior}

Otypować je jako readonly: `readonly string[]` (albo `ReadonlyArray<string>`) usuwa metody mutujące, więc `xs.push()` zakończyło się „Property 'push' does not exist on type 'readonly string[]'”,
a `Readonly<T>` oznacza właściwości obiektu jako tylko do odczytu. Dokumentuje to i wymusza, że funkcja nie zmienia wejść, co zapobiega błędom, gdy wywołujący używają tablicy dalej. W czasie działania
niczego to nie zamraża.

### Co `as const` robi z tablicami i obiektami? {junior}

Wywodzi najwęższe typy (literały zamiast `string`/`number`), czyni właściwości obiektu `readonly` i zamienia tablice w krotki tylko do odczytu: `[1, 2] as const` ma typ `readonly [1, 2]`, a przypisanie
`point[0] = 5` zawiodło (TS2540). Używa się go do konfiguracji, tablic wyszukiwania i wyprowadzania typów unii z wartości.

### Jak zwalidować, że napis jest adresem e-mail, i zachować tę informację w typie? {mid}

Sparsować go raz na granicy funkcją, która sprawdza format i zwraca typ branded: `function parseEmail(s: string): Email | null`, gdzie `type Email = Brand<string, "Email">`. Funkcje potrzebujące e-maila
przyjmują `Email`, więc nie mogą dostać niezwalidowanego napisu, a walidacja nie jest powtarzana. Biblioteki schematów, jak Zod, obsługują wyniki branded (`z.string().email().brand<"Email">()`).

### Co robi asercja non-null `!` i kiedy jest dopuszczalna? {junior}

`value!` usuwa `null` i `undefined` z typu bez żadnego sprawdzenia w czasie działania, np. `document.getElementById("app")!` ma typ `HTMLElement`. Jeśli wartość faktycznie jest `null`, kod
wywraca się później: w teście `n!.length` się skompilowało i rzuciło `TypeError: Cannot read properties of null`. Jest dopuszczalna tylko tam, gdzie niezmiennik gwarantuje wartość (element
w statycznym HTML, wartość właśnie ustawiona); w pozostałych przypadkach bezpieczniejsze są sprawdzenie, optional chaining (`?.`) albo jawny błąd.
