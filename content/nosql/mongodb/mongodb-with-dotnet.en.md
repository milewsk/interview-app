# MongoDB with .NET {mid}

.NET applications use MongoDB through the official **MongoDB C# driver** (`MongoDB.Driver`, 3.x), which maps POCOs to BSON, offers **LINQ** and typed **Builders**, and supports
sessions and transactions. There's also an official **EF Core provider** (`MongoDB.EntityFrameworkCore`) for teams that want `DbContext` and change tracking. Examples below ran
with driver 3.12 and EF Core provider 10.0.4 on .NET 10 against MongoDB 8.0.

## The driver

```csharp
var client = new MongoClient("mongodb://127.0.0.1:27018/?directConnection=true");   // register as a singleton
var products = client.GetDatabase("shop").GetCollection<Product>("products");

ConventionRegistry.Register("camel", new ConventionPack { new CamelCaseElementNameConvention() }, _ => true);

public class Product
{
    [BsonRepresentation(BsonType.ObjectId)] public string? Id { get; set; }   // maps to _id, stored as ObjectId
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public List<string> Tags { get; set; } = [];
    public DateTime CreatedAt { get; set; }
}
```

Verified mapping details:

- The `Id` property mapped to `_id`, stored as an **ObjectId** and read back as a string; with the camelCase convention the fields were stored as `name`, `price`, `tags`, `createdAt`.
- `decimal` was stored as **`Decimal128`** (exact), not as a double.
- `DateTime` values are stored in **UTC**: a local 12:00 (UTC+2) was stored as `10:00Z` and read back with `Kind = Utc`. Store UTC and convert for display.
- **`Guid` needs configuration** in driver 3.x: inserting a document with a `Guid` property failed with "GuidSerializer cannot serialize a Guid when GuidRepresentation is
  Unspecified". Register `new GuidSerializer(GuidRepresentation.Standard)` or annotate the property.

`MongoClient` is thread-safe and holds the connection pool, so create **one per application** (a DI singleton), not per request.

## Queries and updates

- **LINQ** is translated to an aggregation pipeline: `Where(p => p.Price > 20 && p.Tags.Contains("home")).OrderBy(p => p.Name).Select(...)` became
  `$match { price: { $gt: Decimal128("20") }, tags: "home" }`, `$sort { name: 1 }`, `$project` (`queryable.ToString()` shows it).
- **Builders** give typed filters and updates: `FindOneAndUpdateAsync(Filter.Eq(p => p.Name, "Pen"), Update.Inc(p => p.Price, 1m).Push(p => p.Tags, "sale"), new() { ReturnDocument =
  ReturnDocument.After })` returned the updated product (price 11.5, tags `office|sale`).
- **Transactions**: `session.WithTransactionAsync(...)` committed two updates atomically (and retries transient errors).

## EF Core provider

```csharp
var options = new DbContextOptionsBuilder<ShopDb>().UseMongoDB(client, "efmongo").Options;
modelBuilder.Entity<Order>().ToCollection("orders");     // from MongoDB.EntityFrameworkCore.Extensions
```

Verified: `SaveChanges` inserted orders with their `List<Line>` stored as an **embedded array**; a query on `o.Lines.Count > 1` worked; changing a line and calling `SaveChanges`
updated the embedded document. Limits observed: `GroupBy` threw "The LINQ expression ... could not be translated"; `Database.Migrate()` doesn't exist (migrations are relational), while
`EnsureCreated` works. The documentation also lists no foreign keys, no database-first scaffolding and no time series or Atlas Search; it lists `Select` projections as unsupported,
although a simple `Select(o => o.Number)` worked in 10.0.4, so check the docs for your version. Use the driver directly for aggregations and MongoDB-specific features.

## Sources

- [MongoDB C# driver](https://www.mongodb.com/docs/drivers/csharp/current/)
- [C# driver: GUID serialization](https://www.mongodb.com/docs/drivers/csharp/current/serialization/guids/)
- [C# driver: LINQ](https://www.mongodb.com/docs/drivers/csharp/current/fundamentals/linq/)
- [C# driver: transactions](https://www.mongodb.com/docs/drivers/csharp/current/fundamentals/transactions/)
- [MongoDB EF Core provider](https://www.mongodb.com/docs/entity-framework/current/)
- [EF Core provider limitations](https://www.mongodb.com/docs/entity-framework/current/limitations/)

## Questions

### How should `MongoClient` be registered in an ASP.NET Core app? {junior}

As a singleton: `MongoClient` is thread-safe and owns the connection pool and topology monitoring, so one instance per application (per cluster) is reused by all requests. Creating one per
request wastes connections and slows everything down. `IMongoDatabase` and `IMongoCollection<T>` are cheap and also thread-safe, so they can be singletons or resolved from the client.

### How does the C# driver map classes to documents? {junior}

By convention: public properties become fields with the same names (conventions such as camelCase can change that), a property named `Id` maps to `_id`, and nested classes and lists become
embedded documents and arrays. Attributes (`[BsonId]`, `[BsonElement]`, `[BsonRepresentation]`, `[BsonIgnore]`) or class maps customize it. In a test, a string `Id` with
`[BsonRepresentation(BsonType.ObjectId)]` was stored as an `ObjectId` and read back as a string.

### Why did inserting an entity with a `Guid` fail? {mid}

Driver 3.x no longer assumes a GUID binary format: with the default `GuidRepresentation.Unspecified`, serializing a `Guid` throws "GuidSerializer cannot serialize a Guid when
GuidRepresentation is Unspecified" (verified). You choose explicitly, usually `GuidRepresentation.Standard` (binary subtype 4), by registering a `GuidSerializer` or using an attribute. Older
data written with the legacy C# format (subtype 3) must be read with that representation.

### How are `decimal` and `DateTime` stored? {mid}

In driver 3.x, `decimal` is stored as BSON `Decimal128`, preserving exact values (verified), which is what money needs. `DateTime` is stored as a UTC timestamp with millisecond precision: a local
time was converted to UTC on write, and values come back with `DateTimeKind.Utc` (verified), so apps should store UTC and convert for display, or use `DateTimeOffset` handling explicitly.

### How does LINQ work with the MongoDB driver? {mid}

`collection.AsQueryable()` returns an `IQueryable` that the driver translates into an aggregation pipeline (`$match`, `$sort`, `$project`, `$group`...); in a test, a `Where`/`OrderBy`/`Select`
query became `$match`, `$sort` and `$project` stages, visible via `ToString()`. Unsupported expressions throw at runtime. For complex pipelines or updates, the typed Builders or raw
`BsonDocument` stages give full control.

### When would you use the EF Core provider instead of the driver? {mid}

When the team wants the familiar `DbContext` model, change tracking and unit of work over simple document-shaped entities, perhaps sharing patterns with relational parts of the system. In a
test, it stored owned collections as embedded arrays and tracked changes to them. For aggregation pipelines, `GroupBy` (it couldn't translate one), bulk operations, change streams and
MongoDB-specific features, the driver is the better tool; many apps combine both.

### What EF Core features don't work with MongoDB? {senior}

Migrations (verified: `Database.Migrate()` doesn't exist for the provider, it's a relational API), foreign keys and relational joins, database-first scaffolding, table splitting, temporal and
spatial features, time series collections and Atlas Search, according to the documentation. Some LINQ operators aren't translated: `GroupBy` threw in a test. The documentation also lists
`Select` projections as unsupported, though a simple projection worked in 10.0.4, so behavior depends on the version.

### How do you run a transaction with the C# driver? {mid}

Start a session with `client.StartSessionAsync()` and call `session.WithTransactionAsync(async (s, ct) => { ... })`, passing the session to every operation inside; the helper commits, and
retries on `TransientTransactionError` and unknown commit results. In a test, two updates in such a callback were committed atomically. It requires a replica set or sharded cluster.

### How do you do an atomic "update and return" in C#? {junior}

With `FindOneAndUpdateAsync(filter, update, new FindOneAndUpdateOptions<T> { ReturnDocument = ReturnDocument.After })`: it applies the update and returns the modified document in one atomic
operation (in a test it returned the product with its incremented price and new tag). Use it for counters, sequence numbers, claiming queue items or optimistic workflows, instead of a separate
find and update.

### How do you implement optimistic concurrency with MongoDB in .NET? {senior}

Add a version field (a number or timestamp) to the document and include the expected version in the update filter while incrementing it:
`UpdateOneAsync(d => d.Id == id && d.Version == v, Update.Set(...).Inc(d => d.Version, 1))`. If `ModifiedCount` is 0, someone else changed the document first, so reload and
retry or report a conflict. The EF Core provider supports concurrency tokens for the same purpose.
