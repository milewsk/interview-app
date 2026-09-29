# Normalization and denormalization {mid}

Normalization is organizing tables so that **each fact is stored in exactly one place**. It prevents inconsistent data (anomalies) and is the default for
transactional (OLTP) databases. **Denormalization** deliberately duplicates data to speed up reads, at the cost of keeping the copies consistent.

## Anomalies in an unnormalized table

```sql
CREATE TABLE orders_flat (order_id int PRIMARY KEY, customer_email text, customer_city text, product text, price numeric);
-- 1 | ada@x.io | Krakow | Pen | 2
-- 2 | ada@x.io | Krakow | Ink | 5
-- 3 | bob@x.io | Gdansk | Pen | 2
```

- **Update anomaly**: Ada's city is stored in two rows; updating only one leaves her with two cities (verified: `COUNT(DISTINCT customer_city) = 2`).
- **Delete anomaly**: deleting Bob's only order also deletes the only information about Bob.
- **Insert anomaly**: you can't store a new customer (or product) until they have an order.

## Normal forms

| Form | Rule | Violation example |
|---|---|---|
| **1NF** | atomic values, no repeating groups; each row identified by a key | a `phones` column containing `"123, 456"`, or columns `phone1`, `phone2`, `phone3` |
| **2NF** | 1NF + every non-key column depends on the **whole** key (matters for composite keys) | `order_lines(order_id, product_id, qty, product_name)`: `product_name` depends only on `product_id` |
| **3NF** | 2NF + no **transitive** dependencies: non-key columns depend on the key, and nothing but the key | `orders(id, customer_id, customer_city)`: the city depends on the customer, not the order |
| **BCNF** | every determinant is a candidate key (a stricter 3NF) | rare cases with overlapping candidate keys |

The classic summary of 3NF: every non-key attribute depends on "the key, the whole key, and nothing but the key". In practice, designing to 3NF (or BCNF)
is the goal for OLTP systems; higher forms (4NF, 5NF) deal with multi-valued dependencies and are rarely discussed in interviews.

## The normalized version

```sql
customers  (id PK, email UNIQUE, city)
products   (id PK, name UNIQUE, price)
orders     (id PK, customer_id FK -> customers, created_at)
order_lines(order_id FK -> orders, product_id FK -> products, qty, unit_price, PK (order_id, product_id))
```

A customer's city is now changed in one row and every order sees it. Note `order_lines.unit_price`: it looks like duplication of `products.price`, but it's
a **different fact**, the price at the time of the order. In a test, raising the product price to 3 didn't change the historical line price of 2. Copying
values that must be frozen at a point in time (prices, addresses on invoices, exchange rates) isn't denormalization.

## Denormalization

Intentionally storing redundant data to avoid expensive joins or aggregations:

- counters and totals (`orders_count` on a customer, `total` on an order),
- copied display data (the author's name in a comment),
- read models and reporting tables, materialized views, search indexes,
- data warehouses and analytics (star schema: a fact table plus denormalized dimensions).

The costs: every copy must be kept in sync (in the same transaction, with triggers, or eventually through events), writes get more complex, and bugs cause
inconsistencies. Normalize first, measure, and denormalize specific hot paths when there's a real performance problem.

## Sources

- [Database normalization description (Microsoft)](https://learn.microsoft.com/en-us/office/troubleshoot/access/database-normalization-description)
- [PostgreSQL: constraints (keys that enforce the design)](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [SQL Server: materialized data with indexed views](https://learn.microsoft.com/en-us/sql/relational-databases/views/create-indexed-views)

## Questions

### What is normalization, and why is it done? {junior}

Designing tables so that each fact is stored once, by splitting data into related tables connected with keys. It prevents update, insert and delete
anomalies, i.e. inconsistent copies of the same information, reduces redundancy and makes integrity easier to enforce with constraints. It's the standard
approach for transactional databases.

### What are update, insert and delete anomalies? {junior}

Problems caused by redundancy. An update anomaly: the same fact stored in several rows gets updated in only some of them (a customer ends up with two
addresses). An insert anomaly: you can't store a fact without unrelated data (a customer without an order). A delete anomaly: deleting a row removes other
information too (deleting the last order removes the customer). Normalization eliminates them.

### What does first normal form (1NF) require? {junior}

Atomic values in each column and no repeating groups: no lists in a column (`"123, 456"`) and no numbered columns (`phone1`, `phone2`), which should become rows
in a separate table. Each row must be identifiable by a key. Modern databases with array or JSON types blur this rule, but querying and constraining such data
is harder, so it's used deliberately.

### How do second and third normal forms differ? {mid}

2NF deals with partial dependencies on a composite key: every non-key column must depend on the whole key, e.g. `product_name` in `order_lines(order_id,
product_id)` depends only on `product_id`, so it belongs in `products`. 3NF deals with transitive dependencies: a non-key column mustn't depend on another
non-key column, e.g. `customer_city` in `orders` depends on `customer_id`, so it belongs in `customers`.

### Is storing the product price in the order line a violation of normalization? {mid}

No, if it represents the price at the time of the sale. That's a different fact from the product's current price: when the price changes, historical orders
must keep what the customer actually paid. The same applies to billing addresses on invoices or exchange rates on transactions. Duplication is a problem only
when two columns represent the same fact that should stay in sync.

### What is denormalization, and when is it justified? {mid}

Intentionally storing redundant or precomputed data to speed up reads, e.g. a counter of orders on a customer, a cached total on an order, a reporting table or a
materialized view. It's justified when measurements show that joins or aggregations on a hot path are too expensive, and the team accepts the cost of keeping
copies consistent (in the same transaction, with triggers or asynchronously). It's the norm in data warehouses and read models.

### How do you keep denormalized data consistent? {senior}

Options, from strongest to weakest consistency: update the copy in the same transaction as the source, use a trigger, use a materialized view refreshed by the
database, or propagate changes asynchronously through events or change data capture, accepting eventual consistency. Whatever the mechanism, it helps to have a
way to recompute the copy from the source (a reconciliation job), because bugs in synchronization will happen.

### What is BCNF? {senior}

Boyce–Codd normal form is a stricter version of 3NF: for every functional dependency X → Y, X must be a candidate key. 3NF allows an exception when Y is part
of a candidate key, which can leave anomalies in tables with several overlapping candidate keys. In practice most 3NF designs are also in BCNF, and interviews
mostly expect knowing it exists and that it's "3NF without the exception".

### Why are data warehouses usually denormalized? {mid}

They're optimized for reading and aggregating large amounts of historical data, not for many small concurrent updates. A star schema has a central fact table
(e.g. sales) and denormalized dimension tables (product, customer, date) with descriptive attributes, which means fewer joins in analytical queries, simpler
queries for analysts and better performance of columnar engines. The data is loaded in batches by ETL, so update anomalies are controlled by the loading process.

### How do you model a many-to-many relationship? {junior}

With a junction (associative) table containing foreign keys to both tables, usually with a composite primary key on them, e.g.
`student_courses(student_id, course_id)`. Attributes of the relationship itself (enrollment date, grade) are stored in the junction table. Storing a list of IDs in
one column breaks 1NF and makes joins, constraints and indexing impossible.
