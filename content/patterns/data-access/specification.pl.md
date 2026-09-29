# Specyfikacja (specification) {senior}

**Specyfikacja** zamyka **regułę biznesową albo kryterium zapytania w obiekcie**, który odpowiada na pytanie „czy ten obiekt
spełnia regułę?” i który można **łączyć** z innymi specyfikacjami przez `And`, `Or` i `Not`. Wzorzec pochodzi od Erica Evansa
i Martina Fowlera. W C# specyfikacja zbudowana na **drzewach wyrażeń** (`Expression<Func<T, bool>>`) służy dwóm celom naraz:
EF Core tłumaczy ją na SQL, a po skompilowaniu sprawdza obiekty w pamięci.

## Specyfikacja oparta na wyrażeniach

```csharp
public abstract class Specification<T>
{
    public abstract Expression<Func<T, bool>> ToExpression();
    public bool IsSatisfiedBy(T entity) => ToExpression().Compile()(entity);          // sprawdzenie w pamięci

    public Specification<T> And(Specification<T> other) => new Combined<T>(this, other, Expression.AndAlso);
    public Specification<T> Or(Specification<T> other) => new Combined<T>(this, other, Expression.OrElse);
    public Specification<T> Not() => new NotSpecification<T>(this);
}

public class ExpensiveOrders(decimal min) : Specification<Order>
{
    public override Expression<Func<Order, bool>> ToExpression() => o => o.Total > min;
}
public class OrdersWithStatus(string status) : Specification<Order>
{
    public override Expression<Func<Order, bool>> ToExpression() => o => o.Status == status;
}

var spec = new ExpensiveOrders(100).And(new OrdersWithStatus("Paid"));
var orders = await db.Orders.Where(spec.ToExpression()).ToListAsync();              // tłumaczone na SQL
```

Połączenie dwóch lambd wymaga wspólnego parametru: `Combined<T>` podmienia parametr prawego wyrażenia na parametr lewego małym
`ExpressionVisitor`, a potem łączy ciała przez `AndAlso`/`OrElse`. Sprawdzone na SQLite z zamówieniami 120 (Paid), 40 (New)
i 900 (Paid):

- `And` dało `WHERE ... "o"."Total" ... @min ... AND "o"."Status" = @s`, z wartościami przekazanymi jako **parametry**, i zwróciło
  120 i 900;
- `Not(Total > 500 Or Status = New)` zwróciło tylko 120;
- `IsSatisfiedBy` na niezapisanym zamówieniu (150, Paid) zwróciło `true` bez dotykania bazy;
- łączenie przez `Expression.Invoke` zamiast podmiany parametru też zadziałało, bo EF Core rozwija wywołania, ale inni dostawcy
  LINQ mogą tego nie robić, więc visitor jest podejściem przenośnym.

## Zastosowania i kompromisy

- **Nazwane kryteria zapytań wielokrotnego użytku**: `ActiveCustomers`, `OverdueInvoices` zamiast tego samego `Where` kopiowanego
  po kodzie; repozytorium przyjmuje specyfikację zamiast obrastać metodami w rodzaju `GetByStatusAndDateAndCustomer`.
- **Reguły walidacji i selekcji** w domenie: ten sam obiekt, który filtruje bazę, sprawdza pojedynczą encję (`IsSatisfiedBy`), np.
  „czy to zamówienie można wysłać?”.
- **Dynamiczne filtry**: łączenie specyfikacji z kryteriów wybranych przez użytkownika w czasie wykonania (to kompozyt).
- Biblioteki takie jak **Ardalis.Specification** rozszerzają ideę na całe zapytania: kryteria plus `Include`, sortowanie,
  stronicowanie i projekcje, stosowane przez repozytorium.
- Koszty: więcej klas i pośredniości niż wpisany `Where`, a specyfikacje muszą pozostać **przetłumaczalne**: wywołanie własnej
  metody C# w wyrażeniu działa w pamięci, ale w EF Core zawodzi w czasie wykonania. Przy prostym CRUD zwykle wystarczy zwykły LINQ
  albo statyczna metoda rozszerzająca (`query.Paid()`).

## Źródła

- [Specifications (Eric Evans, Martin Fowler)](https://martinfowler.com/apsupp/spec.pdf)
- [Ardalis.Specification](https://github.com/ardalis/Specification)
- [Expression trees (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)
- [Designing the infrastructure persistence layer (.NET microservices guide)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)

## Pytania

### Czym jest wzorzec specyfikacji? {mid}

To wzorzec, który zamyka regułę biznesową albo kryterium selekcji w osobnym obiekcie z metodą w rodzaju `IsSatisfiedBy(entity)`. Specyfikacje można łączyć przez `And`, `Or` i `Not`,
budując złożone reguły z prostych. Nadają regułom nazwy, pozwalają używać ich wielokrotnie w walidacji, selekcji i zapytaniach oraz trzymają je poza serwisami i kontrolerami.

### Dlaczego w specyfikacji używać `Expression<Func<T, bool>>` zamiast `Func<T, bool>`? {mid}

`Func<T, bool>` to skompilowany kod: przekazanie go do `Where` na `DbSet` wybiera przeciążenie `IEnumerable`, więc wszystkie wiersze są wczytywane i filtrowane w pamięci. Drzewo
wyrażenia to dane opisujące lambdę, które EF Core potrafi przetłumaczyć na klauzulę `WHERE` w SQL i które nadal można skompilować przez `.Compile()`, żeby sprawdzić pojedynczy obiekt
w pamięci. Jedna specyfikacja obsługuje więc i zapytania do bazy, i sprawdzenia w pamięci.

### Jak połączyć dwie specyfikacje oparte na wyrażeniach? {senior}

Każda z dwóch lambd ma własny parametr, więc nie da się po prostu połączyć ich ciał. Podmienia się parametr jednego wyrażenia na parametr drugiego za pomocą `ExpressionVisitor`,
a potem tworzy nową lambdę z `Expression.AndAlso` albo `Expression.OrElse` na obu ciałach; dla `Not` ciało opakowuje się w `Expression.Not`. EF Core akceptuje też łączenie przez
`Expression.Invoke`, ale podmiana parametru daje czystsze drzewo, które obsłużą też inni dostawcy LINQ.

### Jaki problem rozwiązuje wzorzec specyfikacji w repozytoriach? {mid}

Bez niego repozytoria obrastają metodami zapytań dla każdej kombinacji kryteriów (`GetActiveByCustomer`, `GetActiveByCustomerAndDate`...) albo udostępniają `IQueryable` i pozwalają,
żeby logika zapytań się rozchodziła. Ze specyfikacjami repozytorium ma jedną metodę, np. `ListAsync(ISpecification<T>)`, a każde kryterium to nazwana, testowalna klasa wielokrotnego
użytku, którą można łączyć.

### Jak wzorzec specyfikacji ma się do wzorca kompozytu? {mid}

Specyfikacje `And`, `Or` i `Not` to kompozyty: zawierają inne specyfikacje i obliczają wynik, łącząc wyniki dzieci. Złożona reguła staje się drzewem małych specyfikacji, które można
zbudować w czasie wykonania, np. z filtrów wybranych przez użytkownika w UI.

### Co może pójść nie tak przy użyciu specyfikacji z EF Core? {senior}

Wyrażenie musi dać się przetłumaczyć na SQL. Wywołanie własnej metody C#, niezmapowanej właściwości albo niektórych funkcji .NET w lambdzie działa po skompilowaniu w pamięci, ale
rzuca wyjątek w czasie wykonania, gdy EF Core nie umie tego przetłumaczyć (albo, w starszych wersjach, było po cichu obliczane po stronie klienta). Złożone połączone wyrażenia mogą
też dawać niewydajny SQL, więc warto sprawdzić wygenerowane zapytanie przez `ToQueryString()` albo logowanie.

### Co Ardalis.Specification dodaje do podstawowego wzorca? {senior}

Zamienia specyfikację w opis całego zapytania, a nie tylko predykatu: kryteria, `Include`, sortowanie, stronicowanie, projekcje (`Select`), `AsNoTracking` i ustawienia cache,
definiowane płynnym builderem w konstruktorze specyfikacji. Generyczne repozytorium (albo ewaluator zastosowany do `DbSet`) stosuje specyfikację, tworząc zapytanie EF Core. Logika
zapytań zostaje w nazwanych klasach wielokrotnego użytku, a funkcje EF nadal są dostępne.

### Kiedy wzorzec specyfikacji to przesada? {mid}

Gdy kryteria są proste i używane w jednym miejscu: wpisany `Where` albo statyczna metoda rozszerzająca na `IQueryable<T>` (np. `orders.Paid().CreatedAfter(date)`) jest krótsza, składalna
i przetłumaczalna. Specyfikacje się opłacają, gdy reguły są pojęciami domenowymi używanymi w kilku miejscach, trzeba je sprawdzać i w pamięci, i w zapytaniach albo łączy się je
dynamicznie.

### Jak testować specyfikacje? {mid}

Samą regułę testuje się przez `IsSatisfiedBy` na obiektach w pamięci: szybkie testy jednostkowe każdej specyfikacji i kombinacji, łącznie z przypadkami brzegowymi. Translację sprawdza
się osobno: test integracyjny uruchamiający specyfikację na prawdziwej bazie (albo przynajmniej wywołanie `ToQueryString()`, żeby wyłapać nieprzetłumaczalne wyrażenia), bo obliczenie
w pamięci może się udać tam, gdzie translacja SQL zawodzi, i może różnić się szczegółami, np. porównywaniem napisów albo semantyką null.

### Jak specyfikacje wspierają walidację domenową? {senior}

Regułę domenową w rodzaju „zamówienie można wysłać, jeśli jest opłacone i ma adres” można zapisać jako specyfikację używaną przez agregat przed zmianą stanu
(`if (!new ShippableOrder().IsSatisfiedBy(this)) throw ...`), przez UI do włączenia przycisku i przez zapytanie listujące wszystkie zamówienia do wysłania. Jedna definicja reguły usuwa
powielone i rozjeżdżające się warunki w różnych warstwach.
