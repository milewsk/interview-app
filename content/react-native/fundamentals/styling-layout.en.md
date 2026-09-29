# Styling and layout {junior}

React Native has no CSS files and no cascade: styles are **JavaScript objects** passed to the `style` prop, with camelCase names (`backgroundColor`, `marginTop`) and **unitless
numbers** in density-independent pixels. Layout is **Flexbox**, calculated by the **Yoga** engine, with a few defaults that differ from the web and catch every developer coming
from CSS.

## Style objects

```tsx
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: '#fff' },
  selected: { borderWidth: 2, borderColor: 'tomato' },
});

<View style={[styles.card, isSelected && styles.selected, { marginTop: insets.top }]} />
```

- `style` accepts an object or an **array**; later entries win, and falsy values (`false`, `null`, `undefined`) are ignored. Verified:
  `StyleSheet.flatten([{ padding: 8 }, [{ margin: 2 }, null, false], { padding: 10 }])` gives `{ padding: 10, margin: 2 }`.
- `StyleSheet.create` gives type checking and, in development, **freezes** each style object so accidental mutation fails; in RN 0.87 it returns the **same object** you passed
  (verified in the source and in Jest), so it's not a performance trick by itself. Defining styles outside the component still avoids creating new objects every render.
- Helpers: `StyleSheet.absoluteFill` (`position: 'absolute'` with all edges 0), `StyleSheet.hairlineWidth` (the thinnest line on the device), `StyleSheet.flatten`.
  `StyleSheet.absoluteFillObject` was removed in RN 0.85 (verified: `undefined` in 0.87); use `absoluteFill`.
- No selectors, no pseudo-classes, no media queries: state-dependent styles come from props and state (`pressed`, `isSelected`), and responsiveness from
  `useWindowDimensions()`.

## Flexbox differences from the web

The docs list the exceptions: **`flexDirection` defaults to `column`** (not `row`), **`alignContent` to `flex-start`**, **`flexShrink` to `0`** (not `1`), and **`flex` accepts only
a single number**. Checked with Yoga (`yoga-layout` 3.2):

- In a 300-high column, children with `flex: 1` and `flex: 2` got heights **100 and 200**: `flex` divides the free space proportionally.
- A child with only a height is **stretched** across the container width (`alignItems: 'stretch'` is the default).
- Two 80-wide children in a 100-wide row **overflowed** (80 + 80) because `flexShrink` is 0; with `flexShrink: 1` both shrank to 50.
- `gap: 10` spaced three 50-wide items at 0, 60, 120; `justifyContent: 'space-between'` at 0, 125, 250.
- `width: '50%'` with `aspectRatio: 2` gave 200×100 in a 400-wide parent; `position: 'absolute'` with `right: 10, bottom: 10` placed a 30×30 box at 360,360.

Every element is `position: 'relative'` by default, and absolute children are positioned relative to their parent (`position: 'static'` exists only on the New Architecture).

## Units, density and responsiveness

- Numbers are **density-independent pixels**; `PixelRatio.get()` gives the device pixel density, and `PixelRatio.roundToNearestPixel` avoids blurry half pixels.
- Percentages work for sizes, margins and positions; there are no `em`, `rem`, `vh`.
- `useWindowDimensions()` returns `width`, `height`, `scale` and `fontScale` and **updates on rotation** or window resize (preferred over the static `Dimensions.get`).
- Text scales with the user's accessibility font size (`fontScale`); don't fix heights of text containers, and use `maxFontSizeMultiplier` only when necessary.
- Dark mode: `useColorScheme()` returns `'light'`/`'dark'`; apps usually map it to a theme object.

## Shadows and platform differences

Shadows used to be platform-specific: `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` on iOS and `elevation` on Android. The New Architecture adds the cross-platform
**`boxShadow`** (CSS-like syntax; outset shadows need Android 9+) and **`filter`** props. Fonts, default text colors and some style props still differ, so test on both platforms.

## Sources

- [Style](https://reactnative.dev/docs/style)
- [Layout with Flexbox](https://reactnative.dev/docs/flexbox)
- [StyleSheet](https://reactnative.dev/docs/stylesheet)
- [View style props (boxShadow, filter, elevation)](https://reactnative.dev/docs/view-style-props)
- [useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions)
- [Yoga layout engine](https://www.yogalayout.dev/)

## Questions

### How is styling in React Native different from CSS? {junior}

Styles are JavaScript objects passed to the `style` prop, with camelCase property names and unitless numbers (density-independent pixels). There are no stylesheets, selectors,
cascade, pseudo-classes or media queries; each component gets its styles explicitly, only text styles are inherited between nested `Text` elements, and conditional styles come from
state and props. Layout uses Flexbox with RN-specific defaults.

### What are the Flexbox defaults in React Native and how do they differ from the web? {junior}

`flexDirection` is `column` (web: `row`), `alignContent` is `flex-start` (web: `stretch`), `flexShrink` is `0` (web: `1`), and `flex` takes a single number rather than the
`grow shrink basis` shorthand. `alignItems` defaults to `stretch` as on the web, so children fill the cross axis. Because of `flexShrink: 0`, content that doesn't fit overflows
instead of shrinking unless you set `flexShrink: 1`.

### What does `flex: 1` do? {junior}

It makes the element take a share of the free space along the parent's main axis proportional to its `flex` value: siblings with `flex: 1` and `flex: 2` split the space 1:2 (in a
300-high column, 100 and 200). `flex: 1` on a screen's root view makes it fill the screen. A parent without a size or flex gives flex children nothing to fill, which is the most common
reason a view "disappears".

### How do you apply conditional or combined styles? {junior}

Pass an array to `style`: `style={[styles.base, isActive && styles.active, { width }]}`. Entries are merged left to right, later ones win, and falsy values are ignored, so conditions can
be written inline. `StyleSheet.flatten` merges an array into one object when you need to read the result (e.g. to extract a color).

### Is `StyleSheet.create` required? What does it give you? {mid}

It's not required; plain objects work too. It gives type checking, freezes the style objects in development (so mutating them fails), and keeps styles defined once outside the component, so new objects aren't
created on every render. In current versions it returns the object you pass unchanged, so any performance benefit comes from defining styles statically rather than from the call
itself.

### How do you build responsive layouts in React Native? {mid}

Rely on Flexbox and percentages rather than fixed sizes, read the window size with `useWindowDimensions()` (which re-renders on rotation, split screen or window resize) and switch
layouts on breakpoints, use `aspectRatio` for media, and respect the user's font scale. `Dimensions.get('window')` gives only a snapshot and doesn't update components on its own.

### How do shadows work across platforms? {mid}

Traditionally iOS uses `shadowColor`, `shadowOffset`, `shadowOpacity` and `shadowRadius`, while Android uses `elevation`, which also affects z-order, so a component needed both sets of
props. On the New Architecture you can use `boxShadow` with CSS-like values on both platforms (outset shadows require Android 9+, inset Android 10+). On iOS, shadows on views without a
background color can hurt performance.

### How does positioning work? {mid}

Elements are `position: 'relative'` by default and laid out by Flexbox; `top`/`left`/`right`/`bottom` offset them from that position. `position: 'absolute'` takes an element out of the
flow and positions it relative to its parent, e.g. a badge with `right: 10, bottom: 10`. `StyleSheet.absoluteFill` covers the parent completely. `zIndex` controls stacking among
siblings (and `elevation` on Android also affects it).

### How do you support dark mode and theming? {mid}

Read the system setting with `useColorScheme()` (or the `Appearance` API) and select a theme object with colors, then pass it through context (navigation libraries and UI kits provide
theme providers). Keep colors out of individual styles and reference theme tokens, so switching themes changes one object. `PlatformColor` and `DynamicColorIOS` let you use native
system colors that adapt automatically.

### What is Yoga? {senior}

Yoga is the cross-platform layout engine, written in C++, that React Native uses to implement Flexbox: it computes the position and size of every view from their styles, and the
results are applied to native views. It's also available as the `yoga-layout` package, which returns the same results (e.g. `flex: 1` and `flex: 2` in a 300-high column give 100 and
200). With the New Architecture, layout is computed in C++ and can run synchronously when needed.
