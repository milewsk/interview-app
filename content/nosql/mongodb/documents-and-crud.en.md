# Documents and CRUD in MongoDB {junior}

MongoDB is a **document database**: data is stored as **BSON documents** (binary JSON with extra types such as `ObjectId`, `Date`, `Decimal128`) in **collections**, without a
fixed table schema. A document can contain nested objects and arrays, so an order with its lines is one document instead of rows in two tables. Examples here ran on MongoDB 8.0
(`mongo:8.0` image, `mongosh`); the latest release line is 8.3.

## Documents and `_id`

```js
db.products.insertOne({ name: 'Pen', price: 10, tags: ['office', 'blue'], stock: { qty: 5, warehouse: 'A' } })
```

- Every document has a unique `_id`; if you don't provide one, the driver generates an **`ObjectId`**, which embeds a creation timestamp (`getTimestamp()` returned today's date).
- Documents in one collection can have **different shapes**: a `Mug` with a `color` field and no `tags` lived next to products with `tags` and `stock`. Schema validation
  (`$jsonSchema`) can enforce structure when needed.
- A document is limited to **16 MB**: verified, a 15.9 MB document was inserted, a 16.5 MB one was rejected ("BSONObj size ... Size must be between 0 and 16809984(16MB)").

## Queries

| Query | Result in the test |
|---|---|
| `{ price: { $gt: 12 } }` | Notebook, Mug, Lamp |
| `{ 'stock.qty': 0 }` (dot notation into nested documents) | Notebook |
| `{ tags: 'blue' }` (a scalar matches **any array element**) | Pen, Lamp |
| `{ tags: { $in: ['home', 'garden'] } }` | Lamp |
| `{ discontinued: null }` | 4 documents: `null` **or missing**; `{ $exists: true }` found only 1 |
| `{ v: { $gt: 0 } }` on `1`, `'1'`, `2` | 2: comparisons are type-aware, the string didn't match |

**`$elemMatch` gotcha**: for orders with lines `[{sku:'A',qty:1},{sku:'B',qty:5}]` and `[{sku:'A',qty:5}]`, the query `{ 'lines.sku': 'A', 'lines.qty': { $gte: 5 } }`
returned **both** orders, because each condition can be satisfied by a *different* element; `{ lines: { $elemMatch: { sku: 'A', qty: { $gte: 5 } } } }` returned only order 2.

Projections (`{ _id: 0, name: 1 }`) return selected fields; `sort`, `skip` and `limit` page results (`sort({price:-1}).skip(1).limit(2)` returned Lamp:50, Notebook:20).
`countDocuments(filter)` counts exactly; `estimatedDocumentCount()` reads collection metadata and is fast but ignores filters.

## Updates

- Updates use **operators**: `$set`, `$inc`, `$push`, `$pull`, `$unset`... Verified: `{ $inc: { price: 2 }, $push: { tags: 'sale' }, $set: { 'stock.qty': 4 } }` changed only those
  fields. Passing a plain document to `updateOne` failed: "Update document requires atomic operators".
- `replaceOne` replaces the **whole** document: after replacing `Mug` without `color`, the field was gone.
- `upsert: true` inserts when nothing matches (`upsertedCount` 1).
- `findOneAndUpdate(..., { returnDocument: 'after' })` atomically updates and returns the new version, useful for counters and queues.
- `deleteOne`/`deleteMany` remove documents (`deleteMany({ price: { $gte: 100 } })` deleted 1).
- A single-document write is **atomic**, including changes to nested fields and arrays.

## Sources

- [Documents](https://www.mongodb.com/docs/manual/core/document/)
- [MongoDB CRUD operations](https://www.mongodb.com/docs/manual/crud/)
- [Query an array of embedded documents ($elemMatch)](https://www.mongodb.com/docs/manual/tutorial/query-array-of-documents/)
- [Query for null or missing fields](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/)
- [Update operators](https://www.mongodb.com/docs/manual/reference/operator/update/)
- [MongoDB limits and thresholds](https://www.mongodb.com/docs/manual/reference/limits/)

## Questions

### What is a document database? {junior}

A database that stores data as self-describing documents (in MongoDB, BSON) grouped in collections instead of rows in tables with a fixed schema. A document can contain nested objects and
arrays, so data that is used together (an order and its lines, a user and their addresses) can be stored and read as one unit, and documents in the same collection can have different fields.

### What is `_id` and what is an `ObjectId`? {junior}

`_id` is the required primary key of every document, unique within the collection and automatically indexed. If you don't set it, the driver generates an `ObjectId`: a 12-byte value
containing a timestamp, a random value and a counter, so it's unique without coordination and roughly sortable by creation time (in a test, `getTimestamp()` returned the insertion date). You
can use your own values, such as a natural key or a GUID.

### How do you query nested fields and arrays? {junior}

Use dot notation for nested documents (`{ 'stock.qty': 0 }`), and for arrays a scalar condition matches documents where any element equals it (`{ tags: 'blue' }` matched every product that
had "blue" among its tags). Operators such as `$in`, `$all`, `$size` and `$elemMatch` express more specific conditions on arrays.

### When do you need `$elemMatch`? {mid}

When several conditions must hold for the same array element. Without it, each condition may be satisfied by different elements: in a test, `{ 'lines.sku': 'A', 'lines.qty': { $gte: 5 } }`
matched an order whose `A` line had quantity 1 and whose `B` line had quantity 5. `{ lines: { $elemMatch: { sku: 'A', qty: { $gte: 5 } } } }` returned only the order where one line satisfied
both.

### What does `{ field: null }` match? {mid}

Documents where the field is `null` and documents where the field doesn't exist at all: in a test it matched 4 documents, while `{ field: { $exists: true } }` matched only the one that had
the field (set to null). To find only explicit nulls use `{ field: { $type: 'null' } }`, and to find missing fields `{ field: { $exists: false } }`.

### What is the difference between `updateOne` and `replaceOne`? {junior}

`updateOne` applies update operators (`$set`, `$inc`, `$push`...) and changes only the specified fields; passing a plain document is rejected ("Update document requires atomic operators").
`replaceOne` replaces the whole document except `_id`, so fields missing from the replacement are removed: in a test, a `color` field disappeared after `replaceOne`. Use updates for partial
changes to avoid overwriting concurrent modifications of other fields.

### What is an upsert? {junior}

An update with `upsert: true` that inserts a new document when no document matches the filter, combining the filter's equality fields with the update. It's useful for "create or update"
logic, such as counters or synchronizing records by an external key. Concurrent upserts for the same key can create duplicates unless there's a unique index on that key.

### Are writes in MongoDB atomic? {mid}

A write to a single document is atomic, even when it modifies several fields, nested documents and arrays, so embedding related data in one document gives atomic updates without transactions.
Operations that touch multiple documents (`updateMany`, several writes) are atomic per document but not as a whole, unless you use a multi-document transaction.

### What is the maximum document size and what does it imply? {mid}

16 MB of BSON: in a test, a 15.9 MB document was inserted and a 16.5 MB one was rejected with "Size must be between 0 and 16809984(16MB)". The limit prevents unbounded documents, such as an
array that grows with every comment or event. Such data belongs in separate documents; large files go to GridFS or object storage.

### How do `countDocuments` and `estimatedDocumentCount` differ? {mid}

`countDocuments(filter)` runs an aggregation that counts matching documents exactly and can use indexes, but it costs time on large collections. `estimatedDocumentCount()` reads the
collection's metadata, so it's instant but takes no filter and may be inaccurate after unclean shutdowns or in sharded clusters with orphaned documents. Use the estimate for dashboards and the
exact count when correctness matters.
