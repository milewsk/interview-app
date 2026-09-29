# Promise w praktyce {mid}

`Promise` reprezentuje wynik operacji asynchronicznej, który będzie dostępny później. Ma trzy stany:
**pending** (oczekuje), **fulfilled** (spełniony, z wartością) i **rejected** (odrzucony, z powodem).
Stan zmienia się **tylko raz** (promise jest wtedy *settled*), a kolejne `resolve`/`reject` są
ignorowane.

```js
const p = new Promise((resolve, reject) => {
  console.log('executor wykonuje się synchronicznie')
  resolve(1)
  resolve(2) // ignorowane
})
```

## Łańcuchy `then`

Każde `then`, `catch` i `finally` **zwraca nowy promise**, dzięki czemu można je łączyć. To, co
zwróci callback, określa stan kolejnego ogniwa:

- zwrócona zwykła wartość: następny promise spełnia się tą wartością,
- zwrócony promise (lub dowolny *thenable*): następne ogniwo **czeka na niego i przejmuje jego
  wynik** (spłaszczanie),
- rzucony wyjątek: następny promise jest odrzucony.

```js
await Promise.resolve(1)
  .then((x) => x + 1)                   // 2
  .then((x) => Promise.resolve(x * 10)) // 20, a nie Promise<20>
```

Najczęstszy błąd to **zapomniany `return`**: łańcuch nie czeka na wewnętrzną operację, dostaje
`undefined`, a błąd z niej trafia w próżnię.

```js
.then(() => { saveAsync(data) })        // 🔴 nie czeka, nie przekaże błędu
.then(() => saveAsync(data))            // ✅
```

## Obsługa błędów

- Odrzucenie „przeskakuje” kolejne `then` aż do najbliższego `catch` (lub `then(_, onRejected)`).
- `catch` **obsługuje błąd**: jeśli nic nie rzuci, łańcuch dalej jest spełniony.
- `then(onOk, onFail)` **nie złapie** błędu rzuconego w `onOk`, a `.then(onOk).catch(onFail)` złapie.
- `finally` nie dostaje argumentów i przepuszcza dalej oryginalną wartość lub błąd. Wyjątek rzucony
  w `finally` nadpisuje jednak wynik.
- **Nieobsłużone odrzucenie**: przeglądarka zgłasza zdarzenie `unhandledrejection`, a Node (od
  wersji 15) domyślnie **kończy proces** z błędem.

## Kombinatory

| Metoda | Kiedy się rozstrzyga | Wynik |
| --- | --- | --- |
| `Promise.all` | wszystkie spełnione **albo pierwsze odrzucenie** | tablica wartości w kolejności wejścia |
| `Promise.allSettled` | wszystkie rozstrzygnięte | `[{ status, value }` lub `{ status, reason }]` |
| `Promise.race` | pierwszy rozstrzygnięty (spełniony lub odrzucony) | jego wynik |
| `Promise.any` | pierwszy **spełniony** | jego wartość; gdy wszystkie odrzucone, `AggregateError` |

```js
const [user, orders] = await Promise.all([getUser(id), getOrders(id)]) // równolegle

const results = await Promise.allSettled(urls.map((u) => fetch(u)))
const failed = results.filter((r) => r.status === 'rejected')

const data = await Promise.race([fetch(url), timeout(5000)]) // prosty timeout
```

`Promise.all` przy pierwszym błędzie **nie anuluje** pozostałych operacji, bo promise nie ma
wbudowanego anulowania. Do tego służy `AbortController` przekazywany np. do `fetch`.

## async/await a promise'y

`async function` zawsze zwraca promise, a `await` czeka na promise i rozpakowuje wartość (albo rzuca
błąd, który łapie się przez `try/catch`). Pułapki:

```js
// 🔴 sekwencyjnie: 3 × czas
for (const id of ids) results.push(await fetchItem(id))

// ✅ równolegle
const results = await Promise.all(ids.map((id) => fetchItem(id)))

// 🔴 forEach nie czeka na async callbacki
ids.forEach(async (id) => { await save(id) })
console.log('to wypisze się przed zapisami')

// ✅ for...of z await (sekwencyjnie) albo Promise.all (równolegle)
```

Przy dużej liczbie zadań `Promise.all` odpala wszystkie naraz. Do ograniczenia współbieżności
służą paczki (np. `p-limit`) albo przetwarzanie partiami.

## Nowsze API

- `Promise.withResolvers()` (ES2024) zwraca `{ promise, resolve, reject }`, co przydaje się, gdy
  `resolve` trzeba wywołać poza executorem (np. w handlerze zdarzenia).
- `Promise.try(fn)` (ES2025) opakowuje funkcję synchroniczną lub asynchroniczną, dzięki czemu
  synchroniczny wyjątek też staje się odrzuceniem.

## Promisyfikacja callbacków

```js
const readFileAsync = (path) =>
  new Promise((resolve, reject) =>
    fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data))),
  )
// w Node: util.promisify(fs.readFile) albo gotowe fs/promises
```

Antywzorzec: owijanie w `new Promise` czegoś, co **już zwraca promise** (explicit construction
anti-pattern). Łatwo wtedy zgubić odrzucenie.

## Źródła

- [Using promises (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)
- [Promise (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [Promise.allSettled (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
- [Promise.withResolvers (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers)
- [Promise.try (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try)

## Pytania

### Jakie stany może mieć promise i czy stan może się zmienić dwa razy? {junior}

`pending`, `fulfilled` i `rejected`. Po spełnieniu lub odrzuceniu promise jest *settled* i jego stan
się już nie zmienia: kolejne wywołania `resolve`/`reject` są ignorowane. Executor przekazany do
`new Promise` wykonuje się synchronicznie, od razu w konstruktorze.

### Co zwraca `then` i co się dzieje, gdy callback zwróci promise? {mid}

`then` zawsze zwraca nowy promise. Gdy callback zwróci wartość, nowy promise spełnia się nią. Gdy rzuci
wyjątek, nowy promise jest odrzucony. Gdy zwróci promise (lub thenable), nowy promise przejmuje jego
stan i wynik, więc nie powstaje `Promise<Promise<T>>`. Dlatego w łańcuchu trzeba zwracać (`return`)
wewnętrzne operacje asynchroniczne.

### Czym różni się `.then(onOk, onFail)` od `.then(onOk).catch(onFail)`? {mid}

W pierwszej wersji `onFail` obsłuży tylko odrzucenie promise'a **poprzedniego**, a błąd rzucony wewnątrz
`onOk` nie zostanie złapany. W drugiej `catch` jest kolejnym ogniwem, więc łapie zarówno odrzucenie
wcześniejszego promise'a, jak i wyjątek z `onOk`. Zwykle właściwa jest druga forma.

### Co się stanie z łańcuchem po `catch`? {junior}

`catch` obsługuje błąd i zwraca nowy promise. Jeśli handler nie rzuci wyjątku, łańcuch jest dalej
**spełniony** wartością zwróconą z `catch` (lub `undefined`), więc kolejne `then` się wykonają. Aby
propagować błąd dalej, trzeba go ponownie rzucić w `catch`.

### Czym różnią się `Promise.all`, `allSettled`, `race` i `any`? {mid}

`all` czeka na wszystkie i zwraca tablicę wyników, ale odrzuca się przy **pierwszym** błędzie.
`allSettled` czeka na wszystkie i zwraca opisy `{status, value|reason}`, więc nigdy się nie odrzuca.
`race` rozstrzyga się jak pierwszy rozstrzygnięty promise, także odrzucony. `any` czeka na pierwszy
**spełniony**, a gdy wszystkie zostaną odrzucone, rzuca `AggregateError` z listą błędów.

### Czy `Promise.all` przerywa pozostałe operacje, gdy jedna się nie powiedzie? {mid}

Nie. Zwrócony promise od razu się odrzuca, ale pozostałe operacje nadal trwają, a ich wyniki są
ignorowane. Promise nie ma wbudowanego anulowania. Do przerwania np. zapytań `fetch` używa się
`AbortController`: przekazuje się `signal` i wywołuje `abort()` w `catch`.

### Dlaczego `array.forEach(async ...)` nie działa zgodnie z oczekiwaniem? {mid}

`forEach` ignoruje wartości zwracane przez callback, więc nie czeka na zwrócone promise'y. Kod po
`forEach` wykona się, zanim operacje się zakończą, a ich błędy nie trafią do otaczającego `try/catch`.
Należy użyć `for...of` z `await` (sekwencyjnie) albo `await Promise.all(array.map(async ...))`
(równolegle).

### Jak wykonać wiele żądań równolegle, ale nie więcej niż N naraz? {senior}

`Promise.all` uruchamia wszystkie naraz. Aby ograniczyć współbieżność, można przetwarzać dane partiami
(`for` po kawałkach tablicy z `await Promise.all(chunk.map(...))`) albo użyć puli: N „workerów”, z
których każdy w pętli pobiera kolejne zadanie ze wspólnej kolejki. Gotowe rozwiązania to np. `p-limit`.
Pula jest wydajniejsza od partii, bo nie czeka na najwolniejsze zadanie w każdej partii.

### Co się dzieje z nieobsłużonym odrzuceniem promise'a? {mid}

Przeglądarka zgłasza zdarzenie `unhandledrejection` i loguje błąd w konsoli. Node od wersji 15
domyślnie traktuje je jak nieobsłużony wyjątek i **kończy proces**. Dlatego każdy łańcuch powinien
kończyć się obsługą błędu, a promise'y „odpalone i zapomniane” wymagają przynajmniej `catch`
z logowaniem.

### Do czego służą `Promise.withResolvers()` i `Promise.try()`? {senior}

`withResolvers()` (ES2024) zwraca `{ promise, resolve, reject }` bez pisania executora. Przydaje się,
gdy promise ma zostać rozstrzygnięty z zewnątrz, np. w callbacku zdarzenia albo w kolejce.
`Promise.try(fn)` (ES2025) wywołuje `fn` i zawsze zwraca promise, a synchroniczny wyjątek z `fn`
zamienia się w odrzucenie. Upraszcza to obsługę funkcji, które mogą być synchroniczne lub
asynchroniczne.
