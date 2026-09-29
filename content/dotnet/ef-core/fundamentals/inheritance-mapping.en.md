# Inheritance mapping: TPH, TPT, TPC {senior}

Relational databases don't have inheritance, so EF Core needs a strategy for mapping a class hierarchy to tables. There are three: **TPH** (table per
hierarchy, the default), **TPT** (table per type) and **TPC** (table per concrete type). The choice affects the schema, integrity constraints and,
above all, the SQL of every query.

```csharp
public abstract class Payment { public int Id { get; set; } public decimal Amount { get; set; } }
public class CardPayment : Payment { public string Last4 { get; set; } = ""; }
public class TransferPayment : Payment { public string Iban { get; set; } = ""; }
```

## TPH: one table for the whole hierarchy (default)

```sql
CREATE TABLE [Payments] (
    [Id] int NOT NULL IDENTITY,
    [Amount] decimal(18,2) NOT NULL,
    [Discriminator] nvarchar(21) NOT NULL,
    [Last4] nvarchar(4) NULL,          -- NULL, even though Last4 is required for a card
    [Iban] nvarchar(34) NULL,
    ...
```

- All types share one table, and the **discriminator** column says which class a row is. It can be configured:
  `HasDiscriminator<string>("PaymentType").HasValue<CardPayment>("card")`.
- Queries are the **fastest**: no joins, `OfType<CardPayment>()` is just `WHERE [Discriminator] = N'CardPayment'`.
- Drawbacks: subtype columns **must be nullable**, so the database can't enforce `NOT NULL` for them. With many subtypes and columns the table is wide
  and sparse.

## TPT: a table per type

```csharp
modelBuilder.Entity<Payment>().UseTptMappingStrategy();
```

- The base table holds shared columns, and each subtype has its own table with a primary key that's also a foreign key to the base table.
- The schema is normalized, and subtype columns can be `NOT NULL`.
- Drawback: **performance**. A query over the base type joins every subtype table (`LEFT JOIN CardPayment ... LEFT JOIN TransferPayment ...` with a `CASE`
  computing the type), and inserting one entity writes to two tables. Microsoft recommends avoiding TPT unless there's a strong reason.

## TPC: a table per concrete type

```csharp
modelBuilder.Entity<Payment>().UseTpcMappingStrategy();
```

- Each concrete type gets a complete table with all columns (shared and its own). The abstract base type has no table.
- Querying a single subtype is as fast as querying a normal table (no joins, no discriminator), and subtype columns can be `NOT NULL`.
- A query over the base type uses `UNION ALL` of all tables.
- Keys must be unique **across all tables**, so a plain `IDENTITY` doesn't work: EF creates a shared **sequence**
  (`DEFAULT (NEXT VALUE FOR [PaymentSequence])`), or you use GUIDs. (Identity columns with a different seed and the same increment per table are possible,
  but adding a type later is hard.)
- Foreign keys to the base type aren't possible, because there's no single table to reference.

## How to choose

| | TPH | TPT | TPC |
|---|---|---|---|
| Tables | 1 | base + one per type | one per concrete type |
| Query on the base type | simplest | joins (slow) | `UNION ALL` |
| Query on one subtype | filter on the discriminator | a join with the base | one table, fastest |
| `NOT NULL` on subtype columns | no | yes | yes |
| Key generation | any | any | sequence / GUID |

The guidance from the EF documentation: **TPH by default**; TPC when you mostly query single leaf types and benchmarks show a gain; TPT "only if
constrained to do so by external factors". Before
mapping inheritance at all, consider whether composition or a single table with a type column would be simpler: deep hierarchies in the database are hard
to evolve.

## Sources

- [Inheritance (EF Core)](https://learn.microsoft.com/en-us/ef/core/modeling/inheritance)
- [Performance: inheritance mapping](https://learn.microsoft.com/en-us/ef/core/performance/modeling-for-performance#inheritance-mapping)

## Questions

### What inheritance mapping strategies does EF Core support? {mid}

Three: TPH (table per hierarchy), where the whole hierarchy is in one table with a discriminator column; TPT (table per type), where each type, including
the abstract base, has its own table joined by the primary key; and TPC (table per concrete type), where each concrete class has a full table with all its
columns. TPH is the default, and the others are enabled with `UseTptMappingStrategy()` or `UseTpcMappingStrategy()`.

### What is a discriminator? {junior}

A column in TPH mapping that stores which class a row represents. By default it's called `Discriminator` and contains the class name, and EF uses it to
materialize the right type and to filter queries on a subtype (`OfType<CardPayment>()` becomes `WHERE [Discriminator] = N'CardPayment'`). Its name, type and
values can be configured with `HasDiscriminator(...).HasValue<T>(...)`.

### What are the drawbacks of TPH? {mid}

Columns specific to subtypes must be nullable, because rows of other types don't have values for them, so the database can't enforce `NOT NULL` or some
check constraints, and validation moves to the application. With many subtypes, the table becomes wide and sparse. On the other hand, queries are simple and
fast, because they don't need joins.

### Why is TPT often the slowest strategy? {mid}

Data for one entity is split between the base table and the subtype table. A query over the base type must `LEFT JOIN` every subtype table and compute the type
with `CASE`, and the number of joins grows with the hierarchy. Inserts and updates also touch several tables. That's why the EF documentation discourages
TPT unless the normalized schema is truly necessary.

### How does TPC handle primary keys, and why? {senior}

In TPC, each concrete type has its own table, but an entity's key must be unique across the whole hierarchy, because EF identifies entities of the base type
by key. `IDENTITY` columns in each table would produce duplicates, so EF uses a database sequence shared by all tables (`DEFAULT NEXT VALUE FOR`) or requires
GUID keys. Another consequence is that another table can't have a foreign key to the base type.

### When would you choose TPC over TPH? {senior}

When queries mostly concern single concrete types, not the whole hierarchy: then TPC reads from one table without a discriminator filter, and its subtype
columns can be `NOT NULL` with proper constraints. Queries over the base type use `UNION ALL`, which gets more expensive as the number of types grows. TPH remains
better when the base type is queried often or when there are relationships pointing to the base type.

### What SQL does EF generate for a query over the base type in each strategy? {senior}

In TPH, a plain `SELECT` from one table. In TPT, a `SELECT` from the base table with a `LEFT JOIN` to each subtype table and a `CASE` expression computing the
discriminator. In TPC, a `UNION ALL` of `SELECT`s from each concrete table, filling missing columns with `NULL` and adding a literal discriminator. That's why
the strategy strongly affects performance of polymorphic queries.

### Can a navigation property point to an abstract base type in TPC? {senior}

Not as a normal database relationship. In TPC there's no base table, so the database has no single table that a foreign key could reference. EF can still
model the relationship, but the database can't enforce referential integrity for it. If relationships to the base type are important, TPH or TPT is a better
fit.

### How do you query only one subtype in EF Core? {junior}

Use `OfType<T>()` on the base `DbSet` (`db.Payments.OfType<CardPayment>()`), or add a separate `DbSet<CardPayment>` to the context. EF translates this to a
discriminator filter in TPH, a join with a `NOT NULL` condition in TPT, or a query to one table in TPC. Type checks inside queries (`p is CardPayment`) are
also translated.

### Should you always map a class hierarchy to the database? {mid}

No. Inheritance in the domain model doesn't have to mean inheritance in the database. Often it's simpler to have one entity with a type column and optional
data in an owned/complex type or a JSON column, or to use composition. Mapping hierarchies adds complexity to queries and migrations, so it's worth it when
subtypes really have different data and behavior and are queried polymorphically.
