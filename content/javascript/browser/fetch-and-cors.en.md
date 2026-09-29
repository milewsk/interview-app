# fetch and CORS {mid}

`fetch` is the standard browser API for HTTP requests (also available in Node 18+). It returns a promise of a `Response`. **CORS**
(Cross-Origin Resource Sharing) is the mechanism by which a server allows a page from a different origin to read its responses.

## `fetch` basics

```js
const res = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ada' }),
  signal: AbortSignal.timeout(5000),
})
if (!res.ok) throw new Error(`HTTP ${res.status}`)   // 🔴 fetch does NOT reject on 404/500
const user = await res.json()
```

- The promise **rejects only on a network error** (no connection, DNS, CORS blocked, abort). HTTP 404 or 500 **resolves** normally: check `res.ok`
  (status 200–299) or `res.status`.
- The body is read **once**: `json()`, `text()`, `blob()`, `arrayBuffer()`, `formData()`. A second read throws a `TypeError`. If you need it twice,
  use `res.clone()` before reading.
- `res.json()` rejects with a `SyntaxError` if the body isn't valid JSON (e.g. an HTML error page).
- The body type sets `Content-Type` automatically: `FormData` → `multipart/form-data` (with a boundary, so **don't** set this header yourself),
  `URLSearchParams` → `application/x-www-form-urlencoded`. For a JSON string you must set `Content-Type: application/json` yourself.

## Key options

| Option | Default | Meaning |
|---|---|---|
| `method` | `GET` | HTTP method |
| `credentials` | `same-origin` | `omit` / `same-origin` / `include`: whether to send cookies and HTTP auth |
| `mode` | `cors` | `cors` / `same-origin` / `no-cors` |
| `redirect` | `follow` | `follow` / `error` / `manual` |
| `signal` | none | `AbortSignal` for cancellation and timeouts |
| `cache` | `default` | interaction with the HTTP cache (`no-store`, `reload`, …) |
| `keepalive` | `false` | the request survives page unload (body limit 64 KiB), e.g. analytics |

## Same-origin policy

An **origin** is the scheme + host + port: `https://app.example.com:443`. `https://api.example.com` is a **different origin** (a different host),
as is `http://` vs `https://` or a different port. By default, the browser lets a script **send** a request to another origin, but **doesn't let it
read the response** unless the server allows it with CORS headers.

CORS is enforced **by the browser**, not the server. The server only declares what it allows, and the browser decides whether JS gets the response.
That's why a request from Postman, curl or a backend works without CORS, and why CORS **isn't a way to protect an API** against unauthorized
clients.

## Simple requests and preflight

A **simple request** goes out straight away with an `Origin` header, and the browser checks `Access-Control-Allow-Origin` in the response. A request is
simple when:

- the method is `GET`, `HEAD` or `POST`,
- it has only safelisted headers (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type`, `Range`),
- `Content-Type` is one of `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`.

Anything else (`PUT`/`PATCH`/`DELETE`, an `Authorization` header, `Content-Type: application/json`, custom `X-*` headers) first triggers a
**preflight**: an `OPTIONS` request asking for permission.

```http
OPTIONS /api/orders HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: authorization, content-type

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

Only after a positive answer does the browser send the actual request. `Access-Control-Max-Age` lets it cache the preflight result so it isn't repeated
before every call.

## Credentials (cookies)

By default a cross-origin `fetch` **doesn't send cookies** (`credentials: 'same-origin'`). To send them:

- the client sets `credentials: 'include'`,
- the server responds with `Access-Control-Allow-Credentials: true` and an **explicit origin** in `Access-Control-Allow-Origin` (`*` is not allowed
  with credentials, and neither is `*` in `Allow-Headers`/`Allow-Methods`/`Expose-Headers`),
- the cookie must also be allowed to travel cross-site (`SameSite=None; Secure`, see the storage topic).

A server that reflects any `Origin` combined with `Allow-Credentials: true` is a security hole: any site can then read the user's data.

## Response headers visible to JS

By default JS sees only the safelisted response headers: `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`, `Expires`,
`Last-Modified`, `Pragma`. Others (e.g. `X-Total-Count`, `ETag`) must be listed in `Access-Control-Expose-Headers`.

## `mode: 'no-cors'`

It doesn't "bypass" CORS. It returns an **opaque** response: status `0`, no headers and no body available to JS. It's only useful for fire-and-forget
requests or caching in a service worker. When the API doesn't support CORS, the solution is a proxy on your own server (e.g. the Vite dev server
`server.proxy` in development, or a reverse proxy/BFF in production).

## Sources

- [Using the Fetch API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [RequestInit (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)
- [Cross-Origin Resource Sharing (CORS) (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [Same-origin policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [Access-Control-Expose-Headers (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers)

## Questions

### Does `fetch` reject its promise on a 404 or 500 response? {junior}

No. `fetch` rejects only on a network error: no connection, a DNS failure, a CORS block or an abort through `AbortSignal`. Any HTTP response, including
404 and 500, resolves the promise normally. You must check `response.ok` (true for statuses 200–299) or `response.status` and throw an error yourself.

### What is an origin, and what does the same-origin policy restrict? {junior}

An origin is the combination of scheme, host and port, so `https://app.example.com` and `https://api.example.com` are different origins. The same-origin
policy stops a script from one origin reading resources from another: the browser may send the request, but JS doesn't get the response unless the
server allows it with CORS headers.

### What is CORS, and who enforces it? {mid}

CORS is a mechanism of HTTP headers (`Access-Control-Allow-Origin` and others) through which a server declares which origins may read its responses. The
browser enforces it: it checks the headers and either hands the response to JS or blocks it. So requests from curl, Postman or a backend aren't subject to
CORS, and CORS itself doesn't protect an API from unauthorized clients: authentication and authorization do that.

### When does the browser send a preflight request? {mid}

When the request isn't "simple": it uses a method other than `GET`/`HEAD`/`POST`, adds a non-safelisted header (e.g. `Authorization` or `X-Request-Id`)
or has a `Content-Type` other than `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`. So a typical `POST` with
`application/json` triggers a preflight. The browser sends `OPTIONS` with `Access-Control-Request-Method` and `-Headers`, and the actual request goes
out only after approval.

### How do you send cookies in a cross-origin request? {mid}

On the client: `credentials: 'include'`. On the server: `Access-Control-Allow-Credentials: true` and a specific origin in `Access-Control-Allow-Origin`,
because `*` isn't allowed with credentials. The cookie itself must allow cross-site sending (`SameSite=None; Secure`). The server should check `Origin`
against an allowlist rather than reflect any value.

### Why can't you read a custom response header, e.g. `X-Total-Count`? {mid}

In a cross-origin response JS sees only the safelisted headers (`Content-Type`, `Content-Length`, `Cache-Control`, `Content-Language`, `Expires`,
`Last-Modified`, `Pragma`). The server must add the header to `Access-Control-Expose-Headers: X-Total-Count`. With credentials, the `*` value doesn't
work as a wildcard there, so headers must be listed by name.

### What does `mode: 'no-cors'` do, and does it solve CORS errors? {mid}

It doesn't solve them. The request goes out, but the response is opaque: status `0`, no access to headers or body. It's only good for requests whose
response you don't need, or for caching in a service worker. Real fixes: correct CORS headers on the API or a proxy on your own origin (a dev server
proxy, a reverse proxy, a BFF).

### How do you correctly send JSON and a file with `fetch`? {junior}

JSON: `body: JSON.stringify(data)` plus the `Content-Type: application/json` header, because `fetch` doesn't set it for a string. A file: create a
`FormData`, add the file (`formData.append('file', file)`) and pass it as `body` **without** setting `Content-Type`, because the browser sets
`multipart/form-data` with the right boundary. Setting the header manually breaks the boundary.

### Why does a second `response.json()` call throw an error? {mid}

A response body is a stream that can be read only once. After the first read `bodyUsed` is `true`, and the next `json()`/`text()` throws a
`TypeError`. If the body is needed twice (e.g. logging and parsing), call `response.clone()` before the first read, or read it once as text and parse
it yourself.

### How do you get around the lack of CORS on a third-party API during development and in production? {mid}

In development, a dev server proxy (e.g. `server.proxy` in Vite) that forwards requests from your origin to the API, so the browser doesn't see a
cross-origin request. In production, a reverse proxy or a backend-for-frontend on your own domain, which also lets you keep API keys server-side.
Disabling browser security or public "CORS proxies" aren't solutions.
