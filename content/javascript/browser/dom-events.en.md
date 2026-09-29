# DOM events {mid}

## Propagation: three phases

An event dispatched on an element travels through the DOM tree in three phases:

1. **Capture**: from `window` down to the target's parent,
2. **Target**: listeners on the element itself,
3. **Bubble**: from the target up to `window`.

```js
outer.addEventListener('click', handler, { capture: true })   // capture phase
outer.addEventListener('click', handler)                        // default: bubble phase
```

For a click on a button inside a list, the order is: the `capture` listener on an ancestor, the listener on the button, the listener on the
list, the `bubble` listener on the ancestor. Not all events bubble: `focus`/`blur` don't (their bubbling counterparts are `focusin`/`focusout`),
nor do `mouseenter`/`mouseleave` and `load`.

## `target` vs `currentTarget`

- `event.target`: the element where the event **originated** (e.g. a `<span>` inside a button).
- `event.currentTarget`: the element the currently running listener is **attached** to.

## Stopping

- `stopPropagation()`: the event won't reach further elements, but **other listeners on the same element** still run.
- `stopImmediatePropagation()`: also stops the remaining listeners on the current element.
- `preventDefault()`: blocks the browser's **default action** (following a link, submitting a form, toggling a checkbox), but not propagation.
  It only works for `cancelable` events.

Overusing `stopPropagation` breaks other mechanisms that rely on bubbling (analytics, closing a menu on an outside click, delegation in frameworks).

## Event delegation

Instead of a listener on every list item, one listener on the container that identifies the target:

```js
list.addEventListener('click', (event) => {
  const button = event.target.closest('button.delete')
  if (!button || !list.contains(button)) return
  removeItem(button.dataset.id)
})
```

Pros: fewer listeners (memory), automatic handling of elements added later, simpler cleanup. `closest()` handles clicks on elements nested inside
the button. React uses delegation internally.

## `addEventListener` options

- `once: true`: the listener removes itself after the first call.
- `passive: true`: a declaration that the handler won't call `preventDefault()`. For `touchstart`/`wheel` it lets the browser scroll without waiting
  for JS (smoother scrolling).
- `signal`: an `AbortSignal` whose `abort()` removes the listener. Convenient for cleaning up many listeners at once.
- `removeEventListener` requires **the same function reference** (and the same `capture` value), so an anonymous arrow can't be removed.

## Custom events

```js
element.dispatchEvent(new CustomEvent('cart:updated', { detail: { count: 3 }, bubbles: true }))
```

A `CustomEvent` **doesn't bubble** by default (`bubbles: false`). Custom events let components stay loosely coupled (e.g. Web Components).

## Performance

Events fired very often (`scroll`, `resize`, `mousemove`, `input`) are limited with **throttle** or **debounce**, and visual changes are synchronized
with `requestAnimationFrame`. For observing changes, dedicated APIs are often better: `IntersectionObserver` (visibility), `ResizeObserver` (size),
`MutationObserver` (DOM changes).

## Sources

- [Introduction to events (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events)
- [Event bubbling (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [addEventListener (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [CustomEvent (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)

## Questions

### What are the phases of DOM event propagation? {junior}

Capture (from `window` down to the target's parent), the target phase (listeners on the element itself) and bubbling (from the target up to
`window`). By default `addEventListener` registers a handler in the bubble phase, and `{ capture: true }` in the capture phase. Not every event
bubbles (e.g. `focus`, `mouseenter`).

### How does `event.target` differ from `event.currentTarget`? {junior}

`target` is the element where the event actually originated, e.g. an icon inside a button. `currentTarget` is the element the currently running
listener is attached to. With delegation, `currentTarget` is the container and `target` the clicked descendant, which is why you find the right
element with `target.closest(selector)`.

### What is event delegation, and what are its advantages? {mid}

Handling events for many elements with one listener on a common ancestor, identifying the target with `event.target.closest(...)`. Advantages: fewer
listeners and less memory, automatic support for elements added later (e.g. new list rows) and simpler cleanup. The limitation: it only works for
events that bubble.

### How does `stopPropagation` differ from `preventDefault`? {junior}

`stopPropagation()` stops the event from reaching further elements in the tree, but doesn't block the default action. `preventDefault()` blocks the
browser's default action (e.g. following a link, submitting a form), but the event keeps propagating. They're independent, and sometimes you need both.

### How does `stopPropagation` differ from `stopImmediatePropagation`? {mid}

`stopPropagation` stops the event from going to other elements, but the remaining listeners on the **current** element still run.
`stopImmediatePropagation` also stops the next listeners on the same element. It's useful when several independent scripts attach to the same element
and one must take over handling.

### Why does `removeEventListener` sometimes not work? {mid}

It requires exactly the same function reference and the same `capture` value as when adding. An anonymous arrow function or a function created with
`bind` when adding is a different reference from the one passed when removing. Fixes: store the handler in a variable, use the `signal` option with an
`AbortController`, or `once: true`.

### What is the `passive: true` option for? {mid}

It tells the browser the handler won't call `preventDefault()`. For `touchstart`, `touchmove` and `wheel` events, the browser can then scroll the page
immediately without waiting for JS to run, which gives smoother scrolling. For these events on `window`/`document`, browsers treat listeners as passive
by default.

### How do you create and dispatch a custom event? {mid}

`element.dispatchEvent(new CustomEvent('name', { detail: data, bubbles: true }))`, and the receiver reads `event.detail`. By default a `CustomEvent`
neither bubbles nor is cancelable, so you set `bubbles` and `cancelable` explicitly. Custom events let elements communicate without direct dependencies,
e.g. in Web Components.

### How do you optimize handling of `scroll` or `resize` events? {mid}

Limit the frequency with throttle (at most once per X ms) or debounce (after a burst ends), synchronize visual changes with `requestAnimationFrame`, use
`passive: true`, and don't read layout in a loop with writes (layout thrashing). Dedicated APIs are often better: `IntersectionObserver` for visibility
and lazy loading, `ResizeObserver` for element size changes.

### How do you close a menu when clicking outside it? {mid}

Add a `click` (or `pointerdown`) listener on `document` and check whether `menu.contains(event.target)`. If not, close the menu. Add the listener only
while the menu is open and remove it on close. Don't break this mechanism with `stopPropagation` inside other components, or clicks on them won't close
the menu.
