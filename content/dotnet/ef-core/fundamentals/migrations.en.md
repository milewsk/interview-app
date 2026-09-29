# Migrations {mid}

Migrations are a way to **version the database schema together with the code**. EF compares the current model
(entities and configuration) with the saved state and generates a migration class with `Up` (apply changes) and
`Down` (revert) methods.

```bash
dotnet tool install --global dotnet-ef               # the CLI tool
dotnet add package Microsoft.EntityFrameworkCore.Design

dotnet ef migrations add AddCustomerEmail            # a new migration
dotnet ef database update                            # apply to the local database
dotnet ef migrations remove                          # remove the last (unapplied) migration
dotnet ef migrations list                            # list, marked (Pending)
dotnet ef migrations has-pending-model-changes       # model changes without a migration? (CI)
```

## What gets created in the project

- `20260925_AddCustomerEmail.cs`: the `Up`/`Down` operations (`CreateTable`, `AddColumn`, `RenameColumn`…),
- `...Designer.cs`: migration metadata,
- `AppDbModelSnapshot.cs`: a **snapshot of the whole model** after the last migration. The model is compared with
  it when adding the next migration, so it must be in the repository.

In the database, the `__EFMigrationsHistory` table stores the IDs of applied migrations. Thanks to it,
`database update` applies only the missing ones.

## Review every migration

A migration is generated heuristically. Renaming a property usually produces `RenameColumn`, but the docs warn
that a migration **may drop a column when the intent was to rename it**, which means data loss. Read the generated
code before committing it. Migrations can be edited by hand:

```csharp
protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddColumn<string>("Email", "Customers", nullable: true);
    // a data migration EF won't generate on its own
    migrationBuilder.Sql("UPDATE Customers SET Email = LegacyEmail");
    migrationBuilder.DropColumn("LegacyEmail", "Customers");
}
```

## Deploying to production

| Strategy | When |
| --- | --- |
| **SQL script** (`dotnet ef migrations script --idempotent -o migrations.sql`) | when a DBA must review the SQL or the process requires approval |
| **Bundle** (`dotnet ef migrations bundle`) | recommended for automated deployments (CI/CD) |
| `dotnet ef database update` | local development and testing |
| `Database.MigrateAsync()` at app startup | simple deployments that accept the tradeoffs |

- An **idempotent script** checks `__EFMigrationsHistory` and applies only the missing migrations, so it suits
  databases in different states. It depends on the provider: SQLite doesn't support it.
- A **bundle** is a single executable (`efbundle`) built in CI. It needs neither the SDK nor the source code, uses
  migration locking and runs seeding. Pass the connection string with `--connection` from a secret store.
- **Runtime migrations** have downsides: the app needs schema-change permissions, the SQL isn't reviewed, and
  rolling back is harder. Since EF Core 9, **migration locking** protects against concurrent application by
  multiple instances.
- Use a separate identity with DDL permissions for schema changes, and run the app under an account with data-only
  permissions.

## Changes in EF Core 9 and 10

- **Pending model changes = an exception.** `Migrate()` and `database update` throw if the model changed since the
  last migration (`PendingModelChangesWarning`). A common cause is a non-deterministic model, e.g. `HasData` with
  `DateTime.Now` or `Guid.NewGuid()`.
- **Migration locking**: `Migrate`/`MigrateAsync`, bundles and `database update` take a lock on the database.
  Wrapping `MigrateAsync` in your own transaction throws (`MigrationsUserTransactionWarning`).
- In EF Core 9 all pending migrations ran in one transaction, and **EF Core 10 went back to a separate transaction
  per migration**.
- **Seeding**: `UseSeeding` / `UseAsyncSeeding` (since EF 9) is the recommended way to add initial data that
  depends on logic. `HasData` is only for static data.

## Working in a team

- Two branches with new migrations conflict in the **model snapshot**. After merging, resolve the snapshot conflict
  (and sometimes remove your migration and regenerate it on top of the merged code), checking the migration order.
- Don't edit migrations already applied to shared environments. Make changes with a new migration.
- `migrations remove` only removes the last migration, and only while it hasn't been applied.
- Don't mix `EnsureCreated()` with migrations: it creates the schema bypassing migrations, and `Migrate()` then
  fails.

## Zero-downtime changes (expand/contract)

With zero-downtime deployments the old and new app versions run side by side, so breaking changes are split into
stages:

1. **Expand**: add a new (nullable) column, the app writes to both, and a migration or job moves the data.
2. Switch reads to the new column.
3. **Contract**: drop the old column in a later release.

## Sources

- [Migrations overview](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [Managing migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/managing)
- [Applying migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)
- [Migrations in team environments](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams)
- [Breaking changes in EF Core 9](https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-9.0/breaking-changes)

## Questions

### What are EF Core migrations and what do they consist of? {junior}

A versioned description of database schema changes, generated from the difference between the model and the last
state. Each migration is a class with `Up` and `Down` methods plus a `Designer` file. The project also contains a
`ModelSnapshot`, the model's snapshot after the last migration. In the database, the `__EFMigrationsHistory` table
records which migrations have been applied.

### What is the `ModelSnapshot` file for, and why does it matter? {mid}

It's a full description of the model after the last migration. On `migrations add`, EF compares the current model
with it, not with the database, and generates the difference. It must be versioned in the repository. Conflicts in
it when merging branches signal that two migrations were created in parallel and need reconciling. A missing or
stale snapshot makes the next migration contain the wrong operations.

### How do you deploy migrations to production? {mid}

Most often with a **bundle** (`dotnet ef migrations bundle`) run in CI/CD as a one-off deployment step, or with a
**SQL script** (`migrations script --idempotent`) when a DBA must review the SQL. `dotnet ef database update` is for
development. Calling `MigrateAsync()` at startup is possible, but the app then needs DDL permissions, review and
rollback get harder, and with multiple instances you rely on migration locking (EF 9+).

### What is an idempotent script? {mid}

A SQL script that, before each migration, checks `__EFMigrationsHistory` to see if it was already applied, and runs
only the missing ones. You can run it against databases in different states (e.g. several environments) without
knowing the last applied migration. Support depends on the provider, e.g. SQLite doesn't support it.

### What happens if you rename an entity property and generate a migration? {mid}

EF tries to detect the rename and usually generates `RenameColumn`, but it's a heuristic. With more complex changes
it may generate `DropColumn` + `AddColumn`, which means **data loss**. That's why you review every migration before
committing it, and if needed replace the operations with `RenameColumn` by hand or add a `migrationBuilder.Sql(...)`
that moves the data.

### Why can `Migrate()` throw a "pending model changes" exception since EF Core 9? {mid}

EF checks whether the app's model matches the last migration. If someone changed an entity and forgot to add a
migration, they get a `PendingModelChangesWarning` exception instead of a database that doesn't match the code.
Common causes: a missing migration after a change, a missing snapshot, or a non-deterministic model (e.g. `HasData`
with `DateTime.Now`). In CI you can detect it with `dotnet ef migrations has-pending-model-changes`.

### How can several app instances apply migrations safely at startup? {senior}

Since EF Core 9, `Migrate`/`MigrateAsync` take a database-level lock, so only one instance applies migrations while
the others wait. Don't wrap it in your own transaction, or EF throws. Even with the lock, a separate deployment step
(a bundle run as a job) is better practice: it runs once, before the new app version, with separate permissions. On
SQLite an abandoned lock can block later migrations.

### How do you resolve a migration conflict between two branches? {senior}

The conflict usually appears in the `ModelSnapshot`. The simplest route: take the target branch's migrations, remove
your own unapplied migration (`migrations remove`, or manually, including restoring the snapshot), apply your model
changes and regenerate it on the merged code. If the migrations are independent, merging the snapshot correctly and
checking that `has-pending-model-changes` reports nothing is enough.

### How do you make a breaking change (e.g. renaming a column) without downtime? {senior}

With the expand/contract pattern across several releases. First add the new column and write to both, with a
migration or background job moving the data. Then switch reads to the new column. Only in a later release, when no
running version uses the old column, drop it. A single migration with `RenameColumn` would break old-version
instances still running during the deployment.

### How is `HasData` different from `UseSeeding` / `UseAsyncSeeding`? {mid}

`HasData` defines static data in the model. It becomes part of migrations (`InsertData`), requires key values and must
be deterministic, so e.g. `DateTime.Now` triggers the pending model changes exception. `UseSeeding`/`UseAsyncSeeding`
(EF 9+) is code that runs after `Migrate`/`EnsureCreated`, can check existing data and use any logic. It's the
recommended approach for anything beyond a simple, fixed lookup table.
