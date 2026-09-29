# Redis and key-value stores {mid}

**Key-value stores** map a key to a value and do little else, which makes them extremely fast. **Redis** is the most popular one: an in-memory store with rich data structures
(strings, hashes, lists, sets, sorted sets, streams), expirations and atomic operations. It's used as a **cache**, session store, rate limiter, lock service, leaderboard,
queue or pub/sub bus next to a primary database. Examples ran on Redis 8.10 in Docker.

## Data structures (verified)

| Structure | Commands | Result | Typical use |
|---|---|---|---|
| String | `SET session:1 alice EX 60`, `GET`, `TTL` | `alice`, TTL 59 s | cache entries, sessions |
| Counter | 5 concurrent `INCR counter` | **5** (atomic) | rate limits, counters |
| Hash | `HSET user:1 name Ann email ann@x.pl` | field-value pairs | objects |
| List | `RPUSH jobs j1 j2 j3`, `LPOP jobs` | `j1`, 2 left | simple queues |
| Set | `SINTER tags:a tags:b` | `y z` | unique members, intersections |
| Sorted set | `ZADD board ...`, `ZREVRANGE board 0 1` | `bob 300, cid 200` | leaderboards, priority |
| Stream | `XADD`, `XREADGROUP` | read by a consumer group, 1 pending until `XACK` | durable event log with consumer groups |

Commands are executed one at a time on the server, so each command is **atomic**; multi-step logic uses `MULTI/EXEC` transactions or Lua scripts.

## Locks and idempotency

`SET lock:order:7 worker-A NX EX 30` returned `OK` for the first worker and nothing for the second, and the owner stayed `worker-A`: a simple lease lock with automatic expiry. The value
should be a unique token checked before release, and the TTL must exceed the work; a paused process can still outlive its lock, so correctness-critical cases need fencing tokens or a
database constraint rather than a Redis lock alone.

## Memory and eviction

Redis keeps data in RAM, limited by `maxmemory`. The default policy was **`noeviction`**: with a 2 MB limit, writes failed at the 21st 10 KB value with "OOM command not allowed when used
memory > 'maxmemory'". With **`allkeys-lru`**, writing 400 values kept 20 and evicted the rest. Caches use an LRU/LFU policy; data that must not disappear needs `noeviction` and capacity
planning. Persistence is optional: the container had RDB snapshots configured (`save 3600 1 300 100 60 10000`) and AOF off (`appendonly no`); a pure cache can run without either.

## Caching patterns

- **Cache-aside**: read from the cache, on a miss load from the database and store with a TTL; on writes update the database and **delete** the cache key.
- Watch out for **stale data** (TTL and invalidation), **cache stampede** (many requests rebuilding the same key: use locking, request coalescing or early refresh) and caching of
  null results. In .NET, `IDistributedCache` and `HybridCache` provide a local + Redis two-level cache with stampede protection.

## Licensing

Redis changed licenses in 2024: 7.4 was source-available only (RSALv2/SSPLv1), which led to the **Valkey** fork (BSD, Linux Foundation). Redis 8 added **AGPLv3** as a third option, so it is
again available under an OSI-approved license. Managed services (Azure Managed Redis, ElastiCache/MemoryDB with Valkey) are common in production.

## Sources

- [Redis data types](https://redis.io/docs/latest/develop/data-types/)
- [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Distributed locks with Redis](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [Redis licenses](https://redis.io/legal/licenses/)
- [HybridCache in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid)

## Questions

### What is Redis and what is it used for? {junior}

An in-memory key-value data store with data structures such as strings, hashes, lists, sets, sorted sets and streams, plus expirations and atomic commands. Because data lives in RAM,
operations take microseconds, so it's used next to a primary database as a cache, session store, rate limiter, distributed lock, leaderboard, queue or message bus rather than as the system of
record.

### Why are Redis commands atomic? {mid}

The server executes commands one at a time on its main thread, so a single command like `INCR` can't interleave with another: five concurrent increments produced exactly 5 in a test. For
multi-step operations, `MULTI/EXEC` runs a batch without interleaving (optionally with `WATCH` for optimistic checks), and Lua scripts or functions run atomically on the server.

### What is the cache-aside pattern? {junior}

The application checks the cache first; on a hit it returns the cached value, and on a miss it loads from the database, stores the result in the cache with a TTL and returns it. On updates it
writes to the database and invalidates (deletes) the cache entry so the next read reloads it. It's simple and keeps the database the source of truth, at the cost of occasional stale reads and
misses after invalidation.

### What is a cache stampede and how do you prevent it? {senior}

When a popular key expires, many concurrent requests miss at once and all rebuild it, overloading the database. Prevention: let only one request rebuild (a lock or in-process request
coalescing, as `HybridCache` does), refresh entries before expiry, add random jitter to TTLs so keys don't expire together, and serve slightly stale data while refreshing.

### How do you implement a simple distributed lock with Redis, and what are its limits? {senior}

`SET lock:key <unique-token> NX EX <seconds>` acquires the lock only if the key doesn't exist and expires it automatically (in a test, the second worker got nothing and the first stayed the
owner); release by deleting the key only if it still holds your token (atomically, with a script). Limits: if the holder pauses longer than the TTL, another process can acquire the lock while
the first still works, and failover can lose the key. For correctness-critical operations use fencing tokens or database constraints.

### What happens when Redis runs out of memory? {mid}

It depends on `maxmemory-policy`. With the default `noeviction`, write commands fail with "OOM command not allowed when used memory > 'maxmemory'" (verified at a 2 MB limit), while reads still
work. With `allkeys-lru`, `allkeys-lfu`, `volatile-*` or `allkeys-random`, Redis evicts keys to make room: in a test with `allkeys-lru`, 20 of 400 values remained. Caches should use an eviction
policy; stores holding essential data need enough memory and `noeviction`.

### Does Redis persist data? {mid}

Optionally. RDB snapshots write the dataset to disk periodically (the default configuration in the test was `save 3600 1 300 100 60 10000`), and the append-only file (AOF, off by default)
logs every write for better durability at some performance cost. Replication and managed services add high availability. Pure caches can disable persistence, since the data can be rebuilt.

### When would you use a Redis stream instead of a list or pub/sub? {senior}

Pub/sub delivers messages only to currently connected subscribers and keeps nothing. A list can act as a simple queue but has no consumer groups or acknowledgments. Streams are an append-only
log with IDs, consumer groups, per-consumer pending lists and `XACK`, so messages survive consumer crashes and can be reprocessed (in a test, a read message stayed pending until acknowledged).
For large-scale durable messaging, a dedicated broker is still often preferable.

### What changed in Redis licensing, and what is Valkey? {mid}

In 2024 Redis moved from BSD to the source-available RSALv2/SSPLv1 dual license (7.4), which aren't OSI-approved, and the community forked the last BSD version as Valkey under the Linux
Foundation, adopted by several cloud providers. With Redis 8, AGPLv3 was added as a third license option. Teams choose between Redis, Valkey and managed services based on licensing, features and
provider support.

### Which Redis data structure fits a leaderboard, and why? {junior}

A sorted set: each member has a score, and Redis keeps members ordered by score, so `ZADD` updates a player's score and `ZREVRANGE board 0 9 WITHSCORES` returns the top ten in logarithmic time
(in a test, the top two came back as `bob 300, cid 200`). `ZRANK`/`ZREVRANK` return a player's position without scanning everyone.
