# Zdarzenia DOM {mid}

## Propagacja: trzy fazy

Zdarzenie wywołane na elemencie przechodzi przez drzewo DOM w trzech fazach:

1. **Przechwytywanie** (capture): od `window` w dół do rodzica celu,
2. **Cel** (target): listenery na samym elemencie,
3. **Bąbelkowanie** (bubble): od celu w górę do `window`.

```js
outer.addEventListener('click', handler, { capture: true })   // faza przechwytywania
outer.addEventListener('click', handler)                        // domyślnie: faza bąbelkowania
```

Dla kliknięcia w przycisk w liście kolejność to: listener `capture` na przodku, listener na przycisku,
listener na liście, listener `bubble` na przodku. Nie wszystkie zdarzenia bąbelkują: `focus`/`blur` nie (ich
bąbelkujące odpowiedniki to `focusin`/`focusout`), podobnie `mouseenter`/`mouseleave` i `load`.

## `target` a `currentTarget`

- `event.target`: element, na którym zdarzenie **powstało** (np. `<span>` wewnątrz przycisku).
- `event.currentTarget`: element, do którego **podpięto** obsługiwany listener.

## Zatrzymywanie

- `stopPropagation()`: zdarzenie nie przejdzie do kolejnych elementów, ale **pozostałe listenery na tym samym
  elemencie** nadal się wykonają.
- `stopImmediatePropagation()`: zatrzymuje także pozostałe listenery na bieżącym elemencie.
- `preventDefault()`: blokuje **domyślną akcję** przeglądarki (przejście linkiem, wysłanie formularza, zaznaczenie
  checkboxa), ale nie propagację. Działa tylko dla zdarzeń `cancelable`.

Nadużywanie `stopPropagation` psuje inne mechanizmy oparte na bąbelkowaniu (analityka, zamykanie menu po
kliknięciu poza nim, delegacja we frameworkach).

## Delegacja zdarzeń

Zamiast listenera na każdym elemencie listy, jeden listener na kontenerze i rozpoznanie celu:

```js
list.addEventListener('click', (event) => {
  const button = event.target.closest('button.delete')
  if (!button || !list.contains(button)) return
  removeItem(button.dataset.id)
})
```

Zalety: mniej listenerów (pamięć), automatyczna obsługa elementów dodanych później, prostsze sprzątanie.
`closest()` obsługuje kliknięcia w elementy zagnieżdżone w przycisku. React stosuje delegację wewnętrznie.

## Opcje `addEventListener`

- `once: true`: listener usuwa się po pierwszym wywołaniu.
- `passive: true`: deklaracja, że handler nie wywoła `preventDefault()`. Przy `touchstart`/`wheel` pozwala
  przeglądarce przewijać bez czekania na JS (płynniejsze przewijanie).
- `signal`: `AbortSignal`, którego `abort()` usuwa listener. Wygodne sprzątanie wielu listenerów naraz.
- `removeEventListener` wymaga **tej samej referencji funkcji** (i tej samej wartości `capture`), więc
  anonimowej strzałki nie da się usunąć.

## Własne zdarzenia

```js
element.dispatchEvent(new CustomEvent('cart:updated', { detail: { count: 3 }, bubbles: true }))
```

`CustomEvent` domyślnie **nie bąbelkuje** (`bubbles: false`). Własne zdarzenia pozwalają luźno wiązać
komponenty (np. Web Components).

## Wydajność

Zdarzenia wywoływane bardzo często (`scroll`, `resize`, `mousemove`, `input`) ogranicza się przez **throttle**
lub **debounce**, a zmiany wizualne synchronizuje z `requestAnimationFrame`. Do obserwacji zmian często lepsze
są API: `IntersectionObserver` (widoczność), `ResizeObserver` (rozmiar), `MutationObserver` (zmiany DOM).

## Źródła

- [Introduction to events (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events)
- [Event bubbling (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [addEventListener (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [CustomEvent (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)

## Pytania

### Jakie są fazy propagacji zdarzenia DOM? {junior}

Przechwytywanie (od `window` w dół do rodzica celu), faza celu (listenery na samym elemencie) i bąbelkowanie (od celu w górę do `window`).
Domyślnie `addEventListener` rejestruje handler w fazie bąbelkowania, a `{ capture: true }` w fazie przechwytywania. Nie każde zdarzenie
bąbelkuje (np. `focus`, `mouseenter`).

### Czym różni się `event.target` od `event.currentTarget`? {junior}

`target` to element, na którym zdarzenie faktycznie powstało, np. ikona wewnątrz przycisku. `currentTarget` to element, do którego podpięto
aktualnie wykonywany listener. Przy delegacji `currentTarget` jest kontenerem, a `target` klikniętym potomkiem, dlatego do znalezienia
właściwego elementu używa się `target.closest(selektor)`.

### Czym jest delegacja zdarzeń i jakie ma zalety? {mid}

To obsługa zdarzeń wielu elementów jednym listenerem na wspólnym przodku, z rozpoznaniem celu przez `event.target.closest(...)`. Zalety: mniej
listenerów i mniejsze zużycie pamięci, automatyczne działanie dla elementów dodanych później (np. nowe wiersze listy) i prostsze sprzątanie.
Ograniczenie: działa tylko dla zdarzeń, które bąbelkują.

### Czym różni się `stopPropagation` od `preventDefault`? {junior}

`stopPropagation()` zatrzymuje przekazywanie zdarzenia do kolejnych elementów w drzewie, ale nie blokuje domyślnej akcji. `preventDefault()` blokuje
domyślną akcję przeglądarki (np. przejście linkiem, wysłanie formularza), ale zdarzenie dalej się propaguje. To dwie niezależne rzeczy i czasem
potrzebne są obie.

### Czym różni się `stopPropagation` od `stopImmediatePropagation`? {mid}

`stopPropagation` zatrzymuje przejście do innych elementów, ale pozostałe listenery na **bieżącym** elemencie nadal się wykonają.
`stopImmediatePropagation` dodatkowo zatrzymuje kolejne listenery na tym samym elemencie. Przydaje się, gdy wiele niezależnych skryptów podpina
się pod ten sam element, a jeden musi przejąć obsługę.

### Dlaczego `removeEventListener` czasem nie działa? {mid}

Wymaga dokładnie tej samej referencji funkcji i tej samej wartości `capture`, co przy dodawaniu. Anonimowa funkcja strzałkowa czy funkcja
utworzona przez `bind` przy dodawaniu to inna referencja niż przy usuwaniu. Rozwiązania: zapisać handler w zmiennej, użyć opcji `signal`
z `AbortController` albo `once: true`.

### Do czego służy opcja `passive: true`? {mid}

Informuje przeglądarkę, że handler nie wywoła `preventDefault()`. Przy zdarzeniach `touchstart`, `touchmove` i `wheel` przeglądarka może wtedy
przewijać stronę od razu, bez czekania na wykonanie JS, co daje płynniejsze przewijanie. Dla tych zdarzeń na `window`/`document` przeglądarki
domyślnie traktują listenery jako pasywne.

### Jak utworzyć i wysłać własne zdarzenie? {mid}

`element.dispatchEvent(new CustomEvent('nazwa', { detail: dane, bubbles: true }))`, a odbiorca czyta `event.detail`. Domyślnie `CustomEvent` nie
bąbelkuje ani nie da się go anulować, więc trzeba jawnie ustawić `bubbles` i `cancelable`. Własne zdarzenia pozwalają komunikować się elementom
bez bezpośrednich zależności, np. w Web Components.

### Jak zoptymalizować obsługę zdarzeń `scroll` czy `resize`? {mid}

Ograniczyć częstotliwość przez throttle (najwyżej raz na X ms) lub debounce (po zakończeniu serii), synchronizować zmiany wizualne
z `requestAnimationFrame`, używać `passive: true` i nie czytać layoutu w pętli z zapisami (layout thrashing). Często lepiej użyć dedykowanych API:
`IntersectionObserver` do widoczności i lazy loadingu, `ResizeObserver` do zmian rozmiaru elementów.

### Jak zamknąć menu po kliknięciu poza nim? {mid}

Dodać listener `click` (lub `pointerdown`) na `document` i sprawdzić, czy `menu.contains(event.target)`. Jeśli nie, menu się zamyka. Listener dodaje
się tylko przy otwartym menu i usuwa przy zamknięciu. Nie należy blokować tego mechanizmu przez `stopPropagation` wewnątrz innych komponentów, bo
wtedy kliknięcia w nie nie zamkną menu.
