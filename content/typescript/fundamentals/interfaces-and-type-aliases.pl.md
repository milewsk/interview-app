# Interfejsy i aliasy typów {junior}

TypeScript ma dwa sposoby nazywania typu: **`interface`** i aliasy **`type`**. Dla zwykłych kształtów obiektów są prawie zamienne, dlatego „interface
czy type?” to klasyczne pytanie na rozmowie. Różnice dotyczą **scalania deklaracji**, tego, jak **rozszerzanie** obsługuje konflikty, i tego, co da się
wyrazić: tylko `type` może nazwać unie, krotki, typy mapowane i warunkowe. Przykłady sprawdzałem w TypeScript 7.0.

## Różnice (sprawdzone)

```ts
interface User { id: number }
interface User { name: string }             // scalone: User ma id i name
type Account = { id: number };
type Account = { name: string };             // błąd TS2300: Duplicate identifier 'Account'
```

| | `interface` | `type` |
|---|---|---|
| Kształty obiektów, `implements`, `extends` | tak | tak (typy obiektowe; klasy mogą je `implements`) |
| Unie, krotki, prymitywy, typy mapowane/warunkowe | nie | **tak** (`type Status = "active" \| "blocked"`) |
| Scalanie deklaracji | **tak**: powtórzone deklaracje się scalają | nie: błąd zduplikowanego identyfikatora |
| Rozszerzanie z kolidującą właściwością | **błąd przy deklaracji** (TS2430: `Derived` incorrectly extends `Base`) | przecięcie po cichu robi z właściwości **`never`** |

Ostatni wiersz ma znaczenie w praktyce: `interface Derived extends Base { id: string }` od razu zgłosiło błąd, a `type Both = { id: number } & { id: string }`
zostało przyjęte i zawiodło dopiero później, przy tworzeniu wartości (`Type 'number' is not assignable to type 'never'`). Interfejsy dają też czytelniejsze
komunikaty błędów i lepiej się cache'ują w dużych projektach.

## Scalanie deklaracji i augmentacja

Scalanie pozwala dodawać składowe do istniejących interfejsów, także globalnych i bibliotecznych: `declare global { interface Window { appVersion: string } }`
sprawiło, że `window.appVersion` był typowany. Biblioteki używają tego samego mechanizmu do **augmentacji modułów** (dodawanie pól do `Request` w Expressie,
typy motywu w styled-components). Druga strona medalu: przypadkowa druga deklaracja o tej samej nazwie scala się po cichu.

## Inne cechy typów obiektowych

- Właściwości `readonly`: przypisanie `pet.tag` zakończyło się TS2540 (tylko w czasie kompilacji; obiekt nie jest zamrożony).
- Właściwości opcjonalne (`age?: number`) i sygnatury indeksu (`[key: string]: number`).
- **Częsta konwencja**: `interface` dla kształtów obiektów, które inni mogą rozszerzać (publiczne API, propsy Reacta), `type` dla unii, krotek i typów
  obliczanych. Spójność w projekcie ma większe znaczenie niż sam wybór.

## Źródła

- [Differences between type aliases and interfaces](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#differences-between-type-aliases-and-interfaces)
- [Object types](https://www.typescriptlang.org/docs/handbook/2/objects.html)
- [Declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html)
- [Intersection types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types)

## Pytania

### Czym różni się `interface` od `type`? {junior}

Oba mogą opisywać kształty obiektów i być rozszerzane albo implementowane. Interfejsy można deklarować wielokrotnie i się scalają (scalanie deklaracji), a konflikty w `extends` są zgłaszane przy
deklaracji. Aliasów typów nie można ponownie otworzyć (druga deklaracja to błąd „Duplicate identifier”), ale mogą nazwać dowolny typ: unie, krotki, prymitywy, typy funkcji, typy mapowane
i warunkowe. Dla zwykłych obiektów działa każdy z nich; wiele zespołów używa interfejsów do kontraktów obiektów, a typów do wszystkiego innego.

### Czym jest scalanie deklaracji? {mid}

Gdy w tym samym zakresie istnieje kilka deklaracji `interface` (albo przestrzeni nazw, albo klasa i interfejs) o tej samej nazwie, TypeScript scala je w jeden typ ze wszystkimi składowymi: dwa
interfejsy `User` z `id` i `name` stały się jednym. Służy do rozszerzania typów globalnych (`Window`) i bibliotecznych przez augmentację modułów, ale może też przypadkowo scalić niezwiązane
deklaracje.

### Czym różnią się `extends` i przecięcia (`&`)? {mid}

`interface B extends A` sprawdza zgodność przy deklaracji: przedefiniowanie właściwości na niezgodny typ jest błędem (w teście TS2430). Przecięcie `A & B` łączy typy bez tego sprawdzenia, więc kolidujące
właściwości stają się `never` (`{ id: number } & { id: string }` daje `id: never`), a błąd pojawia się dopiero przy próbie utworzenia wartości. Przecięcia nadal są przydatne do łączenia niezależnych typów
i w typach generycznych.

### Czy klasa może implementować alias typu? {junior}

Tak, jeśli alias opisuje typ obiektowy (albo przecięcie typów obiektowych): `class Dog implements Pet`. Nie może implementować aliasu będącego unią, bo klasa musi mieć jeden statycznie znany kształt.
`implements` tylko sprawdza klasę względem typu; nie dodaje składowych ani nie zmienia typu klasy.

### Jak dodać właściwość do globalnego typu `Window` albo typu biblioteki? {mid}

Scalaniem deklaracji w bloku globalnym albo augmentacji modułu: `declare global { interface Window { appVersion: string } }` w pliku modułu (który musi mieć import albo export) albo
`declare module "express-serve-static-core" { interface Request { user?: User } }` dla biblioteki. Dodane składowe są wtedy sprawdzane wszędzie, jak `window.appVersion` w teście.

### Czy `readonly` czyni obiekt niemutowalnym? {junior}

Tylko w czasie kompilacji: kompilator odrzuca przypisania do właściwości `readonly` (w teście TS2540 „Cannot assign to 'tag' because it is a read-only property”), a `ReadonlyArray` ukrywa metody
mutujące, ale wynikowy obiekt JavaScript nadal można zmienić, np. przez alias bez `readonly` albo `any`. Do niemutowalności w czasie działania służy `Object.freeze`.

### Kiedy trzeba użyć aliasu typu zamiast interfejsu? {junior}

Gdy typ nie jest pojedynczym kształtem obiektu: unie (`"light" | "dark"`, `Result<T>`), krotki (`[number, number]`), prymitywy i typy literalne, typy funkcji zapisane jako `(x: T) => U` (interfejsy też
mogą opisywać sygnatury wywołania, ale mniej czytelnie) oraz typy obliczane, jak mapowane (`{ [K in keyof T]: ... }`), warunkowe (`T extends U ? X : Y`) i szablonowe typy literalne.

### Czym są sygnatury indeksu i kiedy są ryzykowne? {mid}

`{ [key: string]: number }` opisuje obiekty używane jako słowniki z dowolnymi kluczami. Odczyt dowolnego klucza zwraca według typów `number`, nawet dla nieistniejących kluczy, więc
`dict.missing.toFixed()` się kompiluje i wywraca. Włączenie `noUncheckedIndexedAccess` sprawia, że takie odczyty mają typ `number | undefined`. Dla znanych kluczy lepsze są jawne właściwości albo
`Record<"a" | "b", number>`; dla dynamicznych kluczy często czytelniejszy jest `Map`.

### Dlaczego interfejs może być lepszy ze względu na wydajność albo komunikaty błędów? {senior}

Interfejsy są nazwane i cache'owane przez kompilator, więc relacje między nimi są sprawdzane raz, a komunikaty błędów odwołują się do ich nazw. Przecięcia typów obiektowych są przeliczane i mogą dawać
długie, rozwinięte komunikaty błędów, a bardzo duże przecięcia spowalniają sprawdzanie typów. Wskazówki zespołu TypeScript dotyczące wydajności zalecają w dużych projektach interfejsy z `extends`
zamiast przecięć przy składaniu obiektów.

### Jak opisać typ funkcji interfejsem? {mid}

Sygnaturą wywołania: `interface Formatter { (value: number): string; locale: string }`, która pozwala też na właściwości obiektu funkcji, albo sygnaturą konstruktora dla konstruktorów. Alias typu jest
prostszy dla zwykłych typów funkcji: `type Formatter = (value: number) => string`. Sygnatury metod w interfejsach (`format(v: number): string`) są sprawdzane biwariantnie, a właściwości typu funkcyjnego
(`format: (v: number) => string`) ściśle przy `strictFunctionTypes`.
