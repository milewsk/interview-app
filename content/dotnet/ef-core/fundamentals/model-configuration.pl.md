# Konfiguracja modelu: konwencje, Fluent API i adnotacje {mid}

EF Core buduje **model** encji (tabele, kolumny, klucze, indeksy, relacje) z trzech źródeł, w rosnącej kolejności
ważności: **konwencji**, **adnotacji danych** (atrybutów) i **Fluent API** w `OnModelCreating`. Znajomość ustawień
domyślnych ma znaczenie, bo decydują o schemacie bazy, a kilka z nich to pułapki.

## Ważne konwencje

- Właściwość o nazwie `Id` lub `<Typ>Id` jest **kluczem głównym**, a klucz całkowity generuje baza (`IDENTITY`
  na SQL Server).
- Nienullowalny typ C# daje `NOT NULL`, a nullowalny (`string?`, `int?`) daje `NULL`. Przy włączonych nullable
  reference types `string` jest wymagany, a `string?` opcjonalny.
- `string` bez długości staje się `nvarchar(max)` na SQL Server: to kiepski wybór dla kolumn indeksowanych lub
  przeszukiwanych.
- `decimal` bez precyzji staje się `decimal(18,2)`, a EF ostrzega, że wartości mogą zostać **po cichu obcięte**.
- `enum` domyślnie zapisuje się jako `int`.
- Kolekcja typów prostych (`List<string>`) zapisuje się jako **JSON** w jednej kolumnie (EF Core 8+) i można po niej
  filtrować.
- Właściwości tylko do odczytu bez settera (wyliczane z innych) nie są mapowane.

## Fluent API i `IEntityTypeConfiguration<T>`

```csharp
public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> b)
    {
        b.ToTable("Products");
        b.Property(p => p.Name).HasMaxLength(200).IsRequired();      // nvarchar(200) NOT NULL
        b.HasIndex(p => p.Sku).IsUnique();                             // CREATE UNIQUE INDEX
        b.HasIndex(p => p.Name).HasFilter("[IsDeleted] = 0");          // indeks filtrowany
        b.Property(p => p.Price).HasPrecision(10, 2);                  // decimal(10,2)
        b.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);   // enum jako tekst
        b.Property<DateTime>("CreatedAt").HasDefaultValueSql("CURRENT_TIMESTAMP");   // właściwość cienia
        b.Ignore(p => p.DisplayName);
    }
}

protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    modelBuilder.Entity<OrderLine>().HasKey(l => new { l.OrderId, l.ProductId });   // klucz złożony
}
```

Konfiguracja w osobnych klasach `IEntityTypeConfiguration<T>` utrzymuje `OnModelCreating` krótkim, a klasy domenowe
wolnymi od szczegółów utrwalania. `ApplyConfigurationsFromAssembly` wczytuje je wszystkie.

## Adnotacje czy Fluent API?

Adnotacje (`[Key]`, `[Required]`, `[MaxLength(200)]`, `[Column(TypeName = "...")]`,
`[Index(nameof(Sku), IsUnique = true)]`, `[Precision(10, 2)]`) są krótkie i widoczne na klasie, a `[Required]`/`[MaxLength]`
wykorzystuje też walidacja ASP.NET Core. Fluent API potrafi **wszystko** (np. klucze złożone, indeksy filtrowane,
konwertery, relacje, dzielenie tabel, filtry zapytań) i utrzymuje encje bez atrybutów EF. Wiele zespołów dla spójności
używa wyłącznie Fluent API. Gdy użyje się obu, wygrywa Fluent API.

## Konwencje dla całego modelu

```csharp
protected override void ConfigureConventions(ModelConfigurationBuilder builder)
{
    builder.Properties<string>().HaveMaxLength(256);        // domyślna długość wszystkich stringów
    builder.Properties<decimal>().HavePrecision(18, 4);
    builder.Properties<Money>().HaveConversion<MoneyConverter>();
}
```

## Konwertery wartości

Konwerter mapuje typ CLR na typ w bazie: enumy jako tekst (`HasConversion<string>()`), silnie typowane identyfikatory
(`OrderId` → `int`), szyfrowanie, value object do jednej kolumny. Wada: zapytanie może porównywać tylko skonwertowaną
wartość, a niektórych operacji (np. `Contains` na fragmencie tekstu) nie da się przetłumaczyć.

## Klucze i generowanie wartości

- **Klucze sztuczne** (surrogate): `int`/`long` z `IDENTITY` (albo sekwencją, albo HiLo) lub `Guid`. Losowe
  `Guid.NewGuid()` fragmentują indeks klastrowy, dlatego EF domyślnie generuje dla SQL Server **sekwencyjne GUID-y**,
  a .NET 9+ ma `Guid.CreateVersion7()` (uporządkowany czasowo).
- **Klucze naturalne** (np. SKU) jako klucz główny rzadko są dobrym pomysłem, bo mogą się zmienić. Zamiast tego stosuje
  się indeks unikalny.
- `ValueGeneratedOnAdd`, `HasDefaultValue`/`HasDefaultValueSql`, `HasComputedColumnSql` konfigurują wartości generowane
  przez bazę.

## Źródła

- [Creating and configuring a model](https://learn.microsoft.com/en-us/ef/core/modeling/)
- [Entity properties](https://learn.microsoft.com/en-us/ef/core/modeling/entity-properties)
- [Keys](https://learn.microsoft.com/en-us/ef/core/modeling/keys)
- [Indexes](https://learn.microsoft.com/en-us/ef/core/modeling/indexes)
- [Value conversions](https://learn.microsoft.com/en-us/ef/core/modeling/value-conversions)
- [Pre-convention model configuration](https://learn.microsoft.com/en-us/ef/core/modeling/bulk-configuration)

## Pytania

### Jak EF Core rozpoznaje klucz główny bez konfiguracji? {junior}

Zgodnie z konwencją właściwość o nazwie `Id` lub `<NazwaTypu>Id` (np. `ProductId`) staje się kluczem głównym. Jeśli to liczba całkowita albo `Guid`,
EF zakłada, że wartość jest generowana przy wstawianiu: dla `int` baza używa `IDENTITY` (SQL Server) lub autoinkrementacji, a `Guid` generuje EF po
stronie klienta. Inny klucz albo klucz złożony konfiguruje się przez `HasKey` lub `[Key]`/`[PrimaryKey]`.

### Fluent API czy adnotacje danych? {junior}

Adnotacje są prostsze i widoczne na klasie, ale wyrażają tylko część konfiguracji. Fluent API konfiguruje wszystko (klucze złożone, indeksy
filtrowane, konwertery, relacje, filtry zapytań) i utrzymuje klasy domenowe bez atrybutów specyficznych dla EF. Konfiguracja Fluent API ma
pierwszeństwo przed adnotacjami. Częsty wybór to Fluent API w klasach `IEntityTypeConfiguration<T>` wczytywanych przez
`ApplyConfigurationsFromAssembly`.

### Jaki typ kolumny dostaje `string` bez konfiguracji na SQL Server i dlaczego to ważne? {mid}

`nvarchar(max)` (z `NULL` albo `NOT NULL` zależnie od nullowalności). Takie kolumny nie mogą być kluczem zwykłego indeksu i są mniej wydajnie
przechowywane oraz przetwarzane, więc źle nadają się do wszystkiego, co jest wyszukiwane lub indeksowane. Długość ustawia się przez `HasMaxLength`
albo `[MaxLength]`, albo globalnie w `ConfigureConventions` (`Properties<string>().HaveMaxLength(256)`).

### Dlaczego EF ostrzega przy właściwościach `decimal` bez precyzji? {mid}

Bez konfiguracji `decimal` mapuje się na `decimal(18,2)` na SQL Server, a wartości z większą liczbą miejsc po przecinku lub większym rzędem są po
cichu obcinane lub zaokrąglane, co jest niebezpieczne dla kwot, stawek czy ilości. EF loguje ostrzeżenie podczas budowania modelu. Precyzję
ustawia się jawnie: `HasPrecision(19, 4)`, `[Precision(19, 4)]` albo przez globalną konwencję.

### Jak zapisywany jest `enum` i jak to zmienić? {mid}

Domyślnie jako `int` z wartością liczbową enuma. To zwięzłe, ale dane w bazie są nieczytelne, a zmiana kolejności składowych enuma psuje istniejące
dane. `HasConversion<string>()` zapisuje nazwę jako tekst (najlepiej z `HasMaxLength`), co jest czytelne i odporne na zmianę kolejności, ale nie na
zmianę nazwy. Konfiguracja globalna jest możliwa w `ConfigureConventions`.

### Czym jest konwerter wartości i jakie ma ograniczenia? {mid}

To mapowanie między typem CLR właściwości a typem zapisywanym w bazie, np. enum jako string, silnie typowany `OrderId` jako `int`, value object jako
jedna kolumna albo zaszyfrowany tekst. Konfiguruje się go przez `HasConversion`. Ograniczenia: baza zna tylko skonwertowaną wartość, więc operacji na
typie oryginalnym (np. metody value objectu, częściowe porównania) nie zawsze da się przetłumaczyć na SQL, a konwertery nie działają w surowym SQL.

### Jak skonfigurować indeks unikalny lub filtrowany? {junior}

Przez Fluent API: `HasIndex(p => p.Sku).IsUnique()` tworzy indeks unikalny, a `.HasFilter("[IsDeleted] = 0")` indeks filtrowany obejmujący tylko część
wierszy (np. unikalność wśród nieusuniętych rekordów). Alternatywą jest adnotacja `[Index(nameof(Sku), IsUnique = true)]` na klasie. Indeks unikalny
to też właściwy sposób wymuszenia unikalności kluczy naturalnych, jak e-mail czy SKU, przy zachowaniu sztucznego klucza głównego.

### Dlaczego losowe klucze `Guid` mogą szkodzić wydajności i co z tym zrobić? {senior}

Losowe GUID-y wstawiane do indeksu klastrowego trafiają w przypadkowe miejsca, co powoduje dzielenie stron, fragmentację i słabe wykorzystanie cache.
EF Core domyślnie generuje dla kluczy na SQL Server sekwencyjne GUID-y, co omija problem, jeśli pozwoli się EF wygenerować wartość. Gdy aplikacja
sama tworzy klucze, używa się formatu uporządkowanego czasowo, jak `Guid.CreateVersion7()` (.NET 9+), albo nieklastrowego klucza GUID i klastrowej
kolumny całkowitej.

### Czym jest pole zapasowe (backing field) i kiedy EF Core go używa? {mid}

To prywatne pole, które EF czyta i zapisuje zamiast właściwości (albo obok niej), co pozwala hermetyzować stan. Zgodnie z konwencją EF znajduje pola nazwane np. `_lines` dla
właściwości `Lines`, więc encja może udostępniać `IReadOnlyCollection<Line> Lines => _lines` i zmieniać kolekcję tylko przez metody, jak `AddLine`. Sprawdzone na EF Core 10:
nawigacja została zmapowana na pole `_lines`, a `Include` wczytało przez nie pozycję. `HasField` i `UsePropertyAccessMode` konfigurują niekonwencjonalne nazwy i sposób
dostępu.

### Co daje `ConfigureConventions`? {mid}

Pozwala skonfigurować naraz wszystkie właściwości danego typu, zanim model zostanie zbudowany: np. domyślną długość wszystkich stringów, precyzję
wszystkich decimali albo konwerter dla wszystkich właściwości typu value object (`Properties<Money>().HaveConversion<MoneyConverter>()`). Usuwa to
powtarzalną konfigurację poszczególnych właściwości i czyni spójność ustawieniem domyślnym. Pojedyncze właściwości nadal mogą nadpisać te ustawienia.
