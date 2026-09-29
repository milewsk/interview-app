# Schema design in MongoDB {mid}

"Schemaless" doesn't mean "no design". In a relational database you normalize first and write queries later; in MongoDB you design documents around **how the application
reads and writes data**. The central decision is **embedding vs referencing**, driven by access patterns, the relationship's cardinality, growth, and atomicity needs.

## Embedding vs referencing

```js
// embedded: one document, one read, atomic updates
{ _id: 1, customer: { id: 1, name: 'Ann' }, lines: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }] }

// referenced: separate collections, joined with $lookup (or a second query)
orders:      { _id: 1, customerId: 1 }
order_lines: { orderId: 1, sku: 'A', qty: 2 }
```

Verified: the embedded order returned its 2 lines with one `findOne`; the referenced version needed an aggregation with `$lookup` to return the same 2 lines.

| Embed when | Reference when |
|---|---|
| data is read together ("contains" relationships: order lines, addresses) | data is accessed independently or shared by many parents |
| the child set is **bounded** and small | the child set grows without limit (comments, events, logs) |
| you need atomic updates of parent and children | children change often on their own, or the document would approach 16 MB |

**Denormalization** (copying a customer's name into orders) makes reads faster but writes more expensive: renaming the customer with `updateMany` touched **2** orders in the test,
and the copies can be stale in between. Copy only data that rarely changes, or data that should keep its historical value (the price at the time of the order).

## Common patterns

- **Subset**: keep the latest N items embedded (e.g. 10 recent reviews) and the rest in another collection.
- **Extended reference**: store the ID plus the few fields you always display (customer name), not the whole document.
- **Bucket**: group time series into documents per period (one document per sensor per hour) to limit document count and size; MongoDB also has native **time series collections**.
- **Computed**: store precomputed values (totals, counters) updated on write, when reads vastly outnumber writes.
- **Polymorphic**: different shapes in one collection with a `type` field (products of different kinds).
- Avoid **unbounded arrays** and "massive number of collections" anti-patterns.

## Schema validation

A collection can enforce structure with `$jsonSchema`. Verified: with `required: ['email', 'name']`, inserting a document without `email` failed with "Document failed validation" and
the error details listed the missing property; after switching `validationAction` to `warn`, the same invalid document was inserted (and only a warning is logged). Validation applies to
inserts and updates, so existing invalid documents stay until they're modified (`validationLevel`).

## Sources

- [Data modeling](https://www.mongodb.com/docs/manual/data-modeling/)
- [Embedded data versus references](https://www.mongodb.com/docs/manual/data-modeling/concepts/embedding-vs-references/)
- [Schema design patterns](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/)
- [Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/)
- [$lookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/)

## Questions

### How is schema design in MongoDB different from relational design? {junior}

Relational design normalizes data into tables first and relies on joins at query time. MongoDB design starts from the application's access patterns: data read together is usually stored
together in one document, and duplication is acceptable when it makes important reads cheap. There's still a schema, it's just defined by the application (and optionally enforced with
validation) and can evolve per document.

### When should you embed documents and when should you reference them? {mid}

Embed when the data is read together, belongs to the parent, is bounded in size and needs atomic updates with it (order lines, addresses): one read returns everything. Reference when the
related data is large or unbounded, accessed on its own, shared by many parents, or updated frequently and independently (customers referenced from orders, comments on a popular post).
In a test, an embedded order needed one `findOne`, while the referenced version needed `$lookup`.

### What is the problem with unbounded arrays? {mid}

An array that grows forever (all comments, all events) makes the document keep growing: reads and updates get slower, indexes on the array (multikey) get large, and eventually the document
hits the 16 MB limit and writes fail. Store such items as separate documents referencing the parent, or keep only a bounded subset embedded (subset pattern) or group them in buckets.

### What are the trade-offs of denormalization in MongoDB? {mid}

Duplicating data (e.g. the customer name in each order) avoids joins and makes reads fast, but every change must update all copies: in a test, renaming a customer touched every order that
contained the name, and the copies are inconsistent until the update finishes. Duplicate only fields that rarely change or that should keep a historical value (the product price at order
time), and keep the source of truth in one place.

### How do you join data in MongoDB? {junior}

With the `$lookup` aggregation stage, which performs a left outer join with another collection (and supports pipelines for more complex conditions), or with a second query from the
application. Joins are available but not free, especially across shards, so frequent joins on hot paths are a sign that embedding or an extended reference might fit better.

### What is schema validation in MongoDB? {mid}

A collection option that checks documents against rules, usually a `$jsonSchema` with required fields, types and value constraints. With `validationAction: 'error'` invalid inserts and
updates are rejected ("Document failed validation", with details about the failing rule, in a test); with `'warn'` they're accepted and logged. It gives relational-style guarantees for
critical fields while keeping flexibility.

### What is the bucket pattern? {senior}

Grouping many small related items into one document per range, e.g. one document per sensor per hour containing an array of readings plus precomputed stats. It reduces the number of
documents and index entries and makes range queries efficient. For time series, MongoDB's time series collections apply this bucketing automatically.

### What is the extended reference pattern? {mid}

Storing a reference to another document together with a copy of the few fields that are almost always needed with it, e.g. an order stores `customerId` plus the customer's name and shipping
address. Most reads then need no join, while the full customer stays in its own collection. The copied fields must be chosen so they rarely change or should be frozen at the time of the order.

### How do you evolve a schema in MongoDB? {senior}

Documents can have different shapes, so new fields can be added without a migration, and code must handle both versions for a while. A common approach is a `schemaVersion` field and
migrating documents lazily when they're read or written, or with a background job, then tightening validation and removing old-shape handling. Large changes still need planned migrations
and backward-compatible deployments.

### How do you model a many-to-many relationship in MongoDB? {mid}

Usually with arrays of references on one or both sides, e.g. a student document holds `courseIds` and, if needed, courses hold `studentIds`, choosing the side that stays bounded and matches
the queries. When the relationship has its own data (enrollment date, grade) or is large, use a separate collection of link documents, similar to a junction table, with indexes on both keys.
