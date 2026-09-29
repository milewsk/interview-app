# Networking and offline support {mid}

React Native provides the web's networking APIs (**`fetch`**, `XMLHttpRequest`, `WebSocket`), so libraries like axios and TanStack Query work. But mobile networks are slow,
flaky and often missing, apps go to the background, and there's no browser taking care of focus or connectivity events. A mid-level developer is expected to know the platform
rules for requests and how to make an app **resilient offline**.

## Platform rules

- **HTTPS by default**: iOS App Transport Security requires HTTPS (exceptions per domain in Info.plist), and Android 9+ (API 28) blocks cleartext HTTP unless you set
  `usesCleartextTraffic` or a network security config. Local development servers over `http` therefore need an exception.
- **No CORS** in native apps (it's a browser rule), but the docs list known issues: `credentials: 'omit'` and `redirect: 'manual'` don't work, and cookie-based auth is unreliable, so
  mobile apps usually use **tokens** in headers.
- On the Android emulator, the host machine's `localhost` is **`10.0.2.2`**; a physical device needs your computer's LAN address.
- Requests aren't cancelled automatically when a screen unmounts; use `AbortController` (or a library that does it).

## Server state with TanStack Query

TanStack Query handles caching, deduplication, retries and background refetching, but its browser defaults (window focus, `navigator.onLine`) must be connected to RN APIs:

```ts
// online status from NetInfo
onlineManager.setEventListener(setOnline =>
  NetInfo.addEventListener(state => setOnline(!!state.isConnected)));

// "window focus" = app returns to the foreground
AppState.addEventListener('change', status => focusManager.setFocused(status === 'active'));
```

Verified with TanStack Query 5 in Jest:

- while offline, a query stayed **`pending/paused`** with **0** calls to the fetch function, and ran as soon as `onlineManager.setOnline(true)` was called;
- `focusManager.setFocused(true)` after losing focus **refetched** the stale query (calls went from 1 to 2);
- a mutation executed offline was **paused** (nothing sent), and after reconnecting it completed and sent `order-1`.

The docs also show refetching on **screen focus** with `useFocusEffect` and pausing updates on hidden screens with `subscribed: isFocused`.

## Offline-first patterns

- **Persist the cache** (e.g. TanStack Query persisters with MMKV or AsyncStorage) so the app shows the last data on launch without a network.
- **Queue writes**: paused mutations resume on reconnect; persist them too if they must survive an app restart, and make the server side **idempotent** (client-generated IDs,
  idempotency keys) because retries can duplicate requests.
- **Optimistic updates** make the UI respond instantly and roll back on failure.
- For heavy offline use (large data sets, sync, conflict resolution), use a local database with sync: SQLite (`expo-sqlite`, op-sqlite), WatermelonDB, or sync engines.
- Show connectivity state to the user and avoid blocking the UI on requests.

## Sources

- [Networking](https://reactnative.dev/docs/network)
- [TanStack Query: React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [NetInfo](https://github.com/react-native-netinfo/react-native-netinfo)
- [Network security configuration (Android)](https://developer.android.com/privacy-and-security/security-config)
- [Preventing insecure network connections (Apple)](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)

## Questions

### Which networking APIs are available in React Native? {junior}

`fetch`, `XMLHttpRequest` and `WebSocket` are built in, following the web APIs, so libraries built on them (axios, TanStack Query, GraphQL clients) work. Responses are handled with
promises or `async/await`. There's no CORS, since it's a browser security rule, but platform rules like HTTPS requirements apply instead.

### Why does an `http://` request fail on a device but work in the browser? {mid}

Both platforms block cleartext traffic by default: iOS App Transport Security requires HTTPS unless an exception is declared in Info.plist, and Android 9+ blocks cleartext HTTP unless
`usesCleartextTraffic` or a network security config allows it. Use HTTPS, or add narrow exceptions for development domains only. On the Android emulator, also remember that the
host's `localhost` is `10.0.2.2`.

### How do you detect network connectivity? {junior}

With `@react-native-community/netinfo`: `NetInfo.fetch()` for the current state and `NetInfo.addEventListener` for changes, with `isConnected` and `isInternetReachable` and the
connection type. Connectivity doesn't guarantee that your API is reachable, so requests still need timeouts, error handling and retries.

### How do you configure TanStack Query for React Native? {mid}

Connect its managers to native APIs: `onlineManager.setEventListener` with a NetInfo listener, so queries pause offline and refetch on reconnect, and `focusManager.setFocused` from an
`AppState` listener, so stale data is refetched when the app returns to the foreground. Optionally refetch on screen focus with `useFocusEffect`. In a test, an offline query stayed
paused with no fetch calls and ran after going online.

### What happens to mutations when the device is offline? {mid}

With TanStack Query's default network mode, a mutation started offline is paused and sent when connectivity returns (in a test, nothing was sent until `setOnline(true)`, then the
mutation succeeded). Paused mutations live in memory, so to survive an app restart they must be persisted and resumed, which requires default mutation functions registered by key.
The server should handle duplicates, because a retry after a timeout may resend a request that already succeeded.

### What does "offline-first" mean for a mobile app? {mid}

The app works with local data first and treats the network as a way to sync: it shows cached or locally stored data immediately, lets users make changes that are queued and synced
later, and handles conflicts. Techniques include persisting the query cache, optimistic updates, queued mutations with idempotency keys, and local databases with sync for larger data
sets.

### How do you cancel requests when a screen unmounts? {mid}

Pass an `AbortController`'s signal to `fetch` and abort it in the `useEffect` cleanup, so the request is cancelled and no state is set on an unmounted component. TanStack Query passes a
`signal` to the query function and cancels queries that are no longer used; with axios, pass the `signal` option as well.

### Why is cookie-based authentication problematic in React Native? {senior}

The docs list known issues with cookies: cookie-based auth is unstable, `credentials: 'omit'` doesn't work, and on iOS a 302 redirect with `Set-Cookie` may not store the cookie,
which can cause request loops on expired sessions. Mobile apps therefore usually use tokens (e.g. OAuth access and refresh tokens) sent in the `Authorization` header and stored
securely, with a refresh flow handled by an HTTP interceptor.

### How do you implement token refresh? {senior}

Store the access and refresh tokens securely (Keychain/Keystore), add the access token to requests in an interceptor, and on a 401 response call the refresh endpoint once, queue other
requests that fail meanwhile, retry them with the new token, and sign the user out if the refresh fails. Deduplicating concurrent refreshes is the critical part: without it, several
parallel 401s trigger several refreshes and invalidate each other's tokens.

### When should an app use a local database instead of a cache? {senior}

When the app must work fully offline with a lot of data, query it locally (filtering, sorting, relations), or sync changes in both directions with conflict resolution: field
service apps, note-taking, messaging. A persisted query cache suits apps that mainly display server data. Options include SQLite libraries (`expo-sqlite`, op-sqlite), WatermelonDB,
Realm-style databases and sync engines, chosen by data size, sync needs and team experience.
