# Event loop {mid}

JavaScript wykonuje kod **w jednym wątku**: w danej chwili działa najwyżej jeden fragment JS,
a funkcja zawsze wykonuje się **do końca**, zanim zajdzie cokolwiek innego. **Pętla zdarzeń**
(event loop) to mechanizm, który decyduje, co uruchomić, gdy stos wywołań jest pusty.

## Elementy układanki

- **Stos wywołań** (call stack): funkcje wykonywane w tej chwili.
- **API środowiska** (przeglądarka lub Node.js): timery, sieć, zdarzenia DOM. Działają poza
  wątkiem JS, a po zakończeniu pracy dodają callback do kolejki.
- **Kolejki zadań** (tasks, macrotasks): callbacki `setTimeout`/`setInterval`, zdarzenia UI
  (click, input), callbacki sieciowe, wiadomości `MessageChannel`.
- **Kolejka mikrozadań** (microtasks): reakcje promise'ów (`then`/`catch`/`finally`, kod po
  `await`), `queueMicrotask`, `MutationObserver`.
- **Renderowanie**: przeliczenie stylów, layout i malowanie, poprzedzone callbackami
  `requestAnimationFrame`.

## Jedna iteracja pętli (przeglądarka)

1. Pobierz **jedno** zadanie z kolejki zadań i wykonaj je do końca.
2. **Microtask checkpoint**: wykonaj **wszystkie** mikrozadania, łącznie z tymi dodanymi przez
   inne mikrozadania, aż kolejka będzie pusta.
3. Jeśli nadszedł czas renderowania (zwykle raz na klatkę, ok. 16,7 ms przy 60 Hz): wywołaj
   callbacki `requestAnimationFrame`, potem style, layout i malowanie.
4. Powtórz. W czasie bezczynności przeglądarka może wywołać `requestIdleCallback`.

Najważniejszy wniosek: **wszystkie mikrozadania wykonują się przed kolejnym zadaniem i przed
renderowaniem.**

```js
console.log('1')
setTimeout(() => console.log('2'))
Promise.resolve().then(() => console.log('3'))
console.log('4')
// 1, 4, 3, 2
```

## async/await pod spodem

- Funkcja `async` wykonuje się **synchronicznie** aż do pierwszego `await`.
- `await` zawiesza funkcję. Jej dalsza część (kontynuacja) trafia do kolejki jako **mikrozadanie**,
  gdy oczekiwana wartość się rozstrzygnie. Dzieje się tak nawet wtedy, gdy promise jest już
  rozwiązany albo wartość w ogóle nie jest promise'em.
- Wywołujący od razu dostaje oczekujący promise i kontynuuje własny kod synchroniczny.

```js
async function a() {
  console.log('a1')
  await b()
  console.log('a2')
}
async function b() {
  console.log('b')
}

console.log('start')
setTimeout(() => console.log('timeout'))
a()
Promise.resolve().then(() => console.log('then'))
console.log('end')
// start, a1, b, end, a2, then, timeout
```

## Długie zadania i zamrożony interfejs

Podczas wykonywania zadania przeglądarka nie obsłuży kliknięć ani nie narysuje ekranu. Zadanie
dłuższe niż ok. 50 ms to **long task**, odczuwalny jako lag. Co można zrobić:

- podzielić pracę na kawałki i między nimi **oddawać sterowanie** pętli zdarzeń (`setTimeout`
  lub `scheduler.yield()` w przeglądarkach, które go obsługują),
- przenieść ciężkie obliczenia do **Web Workera** (osobny wątek),
- przy aktualizacjach UI w React użyć `startTransition` / `useDeferredValue`, żeby pilne
  aktualizacje miały pierwszeństwo.

Nieskończony łańcuch mikrozadań (promise, który ciągle dodaje kolejny) zamrozi stronę tak samo
jak nieskończona pętla `while`, bo renderowanie nigdy nie dostanie swojej kolejki.

## Timery nie są precyzyjne

`setTimeout(fn, 0)` znaczy „nie wcześniej niż za 0 ms, jako osobne zadanie”, a nie „natychmiast”.
Callback poczeka na koniec bieżącego zadania, wszystkie mikrozadania i ewentualnie renderowanie.
Przeglądarki podnoszą opóźnienie głęboko zagnieżdżonych timerów (po kilku poziomach) do co
najmniej 4 ms i mocno spowalniają timery w kartach w tle.

## Różnice w Node.js

Node ma własną pętlę zdarzeń (libuv) z fazami (timers → pending callbacks → poll → check → close)
i dwa dodatkowe mechanizmy:

- callbacki `process.nextTick` wykonują się **przed** mikrozadaniami promise'ów,
- `setImmediate` działa w fazie check, po odpytaniu I/O.

```js
setTimeout(() => console.log('timeout'))
setImmediate(() => console.log('immediate'))
Promise.resolve().then(() => console.log('promise'))
process.nextTick(() => console.log('nextTick'))
console.log('sync')
// sync, nextTick, promise, potem timeout/immediate
```

Kolejność `timeout` i `immediate` w głównym module nie jest deterministyczna (zależy od czasu
startu procesu). Wewnątrz callbacku I/O `setImmediate` zawsze wykona się pierwszy.

## Źródła

- [JavaScript execution model (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [Using microtasks (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide)
- [Event loops (HTML spec)](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [The Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

## Pytania

### Dlaczego callback promise'a wykona się przed callbackiem `setTimeout(…, 0)`? {junior}

Callbacki promise'ów to mikrozadania. Po zakończeniu bieżącego zadania (np. wykonywanego skryptu)
pętla zdarzeń opróżnia **całą** kolejkę mikrozadań, zanim pobierze następne zadanie z kolejki zadań,
w której czeka callback timera.

### Co wypisze ten kod? {mid}

```js
async function a() {
  console.log('a1')
  await b()
  console.log('a2')
}
async function b() {
  console.log('b')
}

console.log('start')
setTimeout(() => console.log('timeout'))
a()
Promise.resolve().then(() => console.log('then'))
console.log('end')
```

`start, a1, b, end, a2, then, timeout`. `a()` wykonuje się synchronicznie aż do `await`, razem
z ciałem `b()`. Kontynuacja (`a2`) trafia do kolejki mikrozadań przed `then`, bo `a()` jest
wywołane wcześniej. `timeout` to zadanie, więc wykona się po wszystkich mikrozadaniach.

### Co wypisze ten kod? {mid}

```js
console.log(1)
setTimeout(() => console.log(2))
Promise.resolve().then(() => {
  console.log(3)
  setTimeout(() => console.log(4))
  Promise.resolve().then(() => console.log(5))
})
console.log(6)
```

`1, 6, 3, 5, 2, 4`. Kod synchroniczny wypisuje 1 i 6. W microtask checkpoincie wykonuje się 3,
które dodaje kolejne mikrozadanie (5), a ono wykonuje się w **tym samym** checkpoincie. Dopiero
potem przychodzą zadania, w kolejności zaplanowania: 2, a potem 4.

### Czy mikrozadania mogą blokować renderowanie? {mid}

Tak. Kolejka mikrozadań jest opróżniana w całości, zanim przeglądarka może renderować, a mikrozadania
dodane przez mikrozadania wykonują się w tym samym checkpoincie. Nieskończony łańcuch mikrozadań
zamrozi stronę tak samo jak synchroniczna nieskończona pętla.

### Co dzieje się z kodem po `await`? {mid}

Trafia do kolejki jako mikrozadanie, gdy oczekiwana wartość się rozstrzygnie, nawet jeśli była już
rozwiązana. Funkcja `async` od razu zwraca wywołującemu oczekujący promise, więc kod synchroniczny
po wywołaniu wykona się wcześniej.

### Czy `setTimeout(fn, 0)` wywoła callback natychmiast? {junior}

Nie. Planuje **zadanie**, które wykona się po zakończeniu bieżącego zadania, po wszystkich
mikrozadaniach i ewentualnie po renderowaniu. Opóźnienie to minimum, a nie gwarancja. Zagnieżdżone
timery są podnoszone do 4 ms, a w kartach w tle dodatkowo spowalniane.

### Jak uniknąć zamrożenia interfejsu przez ciężkie obliczenia? {mid}

Podzielić je na kawałki i między nimi oddawać sterowanie pętli zdarzeń (`setTimeout`,
`scheduler.yield()`), żeby przeglądarka mogła obsłużyć zdarzenia i renderować. Obliczenia
obciążające CPU przenieść do Web Workera. W React dodatkowo oznaczyć niepilne aktualizacje przez
`startTransition` lub `useDeferredValue`.

### Kiedy wykonuje się `requestAnimationFrame` i dlaczego używać go do animacji? {mid}

Tuż przed najbliższym malowaniem ekranu, po zadaniach i mikrozadaniach, raz na klatkę. Zmiany
wprowadzone w nim trafiają do tej samej klatki, w tempie dopasowanym do odświeżania ekranu.
W kartach w tle przeglądarka go wstrzymuje, co oszczędza zasoby. Animacja na `setTimeout` może
trafiać w środek klatki i powodować przycięcia.

### Czym różnią się `process.nextTick`, promise'y i `setImmediate` w Node.js? {senior}

Callbacki `process.nextTick` wykonują się najwcześniej, zaraz po bieżącej operacji i przed
mikrozadaniami promise'ów. Następne są callbacki promise'ów, jako mikrozadania. `setImmediate` to
zadanie w fazie **check** pętli zdarzeń, po odpytaniu I/O. W głównym module jego kolejność względem
`setTimeout(…, 0)` jest niedeterministyczna, ale wewnątrz callbacku I/O `setImmediate` zawsze
wygrywa.

### Do czego służy `queueMicrotask` i czym różni się od `setTimeout(fn, 0)`? {mid}

`queueMicrotask(fn)` dodaje funkcję do kolejki **mikrozadań**, więc wykona się zaraz po bieżącym kodzie
synchronicznym, przed jakimkolwiek zadaniem i przed renderowaniem. `setTimeout(fn, 0)` planuje osobne
**zadanie**, które poczeka co najmniej do następnej iteracji pętli. Dla `console.log('a');
queueMicrotask(m); setTimeout(t); Promise.resolve().then(p); console.log('b')` kolejność to `a, b, m,
p, t`. Mikrozadanie przydaje się, gdy trzeba odroczyć pracę „na koniec bieżącego zadania” (np.
zgrupować kilka zmian), bez opóźnienia i bez tworzenia promise'a.
