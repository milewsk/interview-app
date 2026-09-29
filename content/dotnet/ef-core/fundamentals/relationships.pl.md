# Modelowanie relacji {mid}

Relacja w EF Core to **klucz obcy** (FK) plus opcjonalnie **nawigacje** po obu stronach. Większość
relacji EF wykrywa sam na podstawie konwencji, a resztę konfiguruje się Fluent API w `OnModelCreating`.

## Jeden do wielu (1:N)

```csharp
public class Author
{
    public int Id { get; set; }
    public List<Book> Books { get; set; } = [];          // nawigacja kolekcji
}

public class Book
{
    public int Id { get; set; }
    public int AuthorId { get; set; }                    // FK: konwencja <Nawigacja>Id
    public Author Author { get; set; } = null!;          // nawigacja referencyjna
}
```

- **Wymagalność relacji wynika z typu FK**: `int AuthorId` oznacza relację wymaganą, a `int? AuthorId`
  opcjonalną.
- Bez jawnej właściwości FK EF utworzy **shadow property** (`AuthorId` istnieje w modelu i bazie, ale
  nie w klasie).
- Konfiguracja jawna: `modelBuilder.Entity<Book>().HasOne(b => b.Author).WithMany(a => a.Books).HasForeignKey(b => b.AuthorId);`.

## Jeden do jednego (1:1)

```csharp
modelBuilder.Entity<User>()
    .HasOne(u => u.Profile)
    .WithOne(p => p.User)
    .HasForeignKey<UserProfile>(p => p.UserId);   // trzeba wskazać stronę zależną
```

EF nie wie, która strona jest zależna (ma FK), dopóki się tego nie wskaże. Na kolumnie FK tworzony jest
unikalny indeks.

## Wiele do wielu (N:M)

Wystarczą nawigacje kolekcji po obu stronach. EF utworzy **tabelę łączącą** sam:

```csharp
public class Book { public int Id { get; set; } public List<Tag> Tags { get; set; } = []; }
public class Tag  { public int Id { get; set; } public List<Book> Books { get; set; } = []; }
// tabela BookTag (BooksId, TagsId), klucz złożony, ON DELETE CASCADE po obu stronach
```

Gdy połączenie ma **własne dane** (np. data dodania, rola), modeluje się je jawną encją łączącą:

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

## Zachowanie przy usuwaniu (`OnDelete`)

| `DeleteBehavior` | Domyślne dla | W bazie | Co robi EF ze śledzonymi dziećmi |
| --- | --- | --- | --- |
| `Cascade` | relacji **wymaganych** | `ON DELETE CASCADE` | usuwa je |
| `ClientSetNull` | relacji **opcjonalnych** | brak akcji | ustawia FK na `null` |
| `SetNull` | | `ON DELETE SET NULL` | ustawia FK na `null` |
| `Restrict` / `NoAction` | | brak akcji | nic, więc błąd, jeśli dzieci istnieją |
| `ClientCascade` | | brak akcji | usuwa je (tylko wczytane) |

Pułapka `ClientSetNull`: działa tylko dla dzieci **wczytanych do kontekstu**. Jeśli ich nie wczytano,
baza nie ma akcji na FK i usunięcie rodzica kończy się błędem naruszenia klucza obcego.

**Sieroty**: usunięcie dziecka z kolekcji relacji wymaganej (`author.Books.Remove(book)`) sprawia, że
dziecko bez rodzica zostaje **usunięte** przy `SaveChanges`. W relacji opcjonalnej FK jest ustawiany
na `null`.

**SQL Server** nie pozwala na wiele ścieżek kaskadowych do tej samej tabeli ani na cykle („may cause
cycles or multiple cascade paths”). Wtedy jedną z relacji konfiguruje się z `DeleteBehavior.Restrict`
lub `NoAction` i usuwa dzieci w kodzie.

## Typy złożone i owned

Wartości bez własnej tożsamości (adres, kwota z walutą) nie muszą być osobnymi encjami:

```csharp
modelBuilder.Entity<Customer>(b =>
{
    b.ComplexProperty(c => c.ShippingAddress);                   // kolumny ShippingAddress_City, ...
    b.ComplexProperty(c => c.BillingAddress, a => a.ToJson());   // jedna kolumna JSON (EF 10)
});
```

- **Complex types** mają semantykę wartości: przypisanie kopiuje dane, a porównanie odbywa się po
  zawartości. W EF 10 obsługują też typy opcjonalne, mapowanie do JSON, struktury i `ExecuteUpdate`.
  Zespół EF zaleca je zamiast owned types do dzielenia tabeli i JSON.
- **Owned types** (`OwnsOne`/`OwnsMany`) to w praktyce encje z ukrytym kluczem, więc mają semantykę
  referencyjną (np. nie da się przypisać tego samego obiektu dwóm właściwościom).

## Adnotacje czy Fluent API

Adnotacje (`[ForeignKey]`, `[Required]`, `[InverseProperty]`) są wygodne dla prostych przypadków.
Fluent API jest pełniejsze (klucze złożone, `OnDelete`, relacje 1:1, tabele łączące) i trzyma encje
wolne od zależności od EF. Konfigurację warto rozdzielić na klasy
`IEntityTypeConfiguration<T>` + `ApplyConfigurationsFromAssembly`.

## Źródła

- [Introduction to relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships)
- [One-to-many relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships/one-to-many)
- [Many-to-many relationships](https://learn.microsoft.com/en-us/ef/core/modeling/relationships/many-to-many)
- [Cascade delete](https://learn.microsoft.com/en-us/ef/core/saving/cascade-delete)
- [Complex types](https://learn.microsoft.com/en-us/ef/core/modeling/complex-types)

## Pytania

### Jak EF Core rozpoznaje relację i jej wymagalność bez konfiguracji? {junior}

Z konwencji: nawigacja do innej encji i właściwość o nazwie `<Nawigacja>Id` lub `<EncjaGłówna>Id` tworzą
relację z tym FK. Wymagalność wynika z typu FK: `int` oznacza relację wymaganą, `int?` opcjonalną. Przy
nullable reference types także z nullowalności nawigacji. Bez właściwości FK EF tworzy shadow property.

### Jak zamodelować relację wiele do wielu? {junior}

Najprościej przez nawigacje kolekcji po obu stronach (`Book.Tags`, `Tag.Books`), a EF sam utworzy tabelę
łączącą z kluczem złożonym. Jeśli połączenie ma dodatkowe dane (np. `EnrolledAt`, rola), tworzy się jawną
encję łączącą z dwoma FK i kluczem złożonym, a relacja staje się dwiema relacjami 1:N.

### Jakie są domyślne zachowania przy usuwaniu rodzica? {mid}

Dla relacji wymaganych `Cascade`: w bazie `ON DELETE CASCADE`, a EF usuwa też śledzone dzieci. Dla
opcjonalnych `ClientSetNull`: w bazie brak akcji, a EF ustawia FK na `null` tylko w **wczytanych**
dzieciach. Można je zmienić przez `OnDelete(DeleteBehavior.X)`: `SetNull`, `Restrict`, `NoAction`,
`ClientCascade`.

### Dlaczego usunięcie rodzica w relacji opcjonalnej może zakończyć się błędem klucza obcego? {mid}

Domyślne `ClientSetNull` nie tworzy akcji na FK w bazie, a zerowanie FK wykonuje EF, i to tylko dla dzieci
śledzonych przez kontekst. Jeśli dzieci nie zostały wczytane, EF wysyła samo `DELETE` rodzica, a baza
odrzuca je, bo istnieją wiersze wskazujące na niego. Rozwiązania: wczytać dzieci, skonfigurować
`DeleteBehavior.SetNull` (akcja w bazie) albo zmienić relację.

### Co się stanie, gdy usuniesz element z kolekcji nawigacji (`author.Books.Remove(book)`)? {mid}

W relacji **wymaganej** książka bez autora nie może istnieć, więc EF oznaczy ją jako sierotę i przy
`SaveChanges` **usunie** ją z bazy (domyślnie, gdy kaskada jest włączona). W relacji **opcjonalnej** EF
ustawi `AuthorId = null` i zostawi wiersz. Zachowanie sierot można zmienić przez
`ChangeTracker.DeleteOrphansTiming` albo konfigurację relacji.

### Co oznacza błąd SQL Server „may cause cycles or multiple cascade paths”? {senior}

SQL Server nie pozwala, by do jednej tabeli prowadziło kilka ścieżek kaskadowego usuwania albo by
kaskady tworzyły cykl, np. gdy `Order` odwołuje się do `Customer` bezpośrednio i przez `Address`. EF
domyślnie ustawia `Cascade` dla relacji wymaganych, więc migracja kończy się błędem. Rozwiązanie: dla
jednej z relacji ustawić `OnDelete(DeleteBehavior.Restrict)` lub `NoAction` i usuwać dzieci w kodzie
aplikacji.

### Jak skonfigurować relację 1:1 i dlaczego EF czasem prosi o wskazanie strony zależnej? {mid}

`HasOne(u => u.Profile).WithOne(p => p.User).HasForeignKey<UserProfile>(p => p.UserId)`. W relacji 1:1 obie
strony mają nawigację referencyjną, więc EF nie wie, która tabela ma trzymać FK. Trzeba to wskazać
generycznym `HasForeignKey<T>`. Na kolumnie FK powstaje indeks unikalny, a często FK jest jednocześnie
kluczem głównym zależnej tabeli.

### Czym są shadow properties i kiedy powstają? {mid}

To właściwości istniejące w modelu EF (i kolumnie bazy), ale nie w klasie encji. Powstają m.in., gdy
relacja nie ma jawnej właściwości FK. Można je też dodać celowo, np. `CreatedAt` czy `TenantId`
ustawiane w `SaveChanges`. Odczytuje się je przez `EF.Property<T>(entity, "Name")` w zapytaniach
i `Entry(e).Property("Name")`.

### Czym różnią się complex types od owned types i kiedy ich używać? {senior}

Oba mapują obiekt bez własnej tożsamości (np. adres) do kolumn tabeli właściciela lub do JSON. Owned types
to w praktyce encje z ukrytym kluczem: mają semantykę referencyjną, nie można ich współdzielić ani
porównywać po zawartości i nie obsługują `ExecuteUpdate`. Complex types mają semantykę wartości (kopiowanie
przy przypisaniu, porównanie po zawartości). W EF 10 obsługują typy opcjonalne, JSON i struktury, a zespół EF
zaleca je dla nowych modeli zamiast owned types.

### Adnotacje czy Fluent API do konfiguracji relacji? {junior}

Adnotacje (`[ForeignKey]`, `[InverseProperty]`, `[Required]`) wystarczą w prostych przypadkach i są
widoczne przy encji. Fluent API potrafi więcej (klucze złożone, `OnDelete`, relacje 1:1, tabele łączące,
indeksy) i nie wiąże klas domeny z EF. Przy konflikcie wygrywa Fluent API. W większych projektach
konfigurację wydziela się do klas `IEntityTypeConfiguration<T>`.
