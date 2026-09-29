# MongoDB w .NET {mid}

Aplikacje .NET korzystają z MongoDB przez oficjalny **sterownik C#** (`MongoDB.Driver`, 3.x), który mapuje POCO na BSON, oferuje **LINQ**
i typowane **Buildery** oraz obsługuje sesje i transakcje. Istnieje też oficjalny **dostawca EF Core** (`MongoDB.EntityFrameworkCore`) dla
zespołów, które chcą `DbContext` i śledzenia zmian. Poniższe przykłady uruchamiałem ze sterownikiem 3.12 i dostawcą EF Core 10.0.4 na .NET 10
przeciwko MongoDB 8.0.

## Sterownik

```csharp
var client = new MongoClient("mongodb://127.0.0.1:27018/?directConnection=true");   // rejestruj jako singleton
var products = client.GetDatabase("shop").GetCollection<Product>("products");

ConventionRegistry.Register("camel", new ConventionPack { new CamelCaseElementNameConvention() }, _ => true);

public class Product
{
    [BsonRepresentation(BsonType.ObjectId)] public string? Id { get; set; }   // mapowane na _id, zapisywane jako ObjectId
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public List<string> Tags { get; set; } = [];
    public DateTime CreatedAt { get; set; }
}
```

Sprawdzone szczegóły mapowania:

- Właściwość `Id` została zmapowana na `_id`, zapisana jako **ObjectId** i odczytana jako napis; z konwencją camelCase pola zapisały się jako
  `name`, `price`, `tags`, `createdAt`.
- `decimal` został zapisany jako **`Decimal128`** (dokładnie), a nie jako double.
- Wartości `DateTime` są zapisywane w **UTC**: lokalne 12:00 (UTC+2) zapisało się jako `10:00Z` i wróciło z `Kind = Utc`. Zapisuje się UTC,
  a konwertuje przy wyświetlaniu.
- **`Guid` wymaga konfiguracji** w sterowniku 3.x: wstawienie dokumentu z właściwością `Guid` zakończyło się „GuidSerializer cannot serialize a
  Guid when GuidRepresentation is Unspecified”. Rejestruje się `new GuidSerializer(GuidRepresentation.Standard)` albo dodaje atrybut do właściwości.

`MongoClient` jest bezpieczny wątkowo i trzyma pulę połączeń, więc tworzy się **jeden na aplikację** (singleton w DI), a nie na żądanie.

## Zapytania i aktualizacje

- **LINQ** jest tłumaczony na pipeline agregacji: `Where(p => p.Price > 20 && p.Tags.Contains("home")).OrderBy(p => p.Name).Select(...)` stał się
  `$match { price: { $gt: Decimal128("20") }, tags: "home" }`, `$sort { name: 1 }`, `$project` (pokazuje to `queryable.ToString()`).
- **Buildery** dają typowane filtry i aktualizacje: `FindOneAndUpdateAsync(Filter.Eq(p => p.Name, "Pen"), Update.Inc(p => p.Price, 1m).Push(p =>
  p.Tags, "sale"), new() { ReturnDocument = ReturnDocument.After })` zwróciło zaktualizowany produkt (cena 11,5, tagi `office|sale`).
- **Transakcje**: `session.WithTransactionAsync(...)` zatwierdziło atomowo dwie aktualizacje (i ponawia błędy przejściowe).

## Dostawca EF Core

```csharp
var options = new DbContextOptionsBuilder<ShopDb>().UseMongoDB(client, "efmongo").Options;
modelBuilder.Entity<Order>().ToCollection("orders");     // z MongoDB.EntityFrameworkCore.Extensions
```

Sprawdzone: `SaveChanges` wstawiło zamówienia, a ich `List<Line>` zapisała się jako **osadzona tablica**; zapytanie o `o.Lines.Count > 1` zadziałało;
zmiana pozycji i wywołanie `SaveChanges` zaktualizowały osadzony dokument. Zaobserwowane ograniczenia: `GroupBy` rzucił „The LINQ expression ... could
not be translated”; `Database.Migrate()` nie istnieje (migracje są relacyjne), a `EnsureCreated` działa. Dokumentacja wymienia też brak kluczy obcych,
brak scaffoldingu database-first oraz brak obsługi szeregów czasowych i Atlas Search; projekcje `Select` wymienia jako nieobsługiwane, choć prosta
projekcja `Select(o => o.Number)` zadziałała w 10.0.4, więc warto sprawdzić dokumentację swojej wersji. Do agregacji i funkcji specyficznych dla
MongoDB używa się bezpośrednio sterownika.

## Źródła

- [MongoDB C# driver](https://www.mongodb.com/docs/drivers/csharp/current/)
- [C# driver: GUID serialization](https://www.mongodb.com/docs/drivers/csharp/current/serialization/guids/)
- [C# driver: LINQ](https://www.mongodb.com/docs/drivers/csharp/current/fundamentals/linq/)
- [C# driver: transactions](https://www.mongodb.com/docs/drivers/csharp/current/fundamentals/transactions/)
- [MongoDB EF Core provider](https://www.mongodb.com/docs/entity-framework/current/)
- [EF Core provider limitations](https://www.mongodb.com/docs/entity-framework/current/limitations/)

## Pytania

### Jak zarejestrować `MongoClient` w aplikacji ASP.NET Core? {junior}

Jako singleton: `MongoClient` jest bezpieczny wątkowo i posiada pulę połączeń oraz monitorowanie topologii, więc jedna instancja na aplikację (na klaster) jest używana przez wszystkie żądania.
Tworzenie go na żądanie marnuje połączenia i wszystko spowalnia. `IMongoDatabase` i `IMongoCollection<T>` są tanie i też bezpieczne wątkowo, więc mogą być singletonami albo pobierane z klienta.

### Jak sterownik C# mapuje klasy na dokumenty? {junior}

Według konwencji: publiczne właściwości stają się polami o tych samych nazwach (konwencje, np. camelCase, mogą to zmienić), właściwość o nazwie `Id` jest mapowana na `_id`, a zagnieżdżone klasy
i listy stają się osadzonymi dokumentami i tablicami. Atrybuty (`[BsonId]`, `[BsonElement]`, `[BsonRepresentation]`, `[BsonIgnore]`) albo mapy klas pozwalają to dostosować. W teście napisowe
`Id` z `[BsonRepresentation(BsonType.ObjectId)]` zostało zapisane jako `ObjectId` i odczytane jako napis.

### Dlaczego wstawienie encji z `Guid` się nie powiodło? {mid}

Sterownik 3.x nie zakłada już binarnego formatu GUID: przy domyślnym `GuidRepresentation.Unspecified` serializacja `Guid` rzuca „GuidSerializer cannot serialize a Guid when GuidRepresentation is
Unspecified” (sprawdzone). Format wybiera się jawnie, zwykle `GuidRepresentation.Standard` (binarny podtyp 4), rejestrując `GuidSerializer` albo używając atrybutu. Starsze dane zapisane w dawnym
formacie C# (podtyp 3) trzeba czytać z tą reprezentacją.

### Jak zapisywane są `decimal` i `DateTime`? {mid}

W sterowniku 3.x `decimal` jest zapisywany jako BSON `Decimal128`, co zachowuje dokładne wartości (sprawdzone), a tego wymagają kwoty pieniężne. `DateTime` jest zapisywany jako znacznik czasu UTC
z dokładnością do milisekund: czas lokalny został przy zapisie przeliczony na UTC, a wartości wracają z `DateTimeKind.Utc` (sprawdzone), więc aplikacje powinny zapisywać UTC i konwertować przy
wyświetlaniu albo jawnie obsługiwać `DateTimeOffset`.

### Jak działa LINQ ze sterownikiem MongoDB? {mid}

`collection.AsQueryable()` zwraca `IQueryable`, które sterownik tłumaczy na pipeline agregacji (`$match`, `$sort`, `$project`, `$group`...); w teście zapytanie `Where`/`OrderBy`/`Select` stało się
etapami `$match`, `$sort` i `$project`, widocznymi przez `ToString()`. Nieobsługiwane wyrażenia rzucają wyjątek w czasie działania. Przy złożonych pipeline'ach albo aktualizacjach pełną kontrolę
dają typowane Buildery albo surowe etapy `BsonDocument`.

### Kiedy użyć dostawcy EF Core zamiast sterownika? {mid}

Gdy zespół chce znanego modelu `DbContext`, śledzenia zmian i jednostki pracy nad prostymi encjami o kształcie dokumentów, może współdzieląc wzorce z relacyjnymi częściami systemu. W teście
zapisywał kolekcje posiadane jako osadzone tablice i śledził w nich zmiany. Do pipeline'ów agregacji, `GroupBy` (nie przetłumaczył go), operacji masowych, change streams i funkcji specyficznych dla
MongoDB lepszy jest sterownik; wiele aplikacji łączy oba.

### Które funkcje EF Core nie działają z MongoDB? {senior}

Według dokumentacji: migracje (sprawdzone: `Database.Migrate()` nie istnieje dla tego dostawcy, to API relacyjne), klucze obce i relacyjne złączenia, scaffolding database-first, table splitting,
funkcje temporalne i przestrzenne, kolekcje szeregów czasowych i Atlas Search. Niektóre operatory LINQ nie są tłumaczone: `GroupBy` rzucił wyjątek w teście. Dokumentacja wymienia też projekcje
`Select` jako nieobsługiwane, choć prosta projekcja zadziałała w 10.0.4, więc zachowanie zależy od wersji.

### Jak wykonać transakcję w sterowniku C#? {mid}

Rozpocząć sesję przez `client.StartSessionAsync()` i wywołać `session.WithTransactionAsync(async (s, ct) => { ... })`, przekazując sesję do każdej operacji w środku; pomocnik zatwierdza i ponawia
przy `TransientTransactionError` oraz nieznanych wynikach commita. W teście dwie aktualizacje w takim callbacku zostały zatwierdzone atomowo. Wymaga to replica setu albo klastra shardowanego.

### Jak wykonać atomowe „zaktualizuj i zwróć” w C#? {junior}

Przez `FindOneAndUpdateAsync(filter, update, new FindOneAndUpdateOptions<T> { ReturnDocument = ReturnDocument.After })`: stosuje aktualizację i zwraca zmieniony dokument w jednej atomowej operacji
(w teście zwrócił produkt ze zwiększoną ceną i nowym tagiem). Używa się tego do liczników, numerów sekwencji, przejmowania elementów kolejki albo optymistycznych przepływów, zamiast osobnego
wyszukania i aktualizacji.

### Jak zaimplementować optymistyczną współbieżność z MongoDB w .NET? {senior}

Dodać do dokumentu pole wersji (liczbę albo znacznik czasu) i w filtrze aktualizacji uwzględnić oczekiwaną wersję, jednocześnie ją zwiększając:
`UpdateOneAsync(d => d.Id == id && d.Version == v, Update.Set(...).Inc(d => d.Version, 1))`. Jeśli `ModifiedCount` wynosi 0, ktoś inny zmienił dokument wcześniej, więc trzeba
go ponownie wczytać i ponowić albo zgłosić konflikt. Dostawca EF Core obsługuje w tym samym celu tokeny współbieżności.
