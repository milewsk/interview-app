# Typy w czasie działania i walidacja danych {mid}

Typy TypeScriptu są usuwane podczas kompilacji, więc niczego nie gwarantują dla danych przychodzących w czasie działania: odpowiedzi API, ciał żądań, `localStorage`,
zmiennych środowiskowych, wiadomości z kolejek. Kompilator ufa każdemu typowi, jaki takim danym nadasz. Prawdziwe bezpieczeństwo wymaga **walidacji w czasie działania
na granicach**, najlepiej schematem, z którego wyprowadza się typ statyczny, żeby jedno i drugie nie mogło się rozjechać. Przykłady sprawdzałem w TypeScript 7.0, Zod 4.6
i Node 24.

## Gdzie kompilator ci ufa

`JSON.parse` w bibliotece standardowej zwraca `any`, podobnie `Response.json()` (`Promise<any>`). Sprawdzone:

```ts
interface User { id: number; name: string }
const u = JSON.parse('{"id":"1","name":"Ann"}') as User;  // kompiluje się
u.id.toFixed();   // TypeError: u.id.toFixed is not a function (id jest napisem)
```

Adnotacja (`const u: User = JSON.parse(s)`) nie jest bezpieczniejsza, bo `any` da się przypisać do wszystkiego. Otypowanie wyniku jako `unknown` sprawia, że kompilator
wymusza sprawdzenie: `c.id` na wartości `unknown` zakończyło się TS18046. Typów nie da się też badać w czasie działania: `c instanceof User` dla interfejsu zakończyło
się TS2693 („only refers to a type, but is being used as a value”).

Kod z błędami typów nadal może działać: `tsc` wyemitował JavaScript dla pliku z TS2322 (kod wyjścia 2), o ile nie ustawiono `noEmitOnError`, a type stripping w Node
uruchomił taki plik bez żadnego sprawdzania (`typeof oops` wypisało `string` dla zmiennej zadeklarowanej jako `number`). Sprawdzanie typów musi być osobnym krokiem w CI
(`tsc --noEmit`).

## Walidacja schematem w Zod

Schemat opisuje dane w czasie działania, a `z.infer` wyprowadza z niego typ statyczny, więc jest jedno źródło prawdy:

```ts
import { z } from "zod";
const User = z.object({ id: z.number().int().positive(), name: z.string().min(1), email: z.email() });
type User = z.infer<typeof User>;          // { id: number; name: string; email: string }

const user = User.parse(await res.json()); // przy błędnych danych rzuca ZodError
const r = User.safeParse(input);           // { success: true, data } | { success: false, error }
if (!r.success) console.log(r.error.issues);
```

Sprawdzone zachowanie:

- `parse` zwrócił otypowane dane i **usunął nieznane klucze** (właściwość `extra` zniknęła); `User.strict()` zamiast tego je odrzucił. `parse({})` rzucił `ZodError`.
- `safeParse({ id: "1", name: "", email: "nope" })` zgłosił wszystkie trzy problemy: `id: invalid_type; name: too_small; email: invalid_format`.
- Odwołanie do `r.data.name` przed sprawdzeniem `r.success` zakończyło się TS18048 (possibly undefined): wynik jest unią z dyskryminatorem.
- `z.coerce.number()` zamienił wartość z query stringa `"3"` na `3`.
- `z.email().brand<"Email">()` dał typ branded: przekazanie surowego napisu zawiodło (TS2345), a w czasie działania wartość nadal była zwykłym napisem.

## Walidacja konfiguracji

Zmienne środowiskowe są napisami albo `undefined`, więc ich walidacja przy starcie szybko kończy działanie z czytelnym komunikatem:

```ts
const Env = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]),
});
export const env = Env.parse(process.env);
```

W teście poprawne dane dały `PORT: 3000` z wartości domyślnej, a niepoprawne zgłosiły wszystkie trzy zmienne naraz (`z.prettifyError`: „Invalid URL”,
„expected number, received NaN”, „Invalid option”).

## Źródła

- [Zod documentation](https://zod.dev/)
- [Zod: basic usage (parse, safeParse)](https://zod.dev/basics)
- [TypeScript handbook: narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [noEmitOnError](https://www.typescriptlang.org/tsconfig/#noEmitOnError)
- [Parse, don't validate (Alexis King)](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

## Pytania

### Jaki typ zwraca `JSON.parse` i dlaczego to problem? {junior}

`any`, a `Response.json()` zwraca `Promise<any>`. Dlatego `JSON.parse(s) as User` albo `const u: User = JSON.parse(s)` kompilują się bez żadnego sprawdzenia, a zły kształt danych wychodzi później jako
błąd w czasie działania: w teście `id`, które przyszło jako napis, wywróciło `u.id.toFixed()` z `TypeError`. Bezpieczne podejście to traktowanie wyniku jako `unknown` i walidacja (type guard albo schemat).

### Dlaczego kod z błędami typów nadal może działać? {junior}

Bo sprawdzanie typów i generowanie JavaScriptu to osobne rzeczy. `tsc` emituje wynik nawet przy błędach (w teście z kodem wyjścia 2), chyba że ustawiono `noEmitOnError`, a narzędzia takie jak esbuild,
SWC, Vite i type stripping w Node tylko usuwają typy, nie sprawdzając ich. Plik przypisujący napis do zmiennej typu `number` uruchomił się w Node bez zastrzeżeń. Dlatego CI osobno uruchamia
`tsc --noEmit`.

### Gdzie aplikacja powinna walidować dane w czasie działania? {mid}

Na granicach zaufania, tam gdzie dane wchodzą spoza kontroli kompilatora: ciała żądań HTTP i query stringi, odpowiedzi zewnętrznych API, zmienne środowiskowe i pliki konfiguracyjne, `localStorage`,
wiadomości z kolejek oraz zawartość plików albo bazy o luźnym schemacie. Wewnątrz aplikacji, gdy dane są już zwalidowane i otypowane, ponowne sprawdzanie nie jest potrzebne. Walidacja na brzegu
zamienia typ z założenia w gwarancję.

### Jak biblioteka schematów, np. Zod, unika duplikowania typów? {mid}

Schemat definiuje się raz jako wartość w czasie działania, a typ statyczny wyprowadza przez `z.infer<typeof Schema>`. Typ zawsze odpowiada temu, co sprawdza walidator, więc nie ma ręcznie pisanego
interfejsu, który mógłby się rozjechać z walidacją. W teście `User` zbudowany przez `z.infer` odrzucił literał obiektu bez `name` (TS2741), a `parse` zwrócił dane dokładnie tego typu.

### Czym różni się `parse` od `safeParse` w Zod? {junior}

`parse` zwraca otypowane dane albo rzuca `ZodError`. `safeParse` nigdy nie rzuca i zwraca unię z dyskryminatorem: `{ success: true, data }` albo `{ success: false, error }`. Kompilator wymusza
najpierw sprawdzenie `success`: odwołanie do `r.data.name` bez niego zakończyło się TS18048. `safeParse` pasuje do handlerów żądań zwracających klientowi błędy walidacji, a `parse` do miejsc, w których
niepoprawne dane powinny zatrzymać wykonanie, np. konfiguracji przy starcie.

### Co dzieje się z nieznanymi właściwościami, gdy Zod parsuje obiekt? {mid}

Domyślnie są usuwane: w teście parsowanie obiektu z dodatkową właściwością zwróciło dane bez niej. Chroni to kod przed przenoszeniem dalej nieoczekiwanych pól, np. `role` wysłanego przez klienta.
`.strict()` (albo `z.strictObject`) zamiast tego odrzuca nieznane klucze błędem (w tym samym teście `success: false`), a `.loose()` je zachowuje. Wybór zależy od tego, czy dodatkowe dane mają być
ignorowane, czy zgłaszane.

### Jak walidować liczby pochodzące z query stringów albo formularzy? {mid}

Wartości z query stringów, formularzy i zmiennych środowiskowych są zawsze napisami, więc zwykłe `z.number()` odrzuca `"3"`. Koercja najpierw konwertuje, a potem waliduje: `z.coerce.number().int().min(1)`
zamieniło w teście `"3"` na `3`, a `"abc"` stało się `NaN` i zostało zgłoszone jako niepoprawna liczba. Ograniczenia po koercji nadal mają znaczenie, bo sama koercja przyjmuje wszystko, co da się
skonwertować.

### Jak walidować zmienne środowiskowe? {mid}

Opisać je schematem (`z.url()` dla connection stringów, `z.coerce.number()` z `.default()` dla portów, `z.enum` dla trybów), sparsować `process.env` raz przy starcie i eksportować otypowany wynik.
Aplikacja szybko kończy działanie z komunikatem wymieniającym każdy problem: w teście trzy niepoprawne zmienne zostały zgłoszone w jednym błędzie. Reszta kodu używa wtedy `env.PORT` jako `number`
zamiast czytać napisy z `process.env`.

### Co oznacza „parse, don't validate”? {senior}

Zamiast sprawdzić dane i dalej używać oryginalnej, luźno otypowanej wartości, parser je sprawdza i zwraca precyzyjniejszy typ niosący wynik sprawdzenia: `unknown` staje się `User`, `string` staje się
`Email` typu branded, lista staje się niepustą listą. Dalszy kod przyjmuje tylko precyzyjny typ, więc nie może dostać niesprawdzonych danych, a sprawdzenie nie jest powtarzane. `parse` w Zod i typy
branded (`z.email().brand<"Email">()`, gdzie surowy napis został odrzucony z TS2345) realizują tę ideę.

### Jak utrzymać zgodność typów między frontendem a backendem? {senior}

Generować je albo współdzielić z jednego źródła: wspólne pakiety ze schematami w monorepo (schematy Zod używane po obu stronach), generowanie kodu ze schematu OpenAPI albo GraphQL albo typowane
end-to-end RPC, np. tRPC. Współdzielenie w czasie kompilacji dowodzi tylko, że obie strony zbudowano z tej samej definicji, a nie że wdrożony serwer zwraca to, czego oczekuje klient (podczas
wdrożenia wersje mogą się różnić), więc serwer nadal waliduje wejście, a klienci walidują odpowiedzi usług, których nie kontrolują.
