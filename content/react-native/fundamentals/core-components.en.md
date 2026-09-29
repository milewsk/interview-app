# Core components {junior}

React Native renders **real native views**, not HTML: a `View` becomes a `UIView` on iOS and an `android.view.View` (a `ViewGroup`) on Android. You write React components, and the
renderer maps a small set of **core components** to native widgets. There's no DOM, no CSS files, and no `div`/`span`, so knowing what each core component does (and doesn't do) is
the base of every RN interview.

## The essentials

| Component | Purpose | Web analogy |
|---|---|---|
| `View` | container with layout, style, touch handling, accessibility | `div` |
| `Text` | **the only place for text**; supports nesting and style inheritance | `span`/`p` |
| `Image` | local (`require`) and remote (`{ uri }`) images | `img` |
| `TextInput` | keyboard input; controlled via `value` + `onChangeText` | `input` |
| `ScrollView` | scrollable container that renders **all** children | `div` with overflow |
| `FlatList`/`SectionList` | virtualized lists (see the lists topic) | none |
| `Pressable` | press interactions: `onPressIn`, `onPressOut`, `onPress`, `onLongPress` | `button` |
| `Switch`, `ActivityIndicator`, `Modal`, `KeyboardAvoidingView`, `RefreshControl` | platform widgets and helpers | none |

## Rules that surprise web developers

- **Strings must be inside `Text`.** Verified in Jest: `<View>hello</View>` throws "Text strings must be rendered within a `<Text>` component". This also catches the classic bug
  `{count && <Badge />}` when `count` is `0`: the `0` is rendered as a string outside `Text` and crashes.
- **Only `Text` inherits text styles**, and only from a parent `Text`: `<Text style={{ color: 'red' }}>Hello <Text style={{ fontWeight: 'bold' }}>world</Text></Text>` is one
  text node ("Hello world"), with "world" red and bold. A `View` doesn't pass `color` or `fontSize` to its children.
- **Network images need explicit dimensions** (the docs say you must specify them manually); static images from `require('./img.png')` get their size from the file, and
  `@2x`/`@3x` variants are picked by pixel density. `resizeMode` defaults to `cover`.
- **`TextInput` is controlled like on the web**: `value` + `onChangeText` (which gives the string, not an event). Verified: typing "ANN@X.PL" with an `onChangeText` that lowercases
  shows `ann@x.pl`.
- **`Button`** is a native-looking button with very limited styling; for custom designs use `Pressable` with your own content.

## Pressable

```tsx
<Pressable
  onPress={save}
  onLongPress={showMenu}                       // after 500 ms by default (delayLongPress)
  hitSlop={10}                                 // bigger touch area than the visual element
  disabled={saving}
  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
  android_ripple={{ color: '#ddd' }}
  accessibilityRole="button"
>
  <Text>Save</Text>
</Pressable>
```

Verified with React Native Testing Library: a tap produced `in, out, press`, a long press `in, long, out` (no `press`), and a `disabled` Pressable fired nothing. `Pressable`
replaces the older `TouchableOpacity`/`TouchableHighlight`, which the docs describe as less future-proof.

## Safe areas and the keyboard

- Content must avoid notches, the status bar and the home indicator. The built-in `SafeAreaView` is **deprecated** (and iOS-only); use `react-native-safe-area-context`
  (`SafeAreaProvider`, `SafeAreaView`, `useSafeAreaInsets`). On Android 15+ apps draw **edge-to-edge**, so insets matter there too.
- `KeyboardAvoidingView` moves content above the software keyboard (`behavior="padding"` on iOS usually; Android often handles it with `windowSoftInputMode`), and
  `Keyboard.dismiss()` hides the keyboard.

## Sources

- [Core components and native components](https://reactnative.dev/docs/intro-react-native-components)
- [Text](https://reactnative.dev/docs/text)
- [Image](https://reactnative.dev/docs/image)
- [Pressable](https://reactnative.dev/docs/pressable)
- [SafeAreaView (deprecated)](https://reactnative.dev/docs/safeareaview)
- [react-native-safe-area-context](https://github.com/AppAndFlow/react-native-safe-area-context)

## Questions

### How does React Native render UI compared to React on the web? {junior}

React Native doesn't use a DOM or a WebView: its renderer maps React components to real platform views, so `View` becomes a `UIView` on iOS and an Android `View`, `Text` a native
text view, and so on. You still write components, props, state and hooks, but with a fixed set of core components instead of HTML elements, and styles written in JavaScript instead
of CSS.

### Why must text be wrapped in a `Text` component? {junior}

Native platforms render text only through dedicated text views, and `View` has no way to display a string. React Native enforces it: a string directly inside a `View` throws "Text
strings must be rendered within a `<Text>` component". A common source of this error is `{count && <Item />}` with `count === 0`, which renders `0` as a bare string; use
`count > 0 &&` or a ternary.

### How does style inheritance work in React Native? {mid}

There's no general CSS cascade. Only text styles are inherited, and only between nested `Text` components: a `Text` inside a `Text` inherits the parent's color, font size and so on,
and they form a single text block. A `View` doesn't pass text styles to its children, so shared typography is usually done with a custom `AppText` component or a theme.

### What is `Pressable` and why prefer it over `TouchableOpacity`? {junior}

`Pressable` is a core component that detects press interactions and exposes `onPressIn`, `onPressOut`, `onPress` and `onLongPress` (after 500 ms by default), plus `hitSlop`,
`pressRetentionOffset`, `disabled`, `android_ripple`, and a `style`/children function receiving `{ pressed }` so you can design any feedback. The older Touchable components hardcode
one kind of feedback; the docs point to `Pressable` as the more flexible, future-proof API.

### How do you create a controlled text input? {junior}

Keep the value in state and pass `value` and `onChangeText` to `TextInput`; `onChangeText` receives the new string directly (unlike the web's event object). Useful props include
`keyboardType` (`email-address`, `numeric`), `secureTextEntry` for passwords, `autoCapitalize`, `autoComplete`/`textContentType` for autofill, and `returnKeyType` with
`onSubmitEditing`.

### What's special about displaying images? {mid}

Static images are imported with `require('./img.png')`; the bundler includes them and picks `@2x`/`@3x` files by screen density, and their size is known. Remote images (`{ uri }`)
must have explicit width and height, because the size is unknown until download. `resizeMode` (`cover` by default, `contain`, `stretch`, `repeat`, `center`) controls scaling. For
caching, placeholders and performance, apps often use libraries like `expo-image`.

### What is the difference between `ScrollView` and `FlatList`? {junior}

`ScrollView` renders all its children at once, which is fine for a screen with limited content but wastes memory and time with long or unbounded lists. `FlatList` virtualizes: it
renders only the items near the visible area and recycles the rest as you scroll, and it adds features like pull-to-refresh, infinite scrolling and separators. Use `FlatList` (or
`SectionList`) for data lists.

### How do you handle notches and safe areas? {mid}

Use `react-native-safe-area-context`: wrap the app in `SafeAreaProvider` and either use its `SafeAreaView` (with `edges` to choose sides) or read insets with `useSafeAreaInsets()` and
apply padding yourself. The core `SafeAreaView` is deprecated and only worked on iOS. With Android edge-to-edge (enforced on newer Android versions) the same insets are needed on
Android too.

### How do you deal with the on-screen keyboard covering inputs? {mid}

Wrap the form in `KeyboardAvoidingView` (typically `behavior="padding"` on iOS; on Android the window's `softInputMode` often resizes the layout already), put long forms in a
`ScrollView` with `keyboardShouldPersistTaps="handled"`, and dismiss the keyboard with `Keyboard.dismiss()` or by tapping outside. Libraries like `react-native-keyboard-controller`
give finer control and smoother animations.

### When would you use `Modal`? {junior}

For content presented above the current screen, such as dialogs, pickers or full-screen overlays: `Modal` renders in a separate native layer with `visible`, `animationType`
(`slide`, `fade`), `transparent` and `onRequestClose` (called when the user presses the Android back button). In apps with a navigation library, modal screens are often implemented as navigator
routes with a modal presentation instead, so they participate in navigation and deep linking.
