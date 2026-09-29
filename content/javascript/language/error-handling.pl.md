# Obsługa błędów {mid}

## `try` / `catch` / `finally`

```js
try {
  const config = JSON.parse(text)
  apply(config)
} catch (error) {
  console.error('Nie udało się wczytać konfiguracji', error)
} finally {
  hideSpinner()       // zawsze: po sukcesie, błędzie i nawet po return z try
}
```

- `finally` wykonuje się **zawsze**, także po `return` w `try`. `return` w `finally` **nadpisuje** wynik
  z `try`, a rzucony w nim wyjątek nadpisuje oryginalny, dlatego w `finally` się nie zwraca.
- Od ES2019 `catch` może nie mieć parametru: `catch { ... }`.
- `try/catch` łapie tylko błędy **synchroniczne** w swoim bloku oraz odrzucenia **awaitowanych** promise'ów.
  Nie złapie błędu z callbacku `setTimeout` ani z promise'a bez `await`.

## Typy błędów

Wbudowane: `Error`, `TypeError` (np. `null.x`, wywołanie nie-funkcji), `ReferenceError` (niezadeklarowana
zmienna), `RangeError` (`new Array(-1)`), `SyntaxError` (np. `JSON.parse`), `URIError`, `EvalError`,
`AggregateError` (wiele błędów, np. z `Promise.any`).

Rzucać należy **obiekty `Error`**, nie stringi: tylko `Error` ma `stack` i działa z `instanceof`.

## Własne błędy i `cause`

```js
class ValidationError extends Error {
  constructor(field, message, options) {
    super(message, options)
    this.name = 'ValidationError'
    this.field = field
  }
}

try {
  config = JSON.parse(raw)
} catch (e) {
  throw new Error('Nie udało się wczytać konfiguracji', { cause: e })   // ES2022: zachowuje przyczynę
}
```

Własne klasy pozwalają rozróżniać błędy (`instanceof ValidationError`) i dołączać dane (pole, kod HTTP).
`cause` buduje łańcuch przyczyn bez gubienia oryginalnego błędu i jego stosu.

## Strategie

- **Łap tam, gdzie możesz coś sensownego zrobić**: pokazać komunikat, ponowić, użyć wartości zastępczej.
  Pusty `catch {}` ukrywa błędy.
- **Przepuszczaj dalej** (`throw`) błędy, których nie obsługujesz, najlepiej opakowane z `cause`.
- **Błędy oczekiwane a wyjątki**: walidację czy „nie znaleziono” często lepiej modelować jako wartość zwracaną
  (`{ ok: false, error }`) niż wyjątek. Wyjątki zostawia się dla sytuacji nieoczekiwanych.
- **Globalne siatki bezpieczeństwa** do logowania, nie do właściwej obsługi: w przeglądarce
  `window.addEventListener('error')` i `'unhandledrejection'`, w Node `process.on('uncaughtException')`
  i `'unhandledRejection'`. Po `uncaughtException` proces jest w niepewnym stanie i powinien zostać
  zrestartowany. W React: Error Boundary.
- Wysyłaj błędy do systemu monitorowania (Sentry itp.) z kontekstem, ale bez danych wrażliwych.

## Błędy asynchroniczne

```js
async function load() { throw new Error('boom') }

try { load() } catch {}              // 🔴 nie złapie: promise odrzuci się później
try { await load() } catch {}        // ✅
load().catch(handle)                 // ✅
```

Nieobsłużone odrzucenie w Node (od v15) domyślnie kończy proces, a w przeglądarce trafia do konsoli
i `unhandledrejection`.

## Źródła

- [try...catch (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch)
- [Error (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- [Error: cause (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)
- [Control flow and error handling (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling)

## Pytania

### Kiedy wykonuje się blok `finally`? {junior}

Zawsze po zakończeniu `try` (i ewentualnie `catch`): po sukcesie, po wyjątku, a nawet po `return`, `break` czy `continue` wewnątrz `try`.
Służy do sprzątania: zamykania zasobów, ukrywania spinnera, zwalniania blokad. `return` w `finally` nadpisuje wartość zwracaną z `try`
i połyka wyjątki, dlatego się go unika.

### Dlaczego rzuca się obiekty `Error`, a nie stringi? {junior}

`Error` ma `stack` (ślad stosu, kluczowy przy debugowaniu), `message` i `name`, działa z `instanceof` i jest poprawnie obsługiwany przez
narzędzia do monitorowania. Rzucony string nie ma stosu, więc nie wiadomo, skąd pochodzi. Kod łapiący zwykle zakłada `error.message`,
co dla stringa daje `undefined`.

### Jak stworzyć własny typ błędu? {mid}

Rozszerzyć `Error`: `class NotFoundError extends Error { constructor(msg, options) { super(msg, options); this.name = 'NotFoundError' } }`,
ewentualnie z dodatkowymi polami (kod, zasób). Ustawienie `name` poprawia komunikaty i logi. Własne klasy pozwalają rozróżniać błędy
przez `instanceof` i obsługiwać je selektywnie, a nieznane przepuszczać dalej.

### Czym jest `cause` w konstruktorze `Error`? {mid}

Opcja z ES2022: `new Error('Nie udało się zapisać', { cause: originalError })`. Pozwala opakować niskopoziomowy błąd w bardziej
znaczący, bez gubienia oryginału i jego stosu. Tworzy łańcuch przyczyn, który wyświetlają konsole i narzędzia monitorujące. Wcześniej
oryginał często ginął przy ponownym rzuceniu.

### Czy `try/catch` złapie błąd z funkcji async wywołanej bez `await`? {mid}

Nie. Funkcja async zwraca promise, a błąd odrzuca ten promise dopiero później, gdy `try` już się zakończył. Trzeba użyć `await` wewnątrz
`try` albo `.catch()` na promise. Podobnie `try` wokół `setTimeout(() => { throw ... })` nie złapie błędu z callbacku, bo wykona się on
w innym zadaniu event loop.

### Dlaczego `try/catch` wokół `setTimeout` nie łapie błędu rzuconego w jego callbacku? {mid}

Blok `try` obejmuje tylko kod, który wykonuje się w nim synchronicznie. `setTimeout` tylko planuje callback i wraca, więc `try` się kończy; gdy callback rzuci wyjątek później,
działa na nowym stosie wywołań bez otaczającego `try` i błąd staje się nieprzechwycony (sprawdzone w Node: `try` się zakończył, a potem wywołało się `uncaughtException`). To
samo dotyczy listenerów zdarzeń i callbacków. `try/catch` umieszcza się w callbacku albo używa promisów z `await`, gdzie odrzucenie trafia do oczekującego `try`.

### Kiedy łapać wyjątki, a kiedy pozwolić im się propagować? {mid}

Łapać tam, gdzie można coś sensownego zrobić: pokazać komunikat, ponowić operację, użyć wartości zastępczej albo dodać kontekst
i rzucić dalej (`cause`). Przepuszczać te, których dany poziom nie potrafi obsłużyć, żeby trafiły do warstwy, która może (handler HTTP,
Error Boundary). Pusty `catch` bez logowania ukrywa błędy i utrudnia diagnozę.

### Wyjątki czy wartości błędów (`Result`)? {senior}

Wyjątki dobrze sprawdzają się w sytuacjach nieoczekiwanych (awaria sieci, błąd programisty), bo propagują się automatycznie. Dla
oczekiwanych wyników biznesowych (błąd walidacji, brak zasobu) jawny typ zwracany, np. `{ ok: true, value } | { ok: false, error }`, wymusza
obsłużenie przypadku przez wywołującego (w TypeScript na poziomie typów) i nie myli błędów z przepływem sterowania. Wiele zespołów łączy
oba podejścia.

### Czym jest `AggregateError`? {mid}

Błąd grupujący wiele innych błędów w polu `errors`. Rzuca go `Promise.any`, gdy wszystkie promise'y zostaną odrzucone. Można go użyć
samodzielnie, np. przy walidacji wielu pól lub wykonywaniu wielu niezależnych operacji, gdy chcemy zgłosić wszystkie niepowodzenia naraz,
a nie tylko pierwsze.

### Jak `return` w bloku `finally` wpływa na wynik funkcji? {senior}

Nadpisuje wartość zwracaną przez `try` lub `catch`, a nawet **połyka** rzucony wyjątek: funkcja zwróci wartość z `finally`, jakby błędu nie
było. Tak samo wyjątek rzucony w `finally` zastępuje oryginalny. Dlatego w `finally` umieszcza się wyłącznie kod sprzątający, bez `return`
i `throw`, a lintery (`no-unsafe-finally`) to zgłaszają.
