# Replication and sharding {senior}

MongoDB scales and survives failures with two mechanisms. **Replication** (replica sets) keeps copies of the data on several nodes for **high availability** and read scaling.
**Sharding** splits a collection across several replica sets for **horizontal scaling** of data size and write throughput. The replication behaviour below was tested on a
three-node MongoDB 8.0 replica set in Docker Compose; sharding is described from the documentation.

## Replica sets

A replica set has one **primary** that accepts writes and **secondaries** that copy its **oplog** (an ordered log of operations) and apply it. Verified:

- after `rs.initiate` with three members, the status was `m1 PRIMARY, m2 SECONDARY, m3 SECONDARY`, and an insert appeared in `local.oplog.rs` as an entry with `op: "i"` and the
  document;
- `w: 'majority'` writes succeeded with one secondary stopped; with **both** secondaries stopped they timed out, and after about 12 s the isolated primary **stepped down**
  (`isWritablePrimary: false`) and rejected even `w: 1` writes with `NotWritablePrimary`: a node that can't see a majority must not accept writes, which prevents split brain;
- after the primary was killed, a secondary was **elected** primary in about **10 s**, matching the default `electionTimeoutMillis` of 10,000 ms (heartbeats every 2 s). All
  majority-acknowledged documents were still there.

Drivers connect with the replica set name in the connection string (`mongodb://m1,m2,m3/?replicaSet=rs`), discover the topology and redirect writes to the new primary; **retryable
writes** retry a write once after a failover. An odd number of voting members (3, 5) is used so a majority can always be formed; an **arbiter** votes but holds no data (generally
discouraged). Secondaries can be **hidden** or **delayed** for backups and reporting.

## Sharding

A sharded cluster has **shards** (each a replica set), **mongos** routers that clients connect to, and **config servers** (a replica set holding metadata; in MongoDB 8.0 it can also be a
config shard storing data).

- The **shard key** (one or more fields) decides where each document lives. Data is split into **chunks** (ranges of key values) that the **balancer** moves between shards.
- **Ranged** sharding keeps nearby key values together (good for range queries); **hashed** sharding spreads values evenly (good for writes, poor for range queries).
- A good shard key has **high cardinality**, **low frequency** of any single value, and is **not monotonically increasing**: with a monotonically increasing key (timestamp, `ObjectId`)
  all inserts go to the chunk with the upper bound, making one shard the write bottleneck; hashed sharding avoids that.
- Queries that include the shard key (or its prefix) are **targeted** to specific shards; others are **scatter-gather** (broadcast to all shards).
- Since 5.0 a collection can be **resharded** with a new key, and a key can be **refined** by adding suffix fields.

Shard only when a single replica set can't handle the data size or write load; sharding adds operational complexity and makes joins, transactions and unique constraints more expensive.

## Sources

- [Replication](https://www.mongodb.com/docs/manual/replication/)
- [Replica set elections](https://www.mongodb.com/docs/manual/core/replica-set-elections/)
- [Replica set oplog](https://www.mongodb.com/docs/manual/core/replica-set-oplog/)
- [Sharding](https://www.mongodb.com/docs/manual/sharding/)
- [Choose a shard key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)
- [Retryable writes](https://www.mongodb.com/docs/manual/core/retryable-writes/)

## Questions

### What is a replica set? {junior}

A group of MongoDB servers holding the same data: one primary receives all writes and records them in its oplog, and secondaries replicate the oplog asynchronously. If the primary fails, the
remaining members elect a new primary automatically. It provides high availability, data redundancy and the option to read from secondaries; transactions also require it.

### What happens when the primary fails? {mid}

Secondaries stop receiving heartbeats, and after the election timeout (10 seconds by default) an eligible secondary calls an election; the member with the most recent data that gets votes from
a majority becomes primary. In a test with three nodes, a new primary was elected about 10 seconds after the old one was killed, and all majority-acknowledged data was present. Drivers
rediscover the topology and retryable writes retry the interrupted operation.

### Why does a replica set need a majority, and why use an odd number of members? {mid}

A primary must be elected by, and stay in contact with, a majority of voting members; otherwise two partitions could both accept writes (split brain). In a test, a primary cut off from both
secondaries stepped down and rejected writes with `NotWritablePrimary`. With an odd number of members (3, 5), a partition always leaves one side with a majority; with 2 or 4 members a tie
leaves no primary.

### What is the oplog? {mid}

The operations log: a special capped collection (`local.oplog.rs`) where the primary records every change as an idempotent operation, e.g. an insert as `op: "i"` with the document (seen in a
test). Secondaries tail it and apply the entries to replicate. Its size determines how long a secondary can be offline and still catch up; if it falls behind the oldest entry, it needs a full
resync. Change streams are also built on it.

### What is the difference between replication and sharding? {junior}

Replication copies the same data to several nodes for availability and read scaling; each node holds all the data. Sharding partitions the data across several replica sets so each holds only
part of it, which scales storage and write throughput beyond one machine. Production sharded clusters use both: every shard is a replica set.

### How do you choose a shard key? {senior}

Pick fields that are part of most queries (so they can be targeted), have high cardinality and an even distribution of values, and don't increase monotonically. A monotonically increasing key
such as a timestamp sends all inserts to the last chunk, overloading one shard; hashing it spreads writes but makes range queries scatter-gather. A compound key (e.g. `{ tenantId, orderId }`)
often balances locality and distribution. Resharding is possible since 5.0 but costly.

### What are targeted and scatter-gather queries? {mid}

When a query includes the shard key (or a prefix of a compound shard key), `mongos` sends it only to the shards whose chunks can contain matching documents: a targeted query. Without the shard
key it must broadcast the query to every shard and merge the results (scatter-gather), which gets slower as shards are added. Choosing a shard key that matches the most frequent queries keeps
most operations targeted.

### What are the components of a sharded cluster? {mid}

Shards, each a replica set holding a subset of the data; `mongos` routers, which applications connect to and which route operations using the cluster metadata; and config servers, a replica set
storing that metadata (in 8.0 it can double as a config shard with data). The balancer migrates chunks between shards to keep data evenly distributed.

### What are retryable writes? {senior}

A driver feature (on by default) that automatically retries certain write operations once if they fail because of a network error or a primary failover, using a transaction number so the server
applies the write only once even if the first attempt succeeded. It covers single-document writes and some bulk operations, but not multi-document `updateMany`/`deleteMany`, which aren't
idempotent in general.

### When should you shard a MongoDB deployment? {senior}

When a single replica set can no longer handle the data volume (storage, working set larger than RAM) or the write throughput, after optimizing indexes, queries and hardware. Sharding adds
components to operate, makes cross-shard queries, transactions and unique indexes more expensive, and depends on a good shard key that's hard to change. Many applications run on a single
replica set for a long time.
