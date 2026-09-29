# Browser storage {mid}

A browser offers several places to keep data on the client. They differ in capacity, lifetime, API (synchronous or asynchronous), whether they're
sent to the server and what they're exposed to.

| Mechanism | Capacity | Lifetime | API | Sent to the server | JS access |
|---|---|---|---|---|---|
| Cookies | ~4 KB per cookie | session or `Expires`/`Max-Age` | `document.cookie`, `Set-Cookie` | yes, with every matching request | not with `HttpOnly` |
| `localStorage` | ~5 MiB per origin | until removed | synchronous, strings | no | yes |
| `sessionStorage` | ~5 MiB per origin | tab lifetime | synchronous, strings | no | yes |
| IndexedDB | large (a share of disk) | until removed or evicted | asynchronous, structured data | no | yes |
| Cache API | as IndexedDB | until removed or evicted | asynchronous, `Request`/`Response` | no | yes (also in a service worker) |

## Web Storage: `localStorage` and `sessionStorage`

```js
localStorage.setItem('theme', 'dark')
localStorage.getItem('theme')          // 'dark'; a missing key → null
localStorage.removeItem('theme')

localStorage.setItem('n', 1)            // stored as the string '1'
localStorage.setItem('o', { a: 1 })     // 🔴 '[object Object]'
localStorage.setItem('o', JSON.stringify({ a: 1 }))   // ✅
```

- It stores **only strings**. Everything else is converted with `String()`, so objects are serialized with `JSON.stringify` and read with `JSON.parse`
  (wrapped in `try/catch`, because the data may be corrupted or from an older app version).
- The API is **synchronous** and blocks the main thread, so it's for small amounts of data (settings, drafts), not large collections.
- It's scoped to the **origin** (scheme + host + port).
- `localStorage` survives closing the browser. `sessionStorage` is per **tab**: it survives a reload but not closing the tab, and a new tab has its own
  copy (a tab opened with "duplicate" gets a copy of the state).
- Exceeding the limit throws `QuotaExceededError`. In private mode or with storage blocked, access itself may throw an exception.
- The **`storage`** event fires in **other** tabs of the same origin when `localStorage` changes (not in the one that made the change). It lets you
  synchronize state between tabs (logout, theme).

## Cookies

```http
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

- Sent **automatically** with requests to the matching domain and path, so they're used for sessions and authentication. Every cookie adds to the size
  of every request.
- `HttpOnly`: invisible to `document.cookie`, which protects the session token from XSS (the cookie is still sent with `fetch`).
- `Secure`: only over HTTPS.
- `SameSite`: `Strict` (only same-site requests), `Lax` (plus top-level `GET` navigations from other sites), `None` (always; requires `Secure`).
  Browsers increasingly default to `Lax` when the attribute is missing. `SameSite` is the main defense against CSRF.
- No `Expires`/`Max-Age` = a **session cookie**, removed when the browser closes. `Max-Age` takes precedence over `Expires`.
- `Domain` extends the cookie to subdomains, and without it the cookie is "host-only". The `__Host-` prefix enforces `Secure`, `Path=/` and no
  `Domain`.
- `document.cookie` is an awkward API: reading returns one string `"a=1; b=2"`, and assigning **adds or overwrites one** cookie rather than replacing
  them all.

## IndexedDB

A transactional, **asynchronous** key–value database in the browser. It stores structured objects (anything that the structured clone algorithm
supports: objects, arrays, `Date`, `Map`, `Blob`, …), supports indexes, key ranges and transactions, and works in web workers. It's the base for offline
apps and large caches. The native API is event-based and verbose, so in practice people use wrappers such as `idb` or Dexie.

## Quotas and eviction

- Web Storage: about 5 MiB for `localStorage` and 5 MiB for `sessionStorage` per origin.
- IndexedDB and the Cache API: a share of disk space (e.g. in Chrome up to 60% of the disk per origin). By default storage is **best-effort**: under
  storage pressure the browser may evict the least recently used origin (LRU), deleting all of its data at once.
- `navigator.storage.estimate()` returns usage and quota, and `navigator.storage.persist()` asks for persistent storage.
- Safari with tracking prevention deletes script-writable data (including `localStorage` and IndexedDB) for origins without user interaction in the
  last 7 days.

The conclusion: client storage is a **cache**, not a source of truth. Important data must also exist on the server.

## Security

Anything JS can read (`localStorage`, `sessionStorage`, IndexedDB, non-`HttpOnly` cookies) can be stolen by an XSS attack. So you don't store secrets
there, and the choice of where to keep an auth token is a trade-off: an `HttpOnly` cookie is safe from XSS theft but needs CSRF protection, while a
token in memory or `localStorage` avoids CSRF but is exposed to XSS.

## Sources

- [Web Storage API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Set-Cookie (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [Using HTTP cookies (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- [IndexedDB API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Storage quotas and eviction criteria (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Questions

### How does `localStorage` differ from `sessionStorage`? {junior}

Both store strings per origin and have the same synchronous API. `localStorage` survives closing the browser and is shared by all tabs of the origin.
`sessionStorage` is per tab: it survives a reload, but disappears when the tab closes, and every tab has its own copy. `sessionStorage` suits temporary
state of a single tab, e.g. a multi-step form.

### How do you store an object in `localStorage`? {junior}

Serialize it with `JSON.stringify` and read it with `JSON.parse`, because Web Storage keeps only strings: `setItem('o', {a: 1})` stores
`"[object Object]"`. Wrap the read in `try/catch` and handle a missing or old data format. `Date`, `Map`, `Set` or `undefined` don't survive the JSON
round trip unchanged.

### How do cookies differ from `localStorage`? {junior}

Cookies are sent automatically to the server with every matching request, are small (~4 KB each), can have an expiry date and can be hidden from JS
with `HttpOnly`. `localStorage` is larger (~5 MiB), never sent to the server, always readable by JS on the origin, and lasts until removed. Cookies suit
sessions, and `localStorage` suits client-side preferences and cache.

### What do the `HttpOnly`, `Secure` and `SameSite` flags mean? {mid}

`HttpOnly` hides the cookie from `document.cookie`, so an XSS script can't read it, although it's still sent with requests. `Secure` sends it only over
HTTPS. `SameSite` controls cross-site sending: `Strict` only from the same site, `Lax` additionally with top-level `GET` navigations, `None` always
(requires `Secure`). A session cookie should have all three, usually with `SameSite=Lax` or `Strict`.

### Where should you store an authentication token in the browser? {mid}

It's a trade-off. An `HttpOnly; Secure; SameSite` cookie can't be stolen by XSS, but because it's sent automatically you need CSRF protection
(`SameSite`, tokens). `localStorage` isn't sent automatically, so there's no CSRF, but any XSS script can read and steal the token. A common compromise
is a short-lived access token in memory plus a refresh token in an `HttpOnly` cookie. Either way, XSS protection is the foundation.

### When would you choose IndexedDB over `localStorage`? {mid}

For larger amounts of data, structured objects (without manual serialization), binary data (`Blob`), queries through indexes, transactions and work in
web workers, e.g. an offline app or a large data cache. `localStorage` is synchronous and blocks the main thread, stores only strings and has a ~5 MiB
limit, so it's only for small settings. IndexedDB is asynchronous, and in practice people use it through a wrapper (`idb`, Dexie).

### How do you synchronize state between tabs of the same app? {mid}

Listen for the `storage` event on `window`: it fires in the **other** tabs of the origin when `localStorage` changes (not in the tab that made the
change) and includes `key`, `oldValue` and `newValue`. That's how you can e.g. log out all tabs. The `BroadcastChannel` API, which sends any messages
between contexts of the same origin, is an alternative.

### Can data in browser storage disappear by itself? {mid}

Yes. By default storage is best-effort: under disk pressure the browser may evict the whole storage of the least recently used origin. The user can
clear data, private mode deletes it at the end of the session, and Safari with tracking prevention deletes script-writable data after 7 days without
interaction. `navigator.storage.persist()` asks for persistent storage, but client data should still be treated as a cache.

### What happens when the `localStorage` limit is exceeded? {mid}

`setItem` throws a `QuotaExceededError`. So writes should be wrapped in `try/catch` with a fallback (e.g. clearing an old cache or working without
persistence). Access to `localStorage` itself can also throw an exception when storage is blocked by settings, so production code doesn't assume it's
always available.

### How do you set and delete a cookie from JavaScript? {junior}

Setting: `document.cookie = 'theme=dark; Path=/; Max-Age=31536000; SameSite=Lax'`. The assignment adds or overwrites a single cookie rather than
replacing all of them. Deleting: set the same cookie (the same name, `Path` and `Domain`) with `Max-Age=0` or an `Expires` date in the past. An
`HttpOnly` cookie can't be set or deleted from JS, only by the server.
