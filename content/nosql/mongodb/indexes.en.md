# Indexes in MongoDB {mid}

MongoDB indexes are **B-trees**, conceptually like relational indexes: without a suitable index a query scans the whole collection (**COLLSCAN**), with one it walks the index
(**IXSCAN**) and fetches only matching documents. `explain('executionStats')` shows which plan was used and how many keys and documents were examined, which is the main
tool for tuning queries. All numbers below come from a collection of 100,000 orders on MongoDB 8.0.

## From COLLSCAN to IXSCAN

| Query / index | Plan | Keys examined | Docs examined | Returned |
|---|---|---|---|---|
| `{ customerId: 42 }`, no index | COLLSCAN | 0 | **100,000** | 20 |
| same, index `{ customerId: 1 }` | IXSCAN → FETCH | 20 | **20** | 20 |
| `{ status: 'paid' }` on index `{ status, createdAt, amount }` | IXSCAN (prefix) | 25,000 | 25,000 | 25,000 |
| `{ createdAt: ... }` on the same index | **COLLSCAN** (not a prefix) | 0 | 100,000 | 58,626 |

A compound index serves queries on its **prefixes** (`status`, `status + createdAt`...), not on later fields alone.

## Compound indexes: the ESR rule

Order fields as **Equality, Sort, Range**. For `find({ status: 'paid', amount: { $gte: 900 } }).sort({ createdAt: 1 })`:

- index `{ status, amount, createdAt }` (E, R, S): plan `IXSCAN → SORT → FETCH`, an **in-memory sort** of 2,500 documents (blocking, and limited in memory);
- index `{ status, createdAt, amount }` (E, S, R): `IXSCAN → FETCH` with **no SORT stage**, because the index already returns documents in `createdAt` order (it examined a few more
  keys, 2,866, but avoided sorting).

## Other index features

- **Covered queries**: `find({ customerId: 42 }, { _id: 0, customerId: 1 })` ran as `PROJECTION_COVERED` with **0 documents examined**: everything came from the index.
- **Multikey indexes**: an index on an array field (`tags`) indexes every element (`isMultiKey: true`).
- **Unique indexes**: inserting a duplicate email failed with `E11000 duplicate key error`.
- **Partial indexes**: `{ amount: 1 }` only for `status: 'cancelled'` answered `status: 'cancelled', amount > 990` by examining 300 keys, and was **152 KB** versus 1.4-1.7 MB for full
  indexes on the collection.
- **Regex**: an anchored, case-sensitive prefix `/^user4/` used the index efficiently (11,112 keys for 11,111 results), while `/user4/i` scanned **all 100,000 index keys**. For
  case-insensitive search use a collation index or a normalized field; for text search, Atlas Search or text indexes.
- **TTL indexes**: with `expireAfterSeconds: 5`, documents with a `Date` in the field disappeared after about 13 s (a background monitor deletes them periodically, so timing isn't
  exact), and a document whose field wasn't a date **never expired**.
- Other types: text, geospatial (`2dsphere`), hashed (for sharding), wildcard, and vector search indexes in Atlas.

Every index speeds up reads but costs memory, disk and write time, so index for real query patterns and remove unused ones (`$indexStats`).

## Sources

- [Indexes](https://www.mongodb.com/docs/manual/indexes/)
- [Compound indexes and the ESR guideline](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/)
- [Explain results](https://www.mongodb.com/docs/manual/reference/explain-results/)
- [Covered queries](https://www.mongodb.com/docs/manual/core/query-optimization/#covered-query)
- [Partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/)
- [TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)

## Questions

### How do you check whether a MongoDB query uses an index? {junior}

Run it with `.explain('executionStats')` and look at the winning plan's stages and the counters: `COLLSCAN` means a full collection scan, `IXSCAN` an index scan; `totalKeysExamined` and
`totalDocsExamined` should be close to `nReturned`. In a test, a query without an index examined 100,000 documents to return 20, and with an index it examined 20. The profiler and slow query
log find such queries in production.

### What is the ESR rule? {mid}

A guideline for ordering fields in a compound index: first fields tested for Equality, then fields used for Sort, then fields used in Range conditions. It lets the index filter by equality,
return documents already sorted, and apply the range within that order. In a test, an index ordered equality-range-sort needed an in-memory `SORT` stage, while the equality-sort-range index
returned sorted results with no sort stage.

### Which queries can use a compound index? {mid}

Queries that filter or sort on a prefix of its fields: an index on `{ status, createdAt, amount }` serves queries on `status`, on `status` and `createdAt`, and on all three. A query only on
`createdAt` can't use it and falls back to a collection scan (as in a test), unless another index exists. Sort direction matters too: the index can be traversed forwards or backwards as a whole.

### What is a covered query? {mid}

A query where the filter and all returned fields are in the index, so MongoDB answers it from the index alone without reading documents: in a test,
`find({ customerId: 42 }, { _id: 0, customerId: 1 })` ran as `PROJECTION_COVERED` with 0 documents examined. `_id` must be excluded from the projection unless it's part of the
index.

### What is a multikey index? {mid}

An index on an array field that contains one entry per array element, so queries matching elements (`{ tags: 't3' }`) can use it; MongoDB marks it automatically (`isMultiKey: true` in a test).
A compound index may include at most one array field, and indexes on large arrays grow quickly, which is another reason to avoid unbounded arrays.

### How do you make a field unique in MongoDB? {junior}

Create a unique index: `createIndex({ email: 1 }, { unique: true })`. Inserting or updating to a duplicate value then fails with `E11000 duplicate key error`, as a test showed. It's also what makes
concurrent upserts safe. A partial unique index can enforce uniqueness only for documents matching a filter, e.g. only active accounts.

### What are partial indexes good for? {senior}

Indexing only the documents that queries actually target, e.g. only `cancelled` orders or only documents where a field exists. The index is smaller and cheaper to maintain: in a test, a partial
index was 152 KB versus 1.4-1.7 MB for full indexes, and it answered the matching query by examining 300 keys. Queries must include the filter condition for the planner to use it.

### Why can a regex query be slow even with an index? {mid}

Only a case-sensitive regex anchored at the start (`/^user4/`) can use the index as a range scan: in a test it examined about as many keys as it returned. An unanchored or case-insensitive regex
(`/user4/i`) must check every index key (100,000 in the test) or every document. Use a collation-aware index or a normalized lowercase field for case-insensitive matching, and a search engine or
Atlas Search for full-text search.

### How do TTL indexes work? {mid}

A TTL index on a date field with `expireAfterSeconds` makes a background task delete documents once that time has passed. The task runs periodically, so deletion isn't immediate (in a test,
documents with a 5-second TTL disappeared after about 13 seconds), and documents whose field isn't a date, or is missing, never expire (verified). Typical uses: sessions, tokens, temporary data
and logs.

### What is the cost of adding indexes? {mid}

Every insert, update and delete must also update each affected index, so write throughput drops as indexes are added; indexes also use disk and, to be fast, RAM for the working set. Unused or
redundant indexes (e.g. `{ a }` when `{ a, b }` exists) should be removed; `$indexStats` shows how often each index is used. Index for the most important and frequent queries, verified with
`explain`.
