# Local storage and security {mid}

Mobile apps keep data on the device: settings, cached server data, drafts, tokens. The key interview skill is choosing the **right storage for the data's sensitivity and size**,
and knowing that **anything shipped in the app bundle is readable**. The web habit of putting a token in `localStorage` translates to a real vulnerability on mobile.

## Storage options

| Storage | API | Encrypted | Use for |
|---|---|---|---|
| **AsyncStorage** | async, strings only | **no** | small non-sensitive data: settings, flags, persisted UI state |
| **MMKV** | **synchronous**, typed values | optional encryption key | fast key-value reads at startup, persisted caches and stores |
| **SecureStore / Keychain / Keystore** | async (and sync variants) | **yes** | tokens, passwords, keys: small secrets |
| **SQLite** (`expo-sqlite`, op-sqlite) | SQL | optional (SQLCipher) | structured and large data, offline databases |
| **File system** (`expo-file-system`) | files | no | images, downloads, exports |

**AsyncStorage** is, in its own words, an "asynchronous, unencrypted, persistent key-value storage". Version 3 stores data in SQLite and adds **separate databases**:
`createAsyncStorage('users')` creates an isolated instance (the default export is the legacy shared storage), and batch methods are `getMany`/`setMany`/`removeMany`. Checked with the
library's Jest mock: two instances kept different values for the same key, `getMany(['x', 'y', 'missing'])` returned `{ x: "1", y: "2", missing: null }`, and objects must be stored as
JSON strings.

**MMKV** (v4, built on Nitro Modules) is a synchronous key-value store: `createMMKV({ id })`, `set(key, value)`, `getString`/`getNumber`/`getBoolean` (returning `undefined` for
missing keys), plus React hooks like `useMMKVString`. Synchronous access means no loading state for small values read at startup (theme, auth flag). In Jest, MMKV switches to an
in-memory mock automatically, but its native module has to be mocked.

## Storing secrets

- Use the platform's secure storage: **Keychain** on iOS, **Keystore**-encrypted storage on Android, via `expo-secure-store` or `react-native-keychain`. The React Native security
  guide explicitly says AsyncStorage is **not** for tokens or secrets.
- SecureStore notes from the Expo docs: large values may be rejected (some iOS releases historically refused values above about 2048 bytes), data is **removed on Android uninstall
  but can persist on iOS** after reinstall with the same bundle ID, and `requireAuthentication` can require biometrics to read a value.
- **Never put secret API keys in the app**: the docs warn that anything in your code can be read by inspecting the bundle, and that includes values from `.env` files baked in at
  build time. Put a backend (e.g. a serverless function) between the app and services that need secrets.

## Other security essentials

- **HTTPS** everywhere (enforced by ATS and Android defaults); consider **certificate pinning** for high-risk apps, and plan for certificate rotation.
- **OAuth 2 with PKCE** for sign-in (e.g. `expo-auth-session`, `react-native-app-auth`), using the system browser rather than a WebView.
- **Deep links are not secure**: another app can register the same custom scheme, so never pass tokens or sensitive data in them; prefer universal links / App Links and validate
  parameters.
- Don't log sensitive data, strip `console.log` in production, obfuscation (Hermes bytecode) is not protection, and consider root/jailbreak detection, screenshot prevention and
  biometric prompts where the risk justifies it. The **OWASP Mobile Top 10** is the standard checklist.

## Sources

- [Security (React Native)](https://reactnative.dev/docs/security)
- [Async Storage](https://github.com/react-native-async-storage/async-storage)
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
- [SecureStore (Expo)](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [OWASP Mobile Top 10](https://owasp.org/www-project-mobile-top-10/)

## Questions

### Where should you store an authentication token in a React Native app? {junior}

In the platform's secure storage: the iOS Keychain or Keystore-backed encrypted storage on Android, through libraries like `expo-secure-store` or `react-native-keychain`. Not in
AsyncStorage, MMKV without encryption, or plain files, which are unencrypted and can be read from backups or rooted devices. The React Native security guide lists token storage as
something AsyncStorage must not be used for.

### What is AsyncStorage and what are its limitations? {junior}

A persistent key-value store with an asynchronous API that stores only strings (objects must be serialized to JSON). It's unencrypted, so it's unsuitable for secrets, and every read is
asynchronous, so values needed at startup require a loading state. It suits small non-sensitive data like settings. Version 3 uses SQLite, supports separate databases via
`createAsyncStorage(name)`, and renames batch methods to `getMany`/`setMany`/`removeMany`.

### Why do teams choose MMKV over AsyncStorage? {mid}

MMKV is much faster and synchronous: `storage.getString('theme')` returns immediately, so there's no async loading state for values read during startup or rendering. It stores typed
values (strings, numbers, booleans, buffers), supports multiple instances and optional encryption, and has React hooks. It's popular as the persistence layer for stores (Zustand,
Redux) and query caches. It's a native module, so it requires a development build rather than Expo Go.

### Why shouldn't you put API keys in the app, even in environment variables? {mid}

Everything bundled into the app, including values injected from `.env` files at build time, ends up in the JavaScript bundle or native binaries, which anyone can extract and read.
Hermes bytecode or obfuscation doesn't change that. Secret keys belong on a server: the app calls your backend (or a serverless function), which adds the key and calls the third-party
service. Only public, restricted keys (e.g. a map key limited to your app's bundle ID) can live in the app.

### What does SecureStore do differently on iOS and Android? {mid}

On iOS it stores values in the Keychain (as generic password items), and on Android in SharedPreferences encrypted with keys from the Android Keystore. Behavior differs too: data is
deleted when the app is uninstalled on Android but can persist across reinstalls on iOS, so apps sometimes clear Keychain items on first launch after install. It's meant for small
values; large payloads may be rejected.

### Why are deep links a security risk? {mid}

Custom URL schemes aren't owned: another app can register the same scheme and receive links meant for yours, so any data in the link can be intercepted. Never put tokens or sensitive
data in deep links, validate and sanitize their parameters, and don't trigger sensitive actions from a link without confirmation. For sign-in, use OAuth with PKCE, and prefer
universal links / App Links, which are verified against your domain.

### What is PKCE and why is it used for mobile sign-in? {senior}

Proof Key for Code Exchange is an OAuth 2 extension: the app creates a random code verifier, sends its hash (the code challenge) with the authorization request, and must present the
original verifier when exchanging the authorization code for tokens. A mobile app can't keep a client secret, and the redirect can be intercepted, so PKCE ensures that only the app
that started the flow can exchange the code. Libraries like `expo-auth-session` and `react-native-app-auth` implement it with the system browser.

### What is certificate pinning and what are its trade-offs? {senior}

The app trusts only specific certificates or public keys for your API instead of any certificate signed by a trusted authority, which protects against man-in-the-middle attacks with
rogue or user-installed certificates. The downside is operational: when the certificate or key changes, pinned apps can't connect until they're updated, so you pin public keys, include
backup pins, and plan rotation carefully. It's typically used for banking and other high-risk apps.

### How would you store a large amount of structured data locally? {mid}

Use SQLite through `expo-sqlite` or op-sqlite (optionally with an ORM like Drizzle), or a database built on it such as WatermelonDB for large, syncing data sets. Key-value stores
aren't designed for querying, relations or large collections. Store files (images, downloads) in the file system and keep only their paths in the database.

### What security measures would you apply to a banking app? {senior}

Secure storage for tokens with biometric protection, short-lived access tokens with refresh, OAuth with PKCE, HTTPS with certificate pinning, no sensitive data in logs, deep links or
the bundle, root/jailbreak and tampering detection, screenshot and screen-recording prevention on sensitive screens, auto sign-out after inactivity, backend-enforced authorization for
everything, and regular reviews against the OWASP Mobile Top 10 and penetration tests.
