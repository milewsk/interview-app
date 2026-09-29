# Transactions, write concern and read concern {senior}

MongoDB guarantees **atomicity per document** by default, and supports **multi-document ACID transactions** on replica sets and sharded clusters. Durability and visibility
are tuned per operation with **write concern** (how many nodes must acknowledge a write) and **read concern** (which data a read may return). Understanding these is what
separates "MongoDB loses data" myths from correct configurations. Examples ran on MongoDB 8.0 replica sets (one node, and three nodes for the failure cases).

## Single-document atomicity

A write to one document is atomic, including nested fields and arrays, so a well-designed document often needs no transaction. Operations over many documents are atomic **per
document only**: an `updateMany` that hit a document with a non-numeric `balance` failed midway, and the documents updated before the failure **kept their changes** (A and B were
incremented, C wasn't).

## Multi-document transactions

```js
const session = db.getMongo().startSession();
const accounts = session.getDatabase('bank').accounts;
session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
accounts.updateOne({ _id: 'A' }, { $inc: { balance: -30 } });
accounts.updateOne({ _id: 'B' }, { $inc: { balance: 30 } });
session.commitTransaction();                 // or abortTransaction()
```

Verified:

- while the transaction was open, a reader outside it still saw `A=100 B=0`; after commit it saw `A=70 B=30`;
- `abortTransaction` discarded the change;
- two transactions updating the same document: the second failed immediately with **`WriteConflict`** and the label **`TransientTransactionError`**, which means "retry the whole
  transaction". Drivers' `withTransaction` helpers retry such errors automatically.

Transactions require a replica set or sharded cluster (a standalone server doesn't support them), have a default lifetime limit of **60 seconds** (`transactionLifetimeLimitSeconds`,
verified), and cost more than single-document writes, so use them where invariants span documents, not by default.

## Write concern

| Write concern | Meaning |
|---|---|
| `w: 1` | acknowledged by the primary only |
| `w: 'majority'` (default since 5.0) | acknowledged by a majority of voting members, so it survives failover |
| `w: 0` | fire and forget |
| `j: true` | written to the on-disk journal |

Verified on a three-node set: `w: 'majority'` succeeded with all nodes up and with **one** secondary down; with **two** down it failed with `WriteConcernFailed` ("waiting for replication
timed out") after `wtimeout`. On a one-node set, `w: 2` failed with `UnsatisfiableWriteConcern`. In both cases the write **was still applied on the primary** (the document was
present, and after the secondaries came back it had replicated): a write concern error means "not confirmed", not "rolled back", so retries must be idempotent.

## Read concern and read preference

- **Read concern**: `local` (default: the node's latest data, may be rolled back after failover), `majority` (only majority-committed data), `snapshot` (a consistent point in time,
  used in transactions), `linearizable` (reflects all prior majority writes, for single-document reads).
- **Read preference** chooses the node: `primary` (default), `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest`. Reads from secondaries can return **stale** data.
- **Causal consistency** sessions guarantee "read your own writes" even when reading from secondaries.

## Sources

- [Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Transactions in production (limits)](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- [Write concern](https://www.mongodb.com/docs/manual/reference/write-concern/)
- [Read concern](https://www.mongodb.com/docs/manual/reference/read-concern/)
- [Read preference](https://www.mongodb.com/docs/manual/core/read-preference/)
- [Causal consistency](https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/)

## Questions

### Does MongoDB support transactions? {junior}

Yes. Every single-document write is atomic, and since version 4.0 (replica sets) and 4.2 (sharded clusters) MongoDB supports multi-document ACID transactions with snapshot isolation. In a
test, a transfer between two accounts was invisible to other readers until commit, and an aborted transaction left no changes. They require a replica set or sharded cluster, not a standalone
server.

### When do you need a multi-document transaction in MongoDB? {mid}

When an invariant spans several documents or collections and must hold even if something fails midway: transferring money between accounts, creating an order and reserving stock in another
collection, writing an entity together with an outbox message. If the related data can live in one document, a single atomic update is simpler and faster. Without a transaction, a
multi-document operation can stop halfway: in a test, a failed `updateMany` left earlier documents updated.

### What happens when two transactions modify the same document? {senior}

The second one to write gets a `WriteConflict` error with the `TransientTransactionError` label (verified) and must be aborted and retried as a whole. MongoDB doesn't wait for locks
inside transactions the way many relational databases do, so conflicting transactions fail fast. Drivers' `withTransaction`/callback APIs retry transient errors and unknown commit results
automatically; business code should keep transactions short.

### What is write concern? {mid}

The level of acknowledgment requested for a write: `w: 1` (primary only), `w: 'majority'` (a majority of voting replica set members, the default since MongoDB 5.0), a specific number, `w: 0`
(no acknowledgment), plus `j: true` for journaling and `wtimeout`. Majority writes survive the failure of the primary; `w: 1` writes can be rolled back if the primary fails before
replicating them.

### Does a write concern error mean the write didn't happen? {senior}

No. It means the requested acknowledgment wasn't received in time; the write may already be applied on the primary and may still replicate. In tests, a document written with an unsatisfiable
`w: 2` on a one-node set was present on the primary, and a `w: 'majority'` write that timed out with two nodes down was replicated after they came back. Handle such errors by checking state or
retrying idempotently, not by assuming failure.

### What is read concern? {senior}

It controls the consistency of data a read returns: `local` returns the node's most recent data, which could be rolled back after a failover; `majority` returns only data acknowledged by a
majority and thus durable; `snapshot` gives a consistent point-in-time view (used by transactions); `linearizable` guarantees the read reflects all successful majority writes before it. Stronger
levels add latency.

### What is read preference, and what's the risk of reading from secondaries? {mid}

Read preference decides which replica set members serve reads: `primary` by default, or `secondary`, `secondaryPreferred`, `primaryPreferred`, `nearest`. Reading from secondaries spreads load
or serves users from a nearby region, but secondaries replicate asynchronously, so they may return stale data, and a user might not see their own recent write. Use it for reporting or
tolerant reads, and causal consistency sessions when a user must read their own writes.

### Why might a write acknowledged with `w: 1` be lost? {senior}

With `w: 1` the primary acknowledges before the write reaches other members. If the primary fails right after, a secondary without that write is elected, and when the old primary rejoins it
rolls back writes the new primary doesn't have (saving them to rollback files). `w: 'majority'` avoids this because a majority-acknowledged write is present on any node that can win an election.

### What are the limitations of MongoDB transactions? {senior}

They have a lifetime limit (60 seconds by default, verified via `transactionLifetimeLimitSeconds`), hold resources and increase cache pressure, and very large transactions (possible since 4.2, when a transaction
may span several oplog entries) add replication lag. They're slower than single-document operations and, in sharded clusters, involve two-phase commit across shards. Keep them short,
touch few documents, and design documents so most operations don't need them.

### How do you implement "read your own writes" with replicas? {mid}

Read from the primary (the default), or use a causally consistent session with read concern `majority` and write concern `majority`: the driver passes the operation time of the write, and a
secondary serving the read waits until it has caught up to that point. This lets applications read from secondaries without showing users stale versions of their own changes.
