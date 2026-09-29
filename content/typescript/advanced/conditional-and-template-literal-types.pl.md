# Typy warunkowe i szablonowe typy literalne {senior}

**Typy warunkowe** (`T extends U ? X : Y`) wybierają typ na podstawie innego typu, a z **`infer`** potrafią wyciągać fragmenty typów. **Szablonowe typy
literalne** budują typy napisowe z innych typów (`` `on${Capitalize<T>}` ``). Razem pozwalają bibliotekom typować parametry tras, nazwy zdarzeń i głęboko
zagnieżdżone ścieżki. Są potężne, ale łatwo ich nadużyć; na rozmowach zwykle pyta się, jak działają i kiedy są warte zachodu. Każdą relację poniżej
sprawdzałem asercjami w czasie kompilacji w TypeScript 7.0.

## Typy warunkowe i `infer`

```ts
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type A = ElementOf<string[]>;                         // string
```

`infer E` deklaruje zmienną typu, którą kompilator wypełnia przy dopasowaniu; tak są zaimplementowane `ReturnType`, `Parameters` i `Awaited`.

## Dystrybucja po uniach

Typ warunkowy, którego sprawdzanym typem jest **nagi parametr typu**, jest stosowany do każdego elementu unii osobno:

```ts
type ToArray<T> = T extends unknown ? T[] : never;
type B = ToArray<string | number>;                    // string[] | number[]   (dystrybutywny)
type ToArrayND<T> = [T] extends [unknown] ? T[] : never;
type C = ToArrayND<string | number>;                  // (string | number)[]   (opakowany: niedystrybutywny)
```

Oba wyniki zostały sprawdzone. Dystrybucja sprawia, że `Exclude<T, U>` (`T extends U ? never : T`) usuwa elementy z unii; opakowanie w `[T]` ją wyłącza.
Powiązany szczegół: `never` to pusta unia, więc dystrybutywny typ warunkowy na `never` zwraca `never`.

## Szablonowe typy literalne

```ts
type EventName<T extends string> = `on${Capitalize<T>}`;
type D = EventName<"click" | "focus">;                // "onClick" | "onFocus"
type Route = `/users/${number}`;
const r1: Route = "/users/42";                         // OK
const r2: Route = "/users/abc";                        // błąd
type Params<S extends string> =
  S extends `${string}:${infer P}/${infer Rest}` ? P | Params<`/${Rest}`> :
  S extends `${string}:${infer P}` ? P : never;
type E = Params<"/orders/:orderId/items/:itemId">;    // "orderId" | "itemId"
```

Szablony też dystrybuują się po uniach (`"click" | "focus"` dało dwie nazwy zdarzeń), przyjmują `${number}` i inne prymitywy jako wzorce i w połączeniu
z `infer` oraz rekurencją parsują napisy na poziomie typów; tak routery, jak React Router, czy API w stylu tRPC typują parametry ścieżek. Wbudowane
pomocniki: `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize`.

## Kiedy ich używać

W kodzie bibliotek i infrastruktury, gdzie jeden dokładny typ generyczny zastępuje wiele pisanych ręcznie. W kodzie aplikacji głębokie programowanie na
poziomie typów utrudnia czytanie błędów i spowalnia kompilator (rekurencja ma limity głębokości), więc lepsze są prostsze, jawne typy.

## Źródła

- [Conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- [Distributive conditional types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types)
- [Template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html)
- [Intrinsic string manipulation types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html#intrinsic-string-manipulation-types)
- [TypeScript performance (wiki)](https://github.com/microsoft/TypeScript/wiki/Performance)

## Pytania

### Czym jest typ warunkowy? {mid}

To typ w postaci `T extends U ? X : Y`, który rozwiązuje się do `X`, jeśli `T` można przypisać do `U`, a w przeciwnym razie do `Y`. Pozwala typom generycznym rozgałęziać się zależnie od wejścia,
np. `NonNullable<T>` to `T extends null | undefined ? never : T`. Gdy `T` jest nadal generyczne, warunek pozostaje odroczony do chwili podstawienia konkretnego typu.

### Co robi `infer`? {senior}

W klauzuli `extends` typu warunkowego `infer X` wprowadza zmienną typu, którą kompilator wywodzi z dopasowanego typu i której można użyć w gałęzi prawdziwej: `T extends (infer E)[] ? E : never`
wyciąga typ elementu tablicy (w teście `string` dla `string[]`), a `T extends (...args: any) => infer R ? R : never` to `ReturnType`. W ten sposób typy „rozbiera się” bez wypisywania ich w całości.

### Czym jest dystrybutywny typ warunkowy? {senior}

Gdy sprawdzanym typem jest nagi parametr typu, warunek jest stosowany do każdego elementu unii osobno, a wyniki są łączone w unię: `ToArray<string | number>` dało w teście `string[] | number[]`.
Opakowanie obu stron w krotkę (`[T] extends [unknown]`) wyłącza dystrybucję i daje `(string | number)[]`. Dystrybucja to mechanizm stojący za `Exclude`, `Extract` i `NonNullable`.

### Jak działają `Exclude` i `Extract`? {mid}

Oba to dystrybutywne typy warunkowe na unii: `Exclude<T, U> = T extends U ? never : T` usuwa elementy przypisywalne do `U`, a `Extract<T, U> = T extends U ? T : never` zachowuje tylko je. W teście
`Exclude<"a" | "b" | "c", "a">` dało `"b" | "c"`. Zwrócenie `never` dla elementu usuwa go, bo `never` znika z unii.

### Czym są szablonowe typy literalne? {mid}

To literalne typy napisowe budowane składnią szablonu z innych typów: `` `on${Capitalize<T>}` `` zamienia `"click" | "focus"` na `"onClick" | "onFocus"` (sprawdzone, bo dystrybuują się po uniach),
a `` `/users/${number}` `` przyjmuje `"/users/42"`, ale odrzuca `"/users/abc"`. Używa się ich do nazw zdarzeń, wartości CSS, kluczy wyprowadzanych z innych kluczy i wzorców tras.

### Jak TypeScript może wyciągnąć parametry z napisu trasy? {senior}

Rekurencyjnym typem warunkowym, który dopasowuje wzorce szablonowych typów literalnych i używa `infer`: dopasowuje `` `${string}:${infer P}/${infer Rest}` ``, zbiera `P` i rekurencyjnie przetwarza
resztę; w teście `Params<"/orders/:orderId/items/:itemId">` dało `"orderId" | "itemId"`. Routery używają tego, żeby `useParams()` albo handler trasy dostawał dokładnie parametry zadeklarowane w ścieżce.

### Czym są wbudowane typy napisowe? {junior}

To wbudowane przekształcenia napisów na poziomie typów: `Uppercase<S>`, `Lowercase<S>`, `Capitalize<S>` i `Uncapitalize<S>`. Są zaimplementowane w kompilatorze, a nie w samym TypeScripcie,
i używa się ich z szablonowymi typami literalnymi i przemapowaniem kluczy, np. żeby zbudować `getName` z `name` albo stałe `ON_CLICK` z nazw zdarzeń.

### Co się dzieje, gdy typ warunkowy zostanie zastosowany do `never`? {senior}

Dystrybutywny typ warunkowy na `never` zwraca `never`, bo `never` to pusta unia i nie ma elementów do zmapowania. Może to zaskoczyć: `IsString<never>` zdefiniowane jako
`T extends string ? true : false` daje `never`, a nie `true` ani `false`. Opakowanie (`[T] extends [string]`) sprawia, że zachowuje się jak zwykłe sprawdzenie, a
`[T] extends [never]` to standardowy sposób sprawdzania, czy typ jest `never`.

### Dlaczego zaawansowane programowanie na poziomie typów należy stosować oszczędnie? {mid}

Złożone typy warunkowe, rekurencyjne i szablonowe dają trudne do czytania komunikaty błędów, utrudniają utrzymanie kodu zespołowi, spowalniają sprawdzanie typów i edytor oraz mogą przekroczyć
limity głębokości rekurencji. Opłacają się w bibliotekach i wspólnej infrastrukturze (routery, ORM-y, biblioteki formularzy), gdzie zastępują wiele pisanych ręcznie typów; w kodzie aplikacji
zwykle wystarczą jawne proste typy i kilka typów narzędziowych.

### Jak testować złożone typy? {senior}

Asercjami w czasie kompilacji: pomocnik w rodzaju `type Assert<T extends true> = T` w połączeniu z dokładnym sprawdzeniem równości (`Eq<A, B>`), umieszczony w pliku tylko do sprawdzania typów, psuje
build, jeśli typ nieoczekiwanie się zmieni (wszystkie przykłady tutaj sprawdzano w ten sposób, łącznie z celowo błędną asercją, która zawiodła zgodnie z oczekiwaniem). Narzędzia takie jak
`expect-type`, `tsd` czy `expectTypeOf` z Vitest dają to samo z czytelniejszymi komunikatami, a `// @ts-expect-error` pilnuje, żeby niepoprawne użycia pozostały niepoprawne.
