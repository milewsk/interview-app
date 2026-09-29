# Typy wartościowe i referencyjne {junior}

W C# każdy typ jest albo **wartościowy** (value type), albo **referencyjny** (reference type).
Różnica dotyczy tego, **co jest kopiowane** przy przypisaniu i przekazaniu do metody.

- **Typy wartościowe**: `struct` (w tym `int`, `double`, `bool`, `DateTime`, `decimal`),
  `enum`, `record struct`, krotki `(int, string)`, `Nullable<T>`. Zmienna **zawiera dane**.
- **Typy referencyjne**: `class`, `record` (`record class`), `interface`, `delegate`, tablice,
  `string`, `object`. Zmienna zawiera **referencję** do obiektu na stercie.

```csharp
var s1 = new PointStruct { X = 1 };
var s2 = s1;       // kopia całej wartości
s2.X = 10;         // s1.X == 1

var c1 = new PointClass { X = 1 };
var c2 = c1;       // kopia referencji, ten sam obiekt
c2.X = 10;         // c1.X == 10

struct PointStruct { public int X; }
class PointClass { public int X; }
```

## Stos i sterta: uproszczenie, które warto doprecyzować

Popularne zdanie „typy wartościowe są na stosie” jest nieścisłe. Typ wartościowy jest
przechowywany **tam, gdzie jest zadeklarowany**:

- zmienna lokalna lub parametr: zwykle na stosie (albo w rejestrze),
- pole klasy: **wewnątrz obiektu na stercie**,
- element tablicy `int[]`: w ciągłym bloku pamięci tablicy na stercie,
- zmienna lokalna przechwycona przez lambdę lub użyta w metodzie `async` bądź iteratorze:
  staje się polem wygenerowanej klasy, więc trafia na stertę.

Obiekty typów referencyjnych zawsze żyją na stercie zarządzanej i sprząta je garbage collector.
Ważniejsza od miejsca w pamięci jest **semantyka kopiowania**.

## Przekazywanie argumentów: wartość, `ref`, `out`, `in`

Domyślnie C# przekazuje argumenty **przez wartość**. Dla typu referencyjnego kopiowana jest
**referencja**, dlatego metoda może zmienić stan obiektu, ale nie może podmienić obiektu
wywołującemu:

```csharp
static void Mutate(PointClass p) => p.X = 99;                 // wywołujący widzi 99
static void Reassign(PointClass p) => p = new PointClass();   // wywołujący nie widzi zmiany
static void ReassignRef(ref PointClass p) => p = new PointClass(); // wywołujący widzi nowy obiekt
```

- `ref`: przekazanie przez referencję, zmienna musi być zainicjalizowana.
- `out`: metoda musi przypisać wartość (np. `int.TryParse(s, out var n)`).
- `in` / `ref readonly`: przekazanie przez referencję tylko do odczytu, co pozwala uniknąć
  kopiowania dużych struktur.

## Boxing i unboxing

**Boxing** to opakowanie wartości w obiekt na stercie, gdy typ wartościowy trafia tam, gdzie
oczekiwany jest `object` lub interfejs. **Unboxing** to jawne wypakowanie, które musi dotyczyć
**dokładnie tego samego typu**.

```csharp
object o = 42;          // boxing: alokacja na stercie
int i = (int)o;         // unboxing
long l = (long)o;       // InvalidCastException: w pudełku jest int, a nie long

var p = new PointStruct { X = 1 };
object boxed = p;       // pudełko zawiera KOPIĘ
p.X = 2;                // ((PointStruct)boxed).X nadal == 1
```

Boxing kosztuje alokację i pracę GC. Zdarza się niejawnie, np. przy starych kolekcjach
(`ArrayList`), wywołaniu metody interfejsu na strukturze przez zmienną typu interfejsu,
`string.Format` z argumentami `object` czy porównaniu przez `object.Equals`. Generyki
(`List<int>`) go eliminują.

## Równość

- **Klasy**: `==` i domyślne `Equals` porównują **referencje** (tożsamość), chyba że typ je
  nadpisuje.
- **Struktury**: domyślne `ValueType.Equals` porównuje pola (może używać refleksji, więc jest
  wolne). Operator `==` nie istnieje, dopóki go nie zdefiniujesz.
- **`record` / `record struct`**: kompilator generuje równość **wartościową** (`Equals`, `==`,
  `GetHashCode`) oraz wyrażenie `with` do tworzenia zmodyfikowanej kopii.
- **`string`** to typ referencyjny z semantyką wartości: jest niemutowalny, a `==` porównuje zawartość.

```csharp
new Person("Ala") == new Person("Ala");   // True: record
object a = 1; object b = 1;
a == b;                                    // False: porównanie referencji dwóch pudełek
a.Equals(b);                               // True

string t1 = "abc", t2 = new string("abc".ToCharArray());
t1 == t2;                                  // True: przeciążony operator string
(object)t1 == (object)t2;                  // False: różne obiekty

record Person(string Name);
```

## Pułapki mutowalnych struktur

Ponieważ struktury są kopiowane, zmiana często trafia w **kopię**:

```csharp
var list = new List<PointStruct> { new() { X = 1 } };
list[0].X = 5;          // błąd kompilacji CS1612: indeksator zwraca kopię
var item = list[0];
item.X = 99;            // list[0].X nadal == 1
```

Zalecenie: struktury projektuj jako **niemutowalne** (`readonly struct`, `record struct`
z `init`). Strukturę wybieraj dla małych wartości o krótkim życiu, bez tożsamości
(współrzędne, kwota z walutą). Wytyczne .NET sugerują rozmiar do około 16 bajtów.

## Typy dopuszczające null

- `Nullable<T>` (`int?`) to struktura z `HasValue` i `Value`. Boxing `int?` bez wartości daje
  `null`, a z wartością pakuje samą wartość (`GetType()` zwraca `Int32`).
- **Nullable reference types** (`string?`, `#nullable enable`) to wyłącznie **analiza
  kompilatora**. W runtime `string` i `string?` to ten sam typ, a ostrzeżenia nie są gwarancją.

## Wartości domyślne

`default` dla typu wartościowego to wyzerowane pola (`0`, `false`, struktura z zerami), a dla
typu referencyjnego `null`. Struktura zawsze ma stan „wszystko zera”, nawet jeśli definiuje
konstruktor, np. w `new PointStruct[10]` lub `default(PointStruct)`.

## Źródła

- [Value types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/value-types)
- [Reference types (C# reference)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/reference-types)
- [Boxing and unboxing](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/types/boxing-and-unboxing)
- [Records](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)
- [Choosing between class and struct](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/choosing-between-class-and-struct)

## Pytania

### Czym różni się typ wartościowy od referencyjnego? {junior}

Zmienna typu wartościowego **zawiera dane**, więc przypisanie i przekazanie do metody kopiuje całą
wartość. Zmienna typu referencyjnego zawiera **referencję** do obiektu na stercie, więc kopiowana
jest referencja i obie zmienne wskazują ten sam obiekt. Typy wartościowe to `struct`, `enum`,
typy liczbowe, `bool`, `record struct`. Referencyjne to `class`, `record`, `interface`, `delegate`,
tablice, `string`.

### Czy typy wartościowe zawsze są na stosie? {mid}

Nie. Typ wartościowy jest przechowywany tam, gdzie go zadeklarowano. Zmienna lokalna zwykle ląduje
na stosie, ale pole klasy jest częścią obiektu na stercie, element tablicy leży w tablicy na
stercie, a zmienna przechwycona przez lambdę lub użyta w metodzie `async` staje się polem klasy
wygenerowanej przez kompilator. Właściwa różnica to semantyka kopiowania, a nie miejsce w pamięci.

### Co wypisze kod: metoda dostaje obiekt klasy, zmienia jego pole, a potem przypisuje parametrowi nowy obiekt? {junior}

Wywołujący zobaczy zmianę pola, ale nie zobaczy nowego obiektu. Parametr jest **kopią referencji**:
przez nią można modyfikować wspólny obiekt, ale przypisanie `p = new ...` zmienia tylko lokalną
kopię. Aby podmienić obiekt u wywołującego, trzeba użyć `ref`.

### Czym jest boxing i dlaczego warto go unikać? {junior}

To opakowanie typu wartościowego w obiekt na stercie, gdy traktujemy go jak `object` lub interfejs.
Każdy boxing to alokacja, a więc dodatkowa praca garbage collectora. Pudełko przechowuje **kopię**,
więc późniejsze zmiany oryginału go nie dotyczą. Unboxing wymaga dokładnie tego samego typu:
`(long)(object)42` rzuca `InvalidCastException`. Unikamy go dzięki generykom (`List<int>` zamiast
`ArrayList`) i przeciążeniom przyjmującym konkretne typy.

### Dlaczego `object a = 1; object b = 1; a == b` zwraca `false`? {mid}

Obie wartości zostały opakowane w **osobne** obiekty, a operator `==` dla typu statycznego `object`
porównuje referencje. `a.Equals(b)` zwraca `true`, bo wywołuje `Int32.Equals`, które porównuje
wartości.

### Kiedy wybrać `struct`, a kiedy `class`? {mid}

`struct` wybieramy dla małych (orientacyjnie do 16 bajtów), niemutowalnych wartości bez tożsamości,
często tworzonych i krótko żyjących, np. współrzędnych czy kwoty z walutą. Unikamy wtedy alokacji
na stercie. `class` jest właściwa dla obiektów z tożsamością, dużych lub mutowalnych, dziedziczenia
i sytuacji, w których obiekt jest często przekazywany. Duża struktura kopiowana przy każdym
wywołaniu bywa wolniejsza niż klasa.

### Czym różni się `record` od `class` i od `record struct`? {mid}

`record` (czyli `record class`) to typ referencyjny, dla którego kompilator generuje **równość
wartościową** (`Equals`, `==`, `GetHashCode`), czytelne `ToString()`, dekonstrukcję i wyrażenie
`with`. Zwykła `class` porównuje referencje. `record struct` daje te same udogodnienia dla typu
wartościowego. Rekordy pozycyjne `record Person(string Name)` mają właściwości `init`, a w
`record struct` są domyślnie mutowalne, chyba że dodamy `readonly`.

### Dlaczego `list[0].X = 5` nie kompiluje się dla `List<struct>`? {mid}

Indeksator `List<T>` zwraca **kopię** elementu. Zmiana pola kopii niczego by nie zmieniła, więc
kompilator zgłasza błąd CS1612. Trzeba pobrać kopię, zmienić ją i przypisać z powrotem
(`var p = list[0]; p.X = 5; list[0] = p;`) albo zaprojektować strukturę jako niemutowalną. Tablice
(`arr[0].X = 5`) działają inaczej, bo ich indeksator zwraca referencję do elementu.

### Czym różni się `int?` od `string?`? {mid}

`int?` to `Nullable<int>`, czyli prawdziwy inny typ w runtime: struktura z `HasValue` i `Value`.
`string?` to adnotacja **nullable reference types**, wykorzystywana wyłącznie przez analizę
statyczną kompilatora. W runtime to nadal zwykły `string`, a ostrzeżenia nie gwarantują braku
`null`.

### Czy `string` jest typem wartościowym? {junior}

Nie, `string` to typ referencyjny. Zachowuje się jednak „wartościowo”: jest **niemutowalny**
(każda „zmiana” tworzy nowy obiekt), a `==` i `Equals` porównują zawartość. Dlatego wielokrotne
sklejanie w pętli tworzy wiele obiektów, a do budowania dużych tekstów używa się `StringBuilder`.
