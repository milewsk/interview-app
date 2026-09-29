# Modeling relationships {mid}

A relationship in EF Core is a **foreign key** (FK) plus, optionally, **navigations** on both sides. EF discovers
most relationships on its own through conventions, and the rest is configured with the Fluent API in
`OnModelCreating`.

## One-to-many (1:N)

```csharp
public class Author
{
    public int Id { get; set; }
    public List<Book> Books { get; set; } = [];          // collection navigation
}

public class Book
{
    public int Id { get; set; }
    public int AuthorId { get; set; }                    // FK: the <Navigation>Id convention
    public Author Author { get; set; } = null!;          // reference navigation
}
```

- **Whether the relationship is required follows from the FK type**: `int AuthorId` means required, and
  `int? AuthorId` optional.
- Without an explicit FK property, EF creates a **shadow property** (`AuthorId` exists in the model and the
  database, but not in the class).
- Explicit configuration: `modelBuilder.Entity<Book>().HasOne(b => b.Author).WithMany(a => a.Books).HasForeignKey(b => b.AuthorId);`.

## One-to-one (1:1)

```csharp
modelBuilder.Entity<User>()
    .HasOne(u => u.Profile)
    .WithOne(p => p.User)
    .HasForeignKey<UserProfile>(p => p.UserId);   // you must specify the dependent side
```

EF doesn't know which side is dependent (holds the FK) until you tell it. A unique index is created on the FK
column.

## Many-to-many (N:M)

Collection navigations on both sides are enough. EF creates the **join table** itself:

```csharp
public class Book { public int Id { get; set; } public List<Tag> Tags { get; set; } = []; }
public class Tag  { public int Id { get; set; } public List<Book> Books { get; set; } = []; }
// table BookTag (BooksId, TagsId), composite key, ON DELETE CASCADE on both sides
```

When the link has **its own data** (e.g. a date added, a role), model it as an explicit join entity:

```csharp
public class Enrollment
{
    public int StudentId { get; set; }
    public int CourseId { get; set; }
    public DateTime EnrolledAt { get; set; }
    public Student Student { get; set; } = null!;
    public Course Course { get; set; } = null!;
}

modelBuilder.Entity<Enrollment>().HasKey(e => new { e.StudentId, e.CourseId });
```

## Delete behavior (`OnDelete`)

| `DeleteBehavior` | Default for | In the database | What EF does with tracked children |
| --- | --- | --- | --- |
| `Cascade` | **required** relationships | `ON DELETE CASCADE` | deletes them |
| `ClientSetNull` | **optional** relationships | no action | sets the FK to `null` |
| `SetNull` | | `ON DELETE SET NULL` | sets the FK to `null` |
| `Restrict` / `NoAction` | | no action | nothing, so an error if children exist |
| `ClientCascade` | | no action | deletes them (loaded ones only) |

The `ClientSetNull` pitfall: it only works for children **loaded into the context**. If they aren't loaded, the
database has no action on the FK, and deleting the parent fails with a foreign key violation.

**Orphans**: removing a child from a required relationship's collection (`author.Books.Remove(book)`) makes the
parentless child **deleted** on `SaveChanges`. In an optional relationship the FK is set to `null`.

**SQL Server** doesn't allow multiple cascade paths to the same table or cycles ("may cause cycles or multiple
cascade paths"). In that case configure one of the relationships with `DeleteBehavior.Restrict` or `NoAction` and
delete the children in code.

## Complex and owned types

Values without their own identity (an address, an amount with a currency) don't have to be separate entities:

```csharp
modelBuilder.Entity<Customer>(b =>
{
    b.ComplexProperty(c => c.ShippingAddress);                   // columns ShippingAddress_City, ...
    b.ComplexProperty(c => c.BillingAddress, a => a.ToJson());   // a single JSON column (EF 10)
});
```

- **Complex types** have value semantics: assignment copies the data, and comparison is by content. In EF 10 they
  also support optional types, JSON mapping, structs and `ExecuteUpdate`. The EF team recommends them over owned
  types for table splitting and JSON.
- **Owned types** (`OwnsOne`/`OwnsMany`) are in practice entities with a hidden key, so they have reference
  semantics (e.g. you can't assign the same object to two properties).

## Annotations or Fluent API

Annotations (`[ForeignKey]`, `[Required]`, `[InverseProperty]`) are convenient for simple cases. The Fluent API is
more complete (composite keys, `OnDelete`, 1:1 relationships, join tables) and keeps entities free of EF
dependencies. It's worth splitting configuration into `IEntityTypeConfiguration<T>` classes +
`ApplyConfigurationsFromAssembly`.

## Sources

- [Introduction to relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships)
- [One-to-many relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships/one-to-many)
- [Many-to-many relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships/many-to-many)
- [Cascade delete](https://learn.microsoft.com/en-us/ef/core/saving/cascade-delete)
- [Complex types](https://learn.microsoft.com/en-us/ef/core/modeling/complex-types)

## Questions

### How does EF Core discover a relationship and whether it's required without configuration? {junior}

By convention: a navigation to another entity and a property named `<Navigation>Id` or `<PrincipalEntity>Id` form a
relationship with that FK. Whether it's required follows from the FK type: `int` means required, `int?` optional.
With nullable reference types, also from the navigation's nullability. Without an FK property, EF creates a shadow
property.

### How do you model a many-to-many relationship in EF Core? {junior}

Most simply with collection navigations on both sides (`Book.Tags`, `Tag.Books`), and EF creates the join table with
a composite key itself. If the link has extra data (e.g. `EnrolledAt`, a role), create an explicit join entity with
two FKs and a composite key, and the relationship becomes two 1:N relationships.

### What are the default behaviors when a parent is deleted? {mid}

For required relationships `Cascade`: `ON DELETE CASCADE` in the database, and EF also deletes tracked children.
For optional ones `ClientSetNull`: no database action, and EF sets the FK to `null` only in **loaded** children. You
can change them with `OnDelete(DeleteBehavior.X)`: `SetNull`, `Restrict`, `NoAction`, `ClientCascade`.

### Why can deleting the parent in an optional relationship fail with a foreign key error? {mid}

The default `ClientSetNull` creates no FK action in the database, and EF does the nulling itself, only for children
tracked by the context. If the children weren't loaded, EF sends just the parent's `DELETE`, and the database rejects
it because rows still point to it. Fixes: load the children, configure `DeleteBehavior.SetNull` (a database action),
or change the relationship.

### What happens when you remove an item from a navigation collection (`author.Books.Remove(book)`)? {mid}

In a **required** relationship a book can't exist without an author, so EF marks it as an orphan and **deletes** it
on `SaveChanges` (by default, when cascade is enabled). In an **optional** relationship EF sets `AuthorId = null`
and keeps the row. You can change orphan behavior with `ChangeTracker.DeleteOrphansTiming` or the relationship
configuration.

### What does the SQL Server error "may cause cycles or multiple cascade paths" mean? {senior}

SQL Server doesn't allow several cascade-delete paths to lead to one table, or cascades that form a cycle, e.g. when
`Order` references `Customer` directly and also via `Address`. EF sets `Cascade` for required relationships by
default, so the migration fails. The fix: configure one of the relationships with
`OnDelete(DeleteBehavior.Restrict)` or `NoAction` and delete the children in application code.

### How do you configure a 1:1 relationship, and why does EF sometimes ask for the dependent side? {mid}

`HasOne(u => u.Profile).WithOne(p => p.User).HasForeignKey<UserProfile>(p => p.UserId)`. In a 1:1 relationship both
sides have a reference navigation, so EF can't tell which table should hold the FK. You specify it with the generic
`HasForeignKey<T>`. A unique index is created on the FK column, and the FK is often also the dependent table's
primary key.

### What are shadow properties and when do they appear? {mid}

Properties that exist in the EF model (and as database columns) but not in the entity class. They appear, for
example, when a relationship has no explicit FK property. You can also add them on purpose, e.g. `CreatedAt` or
`TenantId` set in `SaveChanges`. You access them with `EF.Property<T>(entity, "Name")` in queries and
`Entry(e).Property("Name")`.

### How do complex types differ from owned types, and when should you use them? {senior}

Both map an object without its own identity (e.g. an address) to the owner's table columns or to JSON. Owned types are
in practice entities with a hidden key: they have reference semantics, can't be shared or compared by content, and
don't support `ExecuteUpdate`. Complex types have value semantics (copied on assignment, compared by content). In EF
10 they support optional types, JSON and structs, and the EF team recommends them over owned types for new models.

### Should an entity have both a navigation property and a foreign key property? {junior}

Usually yes. The navigation (`Order.Customer`) lets you work with related objects, while the foreign key property (`CustomerId`) lets you set or read the relationship by ID
without loading the related entity or joining, e.g. when creating an order from an API request. If you omit the FK property, EF creates a shadow property for the column, which
works but is less convenient. You can also have only the FK and no navigation when you never need to traverse the relationship.
