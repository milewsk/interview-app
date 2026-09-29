# Designing HTTP APIs {mid}

Most services expose HTTP APIs, and interviews often include "design an endpoint for..." questions. A good API uses **HTTP semantics correctly** (methods, status
codes, headers), has predictable resource naming, reports errors consistently, supports pagination and concurrency, and evolves without breaking clients.

## Resources and methods

Model **resources** (nouns) and use methods for actions: `GET /orders/42`, `POST /orders`, `DELETE /orders/42`, `GET /customers/7/orders`. Avoid verbs in URLs like
`/getOrder`; for real business operations that aren't CRUD, a sub-resource or action endpoint is acceptable (`POST /orders/42/cancellation`).

| Method | Purpose | Safe | Idempotent |
|---|---|---|---|
| `GET` | read a resource | yes | yes |
| `POST` | create a resource / trigger a processing action | no | **no** |
| `PUT` | replace a resource entirely (or create at a known URI) | no | yes |
| `PATCH` | partial update | no | not necessarily |
| `DELETE` | remove a resource | no | yes |

**Safe** (RFC 9110) means read-only: `GET`, `HEAD`, `OPTIONS`, `TRACE`. **Idempotent** means the intended effect of several identical requests is the same as of one:
the safe methods plus `PUT` and `DELETE`. It matters for retries: clients and proxies may retry idempotent requests safely. In a test, deleting the same product twice
returned `204` both times, and repeating the same `PUT` left the resource in the same state (only server-side metadata such as a version counter changed, which is
something to be aware of).

## Status codes

| Code | Use |
|---|---|
| `200 OK` | success with a body |
| `201 Created` | created; `Location` header points to the new resource |
| `204 No Content` | success without a body (e.g. `DELETE`) |
| `304 Not Modified` | conditional `GET` and the resource hasn't changed |
| `400 Bad Request` | malformed or invalid input |
| `401 Unauthorized` / `403 Forbidden` | not authenticated / authenticated but not allowed |
| `404 Not Found` | the resource doesn't exist |
| `405 Method Not Allowed` | the method isn't supported for the resource (verified for `PATCH`) |
| `409 Conflict` | conflict with the current state (duplicate, invalid state transition) |
| `412 Precondition Failed` | `If-Match` didn't match: a concurrent modification |
| `422 Unprocessable Content` | well-formed but semantically invalid (some APIs use it for validation) |
| `429 Too Many Requests` | rate limit exceeded, with `Retry-After` |
| `500` / `503` | server error / temporarily unavailable |

## Errors: Problem Details

Return errors in a consistent, machine-readable format: **Problem Details** (RFC 9457, `application/problem+json`) with `type`, `title`, `status`, `detail`, `instance`
and extensions. ASP.NET Core supports it with `AddProblemDetails()`, `Results.Problem()` and `Results.ValidationProblem()`: in a test a missing product returned `404`
with `application/problem+json`, and invalid input returned `400` with an `errors` object per field. Don't leak stack traces or internal messages.

## Pagination, filtering, sorting

`GET /orders?status=paid&sort=-createdAt&pageSize=20&cursor=eyJpZCI6MTIzfQ`. Always limit page size. Cursor (keyset) pagination is stable and fast for large or changing
data; offset pagination is simpler and allows page numbers. Return the next cursor or link in the response.

## Concurrency and caching with ETags

- The server returns an `ETag` (a version of the representation). A client sends `If-None-Match: "1"` to get `304 Not Modified` instead of the body (caching, verified).
- For updates, the client sends `If-Match: "<etag>"`; if the resource changed meanwhile, the server responds `412 Precondition Failed` (verified), which prevents lost
  updates (optimistic concurrency over HTTP).

## Idempotency keys

`POST` isn't idempotent, so a retried "create order" can create two orders. Clients send an `Idempotency-Key` header (a unique value per logical operation), and the server
stores the result per key and returns the same response for repeats: in a test two `POST`s with the same key both returned `201` with `Location: /products/2`, and only one
product was created. An IETF draft standardizes the header.

## Versioning and evolution

- Prefer **backward-compatible changes**: add optional fields and new endpoints; don't rename or remove fields or change their meaning. Clients should ignore unknown fields.
- When breaking changes are unavoidable, version: in the URL (`/v2/orders`, most visible), a query parameter (`?api-version=2026-01-01`, used by Azure) or a header / media type.
  Keep old versions running for a deprecation period.
- Document the API with **OpenAPI** (ASP.NET Core generates it with `AddOpenApi()` in .NET 9+).

## REST, gRPC, GraphQL

- **REST/JSON over HTTP**: universal, cacheable, easy to consume from browsers; the default for public APIs.
- **gRPC**: binary Protobuf over HTTP/2, strongly typed contracts, streaming, high performance; great for internal service-to-service calls.
- **GraphQL**: clients query exactly the fields they need from one endpoint; good for varied front-end needs, but caching, authorization per field and query cost control are
  harder.

## Sources

- [RFC 9110: HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Web API design best practices (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)
- [Microsoft REST API guidelines](https://github.com/microsoft/api-guidelines)
- [Handle errors in ASP.NET Core APIs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling-api)
- [The Idempotency-Key HTTP header field (IETF draft)](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)

## Questions

### What do "safe" and "idempotent" mean for HTTP methods? {mid}

A safe method is read-only: it isn't expected to change server state (`GET`, `HEAD`, `OPTIONS`, `TRACE`). An idempotent method has the same intended effect whether a request
is sent once or several times: the safe methods plus `PUT` and `DELETE`. `POST` is neither, and `PATCH` isn't necessarily idempotent. Idempotency determines whether a
request can be retried safely after a timeout.

### How does `PUT` differ from `PATCH`? {mid}

`PUT` replaces the whole resource with the representation sent: fields that are missing are reset, and sending the same request twice gives the same result, so it's
idempotent. `PATCH` applies a partial modification described by the body (e.g. JSON Merge Patch or JSON Patch) and isn't necessarily idempotent (e.g. "add 1 to quantity").
`PATCH` is convenient for updating a few fields without sending the whole resource.

### Which status code should a `POST` that creates a resource return? {junior}

`201 Created`, with a `Location` header containing the URI of the new resource and usually its representation in the body. If the request is accepted for asynchronous processing
rather than completed, `202 Accepted` with a link to check the status. Returning `200 OK` for creation works but hides the semantics that clients and tools rely on.

### How do `401` and `403` differ? {junior}

`401 Unauthorized` means the request lacks valid authentication (no token, an expired or invalid one), and the client should authenticate and try again; the response includes a
`WWW-Authenticate` header. `403 Forbidden` means the client is authenticated but doesn't have permission for this resource or action, and re-authenticating won't help. Sometimes
`404` is returned instead of `403` to avoid revealing that a resource exists.

### How should an API report errors? {mid}

With the appropriate status code and a consistent, machine-readable body, ideally Problem Details (RFC 9457, `application/problem+json`): `type`, `title`, `status`, `detail`,
`instance`, plus extensions such as validation `errors` per field or a trace ID. ASP.NET Core produces them with `AddProblemDetails()`, `Results.Problem` and
`Results.ValidationProblem`. Error bodies must not expose stack traces or internal details.

### How do you make a `POST` safe to retry? {senior}

With idempotency keys: the client generates a unique key per logical operation and sends it in an `Idempotency-Key` header; the server records the key together with the result
(ideally in the same transaction as the operation), and for repeated requests with the same key returns the stored response instead of executing again. Keys expire after some
time, and a request with the same key but a different body should be rejected. Payment APIs popularized this approach.

### How do you prevent lost updates in a REST API? {senior}

With optimistic concurrency using ETags: `GET` returns an `ETag` representing the version of the resource, and the client sends it back in `If-Match` when updating. If someone else
changed the resource in the meantime, the ETag doesn't match and the server responds `412 Precondition Failed`, so the client must reload and reapply its change. The ETag usually
maps to a row version or concurrency token in the database.

### How can you version an API, and how do you avoid needing to? {mid}

By URL path (`/v2/...`), query parameter (`?api-version=...`) or a header or media type. Each has trade-offs in visibility and caching; URL versioning is the most explicit.
Versioning is needed only for breaking changes, so the first strategy is evolving compatibly: add optional fields and endpoints, never remove or rename fields or change their
meaning, and have clients ignore unknown fields. Old versions are deprecated with advance notice.

### How should an API implement pagination? {mid}

Always cap the page size and accept a limit parameter, return items with a way to get the next page (a cursor or a `next` link), and optionally a total count if it's cheap. Cursor
(keyset) pagination based on a sort key is stable when data changes and fast on large collections; offset pagination (`page`, `pageSize`) is simpler and supports jumping to page
numbers, but gets slower and can skip or duplicate items when data changes.

### When would you choose gRPC over REST? {mid}

For internal service-to-service communication where performance and strong contracts matter: gRPC uses compact binary Protobuf over HTTP/2, generates typed clients, supports
bidirectional streaming and deadlines. REST with JSON is better for public APIs and browsers, because it's universally supported, human-readable, cacheable and easy to explore;
gRPC in browsers needs gRPC-Web.
