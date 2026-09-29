# async/await w JavaScript {mid}

`async`/`await` to składnia nad promise'ami, która pozwala pisać kod asynchroniczny liniowo. Nie zmienia modelu
wykonania: pod spodem nadal działają promise'y i mikrozadania.

```js
async function loadUser(id) {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()               // wartość zwracana staje się wartością promise'a
}
```

## Semantyka

- Funkcja `async` **zawsze zwraca promise**: zwrócona wartość go spełnia, a rzucony wyjątek go odrzuca.
- Kod wykonuje się **synchronicznie do pierwszego `await`**. Potem funkcja się zawiesza, a wywołujący od razu
  kontynuuje swój kod. Reszta funkcji trafia do kolejki mikrozadań po rozstrzygnięciu oczekiwanej wartości.
- `await` przyjmuje też wartości, które nie są promise'ami (`await 42`), oraz thenable. Zawsze jednak oddaje
  sterowanie co najmniej na jedno mikrozadanie.
- Błędy łapie się zwykłym `try/catch` wokół `await`.

## Sekwencyjnie czy równolegle

```js
// 🔴 sekwencyjnie: czas = suma
const user = await getUser(id)
const orders = await getOrders(id)

// ✅ równolegle: czas = najdłuższe
const [user, orders] = await Promise.all([getUser(id), getOrders(id)])

// ✅ też równolegle: najpierw uruchom, potem czekaj
const userP = getUser(id)
const ordersP = getOrders(id)
const user2 = await userP, orders2 = await ordersP
```

Przy wariancie „uruchom i czekaj po kolei” uważaj na błędy: jeśli `ordersP` odrzuci się, zanim zaczniesz na
niego czekać, w niektórych środowiskach pojawi się ostrzeżenie o nieobsłużonym odrzuceniu. `Promise.all` jest
bezpieczniejsze. Operacje zależne od siebie muszą pozostać sekwencyjne.

## Pułapka: `return` a `return await` w `try`

```js
async function load() {
  try {
    return fetchData()          // 🔴 odrzucenie NIE trafi do catch poniżej
  } catch {
    return fallback
  }
}

async function loadSafe() {
  try {
    return await fetchData()    // ✅ odrzucenie trafi do catch
  } catch {
    return fallback
  }
}
```

Bez `await` funkcja kończy blok `try`, zanim promise się rozstrzygnie. Poza `try/catch` `return await` jest
zbędne (poza lepszym śladem stosu).

## Pętle

- `for...of` z `await` przetwarza elementy **po kolei**, co jest właściwe, gdy kolejność ma znaczenie lub trzeba
  ograniczyć obciążenie.
- `forEach(async ...)` **nie czeka** na callbacki. Do równoległości służy `Promise.all(items.map(async ...))`,
  a do ograniczonej równoległości pula (np. `p-limit`).
- `for await...of` iteruje po asynchronicznych iteratorach (strumienie, stronicowanie).

## Anulowanie i timeouty

Promise'y nie mają wbudowanego anulowania. Standardem jest **`AbortController` / `AbortSignal`**:

```js
const controller = new AbortController()
const res = await fetch(url, { signal: controller.signal })   // controller.abort() przerwie żądanie

await fetch(url, { signal: AbortSignal.timeout(5000) })           // TimeoutError po 5 s
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])   // którykolwiek
```

Własne funkcje asynchroniczne powinny przyjmować `signal` i przekazywać go dalej (np. do `fetch`) albo sprawdzać
`signal.aborted` / `signal.throwIfAborted()`.

## Źródła

- [async function (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [await (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await)
- [AbortController (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [AbortSignal.timeout (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- [AbortSignal.any (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)

## Pytania

### Co zwraca funkcja `async`? {junior}

Zawsze promise. Wartość zwrócona przez `return` spełnia ten promise, a rzucony wyjątek go odrzuca. Nawet `async () => 1` zwraca
`Promise<1>`, więc wynik trzeba odczytać przez `await` albo `.then()`.

### Czy kod funkcji `async` wykonuje się asynchronicznie od początku? {mid}

Nie. Ciało wykonuje się synchronicznie aż do pierwszego `await`. Dopiero tam funkcja się zawiesza i zwraca wywołującemu oczekujący
promise, a wywołujący kontynuuje swój kod. Dalsza część funkcji wykona się jako mikrozadanie. Funkcja `async` bez `await` wykona się więc
w całości synchronicznie, choć wynik i tak będzie opakowany w promise.

### Jak wykonać kilka niezależnych operacji równolegle? {junior}

Uruchomić je wszystkie przed czekaniem i poczekać zbiorczo: `const [a, b] = await Promise.all([getA(), getB()])`. Czas to wtedy najdłuższa
z operacji, a nie ich suma. `await` każdej po kolei (`await getA(); await getB()`) wykonuje je sekwencyjnie. Gdy wyniki mają być zebrane
mimo błędów, używa się `Promise.allSettled`.

### Dlaczego `return promise` w bloku `try` nie złapie błędu, a `return await promise` tak? {mid}

`return promise` kończy wykonanie bloku `try` natychmiast, zwracając niezakończony promise. Gdy później zostanie on odrzucony, blok `try`
już nie istnieje, więc błąd trafia do wywołującego. `return await` czeka na rozstrzygnięcie wewnątrz `try`, więc odrzucenie zamienia się
w wyjątek łapany przez `catch`. Poza `try/catch` `await` przy `return` nie jest potrzebne.

### Jak anulować operację asynchroniczną? {mid}

Przez `AbortController`: przekazuje się `controller.signal` do operacji (`fetch`, strumienie, własne funkcje), a `controller.abort()`
przerywa ją, przez co promise odrzuca się z `AbortError`. `AbortSignal.timeout(ms)` tworzy sygnał przerywający po czasie (`TimeoutError`),
a `AbortSignal.any([...])` łączy kilka sygnałów. Własne funkcje powinny przyjmować `signal` i przekazywać go dalej.

### Czy `await` blokuje wątek? {junior}

Nie. `await` zawiesza tylko bieżącą funkcję `async` i oddaje sterowanie pętli zdarzeń, więc w tym czasie wykonuje się inny kod: obsługa
kliknięć, renderowanie, inne zapytania. Wątek blokuje dopiero długie synchroniczne obliczenie, niezależnie od tego, czy jest w funkcji `async`.

### Jak obsługiwać błędy przy wielu równoległych zapytaniach? {mid}

`Promise.all` odrzuca się przy pierwszym błędzie (pozostałe operacje trwają, ale ich wyniki są ignorowane), więc sprawdza się, gdy potrzebne są
wszystkie wyniki. `Promise.allSettled` zbiera wynik każdej operacji (`fulfilled`/`rejected`), co pozwala obsłużyć częściowe powodzenie. Przy
pierwszym błędzie można też anulować resztę przez wspólny `AbortController`.

### Dlaczego `array.forEach(async (x) => await save(x))` jest błędem? {mid}

`forEach` ignoruje promise'y zwracane przez callback, więc nie czeka na zapisy. Kod po `forEach` wykona się od razu, a błędy zapisów nie
trafią do otaczającego `try/catch` (staną się nieobsłużonymi odrzuceniami). Poprawnie: `for (const x of array) await save(x)` (sekwencyjnie)
albo `await Promise.all(array.map(save))` (równolegle).

### Czym różni się `async/await` od `.then()`? {junior}

Działają na tym samym mechanizmie promise'ów. `async/await` pozwala pisać kod liniowo, z naturalnym `try/catch`, pętlami i warunkami, co jest
czytelniejsze przy wielu krokach. `.then()` bywa zwięźlejsze przy prostych transformacjach i nie wymaga funkcji `async`. Można je swobodnie
łączyć, bo `await` działa na dowolnym promise.

### Jak dodać timeout do zapytania `fetch`? {mid}

Przekazać `signal: AbortSignal.timeout(5000)`. Po 5 sekundach żądanie zostanie przerwane, a promise odrzucony z błędem `TimeoutError`. Jeśli
potrzebne jest też ręczne anulowanie, łączy się sygnały: `AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])`. Starszym sposobem
było `Promise.race` z promise'em odrzucanym przez `setTimeout`, który jednak nie przerywa samego żądania.
