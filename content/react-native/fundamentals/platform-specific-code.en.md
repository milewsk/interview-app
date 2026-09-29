# Platform-specific code {mid}

React Native shares most code between iOS and Android, but the platforms differ in UI conventions (back button, navigation patterns, date pickers), native capabilities, permissions
and small rendering details. RN gives you two tools for the differences: the **`Platform` module** for small branches inside a file, and **platform-specific file extensions** for
whole implementations. Choosing well keeps shared code clean and avoids `if (ios)` scattered everywhere.

## The `Platform` module

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'android' ? 8 : 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},                                      // web and other platforms
    }),
  },
});

if (Platform.OS === 'android' && Platform.Version >= 33) {
  // Android 13+: request POST_NOTIFICATIONS at runtime
}
```

- `Platform.OS`: `'ios'`, `'android'`, and on other targets `'web'`, `'windows'`, `'macos'`.
- `Platform.select` picks a value by key with precedence **`ios`/`android` → `native` → `default`**. Verified in Jest: with the iOS preset it returned the `ios` value, and with
  the Android platform the `android` value; `{ native, default }` returned `native` on both.
- `Platform.Version` is the **API level number** on Android (e.g. 33) but a **string** like `"18.2"` on iOS, so compare iOS versions with `parseInt(Platform.Version, 10)`.
- Extras: `Platform.isPad`, `Platform.isTV`, `Platform.constants`.

## Platform-specific files

```
DatePicker.ios.tsx       // used by Metro when bundling for iOS
DatePicker.android.tsx   // used when bundling for Android
Storage.native.ts        // iOS and Android (Metro)
Storage.ts               // web bundlers and Node pick this one
```

You import `./DatePicker` without an extension, and the bundler resolves the right file. Verified with the Jest preset: the same `import Btn from './Button'` resolved to
`Button.ios.js` with the default iOS platform and to `Button.android.js` with `defaultPlatform: 'android'`; `Only.native.js` won over `Only.js` on both.

Rules of thumb from the docs: use `Platform` for small, isolated differences, and file extensions when implementations differ substantially. Keep the **same exported API** in
both files (and a shared `.d.ts` or type), otherwise type checking and imports drift apart.

## Beyond iOS and Android

- **React Native Web** (used by Expo for web) renders RN components to the DOM; `.web.tsx` files and `Platform.OS === 'web'` handle differences.
- Out-of-tree platforms: Windows and macOS (Microsoft), TV (`react-native-tvos`), visionOS.
- Expo modules and many libraries expose one JS API with separate native implementations, so most apps need few platform branches themselves.

## Common differences to remember

Hardware back button on Android (`BackHandler`, handled by navigation libraries), permission models and runtime prompts, push notification setup (APNs vs FCM), keyboard behavior,
status bar and edge-to-edge insets, fonts and text rendering, shadows (`shadow*` vs `elevation`), date/time pickers, haptics, and store policies.

## Sources

- [Platform-specific code](https://reactnative.dev/docs/platform-specific-code)
- [Platform API](https://reactnative.dev/docs/platform)
- [BackHandler](https://reactnative.dev/docs/backhandler)
- [React Native for Web](https://necolas.github.io/react-native-web/)

## Questions

### How do you write platform-specific code in React Native? {junior}

For small differences, use the `Platform` module: check `Platform.OS` (`'ios'`, `'android'`, `'web'`...) or pick values with `Platform.select({ ios, android, native, default })`. For
larger differences, create separate files such as `Component.ios.tsx` and `Component.android.tsx` and import `./Component`; the bundler picks the file for the target platform.

### What is the precedence of keys in `Platform.select`? {mid}

The specific platform key (`ios` or `android`) wins, then `native` (any native platform), then `default` (used for web and other platforms). So `{ native: A, default: B }` returns
`A` on iOS and Android and `B` on web. If no key matches and there's no `default`, it returns `undefined`.

### What is the difference between `Platform.Version` on iOS and Android? {mid}

On Android it's a number, the API level (e.g. 33 for Android 13), which is what feature checks and permission changes are defined by. On iOS it's a string with the system version (e.g.
`"18.2"`), so you parse it (`parseInt(Platform.Version, 10)`) before comparing. Mixing the two leads to comparisons that silently fail.

### How do platform-specific file extensions work? {junior}

Metro resolves imports by trying platform extensions first: when bundling for iOS, `import './Button'` loads `Button.ios.tsx` if it exists, then `Button.native.tsx`, then
`Button.tsx`. `.native` files are shared by iOS and Android, while web bundlers ignore them and use the plain file. Both variants should export the same API so the rest of the code
doesn't care which one is loaded.

### When would you use separate files instead of `Platform.OS` checks? {mid}

When the implementations differ substantially, for example different native components, different libraries or completely different layouts. Separate files keep each version readable
and allow platform-only imports without loading code for the other platform. For a padding value or one prop, a `Platform.select` inline is simpler.

### How do you adapt the layout for tablets or TV? {mid}

`Platform.isPad` (iOS) and `Platform.isTV` identify some device types, but layout decisions are better based on the available space: read `useWindowDimensions()` and switch
layouts at width breakpoints (e.g. a master-detail view above 768 dp), because Android tablets, foldables, split screen and resizable windows all change the width without
changing the device type. TV apps also need focus-based navigation instead of touch.

### What is React Native Web? {mid}

A library that implements React Native's components and APIs on top of the DOM, so the same components render on the web. Expo uses it for its web target. Platform differences are
handled with `Platform.OS === 'web'` and `.web.tsx` files. It enables sharing much of the code between mobile and web, though web-specific concerns (SEO, routing, accessibility
semantics, responsive layouts) still need attention.

### How do you keep types consistent across platform-specific files? {senior}

TypeScript resolves `./Button` to `Button.tsx` or a `.d.ts`, not to `.ios`/`.android` files, so imports of platform-only files can fail type checking. Common solutions: a shared
`Button.types.ts` that both implementations import and satisfy, a `Button.d.ts` declaring the public API, or configuring `moduleSuffixes` (`[".ios", ".android", ".native", ""]`) in
`tsconfig`. Tests should cover each platform variant.

### What platform differences commonly affect cross-platform apps? {mid}

The Android hardware back button, different permission models and prompts, push notification services (APNs vs FCM), keyboard and edge-to-edge insets, shadows (`shadow*` props vs
`elevation`), fonts and text metrics, native pickers, and store review rules. Designing screens with both platforms' conventions in mind and testing on real devices for both is
more reliable than patching differences late.

### How do you test platform-specific behavior? {senior}

Unit tests can switch platforms: the React Native Jest preset defaults to iOS, and a second Jest project with `haste.defaultPlatform: 'android'` runs the same tests against Android
files and `Platform.OS`. In a test in this environment, the same import resolved to `Button.ios.js` in one configuration and `Button.android.js` in the other. Native differences
(permissions, gestures, rendering) still need E2E tests or manual checks on both platforms.
