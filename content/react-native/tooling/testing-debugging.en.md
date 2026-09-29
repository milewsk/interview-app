# Testing and debugging {mid}

Testing a React Native app follows the same pyramid as the web: **static analysis** (TypeScript, ESLint), **unit and component tests** in Jest with **React Native Testing Library**,
and a few **end-to-end tests** on real devices or simulators. The RN-specific parts are the Jest preset, **mocking native modules**, and E2E tools that understand mobile apps. For
debugging, **React Native DevTools** replaced the older remote debugging and Flipper setups.

## Jest setup

```js
// jest.config.js
module.exports = {
  preset: '@react-native/jest-preset',            // since RN 0.85; before it was preset: 'react-native'
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  ],
  setupFiles: ['./jest.setup.js'],                // native module mocks
};
```

Everything in this group was checked in such a setup (RN 0.87, Jest 29, RNTL 14):

- The preset mocks native components and some modules; the default platform is **iOS**. A second config with `haste.defaultPlatform: 'android'` ran the same tests against
  `.android.js` files and Android behavior (e.g. `BackHandler`).
- Libraries shipping untranspiled code must be added to **`transformIgnorePatterns`**: React Navigation needed it.
- **Native modules must be mocked**: `react-native-safe-area-context` ships a Jest mock, AsyncStorage exports one at `@react-native-async-storage/async-storage/jest`, and MMKV failed with
  "The native NitroModules Turbo/Native-Module could not be found" until `react-native-nitro-modules` was mocked (MMKV then switched to its in-memory implementation).
- Jest **fake timers** drive `Animated` animations and timeouts deterministically.

## React Native Testing Library

```tsx
test('user can add an item', async () => {
  await render(<ShoppingList />);                           // RNTL 14: render returns a Promise
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('Item'), 'Milk');
  await user.press(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByText('Milk')).toBeTruthy();
});
```

- Query like a user: `getByRole` (with `name`), `getByText`, `getByLabelText`, `getByPlaceholderText`; `testID` is a last resort. The RN docs advise asserting on rendered text and
  accessibility, not props or state.
- **`userEvent`** simulates realistic interactions: a `press` produced `pressIn, pressOut, press`, and `longPress` produced `pressIn, longPress, pressOut`. `fireEvent` calls a single
  handler (`fireEvent.changeText`, `fireEvent.press`), which is faster but less realistic.
- In **RNTL 14**, `render` and `renderHook` return **Promises** (checked in the type definitions), so tests `await` them.
- Wrap tests needing navigation or data in the real providers (`NavigationContainer`, `QueryClientProvider`) rather than mocking hooks. Snapshot tests are discouraged except for
  small, stable components: the docs note a snapshot is considered correct when created, even if the output is wrong.

## End-to-end tests

- **Detox** (Wix): a **gray-box** framework that monitors the app (network, animations, timers, JS thread) and proceeds only when the app is idle, which reduces flakiness; tests are
  written in JS with Jest.
- **Maestro**: black-box UI automation with **YAML flows**, quick to write, works with any app, including React Native and web.
- Appium for broader device farms. Cover critical flows (sign-in, checkout, payments) with E2E and keep the rest in faster Jest tests.

## Debugging

- **React Native DevTools** (press `j` in the Metro terminal, or "Open DevTools" in the Dev Menu): **Console**, **Sources** with breakpoints, **Memory** heap snapshots, **Network** and
  **Performance** panels (since 0.83), and React **Components** and **Profiler**.
- **Dev Menu** (shake, `Cmd+M`/`Ctrl+M` on the Android emulator, `Ctrl+Cmd+Z` on the iOS simulator), **LogBox** for errors and warnings (a syntax error shows a non-dismissable screen
  until fixed), **Perf Monitor** overlay. These are **disabled in release builds**.
- Native issues: `adb logcat` and Android Studio, Xcode console and debugger. In production: crash and error reporting (Sentry, Crashlytics) with uploaded **source maps** so Hermes stack
  traces point to your source.

## Sources

- [Testing overview](https://reactnative.dev/docs/testing-overview)
- [React Native Testing Library](https://oss.callstack.com/react-native-testing-library/)
- [Debugging basics](https://reactnative.dev/docs/debugging)
- [React Native DevTools](https://reactnative.dev/docs/react-native-devtools)
- [How Detox works](https://wix.github.io/Detox/docs/articles/how-detox-works)
- [Maestro](https://docs.maestro.dev/)

## Questions

### How do you set up Jest for a React Native project? {junior}

Use the React Native Jest preset (`@react-native/jest-preset` since RN 0.85, previously `preset: 'react-native'`), which configures Babel, the RN environment and mocks for native
components. Add libraries that ship untranspiled code to `transformIgnorePatterns`, and add setup files with mocks for native modules. Expo projects use the `jest-expo` preset. Then
write tests with React Native Testing Library.

### Why do native modules need to be mocked in Jest? {mid}

Jest runs in Node, where there's no iOS or Android runtime, so native modules don't exist; a library that looks up its native module at import time throws. In a test, MMKV failed with
"The native NitroModules ... could not be found" until the Nitro module was mocked. Many libraries ship ready-made Jest mocks (safe-area-context, AsyncStorage, Reanimated), and for others
you write `jest.mock` factories. Native behavior itself must be covered by E2E tests.

### How do you query elements in React Native Testing Library? {junior}

The way a user perceives them: by role and accessible name (`getByRole('button', { name: 'Save' })`), visible text (`getByText`), label (`getByLabelText`), placeholder or display
value. `getBy*` throws if the element is missing, `queryBy*` returns `null` (for asserting absence), and `findBy*` waits for async appearance. `testID` is a fallback when nothing
user-visible identifies the element.

### What is the difference between `fireEvent` and `userEvent`? {mid}

`fireEvent` calls one event handler directly, e.g. `onPress` or `onChangeText`. `userEvent` simulates the full interaction: a press triggers `pressIn`, `pressOut` and `press` (in a test a
long press gave `pressIn, longPress, pressOut` without `press`), and typing enters characters one by one with focus and change events. `userEvent` catches more bugs; `fireEvent` is
simpler and fine for custom events.

### How do you test a component that uses React Navigation? {mid}

Render it inside a real `NavigationContainer` with a small navigator containing the screens involved, interact like a user, and assert on what's rendered: in a test, pressing
a button showed "Details 42" and `useFocusEffect` logged blur and focus when navigating away and back. A navigation ref (`createNavigationContainerRef`) lets tests inspect the
state. Mocking `useNavigation` to check that `navigate` was called is quicker but tests implementation details rather than behavior.

### How do you test how a screen behaves offline? {mid}

Control connectivity in the test instead of relying on the device: with TanStack Query, call `onlineManager.setOnline(false)` before rendering, assert the offline UI, then
`setOnline(true)` and wait for data with `findBy*`. In a test, a query stayed `pending/paused` with no fetch calls while offline and ran after reconnecting, and a mutation
started offline was paused and sent after reconnecting. Use a fresh `QueryClient` per test with retries disabled, and check real devices in airplane mode for the native side.

### What E2E testing tools are used for React Native? {mid}

Detox, a gray-box framework that synchronizes with the app (network, animations, timers, the JS thread) and runs the next step only when the app is idle, with tests written in JS and Jest;
Maestro, a black-box tool using YAML flows that's quick to adopt; and Appium for broad device coverage. E2E tests are slow and can be flaky, so they cover critical user journeys only.

### How do you debug a React Native app? {junior}

Open React Native DevTools by pressing `j` in the Metro terminal or from the Dev Menu, then use the Console, breakpoints in Sources, the React Components tree and Profiler, and the Memory,
Network and Performance panels. LogBox shows errors and warnings in the app, and Fast Refresh keeps state while you edit. For native crashes, use `adb logcat` or Xcode's console.

### What changed in React Native debugging tools in recent years? {mid}

React Native DevTools became the standard debugger, built on Chrome DevTools and connected directly to Hermes, with React DevTools integrated, and newer versions added Network and
Performance panels (0.83). The older approaches, remote JS debugging in Chrome (which ran JS in the browser instead of on the device) and Flipper, are no longer the recommended path.

### How do you investigate crashes in production? {senior}

Integrate crash reporting (Sentry, Firebase Crashlytics, Bugsnag) for both JS errors and native crashes, upload source maps for each release (and OTA update) so Hermes bytecode stack traces
map back to source files and lines, attach breadcrumbs and the app, OS and device versions, and track crash-free sessions per release. Reproduce with the same build type and device, and
add a regression test once fixed.
