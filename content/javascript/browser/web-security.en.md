# Frontend security: XSS, CSRF, CSP {mid}

A frontend runs in an environment the attacker also has access to. The most common interview topics are **XSS** (running someone else's code on your
page), **CSRF** (forcing a request on the user's behalf), the **CSP** header and **clickjacking**. A reminder that runs through all of them: **the
client isn't a trust boundary**, so validation, authorization and rate limits must happen on the server.

## XSS: Cross-Site Scripting

An attacker gets their script to run in the context of your origin. The script can then do everything the user can: read the DOM, `localStorage` and
non-`HttpOnly` cookies, and send requests with the user's session.

- **Stored**: the payload is saved in the database (a comment, a username) and displayed to other users.
- **Reflected**: the payload comes in the request (e.g. a URL parameter) and the server puts it into the response.
- **DOM-based**: frontend code itself puts data from an untrusted source (`location.hash`, `postMessage`, an API) into a dangerous sink.

```js
el.innerHTML = `<p>Hello, ${name}</p>`   // 🔴 name = '<img src=x onerror="stealCookies()">'
el.textContent = `Hello, ${name}`        // ✅ always text
```

Dangerous sinks: `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout(string)`, `href`/`src` with
a `javascript:` URL. A `<script>` inserted via `innerHTML` doesn't run, but an `onerror` handler on `<img>` does, so "it has no script tag" isn't
protection.

### Defenses

1. **Contextual output encoding**: frameworks do it by default. React escapes text and attribute values, and in React 19 a `javascript:` URL in
   `href` is replaced with code that throws an error ("React has blocked a javascript: URL…").
2. **Avoid raw HTML**. The loopholes are `dangerouslySetInnerHTML` (React), `v-html` (Vue), `[innerHTML]` (Angular) and direct DOM operations through
   `ref`. If you need to render user HTML (e.g. from a WYSIWYG editor), sanitize it with a proven library, e.g. **DOMPurify**, never with your own
   regular expressions.
3. **Validate URLs** from users: allow only `http:`/`https:` (and possibly `mailto:`).
4. **CSP** as a second line of defense (below), plus **`HttpOnly`** cookies, so a successful XSS at least can't steal the session.

## CSRF: Cross-Site Request Forgery

The user is logged in to `bank.example`, and a malicious page contains a form that automatically sends `POST /transfer` to the bank. The browser
**attaches the session cookie automatically**, so the server sees a legitimate request. The attacker can't read the response, but the side effect
(the transfer) happens.

Defenses:

- **`SameSite=Lax` or `Strict`** on session cookies: the cookie doesn't go with cross-site `POST` requests. Many browsers default to `Lax`, but you
  should set it explicitly.
- **CSRF tokens** (synchronizer token or double-submit cookie): a random value in the form or a header that a foreign page can't know.
- **Fetch Metadata**: the server rejects state-changing requests with `Sec-Fetch-Site: cross-site`. Checking `Origin`/`Referer` is a weaker variant.
- **Don't change state with `GET`**: `SameSite=Lax` lets top-level `GET` navigations through.
- An API that requires a token in the `Authorization` header (rather than a cookie) isn't vulnerable to classic CSRF, because the browser doesn't add
  that header itself.

CORS isn't a CSRF defense: a "simple" request (e.g. a form `POST`) goes out without a preflight, and CORS only blocks reading the response.

## CSP: Content Security Policy

A response header that tells the browser which sources of scripts, styles, images and frames are allowed. When a policy has `script-src` (or
`default-src`), **inline scripts, inline handlers (`onclick="…"`), `javascript:` URLs and `eval()` are blocked** by default. So even an injected
payload won't run.

```http
Content-Security-Policy:
  script-src 'nonce-rAnd0m123' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none'
```

- A **strict CSP** is based on a **nonce** (a random value generated for each response and added to allowed `<script nonce="…">`) or a **hash** of the
  script contents. Domain allowlists are easy to bypass (e.g. JSONP on an allowed CDN).
- `'strict-dynamic'`: a script trusted through a nonce/hash may load further scripts.
- `'unsafe-inline'` and `'unsafe-eval'` largely disable the protection.
- **`Content-Security-Policy-Report-Only`** reports violations without blocking, so you roll out a policy gradually.
- `require-trusted-types-for 'script'` (Trusted Types) makes dangerous sinks like `innerHTML` accept only values passed through an approved sanitizing
  policy.
- CSP can be set with `<meta http-equiv>`, but without all features, e.g. without `frame-ancestors` and report-only mode.

## Clickjacking

A malicious page loads yours in an invisible `<iframe>` and gets the user to click a button (e.g. "delete account"). Defense: `Content-Security-Policy:
frame-ancestors 'none'` (or `'self'`), and the older `X-Frame-Options: DENY`.

## Other good practices

- **HTTPS** everywhere, plus `Strict-Transport-Security` (HSTS).
- **Subresource Integrity**: `<script src="https://cdn…" integrity="sha384-…" crossorigin>` guarantees a file from a CDN hasn't been modified.
- **Dependencies**: `npm audit`, lockfiles, updates. The supply chain is a real attack vector.
- **Secrets**: anything in the frontend bundle (including `VITE_*` variables) is public. API keys with privileges belong on the server.
- **`postMessage`**: check `event.origin` on receipt and pass a specific `targetOrigin` when sending.
- Links with `target="_blank"` to foreign pages: modern browsers apply `noopener` by default, but `rel="noopener noreferrer"` is still used explicitly.

## Sources

- [Cross-site scripting (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS)
- [Cross-site request forgery (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [Clickjacking (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Clickjacking)
- [Cross Site Scripting Prevention Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [CSRF Prevention Cheat Sheet (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Questions

### What is XSS, and what types are there? {junior}

Cross-Site Scripting is injecting and running an attacker's script in the context of your page. The script then has the user's permissions: it reads data
and the DOM and sends requests with their session. Types: stored (the payload saved on the server and shown to others), reflected (the payload from the
request echoed in the response) and DOM-based (frontend code puts untrusted data into a sink like `innerHTML`).

### What is Subresource Integrity (SRI)? {mid}

An attribute on `script` and `link` tags, e.g. `integrity="sha384-..."` with `crossorigin="anonymous"`, containing a hash of the expected file. The browser computes the hash
of the downloaded resource and refuses to execute it if it doesn't match, so a compromised or modified file on a CDN can't inject code into your page. It only works for files
that don't change, so you pin a specific version, and bundlers can generate the hashes during the build.

### Why is `innerHTML` with user data dangerous even though a `<script>` inserted this way doesn't run? {mid}

Because code can run in other ways: event attributes (`<img src=x onerror="…">`, `<svg onload="…">`), `javascript:` links or an `<iframe srcdoc>`. So
blocking just `<script>` tags or filtering with regular expressions is ineffective. For text use `textContent`, and HTML should be sanitized with a proven
library, ideally combined with CSP and Trusted Types.

### What is CSRF, and how do you defend against it? {mid}

Cross-Site Request Forgery is getting the user's browser to send a request with their cookies from a foreign page, e.g. an automatic form sending a
transfer. The attacker doesn't see the response, but the action happens. Defenses: `SameSite=Lax`/`Strict` cookies, CSRF tokens (synchronizer or
double-submit), checking `Sec-Fetch-Site` or `Origin`, and not changing state with `GET` requests.

### Why doesn't CORS protect against CSRF? {mid}

CORS controls whether JS can **read** a cross-origin response, not whether a request goes out. A simple request (e.g. a form `POST` with
`application/x-www-form-urlencoded`) is sent without a preflight, with cookies, and its side effect on the server happens even though the browser then
blocks access to the response. CSRF needs no response, so it requires separate protection.

### What is Content Security Policy, and how does it limit XSS? {mid}

It's a response header that lists allowed sources of scripts and other resources. Once `script-src` is set, the browser blocks inline scripts, inline event
handlers, `javascript:` URLs and `eval`, so injected code won't run even when an XSS vulnerability exists. The recommended strict CSP is based on a nonce
or hash (`script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`). It's a second line of defense, not a replacement for escaping.

### How do you roll out CSP in an existing app without breaking it? {mid}

Start with the `Content-Security-Policy-Report-Only` header and violation reporting (`report-to`): the browser doesn't block anything but reports what would
be blocked. Based on the reports, remove inline scripts and handlers, add nonces or hashes, and only then switch to the enforcing
`Content-Security-Policy` header. Both headers can run side by side, e.g. while testing a stricter policy.

### What is clickjacking, and how do you prevent it? {mid}

An attacker loads your page in a transparent `<iframe>` on top of their own and gets the user to click something that actually clicks your button (e.g.
confirming an action). Defense: the `Content-Security-Policy: frame-ancestors 'none'` header (or a list of allowed parents), and in older browsers
`X-Frame-Options: DENY`. `frame-ancestors` doesn't work when CSP is set through a `<meta>` tag.

### Can you keep an API key in a frontend environment variable? {junior}

Not a secret one. Everything that gets into the bundle (e.g. `VITE_*` or `NEXT_PUBLIC_*` variables) is public, because anyone can read it in the browser.
Only public identifiers are fine there (e.g. an analytics key restricted by domain). Keys with privileges should be kept on a server or BFF that makes
requests on behalf of the client and enforces authorization and limits.

### How do you safely use `window.postMessage`? {mid}

When receiving, always check `event.origin` against an allowlist of expected origins and validate the shape of `event.data`, because any window can send a
message. When sending, give a specific `targetOrigin` instead of `'*'`, so data doesn't reach a page that has changed its address in the meantime. Never
put received data into sinks like `innerHTML` or `eval`.
