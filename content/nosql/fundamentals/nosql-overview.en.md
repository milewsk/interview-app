# NoSQL databases: types and when to use them {junior}

**NoSQL** ("not only SQL") covers databases that don't use the relational table model as their primary abstraction. They trade some relational features (joins, fixed schemas,
sometimes multi-record transactions) for flexible data models, horizontal scaling and high availability. The interview question is rarely "what is MongoDB", and usually "which
kind of database fits this problem, and why not PostgreSQL?".

## Main families

| Type | Data model | Examples | Good for |
|---|---|---|---|
| **Document** | JSON-like documents with nested objects and arrays | MongoDB, Couchbase, Azure Cosmos DB, Firestore | aggregates read and written as a whole: catalogs, profiles, content |
| **Key-value** | a value (often opaque) per key | Redis, Valkey, DynamoDB, etcd | caching, sessions, counters, very high throughput lookups by key |
| **Wide-column** | rows with dynamic columns grouped in partitions | Cassandra, ScyllaDB, HBase, Bigtable | huge write volumes, time series, multi-region, known query patterns |
| **Graph** | nodes and relationships with properties | Neo4j, Amazon Neptune | highly connected data: social networks, recommendations, fraud rings |
| **Search** | inverted indexes over documents | Elasticsearch, OpenSearch | full-text search, logs, faceted filtering |
| **Time series / vector** | timestamped points / embeddings | InfluxDB, TimescaleDB; vector indexes in many databases | metrics and IoT; semantic search and RAG |

## Relational vs NoSQL

- **Schema**: relational schemas are defined up front and enforced; document databases let the application define structure (optionally validated), which suits evolving or heterogeneous
  data but moves discipline into code.
- **Relationships**: relational databases excel at joins and ad-hoc queries across entities; NoSQL models are designed **around access patterns** (embed data read together, duplicate to avoid
  joins), which makes known queries fast and unknown ones harder.
- **Consistency and transactions**: relational databases default to ACID transactions; many NoSQL systems default to single-record atomicity and tunable or eventual consistency (MongoDB also has
  multi-document transactions).
- **Scaling**: many NoSQL systems were built to scale horizontally (sharding, partitioning) and replicate across regions; relational databases scale up and use read replicas, with sharding
  available but harder.

The boundary is blurry: PostgreSQL stores and indexes JSON documents. Verified on PostgreSQL 18: a containment query `doc @> '{"tags":["sale"]}'` over 50,000 JSONB rows ran as a sequential
scan, and after `CREATE INDEX ... USING gin (doc jsonb_path_ops)` as a **Bitmap Index Scan** on the GIN index, returning 5,000 rows. A relational database with JSON columns is often enough
for "some flexible fields".

## Choosing

Start from the data and access patterns: strongly related data with complex queries and transactions favours a relational database; self-contained aggregates with a flexible shape and high
read/write volume favour a document store; key lookups with extreme speed favour a key-value store; massive writes with predictable queries favour wide-column; relationship traversal favours a
graph database. **Polyglot persistence** (several stores in one system, e.g. PostgreSQL + Redis + Elasticsearch) is common, but each store adds operational cost.

## Sources

- [NoSQL databases explained (MongoDB)](https://www.mongodb.com/resources/basics/databases/nosql-explained)
- [What is NoSQL? (AWS)](https://aws.amazon.com/nosql/)
- [NoSQL definition (Martin Fowler)](https://martinfowler.com/bliki/NosqlDefinition.html)
- [Polyglot persistence (Martin Fowler)](https://martinfowler.com/bliki/PolyglotPersistence.html)
- [PostgreSQL: JSON types and indexing](https://www.postgresql.org/docs/current/datatype-json.html)

## Questions

### What is NoSQL? {junior}

A broad term for databases that don't use the relational model of tables, rows and SQL joins as their main abstraction: document, key-value, wide-column and graph databases, among others. They
typically offer flexible schemas, data models closer to application objects, and built-in horizontal scaling and replication, trading away some relational features such as arbitrary joins or,
in some systems, multi-record transactions.

### What are the main types of NoSQL databases? {junior}

Document databases (MongoDB, Couchbase, Cosmos DB) store JSON-like documents; key-value stores (Redis, DynamoDB) map keys to values; wide-column stores (Cassandra, HBase) store rows with
dynamic columns in partitions designed for huge write volumes; graph databases (Neo4j, Neptune) store nodes and relationships for traversal queries. Search engines, time series and vector
databases are related specialized stores.

### When would you choose a document database over a relational one? {mid}

When data naturally forms self-contained aggregates that are read and written together (a product with variants, a user profile, a CMS page), when the structure varies between records or
evolves quickly, and when you need easy horizontal scaling. A relational database remains the better default when data is highly relational, requires complex ad-hoc queries and reporting, or
depends on multi-entity transactions and constraints.

### What is a wide-column store, and what is it good for? {mid}

A database like Cassandra or ScyllaDB where data is grouped by a partition key and sorted by clustering columns within a partition, distributed across many nodes without a single leader. It
handles very high write throughput and multi-region replication with tunable consistency. Tables are designed per query ("query-first" modeling, often duplicating data per access pattern),
because arbitrary joins and ad-hoc filters aren't supported efficiently.

### When is a graph database a good choice? {mid}

When the questions are about relationships and paths: friends of friends, recommendations based on shared behaviour, fraud detection across linked accounts, network or dependency analysis. Graph
databases store relationships as first-class records, so traversing many hops is efficient, whereas in SQL each hop is another join that gets expensive and hard to express for variable-length
paths.

### Can PostgreSQL replace a document database? {mid}

Often, for moderate needs: JSONB columns store documents, operators query into them, and GIN indexes make containment queries fast; in a test, a JSONB containment query over 50,000 rows switched
from a sequential scan to a GIN index scan after the index was created. You keep transactions, joins and constraints alongside the flexible data. Dedicated document databases still offer a
more natural document API, built-in sharding and replica set failover.

### What is polyglot persistence? {mid}

Using different storage technologies for different needs within one system: e.g. PostgreSQL for orders, Redis for caching and sessions, Elasticsearch for product search, a graph database for
recommendations. Each store fits its workload, but every addition brings operational cost, data synchronization problems (often solved with events or change data capture) and more skills needed
by the team.

### What do NoSQL databases give up compared to relational databases? {mid}

Depending on the system: ad-hoc joins across entities, enforced schemas and foreign keys, multi-record ACID transactions, and strong consistency by default. In exchange they offer flexible
schemas, horizontal scaling, high availability and data models tuned for specific access patterns. Many modern NoSQL databases have added transactions and schema validation, and many relational
databases added JSON, so the differences are narrower than they used to be.

### What is "query-first" data modeling? {senior}

Designing the storage structure from the queries the application will run, rather than from the entities and their normalized relationships. It's essential in wide-column stores like Cassandra,
where each table serves specific queries and data is duplicated across tables, and it's the default mindset in document databases (embed what's read together). It makes known queries very fast
but makes new, unanticipated queries harder, sometimes requiring new tables or indexes and data backfills.

### How would you choose a database for a new service? {senior}

Start from the data shape and access patterns: relationships and query flexibility, consistency and transaction needs, read/write volumes and latency targets, growth and geographic distribution,
and operational constraints (managed services available, team experience, cost). Prefer a well-known relational database unless a specific requirement (flexible documents at scale, extreme key
lookups, massive writes, graph traversal, full-text search) clearly points elsewhere, and add specialized stores only when they solve a measured problem.
