# Typy narzędziowe i typy mapowane {mid}

TypeScript potrafi obliczać nowe typy z istniejących. **Typy narzędziowe**, takie jak `Partial`, `Pick`, `Omit` i `Record`, pokrywają codzienne
przekształcenia, a są zbudowane z kilku elementów, których można używać samodzielnie: **`keyof`**, **dostępu indeksowanego** (`T[K]`), **typów
mapowanych** (`{ [K in keyof T]: ... }`) z **przemapowaniem kluczy** (`as`) oraz modyfikatorów (`readonly`, `?`, `-readonly`, `-?`). Każdą relację typów
poniżej sprawdzałem asercją w czasie kompilacji (`Assert<Eq<A, B>>`) w TypeScript 7.0.

## Wbudowane typy narzędziowe (sprawdzone)

```ts
interface User { id: number; name: string; email?: string; readonly createdAt: Date }
```

| Typ narzędziowy | Wynik |
|---|---|
| `Partial<User>` | każda właściwość opcjonalna: `Partial<User>["id"]` to `number \| undefined` |
| `Required<User>` | każda właściwość wymagana: `email` to `string` |
| `Readonly<User>` | każda właściwość `readonly` |
| `Pick<User, "id" \| "name">` | tylko `id` i `name` |
| `Omit<User, "email" \| "createdAt">` | `id` i `name` |
| `Record<"a" \| "b", number>` | `{ a: number; b: number }` |
| `Exclude<"a" \| "b" \| "c", "a">` / `Extract` | `"b" \| "c"` |
| `NonNullable<string \| null \| undefined>` | `string` |
| `ReturnType<F>`, `Parameters<F>` | typ wyniku; parametry jako krotka (`[a: string, b: number]`) |
| `Awaited<Promise<Promise<number>>>` | `number` (rekurencyjnie rozpakowuje) |

**`Omit` nie sprawdza kluczy**: `Omit<User, "emial">` (literówka) skompilowało się bez błędu i po prostu niczego nie usunęło. `Pick` sprawdza
(`K extends keyof T`). Niektóre zespoły definiują ściślejsze `StrictOmit<T, K extends keyof T>`.

## Typy mapowane

```ts
type Mutable<T> = { -readonly [K in keyof T]: T[K] };                              // usuń readonly
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] }; // zmień nazwy kluczy
type OnlyStrings<T> = { [K in keyof T as T[K] extends string ? K : never]: T[K] };  // filtruj klucze
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };
```

Sprawdzone: `Getters<{ id: number; name: string }>` miało klucze `getId` i `getName`; `OnlyStrings<User>` zachowało tylko `name` (opcjonalne `email` ma typ
`string | undefined`, który nie rozszerza `string`); przypisanie `cfg.db.host` w obiekcie `DeepReadonly` zawiodło, a wbudowane `Readonly` jest płytkie.
Zmapowanie klucza na `never` usuwa go i na tym polega filtrowanie.

## `keyof`, `typeof` i dostęp indeksowany

- `keyof T` to unia nazw właściwości; `T[K]` to typ właściwości; `T[number]` to typ elementu tablicy albo krotki.
- `typeof value` w pozycji typu zamienia wartość w typ: `type Config = typeof defaultConfig`, a `(typeof ROLES)[number]` daje unię z tablicy `const`.

## Źródła

- [Utility types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [Mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Keyof type operator](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html)
- [Indexed access types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html)
- [Typeof type operator](https://www.typescriptlang.org/docs/handbook/2/typeof-types.html)

## Pytania

### Co robią `Partial`, `Required` i `Readonly`? {junior}

Tworzą z `T` nowy typ, w którym każda właściwość jest opcjonalna (`Partial`), wymagana (`Required`) albo tylko do odczytu (`Readonly`). `Partial` jest typowy dla obiektów aktualizacji/patch
i opcji z wartościami domyślnymi, `Readonly` dla wartości, których nie należy zmieniać. Są płytkie: zagnieżdżone obiekty zachowują swoje modyfikatory, więc wersje głębokie wymagają rekurencyjnego
typu mapowanego.

### Czym różni się `Pick` od `Omit`? {junior}

`Pick<T, K>` zachowuje tylko wymienione właściwości, `Omit<T, K>` wszystkie poza wymienionymi; oba przydają się przy DTO i modelach widoku wyprowadzanych z encji (`Omit<User, "passwordHash">`). `Pick`
wymaga, żeby klucze istniały w `T`, ale `Omit` przyjmuje dowolny napis: w teście `Omit<User, "emial">` się skompilowało i po cichu niczego nie usunęło, więc literówka albo zmieniona nazwa właściwości
nie jest wyłapywana.

### Do czego służy `Record<K, V>`? {junior}

Buduje typ obiektu z kluczami `K` i wartościami `V`: `Record<"a" | "b", number>` to dokładnie `{ a: number; b: number }` (sprawdzone), więc każdy wymieniony klucz jest wymagany, co świetnie pasuje
do tablic wyszukiwania nad unią. `Record<string, V>` to otwarty słownik, w którym dozwolony jest dowolny klucz, a odczyty nie są sprawdzane pod kątem istnienia, co jest częstym źródłem błędów
w czasie działania.

### Czym jest typ mapowany? {mid}

To typ, który iteruje po unii kluczy i tworzy właściwość dla każdego: `{ [K in keyof T]: T[K] }` kopiuje `T`, a modyfikatory zmieniają właściwości (`readonly`, `?` albo `-readonly`/`-?`, żeby je usunąć).
Tak są zaimplementowane typy narzędziowe, jak `Partial` i `Readonly`. Typy mapowane pozwalają wyprowadzać typy (formularze, błędy walidacji, gettery), które pozostają zsynchronizowane z typem źródłowym.

### Czym jest przemapowanie kluczy przez `as` w typach mapowanych? {senior}

Od TypeScript 4.1 typ mapowany może obliczać nowe nazwy kluczy przez `as`: ``{ [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] }`` zamieniło w teście `id` i `name` na `getId`
i `getName`. Zmapowanie klucza na `never` go usuwa, więc `as T[K] extends string ? K : never` zachowuje tylko właściwości napisowe. Używa się tego do wyprowadzania map handlerów zdarzeń, metod klientów
API i przefiltrowanych widoków typów.

### Co robi `NoInfer<T>`? {senior}

Oznacza miejsce, z którego nie wolno wywodzić parametru typu, więc wnioskowanie korzysta tylko z pozostałych argumentów. W `function pick<T extends string>(options: T[], fallback: T)` wywołanie
`pick(["a", "b"], "c")` się skompilowało, bo `T` zostało wywiedzione jako `"a" | "b" | "c"`. Z `fallback: NoInfer<T>` `T` pochodziło tylko z `options`, a `"c"` zostało odrzucone (TS2345). Przydaje
się przy wartościach domyślnych i zapasowych, które muszą być jedną z wartości podanych gdzie indziej. Dostępne od TypeScript 5.4.

### Jak zamienić stałą tablicę w typ unii? {mid}

Zadeklarować ją `as const`, żeby elementy zachowały typy literalne, a tablica stała się krotką tylko do odczytu, a potem wziąć typ jej elementu:
`const ROLES = ["admin", "user"] as const; type Role = (typeof ROLES)[number];` daje `"admin" | "user"`. Tablicy można używać w czasie działania (do wyrenderowania selecta
albo walidacji wejścia), a typ automatycznie pozostaje zsynchronizowany.

### Dlaczego `Readonly<T>` nie wystarcza dla głęboko niemutowalnych danych? {mid}

`Readonly` oznacza jako tylko do odczytu jedynie właściwości najwyższego poziomu; zagnieżdżone obiekty i tablice nadal można przez nie zmieniać. Rekurencyjny typ mapowany, np. `DeepReadonly<T>`,
stosuje `readonly` na każdym poziomie (w teście przypisanie zagnieżdżonej właściwości zawiodło), a `ReadonlyArray`/`readonly T[]` chroni tablice. To nadal tylko ochrona w czasie kompilacji; do
niemutowalności w czasie działania potrzebne jest `Object.freeze`.

### Co dają `ReturnType`, `Parameters` i `Awaited`? {mid}

`ReturnType<F>` wyciąga typ wyniku typu funkcji, `Parameters<F>` jej parametry jako krotkę (z etykietami, np. `[a: string, b: number]`), a `Awaited<T>` rekurencyjnie rozpakowuje promisy
(`Awaited<Promise<Promise<number>>>` to `number`). Pozwalają typować opakowania, mocki i cache na podstawie istniejących funkcji bez powtarzania ich sygnatur, np.
`type User = Awaited<ReturnType<typeof fetchUser>>`.

### Jak uczynić `Omit` bezpieczniejszym? {senior}

Zdefiniować wariant, który ogranicza klucze do istniejących: `type StrictOmit<T, K extends keyof T> = Omit<T, K>`. Wtedy literówka albo właściwość usunięta przy refaktoryzacji staje się błędem
kompilacji, inaczej niż we wbudowanym `Omit`, który przyjmuje dowolny klucz `string | number | symbol` (w teście skompilował się z błędnie zapisanym `"emial"`). Wersja wbudowana jest luźna celowo,
żeby działała z typami unii i generycznymi.
