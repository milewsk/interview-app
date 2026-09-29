# Indexes {mid}

An index is an additional data structure that lets the database find rows **without reading the whole table**, much like the index at the back of a book.
Most performance problems in SQL come down to a missing, unused or poorly designed index, which makes this one of the most important interview topics.

## How a B-tree index works

The default index type in every major database is a **B-tree** (balanced tree): values are kept sorted, and finding a value takes a few page reads
(O(log n)) instead of scanning all rows. Because the data is sorted, a B-tree supports equality (`=`), ranges (`<`, `BETWEEN`), prefix `LIKE 'abc%'`,
`ORDER BY` and `MIN`/`MAX`.

On a 100,000-row table in PostgreSQL:

```sql
SELECT * FROM users WHERE score = 5;               -- no index: Seq Scan, ~14.5 ms
SELECT * FROM users WHERE email = 'user42@x.io';   -- index: Index Scan using ix_email, ~0.9 ms
SELECT id FROM users ORDER BY email LIMIT 10;      -- Index Scan + Limit: no sorting of 100,000 rows
```

**The cost**: every `INSERT`, `UPDATE` of an indexed column and `DELETE` must update every index, and indexes take disk space and memory. Indexes are chosen
based on real queries, and unused ones are removed.

## Clustered vs non-clustered

- A **clustered** index determines the physical order of the table's rows: the table *is* the index (leaf pages contain whole rows), so there's only one.
  In SQL Server the primary key is clustered by default, and in MySQL InnoDB the table is always clustered by its primary key.
- A **non-clustered** (secondary) index contains the key values and a pointer to the row (in SQL Server/InnoDB: the clustered key), so after finding an entry
  the database does a **lookup** into the table.
- PostgreSQL stores tables as unordered heaps, so all indexes are secondary (`CLUSTER` reorders a table once, but doesn't maintain the order).
- A wide or random clustered key (e.g. a random UUID) makes every secondary index larger and causes page splits on inserts.

## Composite indexes and column order

An index on `(country, created_at)` is sorted by `country` first, then by `created_at` within each country, like a phone book sorted by last name, then
first name.

- It supports `WHERE country = ?`, `WHERE country = ? AND created_at >= ?` and `ORDER BY country, created_at`.
- Classically it **doesn't** help a condition only on `created_at` (the **leftmost prefix** rule): SQLite fell back to a full `SCAN` in that case.
  PostgreSQL 18 added **skip scan**, which can use the index anyway when the leading column has few distinct values (in a test: `Index Searches: 6`); SQL
  Server doesn't do this.
- Rule of thumb: put columns used with equality first and the column used for ranges or sorting last.

## When an index can't be used ("sargability")

A condition is *sargable* (search-argument-able) when the database can look it up in the index. These are not:

| Not sargable | Sargable alternative |
|---|---|
| `WHERE lower(email) = 'x'` (Seq Scan) | an expression index `CREATE INDEX ... ON users (lower(email))`, or a case-insensitive collation |
| `WHERE email LIKE '%42@x.io'` | a prefix `LIKE 'user42%'` (used an index range), or a full-text / trigram index |
| `WHERE YEAR(created_at) = 2026` | `WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'` |
| `WHERE id::text = '42'` (implicit or explicit cast of the column) | compare with a value of the column's type |
| `WHERE price * 1.23 > 100` | `WHERE price > 100 / 1.23` |

Functions or casts on the **column** block the index; computations on the **constant** side are fine.

## Selectivity

An index pays off when a condition selects a small fraction of rows. For `status = 'active'` (99% of rows) PostgreSQL chose a Seq Scan even though an index
existed, and for `status = 'banned'` (1%) an Index Scan. Reading most of the table through an index means random access to almost every page, which is
slower than a sequential scan. The optimizer decides based on **statistics**, so outdated statistics lead to bad plans.

## Covering, partial and other indexes

- **Covering index**: contains all columns a query needs, so the table isn't touched at all (PostgreSQL `Index Only Scan`). Extra non-key columns are added
  with `INCLUDE (score)` (PostgreSQL, SQL Server).
- **Partial / filtered index**: indexes only some rows, e.g. `CREATE INDEX ... WHERE status = 'pending'`, smaller and faster for queries on that subset;
  also used for uniqueness among non-deleted rows.
- **Unique index**: enforces uniqueness (created automatically for `PRIMARY KEY` and `UNIQUE`).
- Other types: **hash** (only equality), **GIN** (PostgreSQL: arrays, JSONB, full-text), **GiST** (geometry, ranges), **BRIN** (huge, naturally ordered
  tables such as logs), **columnstore** (SQL Server analytics).

## Sources

- [PostgreSQL: indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL: multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [PostgreSQL 18 release notes (skip scan)](https://www.postgresql.org/docs/release/18.0/)
- [SQL Server: clustered and nonclustered indexes](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/clustered-and-nonclustered-indexes-described)
- [SQLite: query planning](https://www.sqlite.org/queryplanner.html)
- [Use The Index, Luke (Markus Winand)](https://use-the-index-luke.com/)

## Questions

### What is an index, and what does it cost? {junior}

An additional structure (usually a B-tree) that keeps selected column values sorted with pointers to the rows, so the database can find rows without scanning
the whole table: in a test, a lookup by an indexed email took ~0.9 ms versus ~14.5 ms for a full scan. The cost is slower writes (every index must be updated
on `INSERT`, `DELETE` and `UPDATE` of indexed columns), disk space and memory. Indexes should match real queries.

### How does a clustered index differ from a non-clustered one? {mid}

A clustered index defines the physical order of rows: its leaf level contains the whole rows, so a table can have only one (in SQL Server the PK by default,
in MySQL InnoDB always the PK). A non-clustered index is a separate structure with the key values and a reference to the row, which requires an extra lookup to
fetch other columns. PostgreSQL has no maintained clustered indexes: tables are heaps and all indexes are secondary.

### Why does the column order in a composite index matter? {mid}

A composite B-tree is sorted by the first column, then by the second within it, and so on. It's efficient for conditions on a leftmost prefix of its columns:
`(country, created_at)` helps `WHERE country = ?` and `WHERE country = ? AND created_at > ?`, but classically not `WHERE created_at > ?` alone. Equality columns
go first, range or sort columns last. PostgreSQL 18's skip scan relaxes the rule when the leading column has few distinct values.

### Why isn't an index used for `WHERE lower(email) = ?`? {mid}

The index stores `email` values, not `lower(email)`, so the database can't look up the result of a function applied to the column and has to scan the table
(verified: a Seq Scan). Solutions: an expression index on `lower(email)` (after creating it, the plan switched to an Index Scan), a case-insensitive collation or
`citext` type, or storing a normalized value. The same applies to `YEAR(date)`, casts and arithmetic on the column.

### What does "sargable" mean? {mid}

A condition that the database can evaluate by seeking in an index: the indexed column appears alone on one side of a comparison, e.g. `created_at >= '2026-01-01'`.
Wrapping the column in a function, casting it, doing arithmetic on it or using `LIKE` with a leading `%` makes the condition non-sargable, so the index can't be
used for seeking. Rewriting the condition to keep the column bare usually fixes it.

### Why might the database ignore an existing index? {mid}

Because the condition isn't selective enough: when a large part of the table matches (e.g. `status = 'active'` for 99% of rows), reading through the index with
random page access is slower than a sequential scan, so the optimizer chooses the scan. Other reasons: a non-sargable condition, a type mismatch between the column
and the parameter, outdated statistics, or a composite index whose leading column isn't in the condition.

### What is a covering index? {mid}

An index that contains all columns a query reads, so the result is produced from the index alone, without accessing the table (PostgreSQL's `Index Only Scan`,
verified for `INCLUDE (score)`). Non-key columns can be added with `INCLUDE`, which keeps them out of the sort key. It's a powerful optimization for frequent,
narrow queries, at the cost of a larger index.

### What is a partial (filtered) index? {mid}

An index built only on rows matching a condition, e.g. `CREATE INDEX ix_pending ON orders (created_at) WHERE status = 'pending'`. It's smaller and cheaper to
maintain, and serves queries on that subset, e.g. processing a queue of pending orders. A partial unique index enforces uniqueness only among some rows, e.g.
unique emails among non-deleted users (in SQL Server it's called a filtered index).

### Can you have too many indexes? {junior}

Yes. Each index slows every write, because it must be updated, takes disk space and memory (competing with data for the cache), and gives the optimizer more
options to consider. Overlapping indexes (e.g. `(a)` and `(a, b)`) are often redundant. Databases report index usage statistics (e.g. `pg_stat_user_indexes`,
SQL Server's index usage DMVs), and unused indexes should be removed.

### Which index types exist besides B-tree? {senior}

Hash (only equality, in PostgreSQL rarely better than B-tree), GIN (inverted index for arrays, JSONB and full-text search in PostgreSQL), GiST and SP-GiST (geometric
data, ranges, nearest-neighbor), BRIN (tiny block-range summaries for huge tables naturally ordered by a column, such as time-series logs), full-text indexes, and
columnstore indexes in SQL Server for analytical scans. The choice depends on the operators the queries use.
