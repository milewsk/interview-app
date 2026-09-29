# Raw SQL, views and stored procedures in EF Core {mid}

LINQ covers most queries, but sometimes you need SQL directly: database-specific features (window functions, full-text search, hints), a stored
procedure, a hand-optimized query or a bulk operation. EF Core lets you do this while keeping **parameterization** and, where possible, mapping the
results to entities.

## `FromSql`: SQL returning entities

```csharp
var name = "Ada";
var orders = await db.Orders
    .FromSql($"SELECT * FROM Orders WHERE CustomerName = {name}")   // {name} becomes a DbParameter, not text
    .Where(o => o.Total > 8)                                        // further LINQ is composed on top
    .OrderBy(o => o.Id)
    .ToListAsync();
// SELECT ... FROM ( SELECT * FROM Orders WHERE CustomerName = @p0 ) AS "o" WHERE ... ORDER BY ...
```

- `FromSql` takes a `FormattableString`: interpolated values are turned into **parameters**, so the query is safe from SQL injection even though it looks
  like string interpolation.
- The result must contain **all columns** of the entity with matching names, otherwise EF throws ("The required column 'Total' was not present...").
- When the SQL is composable (a `SELECT`), EF wraps it in a subquery and adds `Where`, `OrderBy`, `Include` and so on. Stored procedure calls can't be
  composed, so continue with `AsEnumerable()` or finish with `ToList()`.
- Results are **tracked** like normal query results, unless you add `AsNoTracking()`.

## `FromSqlRaw` and SQL injection

```csharp
var evil = "x' OR '1'='1";
db.Orders.FromSqlRaw("SELECT * FROM Orders WHERE CustomerName = '" + evil + "'");   // 🔴 returns every row
db.Orders.FromSqlRaw("SELECT * FROM Orders WHERE CustomerName = {0}", evil);        // ✅ {0} is a parameter
db.Orders.FromSql($"SELECT * FROM Orders WHERE CustomerName = {evil}");            // ✅ parameter
```

In a test, the concatenated version returned all 3 rows (an injection), and both parameterized versions returned 0. EF's analyzer reports concatenation in
`FromSqlRaw` as warning **EF1003**. `FromSqlRaw` is for **dynamic SQL structure** (e.g. a column or table name chosen at runtime), and such identifiers
must be validated against an allowlist, because they can't be parameterized.

## `SqlQuery<T>`: results that aren't entities

```csharp
var totals = await db.Database
    .SqlQuery<CustomerSum>($"SELECT CustomerName, SUM(Total) AS Total FROM Orders GROUP BY CustomerName")
    .ToListAsync();                                          // any class, no DbSet or configuration needed (EF Core 8+)

var ids = await db.Database.SqlQuery<int>($"SELECT Id AS Value FROM Orders").Where(v => v > 1).ToListAsync();
```

For scalar types the column must be called `Value` if you want to compose LINQ on top. `SqlQuery` results are never tracked.

## `ExecuteSql`: commands without results

```csharp
int affected = await db.Database.ExecuteSqlAsync($"UPDATE Orders SET Total = Total + 1 WHERE CustomerName = {name}");
```

It returns the number of affected rows and bypasses the change tracker: already loaded entities won't see the change. For typical bulk updates, LINQ-based
`ExecuteUpdate`/`ExecuteDelete` are more convenient (see the saving topic).

## Views, keyless entities and functions

```csharp
modelBuilder.Entity<CustomerTotal>().HasNoKey().ToView("CustomerTotals");
var report = await db.CustomerTotals.OrderBy(c => c.CustomerName).ToListAsync();
```

- A **keyless entity type** (`HasNoKey`) maps to a view, a query or a table without a key. It can be queried with LINQ, but it's never tracked and can't be
  inserted or updated.
- `ToSqlQuery("SELECT ...")` maps an entity to a defining SQL query, and `HasDbFunction` maps a C# method to a scalar or table-valued database function
  that can be used inside LINQ.

## When to use raw SQL

- Database-specific features that EF doesn't translate, performance-critical queries tuned by hand, reports.
- It's a trade-off: SQL in strings isn't checked by the compiler, isn't portable between providers and doesn't follow model renames. Many teams keep EF for
  writes and simple reads, and use raw SQL or Dapper for complex read models.

## Sources

- [SQL queries](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries)
- [Keyless entity types](https://learn.microsoft.com/en-us/ef/core/modeling/keyless-entity-types)
- [User-defined function mapping](https://learn.microsoft.com/en-us/ef/core/querying/user-defined-function-mapping)
- [Passing parameters and SQL injection](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries#passing-parameters)

## Questions

### Is `FromSql($"... {value}")` vulnerable to SQL injection? {mid}

No. `FromSql` (and `FromSqlInterpolated`) takes a `FormattableString`, and EF converts each interpolated value into a `DbParameter`, so the value is never
pasted into the SQL text. It looks like string interpolation, but it isn't. The danger is building the string yourself first (`var sql = $"..."` and then
`FromSqlRaw(sql)`), because then interpolation happens before EF sees it.

### How do `FromSql` and `FromSqlRaw` differ? {mid}

`FromSql` accepts an interpolated string and parameterizes the values automatically. `FromSqlRaw` accepts a plain string with optional `{0}` placeholders
or `DbParameter` objects: placeholders are parameterized, but anything concatenated into the string isn't. `FromSqlRaw` is needed only for dynamic SQL
structure, e.g. a table or column name, and such parts must be validated against an allowlist. EF's analyzer warns about concatenation (EF1003).

### Can you add LINQ operators to a `FromSql` query? {mid}

Yes, if the SQL is composable, e.g. a plain `SELECT`: EF wraps it in a subquery and adds `Where`, `OrderBy`, `Skip`/`Take` or `Include` in the outer query.
Stored procedure calls and some statements can't be wrapped in a subquery, so after them you materialize the results (`ToListAsync`) or switch to
`AsEnumerable()`.

### What requirements must SQL passed to `FromSql` meet? {mid}

It must return all the columns mapped to the entity, with names matching the column names in the model (or the query throws "The required column ... was
not present"), and it can't return related data directly. Types must be compatible with the mapping. If you need a different shape, use
`Database.SqlQuery<T>` with a DTO instead of an entity.

### How do you read results that don't match any entity? {mid}

Since EF Core 8, use `Database.SqlQuery<T>($"...")` with any class whose properties match the result columns, without registering it in the model. For
scalars, e.g. `SqlQuery<int>`, name the column `Value` to be able to compose LINQ. The results aren't tracked. Earlier versions required a keyless entity
type registered in the model.

### What is a keyless entity type? {mid}

An entity configured with `HasNoKey()`, typically mapped to a view (`ToView`), a SQL query (`ToSqlQuery`) or a table without a primary key. It can be queried
with LINQ like other entities, but because it has no key it isn't tracked, can't be inserted, updated or deleted through `SaveChanges`, and can't be the
principal of a relationship. It's used for reports and read models.

### How do you call a stored procedure from EF Core? {mid}

If it returns entity rows: `db.Orders.FromSql($"EXEC GetOrders {customerId}").ToListAsync()` (not composable, so no further LINQ in SQL). If it returns a
different shape: `Database.SqlQuery<Dto>($"EXEC ...")`. If it doesn't return rows: `Database.ExecuteSqlAsync($"EXEC ...")`, which returns the number of
affected rows. Parameters are passed through interpolation, so they're parameterized.

### Does `ExecuteSql` update entities already loaded into the context? {mid}

No. `ExecuteSql` sends the command directly to the database and doesn't touch the change tracker, so tracked instances keep their old values, and a later
`SaveChanges` may even overwrite the change. After such a command, reload the affected entities (`Entry(e).ReloadAsync()`), use a new context, or clear
the tracker (`ChangeTracker.Clear()`).

### How do you safely build SQL with a dynamic column name? {senior}

Identifiers can't be parameters, so they must be put into the SQL text, which requires `FromSqlRaw`. Never accept them from the user directly: map the
input to an allowlist of known column names (e.g. a `switch` or dictionary), and pass values as parameters (`{0}` placeholders). Often it's simpler to avoid
raw SQL and choose the LINQ `OrderBy` expression based on the input.

### When is it reasonable to use raw SQL instead of LINQ? {mid}

When you need database features EF doesn't translate (window functions, hints, full-text search, `MERGE`), when a query tuned by hand is much faster, for
reports and complex read models, and for stored procedures. The costs are no compile-time checking, provider lock-in, and SQL that doesn't follow model
renames. A common approach is to keep EF for writes and typical reads, and use raw SQL or Dapper only where it clearly pays off.
