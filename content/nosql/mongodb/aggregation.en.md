# The aggregation pipeline {mid}

The **aggregation pipeline** is MongoDB's way to transform and analyze data on the server: documents flow through **stages** (`$match`, `$group`, `$sort`, `$project`,
`$lookup`...), each producing input for the next. It covers what SQL does with `WHERE`, `GROUP BY`, `JOIN`, window functions and `INSERT ... SELECT`. All results below come
from 100,000 orders on MongoDB 8.0.

## A typical pipeline

```js
db.orders.aggregate([
  { $match: { status: 'paid' } },                                    // filter first (can use an index)
  { $group: { _id: '$customerId', total: { $sum: '$amount' }, orders: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 3 }
])
```

This returned the top three customers by paid total in 54 ms.

## Stages worth knowing (verified)

- **`$match` early**: a pipeline starting with `$match { customerId: 42 }` ran as `IXSCAN → FETCH`. Even with `$addFields` first, the optimizer moved the `$match` before it and used
  the index; still, write filters first rather than relying on reordering.
- **`$unwind`** turns array elements into separate documents (counting tags gave 24,286 per tag).
- **`$lookup`** joins another collection (an order got its customer name `Ann`).
- **`$facet`** runs several sub-pipelines on the same input: counts per status (25,000 each) and average/maximum amount (499.5 / 999) in one query.
- **`$bucket`** groups by ranges (`[0, 250)`: 25,000, `[250, 500)`: 25,000, `[500, 1000)`: 50,000).
- **Date grouping**: `$dateToString` by month gave revenue per month (`2026-01`: 4,238,825).
- **`$setWindowFields`** computes window functions like running totals (554, 1108, 1662).
- **`$merge`/`$out`** write results to a collection (`$merge` wrote 4 summary documents), useful for materialized views and reports.

## Limits and performance

- Each stage has a **100 MB memory limit** for blocking operations like `$sort` and `$group`. Verified: sorting about 156 MB of documents with `allowDiskUse: false` failed with
  `QueryExceededMemoryLimitNoDiskUseAllowed` ("Sort exceeded memory limit of 104857600 bytes"); with default options it succeeded in 404 ms, because since MongoDB 6.0
  `allowDiskUseByDefault` is `true` (verified) and the stage spills to temporary files.
- The optimizer projects only needed fields: the same sort followed by a `$count` needed only the sort key and stayed under the limit even with `allowDiskUse: false`.
- Results are returned through a cursor, but a single output document is still limited to 16 MB (for example `$push` of a whole group into one array).

## Sources

- [Aggregation operations](https://www.mongodb.com/docs/manual/aggregation/)
- [Aggregation pipeline stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/)
- [Aggregation pipeline optimization](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/)
- [Aggregation pipeline limits](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-limits/)
- [SQL to aggregation mapping chart](https://www.mongodb.com/docs/manual/reference/sql-aggregation-comparison/)

## Questions

### What is the aggregation pipeline? {junior}

A sequence of stages that process documents on the server, where the output of one stage is the input of the next: filtering (`$match`), reshaping (`$project`, `$addFields`), grouping
(`$group`), sorting, joining (`$lookup`), unwinding arrays and writing results (`$merge`, `$out`). It's MongoDB's equivalent of SQL's `WHERE`, `GROUP BY`, `JOIN` and window functions.

### Why should `$match` come as early as possible? {junior}

A `$match` at the start of the pipeline can use indexes and reduces the number of documents every later stage must process; in a test, a leading `$match` ran as an index scan. The
optimizer can move some `$match` stages earlier automatically (it did so past an `$addFields`), but not across stages that change the matched fields, so writing filters first is the reliable
approach.

### How do you do a SQL `GROUP BY` in MongoDB? {junior}

With `$group`, where `_id` is the grouping key (a field, an expression or an object of several fields) and the other fields use accumulators such as `$sum`, `$avg`, `$min`, `$max`, `$push`,
`$first`: `{ $group: { _id: '$customerId', total: { $sum: '$amount' }, orders: { $sum: 1 } } }`. A `$match` after `$group` acts like `HAVING`.

### What does `$unwind` do and what should you watch out for? {mid}

It outputs one document per element of an array field, so array elements can be grouped, filtered or joined individually (e.g. counting orders per tag). It multiplies the number of documents,
which costs memory and time on large arrays, and by default drops documents with missing or empty arrays unless `preserveNullAndEmptyArrays: true` is set.

### How do you join collections in an aggregation? {mid}

With `$lookup`, which adds an array of matching documents from another collection (a left outer join), either by `localField`/`foreignField` equality or with a sub-pipeline for complex
conditions; `$unwind` or `$first` then flattens it. In a test, an order got its customer's name this way. The foreign field should be indexed, and joins on hot paths may indicate that
embedding or an extended reference fits better.

### What memory limits apply to aggregations? {senior}

Blocking stages such as `$sort` and `$group` may use 100 MB of RAM each. Beyond that they must spill to disk: in a test, sorting about 156 MB of documents failed with
`QueryExceededMemoryLimitNoDiskUseAllowed` when `allowDiskUse` was false, and succeeded with defaults because `allowDiskUseByDefault` is true since MongoDB 6.0. Spilling is slower, so large
sorts should be served by indexes or reduced early with `$match` and `$project`.

### What are `$facet` and `$bucket` used for? {mid}

`$facet` runs several independent sub-pipelines on the same input and returns their results in one document, which suits search pages with multiple facets (counts per category, price ranges,
statistics) computed in one query. `$bucket` groups documents into ranges defined by boundaries (e.g. price bands), and `$bucketAuto` picks the boundaries automatically.

### How do you compute running totals or rankings? {senior}

With `$setWindowFields`, MongoDB's window functions: it partitions and sorts documents and computes values over a window, such as a running sum with
`window: { documents: ['unbounded', 'current'] }` (in a test: 554, 1108, 1662), moving averages, `$rank` or `$denseRank`, without collapsing documents like `$group` does.

### What is the difference between `$out` and `$merge`? {mid}

Both write pipeline results to a collection. `$out` replaces the entire target collection with the results. `$merge` merges them into an existing collection: for each result it can insert,
replace, update (merge fields) or keep existing documents based on a key, so it can incrementally maintain materialized views or summary collections (in a test it wrote per-status counts into
a summary collection).

### When would you use aggregation instead of processing data in the application? {mid}

When the computation reduces a large amount of data to a smaller result (sums, counts, top N, reports): doing it on the server avoids transferring all documents and uses indexes. Processing in
the application is fine for small result sets or complex business logic that doesn't fit the pipeline. For heavy analytics on operational data, consider `$merge`-based summaries, a secondary
node for reads, or a separate analytics store.
