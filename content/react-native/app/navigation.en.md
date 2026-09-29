# Navigation {mid}

React Native has no built-in router or browser history: navigation comes from libraries. The two mainstream options are **React Navigation** (navigators defined in code) and
**Expo Router** (file-based routing, the default in new Expo projects). They share the same concepts, so interview questions focus on **stacks, tabs, params, the navigation
lifecycle and deep linking**.

## Navigators

```tsx
const Stack = createNativeStackNavigator<RootStackParamList>();

<NavigationContainer linking={linking}>
  <Stack.Navigator>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="Details" component={DetailsScreen} options={{ title: 'Order' }} />
  </Stack.Navigator>
</NavigationContainer>

navigation.navigate('Details', { id: 42 });      // go to the screen, passing params
navigation.push('Details', { id: 43 });          // always add a new entry
navigation.goBack();  navigation.popTo('Home');  navigation.popToTop();
```

- **Native stack** uses the platform's native navigation (UINavigationController / Android fragments via `react-native-screens`): native transitions and gestures. The JS-based
  stack is more customizable.
- **Bottom tabs**, **drawer** and **material top tabs** navigators can be **nested** (tabs inside a stack, a stack in each tab).
- Screens receive `navigation` and `route` (`route.params`), or use `useNavigation()` and `useRoute()` in child components.

Verified with React Navigation 7 in Jest:

- `navigate('Details', { id: 42 })` showed "Details 42";
- `push('Details', { id: 43 })` added an entry: `Home > Details42 > Details43`;
- `navigate('Details', { id: 44 })` from a `Details` screen **didn't add** an entry, it updated the current one: `Home > Details42 > Details44` (use `push` for a new copy);
- `navigate('Home')` from `Home > A > B` **added** a new entry (`Home > A > B > Home`): since v7 `navigate` doesn't go back to earlier screens; `popTo('A')`
  and `navigate('A', undefined, { pop: true })` both went back to `Home > A`;
- two `goBack()` calls returned to `Home`;
- a counter in a tab **kept its state** after switching to another tab and back: tab screens stay mounted.

## Screen lifecycle

Screens in a stack **stay mounted** when you navigate forward, so `useEffect` doesn't run again when you come back. Verified: navigating from Home to Details logged `Home blur`, and
going back logged `Home focus`. Use **`useFocusEffect`** (or the `focus`/`blur` events, `useIsFocused`) to refresh data, start and stop subscriptions, or handle the back button only
while a screen is visible.

## Params and types

Params should be **small and serializable** (an ID, not a whole object with functions), because they're part of navigation state, used for deep links and state persistence. Define
a param list type (`type RootStackParamList = { Details: { id: string } }`) for type-checked `navigate` calls; React Navigation 7 also has a **static API** that infers types from the
configuration.

## Deep linking

A linking configuration maps URL paths to screens:

```ts
const linking = {
  prefixes: ['myapp://', 'https://example.com'],
  config: { screens: { Home: '', Details: 'item/:id', Profile: 'user/:name' } },
};
```

Verified with `getStateFromPath`: `item/42?ref=mail` became the `Details` route with params `{ id: "42", ref: "mail" }` (**strings**; use `parse` to convert, e.g. a `parse`
function turned `ann` into `ANN`), an unknown path returned `undefined`, and `getPathFromState` turned `Details` with `id: 7` into `/item/7`. The OS side needs a custom URL scheme
and, for `https` links, **universal links** (iOS, `apple-app-site-association`) and **App Links** (Android, `assetlinks.json`).

## Expo Router

Files in the `app/` directory become routes: `app/index.tsx` is `/`, `app/item/[id].tsx` is `/item/:id`, `_layout.tsx` defines the navigator (Stack, Tabs) for a folder, and
groups like `(tabs)` organize files without affecting the URL. Every screen is **automatically deep linkable**, routes can be **statically typed**, and the same structure works on
the web. Navigation uses `<Link href="/item/42">` or `router.push()`, and params come from `useLocalSearchParams()`. Expo Router used the React Navigation packages as dependencies;
current versions (checked: 57) ship their own copy of React Navigation's code, exposed at `expo-router/react-navigation`.

## Sources

- [React Navigation: getting started](https://reactnavigation.org/docs/getting-started)
- [Moving between screens](https://reactnavigation.org/docs/navigating)
- [Navigation lifecycle](https://reactnavigation.org/docs/navigation-lifecycle)
- [Deep linking](https://reactnavigation.org/docs/deep-linking)
- [Configuring links](https://reactnavigation.org/docs/configuring-links)
- [Expo Router introduction](https://docs.expo.dev/router/introduction/)

## Questions

### What are the main navigation options in React Native? {junior}

React Native has no built-in navigation. React Navigation defines navigators (stack, tabs, drawer) and screens in code and is the most widely used library. Expo Router builds
file-based routing on the same concepts: files in `app/` become routes, with automatic deep links and web support; it's the default in new Expo projects. Native-first alternatives
exist, but these two cover most apps.

### What is the difference between a native stack and a JS stack? {mid}

The native stack uses the platform's navigation primitives through `react-native-screens`, so transitions, gestures and headers are native, perform well and look platform-standard.
The JS stack implements transitions in JavaScript with gesture and animation libraries, which allows more customization of animations and headers but costs performance. Native stack
is the usual default.

### What's the difference between `navigate` and `push`? {mid}

`navigate` means "go to this screen": if you're already on it, it doesn't add a new entry (in a test, navigating from `Details` to `Details` with new params updated the current screen),
but since v7, if the screen is earlier in the stack, it adds a new entry instead of going back (in a test, `Home > A > B` became `Home > A > B > Home`); use `popTo` or
`navigate(name, params, { pop: true })` to go back. `push` always adds a new entry, which is what you need for drill-downs like product → related product. `goBack`,
`popTo` and `popToTop` go back.

### Why doesn't `useEffect` run when I return to a screen? {mid}

Screens in a stack stay mounted when you navigate forward, and tabs stay mounted when you switch away, so returning to them doesn't mount them again. Use `useFocusEffect` to run code
every time a screen gains focus (and clean up on blur), or `useIsFocused` to re-render on focus changes. In a test, navigating away and back logged `Home blur` and then `Home focus`.

### How should you pass data between screens? {mid}

Pass small, serializable params such as IDs (`navigate('Details', { id })`) and load the full data on the target screen, usually from a cache like TanStack Query or a store. Passing
full objects duplicates data that can go stale, breaks deep links and state persistence, and passing functions triggers warnings because state must be serializable. For results going
back, navigate back with params or use shared state.

### How do you type navigation in TypeScript? {mid}

Define a param list per navigator (`type RootStackParamList = { Home: undefined; Details: { id: string } }`), pass it to `createNativeStackNavigator<RootStackParamList>()`, and type
screen props with helpers such as `NativeStackScreenProps<RootStackParamList, 'Details'>`. Then `navigate` calls and `route.params` are checked. React Navigation 7's static API and Expo
Router's typed routes can infer these types automatically.

### How does deep linking work? {mid}

The OS opens the app with a URL (a custom scheme like `myapp://item/42`, or an `https` universal link / App Link), and the navigation library maps the path to a navigation state using a
linking configuration of paths and params. Params from URLs arrive as strings (in a test, `item/42` produced `id: "42"`), so parse and validate them. Unknown paths should lead to a
fallback screen, and screens behind authentication need a redirect after login.

### What are universal links and App Links? {senior}

They let normal `https` URLs open your app instead of the browser when it's installed. The domain proves ownership by hosting a file: `apple-app-site-association` for iOS universal links
and `assetlinks.json` for Android App Links, and the app declares the associated domains. Unlike custom schemes, they can't be claimed by other apps, and they fall back to the website
when the app isn't installed.

### How do you handle authentication flows in navigation? {mid}

Render different screen sets depending on auth state: when the user isn't signed in, the navigator contains only sign-in screens, and after sign-in it contains the app screens, so
there's no way to navigate back to the login screen and protected screens don't exist for signed-out users. React Navigation documents this conditional pattern, and Expo Router provides
protected routes and redirects in layouts. Show a splash screen while the token is being restored.

### How does Expo Router map files to routes? {junior}

Files in `app/` become routes by their path: `index.tsx` is `/`, `settings.tsx` is `/settings`, `[id].tsx` is a dynamic segment read with `useLocalSearchParams()`, `_layout.tsx`
defines the navigator that wraps a folder (stack, tabs), and folder names in parentheses, like `(tabs)`, group routes without changing the URL. Every route is automatically deep
linkable and works on the web.
