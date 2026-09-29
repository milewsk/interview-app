# Pamięć i garbage collector w JavaScript {senior}

JavaScript zarządza pamięcią automatycznie: obiekty są alokowane przy tworzeniu, a **garbage collector (GC)**
zwalnia te, które stały się **nieosiągalne**. Programista nie zwalnia pamięci ręcznie, ale może jej nie
zwalniać przez przypadek, gdy trzyma niepotrzebne referencje.

## Osiągalność i mark-and-sweep

- **Korzenie** (roots): obiekt globalny, bieżący stos wywołań (zmienne lokalne, argumenty), aktywne domknięcia,
  zarejestrowane callbacki (timery, listenery) i uchwyty środowiska.
- GC **oznacza** (mark) wszystko, do czego da się dojść od korzeni po referencjach, a resztę **usuwa** (sweep).
- **Cykle referencji nie są problemem**: obiekty wskazujące tylko na siebie nawzajem, ale nieosiągalne z korzeni,
  zostaną zebrane (w odróżnieniu od prostego zliczania referencji).

V8 (Chrome, Node) stosuje **GC generacyjny**: nowe obiekty trafiają do „młodej generacji” sprzątanej często
i tanio (scavenger), a te, które przeżyją kilka cykli, są przenoszone do „starej generacji” sprzątanej rzadziej
(mark-sweep-compact). Duża część pracy odbywa się przyrostowo i współbieżnie, żeby ograniczyć pauzy.

## Typowe wycieki pamięci

```js
// 1. Globalne kolekcje i cache bez limitu
const cache = new Map()
function getUser(id) { if (!cache.has(id)) cache.set(id, fetchUser(id)); return cache.get(id) }

// 2. Zapomniane timery i listenery
const id = setInterval(() => poll(bigState), 1000)       // bez clearInterval trzyma bigState
window.addEventListener('resize', onResize)               // bez removeEventListener

// 3. Odłączone węzły DOM trzymane w zmiennych
let detached = document.querySelector('#modal'); detached.remove()   // nadal w pamięci przez zmienną

// 4. Domknięcia trzymające duże obiekty dłużej niż trzeba
function setup() { const huge = loadHuge(); return () => huge.length }
```

W React: efekt bez cleanupu (subskrypcja, interwał, listener) i ustawianie stanu w odmontowanym komponencie.
W SPA wycieki narastają, bo strona nie jest przeładowywana.

## Słabe referencje

- **`WeakMap` / `WeakSet`**: klucze muszą być obiektami i są trzymane **słabo**, czyli nie blokują zwolnienia
  obiektu. Gdy klucz przestanie być osiągalny, wpis znika. Nie są iterowalne i nie mają `size`. Zastosowania:
  metadane i cache przypisane do obiektów, które nie powinny przedłużać ich życia, prywatne dane
  (przed polami `#`).
- **`WeakRef`**: słaba referencja do obiektu, a `deref()` zwraca obiekt albo `undefined`, jeśli został zebrany.
- **`FinalizationRegistry`**: callback wywoływany (kiedyś, **bez gwarancji**) po zebraniu obiektu.
  Specyfikacja zaleca unikać obu tam, gdzie nie są konieczne, bo zachowanie GC jest niedeterministyczne.

## Diagnoza

- **Chrome DevTools, zakładka Memory**: *Heap snapshot* (co zajmuje pamięć i kto to trzyma, tzw. retainers),
  porównanie dwóch snapshotów po powtórzeniu akcji, *Allocation timeline*, wyszukiwanie „Detached” elementów DOM.
- **Performance monitor**: wykres rozmiaru sterty. Stały wzrost po powtarzaniu tej samej akcji (piła, która
  nie wraca do poziomu wyjściowego) sugeruje wyciek.
- **Node**: `process.memoryUsage()`, `--inspect` + DevTools, `--heapsnapshot-signal`, `node --expose-gc` w testach.

## Źródła

- [Memory management (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management)
- [WeakMap (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
- [WeakRef and FinalizationRegistry (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef)
- [Fix memory problems (Chrome DevTools)](https://developer.chrome.com/docs/devtools/memory-problems)
- [Trash talk: the Orinoco garbage collector (V8 blog)](https://v8.dev/blog/trash-talk)

## Pytania

### Jak działa garbage collector w JavaScript? {mid}

Zwalnia obiekty nieosiągalne z korzeni: obiektu globalnego, stosu wywołań, aktywnych domknięć i zarejestrowanych callbacków. Algorytm
mark-and-sweep oznacza wszystko, do czego da się dojść po referencjach, a resztę usuwa. Silniki takie jak V8 dzielą stertę na generacje:
młode obiekty sprzątają często i tanio, a długo żyjące rzadziej, dużą część pracy wykonując przyrostowo i współbieżnie.

### Czy cykliczne referencje powodują wycieki pamięci? {mid}

Nie w nowoczesnych silnikach. Mark-and-sweep sprawdza osiągalność od korzeni, więc obiekty wskazujące na siebie nawzajem, ale nieosiągalne
z zewnątrz, zostaną zebrane. Problem cykli dotyczył prostego zliczania referencji (np. dawne silniki IE przy połączeniach DOM–JS). Wycieki
w JS to obiekty wciąż osiągalne przez niepotrzebną referencję.

### Jakie są najczęstsze przyczyny wycieków pamięci w aplikacji frontendowej? {mid}

Niezwolnione listenery i subskrypcje (`addEventListener` bez `remove`, WebSocket, store), niewyczyszczone `setInterval`, rosnące globalne
kolekcje i cache bez limitu, odłączone węzły DOM trzymane w zmiennych, domknięcia przechwytujące duże obiekty oraz w React efekty bez
cleanupu. W SPA kumulują się, bo strona nie jest przeładowywana.

### Czym różni się `WeakMap` od `Map`? {mid}

`WeakMap` trzyma klucze słabo: nie blokuje zebrania obiektu-klucza przez GC, a po jego zebraniu wpis znika. Klucze muszą być obiektami (lub
niezarejestrowanymi symbolami), a `WeakMap` nie jest iterowalna i nie ma `size`, bo jej zawartość zależy od niedeterministycznego GC. `Map`
trzyma klucze silnie, więc obiekt-klucz żyje tak długo jak wpis. `WeakMap` służy do metadanych i cache przypisanych do obiektów.

### Kiedy użyć `WeakRef` i `FinalizationRegistry`? {senior}

Rzadko: np. przy cache dużych obiektów, który nie powinien blokować ich zwolnienia (`WeakRef` + sprawdzanie `deref()`), albo do sprzątania
zasobów zewnętrznych po zebraniu obiektu (`FinalizationRegistry`). Moment zebrania i wywołania callbacku jest niedeterministyczny (może nie
nastąpić wcale), więc nie można na nich opierać logiki poprawności. Specyfikacja wprost zaleca unikanie ich, gdy nie są konieczne.

### Jak znaleźć wyciek pamięci w przeglądarce? {mid}

W Chrome DevTools, w zakładce Memory, zrobić heap snapshot, kilka razy powtórzyć podejrzaną akcję (np. otwarcie i zamknięcie modala), zrobić
drugi snapshot i porównać: obiekty, których liczba rośnie, wskazują wyciek, a panel „Retainers” pokazuje, co je trzyma. Pomagają też
*Allocation timeline*, filtr „Detached” dla węzłów DOM i monitor wydajności pokazujący, czy sterta wraca do poziomu wyjściowego po GC.

### Czym jest „detached DOM node” i dlaczego powoduje wyciek? {mid}

To element usunięty z dokumentu, ale wciąż osiągalny z JavaScriptu: przez zmienną, cache, listener albo domknięcie. Nie jest widoczny, ale nie
może zostać zebrany, a trzyma całe poddrzewo i powiązane dane. Zwykle powstaje, gdy kod zapisuje referencję do elementu (np. w obiekcie
kontrolera), a potem usuwa element z DOM bez wyczyszczenia referencji.

### Jak domknięcia mogą zatrzymywać pamięć? {mid}

Dopóki funkcja jest osiągalna (np. zarejestrowana jako listener lub callback timera), jej środowisko ze wszystkimi przechwyconymi zmiennymi
zostaje w pamięci. W V8 funkcje utworzone w jednym zakresie współdzielą obiekt kontekstu, więc mała, długo żyjąca funkcja może trzymać duży
obiekt używany tylko przez inną funkcję z tego zakresu. Pomaga zwalnianie callbacków i nieprzechwytywanie niepotrzebnych danych.

### Dlaczego ręczne wywoływanie GC nie jest możliwe (i nie jest potrzebne) w przeglądarce? {mid}

Specyfikacja nie udostępnia API do sterowania GC, bo silniki stosują różne, dopracowane strategie (generacje, przyrostowość, praca w tle),
a ręczne wymuszanie zwykle pogarszałoby wydajność. W Node flaga `--expose-gc` udostępnia `global.gc()`, ale tylko do testów i diagnostyki.
Programista wpływa na GC pośrednio: usuwając niepotrzebne referencje.

### Jak zapobiegać wyciekom w komponentach React? {mid}

Każdy efekt, który coś rejestruje (listener, interwał, subskrypcja, połączenie, obserwator), musi zwracać cleanup, który to wyrejestrowuje.
Asynchroniczne operacje anuluje się (`AbortController`) albo ignoruje ich wynik po odmontowaniu. Nie trzyma się referencji do komponentów
ani węzłów DOM w modułach czy globalnych cache. `StrictMode` w developmencie pomaga wykryć brakujący cleanup, bo montuje efekty dwukrotnie.
