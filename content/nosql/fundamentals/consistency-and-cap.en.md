# Consistency, CAP and BASE {mid}

Distributed databases replicate data across machines, and networks fail. The **CAP theorem** says that when a **network partition** happens, a system must choose between
**consistency** (every read sees the latest write) and **availability** (every request gets a response). **PACELC** adds that even without partitions there's a trade-off between
**latency** and consistency. These ideas explain why NoSQL systems talk about eventual consistency, quorums and tunable consistency.

## CAP in practice

- **C** in CAP means **linearizability**: the system behaves as if there were one copy of the data. (It's not the "C" of ACID, which means integrity constraints.)
- **A** means every request to a non-failed node gets a non-error response.
- **P**: partitions happen in real networks, so the real choice is what to do **during** one: refuse some requests (CP) or answer with possibly stale data (AP).

Verified with a three-node MongoDB replica set: when the primary lost contact with both secondaries, it **stepped down and rejected writes** (`NotWritablePrimary`) rather than risk
diverging data, a consistency-first choice for writes. Reads from secondaries, on the other hand, trade consistency for availability and latency: right after a majority write, the primary
and a normal secondary returned the new document, while a secondary delayed by 5 seconds returned **"NOT FOUND"**, and 7 seconds later it had the document. That's **eventual consistency**:
replicas converge if writes stop.

Real systems aren't simply "CP" or "AP": most offer settings per operation (MongoDB's write/read concerns and read preferences, Cassandra's consistency levels, DynamoDB's strongly consistent
reads).

## PACELC

"If there's a Partition, choose Availability or Consistency; Else, choose Latency or Consistency." Even in normal operation, waiting for more replicas (majority writes, reading from the
leader, synchronous replication across regions) costs latency. Systems such as Cassandra and DynamoDB default to low latency (PA/EL), while systems like classic single-leader databases with
synchronous replication favour consistency (PC/EC).

## Quorums

With `N` replicas, a write confirmed by `W` of them and a read that consults `R` of them overlap when **`R + W > N`**, so the read sees at least one copy of the latest write (e.g. `N=3`,
`W=2`, `R=2`). Smaller `R`/`W` mean lower latency and higher availability but possible stale reads. MongoDB's `w: 'majority'` with read concern `majority` follows the same majority idea.

## ACID vs BASE

- **ACID** (relational databases, MongoDB transactions): atomic, consistent, isolated, durable transactions.
- **BASE**: Basically Available, Soft state, Eventually consistent: accept temporary inconsistency for availability and scale, and resolve conflicts later (last-write-wins, version vectors,
  CRDTs, application merges).

Stronger models in between: **read-your-writes**, **monotonic reads** and **causal consistency** (MongoDB causally consistent sessions) give useful guarantees without full linearizability.

## Sources

- [CAP theorem (Gilbert and Lynch, "Brewer's conjecture...")](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf)
- [Please stop calling databases CP or AP (Martin Kleppmann)](https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html)
- [Consistency models (Jepsen)](https://jepsen.io/consistency)
- [PACELC (Daniel Abadi)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
- [MongoDB: read isolation, consistency and recency](https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/)

## Questions

### What does the CAP theorem say? {junior}

That a distributed data store can't guarantee all three of consistency (every read returns the latest write), availability (every request receives a non-error response) and partition tolerance
(the system keeps working when messages between nodes are lost) at the same time. Since network partitions can't be ruled out, during a partition a system must choose between staying
consistent (refusing some requests) and staying available (possibly returning stale data).

### Is the "C" in CAP the same as the "C" in ACID? {mid}

No. CAP consistency means linearizability: all clients see operations as if there were one up-to-date copy. ACID consistency means a transaction takes the database from one valid state to
another, respecting constraints and invariants. A system can be ACID on a single node and still offer only eventual consistency across replicas.

### What is eventual consistency? {junior}

A guarantee that if no new writes happen, all replicas eventually return the same value; in the meantime, reads from different replicas may return different, stale values. In a test, a
delayed MongoDB secondary returned "NOT FOUND" for a just-written document while the primary returned it, and a few seconds later the secondary had it too. Applications must tolerate reading
old data or route important reads to the leader.

### Why is calling a database "CP" or "AP" an oversimplification? {senior}

Most databases let you choose consistency per operation and behave differently for reads and writes: MongoDB refuses writes on a minority partition (the primary steps down, as a test showed)
but can serve stale reads from secondaries; Cassandra and DynamoDB offer strong or eventual consistency per request. Also, CAP only describes behavior during partitions and says nothing about
latency in normal operation, which PACELC adds. Describe the guarantees of specific configurations instead of labels.

### What is PACELC? {senior}

An extension of CAP: if there's a Partition (P), a system chooses between Availability and Consistency (A/C); Else (E), in normal operation, it chooses between Latency and Consistency (L/C).
It captures that replicating synchronously to more nodes for stronger consistency costs latency even when nothing fails, which is why systems like Cassandra or DynamoDB default to low latency
and eventual consistency, with stronger options available.

### How do quorums provide consistency? {mid}

With N replicas, if every write must be acknowledged by W replicas and every read queries R replicas, then when R + W > N the read set and write set overlap, so at least one replica in every
read has the latest write (for example N = 3, W = 2, R = 2). Lowering R or W increases speed and availability but allows stale reads. Majority reads and writes in MongoDB follow the same idea.

### What does BASE mean? {mid}

Basically Available, Soft state, Eventually consistent: a design philosophy for distributed systems that prefers availability and scalability over immediate consistency. The system keeps
responding during failures, its state may change without new input as replicas converge, and it becomes consistent over time. It's the counterpart to ACID's strict transactional guarantees.

### How does MongoDB behave during a network partition? {senior}

The side with a majority of voting members keeps or elects a primary and continues accepting writes; a primary on the minority side steps down and rejects writes (in a test, an isolated
primary became non-writable after about 12 seconds and returned `NotWritablePrimary`). Writes acknowledged only by the old primary (`w: 1`) may be rolled back when it rejoins; majority writes
survive. Secondaries on either side can still serve reads if the read preference allows it.

### What is read-your-writes consistency and why does it matter? {mid}

A guarantee that after a client writes something, its subsequent reads see that write. Without it, a user who updates their profile and reloads the page may see old data when the read goes to a
lagging replica (like the delayed secondary in a test). It's achieved by reading from the leader after writes, sticky sessions, or causal consistency (MongoDB causally consistent sessions).

### How do systems resolve conflicting writes in eventually consistent databases? {senior}

With strategies such as last-write-wins based on timestamps (simple but can silently lose updates), version vectors that detect concurrent writes and keep siblings for the application to merge,
CRDTs (data types like counters and sets that merge automatically without conflicts), or application-level merge logic. Single-leader systems like MongoDB avoid most conflicts by accepting
writes only on the primary.
