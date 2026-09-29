# Keys, constraints and data types {mid}

Constraints are rules the database enforces for **every** write, regardless of which application or script makes it. They're the last line of defense
for data integrity: validation in the application can be bypassed, a constraint can't. Choosing appropriate data types belongs to the same topic.

## Keys

- **Primary key (PK)**: uniquely identifies a row; implies `NOT NULL` and `UNIQUE`, and the database creates an index for it (in SQL Server by default a
  clustered one).
- **Candidate / natural key**: another unique attribute from the domain (email, ISBN, tax number), protected with a `UNIQUE` constraint.
- **Surrogate key**: an artificial identifier with no business meaning (`int`/`bigint` identity, UUID). It never changes, is compact and simple to reference,
  so it's the usual choice for the PK, while natural keys get `UNIQUE` constraints.
- **Composite key**: several columns together, typical for junction tables (`PRIMARY KEY (order_id, product_id)`).
- **Foreign key (FK)**: a column (or columns) that must match a key in another table, or be `NULL`.

## Generating keys

| Database | Auto-incrementing key |
|---|---|
| PostgreSQL | `id int GENERATED ALWAYS AS IDENTITY` (standard; `serial` is the older form) |
| SQL Server | `id int IDENTITY(1,1)`, or a `SEQUENCE` |
| MySQL | `id int AUTO_INCREMENT` |
| SQLite | `id INTEGER PRIMARY KEY` (an alias for the rowid) |

`GENERATED ALWAYS` rejects explicitly provided values (`cannot insert a non-DEFAULT value into column "id"`), while `BY DEFAULT` allows them. Identity values
can have **gaps** (rolled-back transactions, cached values), so they must never be used as a gapless sequence such as invoice numbers. **UUIDs** allow
generating keys in the application and across systems, but random UUIDs (v4) fragment B-tree indexes; time-ordered UUIDs (v7) avoid that.

## Foreign key actions

```sql
CREATE TABLE orders (
    id          int PRIMARY KEY,
    customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    total       numeric(12,2) NOT NULL CHECK (total >= 0)
);
```

| `ON DELETE` | When the parent is deleted |
|---|---|
| `NO ACTION` / `RESTRICT` (default) | the delete fails while children exist |
| `CASCADE` | children are deleted too |
| `SET NULL` | the FK in children is set to `NULL` |
| `SET DEFAULT` | the FK is set to its default value |

Cascades are convenient for data that belongs strictly to the parent (order lines of an order), but dangerous for data with its own meaning (invoices), where
`RESTRICT` plus soft delete is safer.

**Foreign keys aren't indexed automatically** in PostgreSQL and SQL Server (only PKs and `UNIQUE` constraints get indexes; in a test PostgreSQL created no
index for `ord.cu_id`). Without an index on the FK column, joins are slower, and deleting a parent requires scanning the child table. MySQL's InnoDB creates
the index automatically.

## Other constraints

- `NOT NULL`: the most important and cheapest constraint; make columns nullable only when "unknown" is a real state.
- `UNIQUE`: no duplicates (for `NULL` behavior see the `NULL` topic).
- `CHECK (total >= 0)`: a condition every row must meet; `NULL` passes it.
- `DEFAULT`: a value used when the column is omitted.
- **Deferrable constraints** (PostgreSQL, Oracle): `DEFERRABLE INITIALLY DEFERRED` checks the constraint at `COMMIT` instead of after each statement, which
  allows e.g. inserting two rows that reference each other in one transaction.

## Data types that matter

- **Money**: `decimal`/`numeric` with explicit precision, never `float`: `0.1 + 0.2 = 0.3` is true for `numeric` and false for `double precision`.
- **Time**: store instants as `timestamptz` (PostgreSQL) / `datetimeoffset` (SQL Server) or UTC; `timestamp without time zone` doesn't know which zone it's in.
- **Text**: `varchar(n)` enforces a maximum (`value too long for type character varying(3)`); in PostgreSQL `text` and `varchar` perform the same.
- **SQLite is dynamically typed**: in a normal table an `int` column accepted `'abc'` and stored it as text. `STRICT` tables (3.37+) enforce types, and
  **foreign keys are disabled by default** unless `PRAGMA foreign_keys = ON` (many drivers, e.g. Node's `node:sqlite`, turn it on; with it off, an
  orphan row was accepted).

## Sources

- [PostgreSQL: constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL: identity columns](https://www.postgresql.org/docs/current/ddl-identity-columns.html)
- [SQL Server: primary and foreign key constraints](https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints)
- [SQLite: foreign key support](https://www.sqlite.org/foreignkeys.html)
- [SQLite: STRICT tables](https://www.sqlite.org/stricttables.html)

## Questions

### What is the difference between a primary key and a unique constraint? {junior}

Both guarantee uniqueness and create an index. A table has only one primary key, which can't contain `NULL`s and serves as the row's main identifier
referenced by foreign keys. A table can have many unique constraints, which may allow `NULL`s (with dialect differences), and are used for alternative keys
such as an email or a product code.

### Surrogate or natural key? {mid}

A natural key (email, ISBN, tax number) has business meaning but can change, may be long or composite, and its format can change with business rules, which
then cascades into every referencing table. A surrogate key (identity or UUID) is stable, compact and meaningless. The common practice is a surrogate primary
key plus a `UNIQUE` constraint on the natural key, which gives stable references and still prevents duplicates.

### What happens when you delete a row that other rows reference? {junior}

It depends on the foreign key's `ON DELETE` action. By default (`NO ACTION`/`RESTRICT`) the delete fails while referencing rows exist. `CASCADE` deletes the
referencing rows too, `SET NULL` sets their foreign key to `NULL`, and `SET DEFAULT` to its default. The action should reflect the domain: order lines can
cascade with their order, invoices shouldn't disappear with a customer.

### Are foreign key columns indexed automatically? {mid}

Not in PostgreSQL and SQL Server: only primary keys and unique constraints get indexes automatically, so a foreign key column needs an index created explicitly.
Without it, joins on that column and deleting or updating the parent (which must check the child table) require scanning the child table and can cause locking
problems. MySQL's InnoDB creates an index for foreign keys automatically.

### Why shouldn't money be stored as `float`? {junior}

`float`/`double` are binary floating-point types that can't represent most decimal fractions exactly, so `0.1 + 0.2` isn't exactly `0.3`, and rounding errors
accumulate in sums. Money is stored as `decimal`/`numeric` with explicit precision (e.g. `numeric(19,4)`), or as an integer number of the smallest unit (cents),
together with a currency.

### Can identity values have gaps? {mid}

Yes. A value taken by a transaction that is rolled back isn't reused, values may be cached and lost on restart, and deleted rows leave holes. That's by design,
because a gapless counter would require serializing all inserts. So identity columns are only identifiers; when the business requires consecutive numbers
(invoices), you generate them separately, e.g. with a counter row updated under a lock.

### What does a `CHECK` constraint do, and what are its limitations? {junior}

It rejects rows for which a condition is false, e.g. `CHECK (total >= 0)` or `CHECK (end_date > start_date)`. A `NULL` passes, because the condition is then unknown,
so combine it with `NOT NULL` if needed. A check can only look at the current row (in most databases), not at other rows or tables; rules across rows need
unique constraints, foreign keys, triggers or application logic.

### What is a deferrable constraint? {senior}

A constraint (usually a foreign key or unique constraint) marked `DEFERRABLE`, whose check can be postponed until the end of the transaction
(`INITIALLY DEFERRED` or `SET CONSTRAINTS ... DEFERRED`). It allows temporarily inconsistent states within a transaction, e.g. inserting two rows that reference
each other, or swapping unique values between rows. It's supported by PostgreSQL and Oracle, but not SQL Server or MySQL.

### Why must you be careful with foreign keys in SQLite? {mid}

SQLite parses foreign key definitions but doesn't enforce them unless the connection runs `PRAGMA foreign_keys = ON`, and the setting is per connection. Some
drivers enable it by default (e.g. Node's `node:sqlite`, EF Core's SQLite provider), others don't. SQLite also uses flexible typing, so a column declared `int`
can store text unless the table is declared `STRICT`.

### How do you store dates and times correctly? {mid}

Store instants (when something happened) as a timezone-aware type (`timestamptz` in PostgreSQL, `datetimeoffset` in SQL Server) or consistently in UTC, and
convert to local time only for display. `timestamp without time zone` stores a wall-clock value without knowing its zone, which breaks across time zones and
daylight saving time. Dates without time (birthdays) use a `date` type.
