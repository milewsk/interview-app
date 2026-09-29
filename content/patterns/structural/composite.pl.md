# Kompozyt (composite) {mid}

**Kompozyt** pozwala traktować **pojedyncze obiekty i grupy obiektów jednakowo**, układając je w **drzewo**, w którym liście
i kontenery implementują ten sam interfejs. Klient wywołuje operację na korzeniu, a ona rekurencyjnie się propaguje. Typowe
drzewa: systemy plików, menu i hierarchie elementów UI, schematy organizacyjne, zestawy produktów, drzewa wyrażeń, zestawy
reguł.

## Struktura

```csharp
public interface INode
{
    string Name { get; }
    long Size { get; }
}

public record FileItem(string Name, long Size) : INode;                       // liść

public record Folder(string Name, List<INode> Children) : INode               // kompozyt
{
    public long Size => Children.Sum(c => c.Size);                          // deleguje do dzieci, rekurencyjnie
}

var root = new Folder("root", [
    new FileItem("a.txt", 100),
    new Folder("docs", [new FileItem("b.pdf", 2000), new FileItem("c.pdf", 3000), new Folder("empty", [])]),
    new FileItem("d.png", 500)]);

root.Size;   // 5600: klienta nie obchodzi, czy pyta plik, czy folder
```

- **Komponent**: wspólny interfejs (`INode`, `IPriced`).
- **Liść**: element bez dzieci, który wykonuje właściwą pracę (`FileItem`, `Product`).
- **Kompozyt**: element zawierający komponenty, który implementuje operacje, delegując do nich, być może z własną logiką.

Przykład z katalogu produktów: `Bundle` z długopisem (10), notesem (20) i zagnieżdżonym zestawem atramentów (15 + 15) z 10%
rabatem kosztuje 54, bo zestaw sumuje swoje elementy, niezależnie od tego, czy to produkty, czy inne zestawy, i stosuje swój
rabat.

## Zalety i kompromisy

- **Jednolitość**: kod klienta nie potrzebuje rozgałęzień `if (node is Folder)`; dodawanie nowych typów węzłów nie zmienia
  klientów (zasada otwarte-zamknięte).
- **Rekurencja za darmo**: operacje na dowolnie głębokich drzewach pisze się raz.
- **Decyzja projektowa**: gdzie umieścić metody zarządzania dziećmi (`Add`, `Remove`). Umieszczenie ich we wspólnym interfejsie
  daje przezroczystość, ale pozwala klientom wywołać `Add` na liściu (co musi rzucić wyjątek); umieszczenie ich tylko
  w kompozycie jest bezpieczniejsze, ale wymaga sprawdzania typów przy budowie drzewa. Współczesny C# zwykle preferuje
  bezpieczną opcję z niemutowalną konstrukcją.
- Uwaga na bardzo głębokie drzewa (głębokość rekurencji) i cykle, jeśli węzły mogą być współdzielone.

## W .NET

- `XElement`/`XNode` (LINQ to XML) i DOM-y HTML/JSON (`JsonNode`) to kompozyty.
- Drzewa wyrażeń: `BinaryExpression` zawiera inne `Expression`.
- `CompositeFileProvider` łączy kilka `IFileProvider` w jeden (sprawdzone: wylistował `one.txt` i `two.txt` z dwóch katalogów),
  a `CompositeChangeToken` łączy tokeny zmian.
- Frameworki UI: drzewa wizualne WPF/MAUI, drzewa komponentów Blazor/React.
- Kombinatory reguł i specyfikacji (`And`, `Or`, `Not`) budują złożone reguły.

## Źródła

- [Composite (refactoring.guru)](https://refactoring.guru/design-patterns/composite)
- [CompositeFileProvider (ASP.NET Core file providers)](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/file-providers)
- [Expression trees (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/expression-trees/)

## Pytania

### Czym jest wzorzec kompozytu? {junior}

To wzorzec strukturalny, który składa obiekty w struktury drzewiaste i pozwala klientom traktować pojedyncze obiekty (liście) i złożenia obiektów (kontenery) tak samo, przez
wspólny interfejs. Operacja wywołana na kontenerze jest rekurencyjnie stosowana do jego dzieci. Klasyczne przykłady to systemy plików (pliki i foldery), menu z podmenu
i schematy organizacyjne.

### Jakie role występują we wzorcu kompozytu? {junior}

Komponent: wspólny interfejs lub klasa abstrakcyjna, której używają klienci. Liść: element bez dzieci, który implementuje operację bezpośrednio (plik ze swoim rozmiarem).
Kompozyt: element trzymający komponenty-dzieci, który implementuje operację, delegując do nich i łącząc wyniki (folder sumujący rozmiary dzieci), być może z własną logiką
(zestaw stosujący rabat).

### Jaki problem rozwiązuje kompozyt? {mid}

Bez niego kod klienta musi wszędzie rozróżniać pojedyncze elementy i grupy (`if (x is Folder f) { foreach ... } else { ... }`), a te sprawdzenia są powielane i trzeba je
aktualizować przy każdym nowym typie węzła. Ze wspólnym interfejsem operacje takie jak „łączny rozmiar”, „łączna cena” czy „renderuj” pisze się raz na typ węzła, działają na
drzewach dowolnej głębokości i pozwalają dodawać nowe typy węzłów bez zmiany klientów.

### Gdzie deklarować metody dodawania i usuwania dzieci? {senior}

To kompromis między przezroczystością a bezpieczeństwem. Zadeklarowanie `Add`/`Remove` we wspólnym interfejsie komponentu pozwala klientom traktować wszystkie węzły
identycznie, ale liście mają wtedy metody bez sensu, które muszą rzucać wyjątek. Zadeklarowanie ich tylko w kompozycie jest bezpieczne typowo, ale kod budujący drzewo musi
wiedzieć, które węzły są kompozytami. W C# częste jest podejście bezpieczne, często z dziećmi przekazywanymi do konstruktora, żeby drzewa budować niemutowalnie.

### Podaj przykłady wzorca kompozytu w .NET. {mid}

LINQ to XML (`XElement` zawierający inne `XNode`) i `System.Text.Json.Nodes` (`JsonObject`, `JsonArray`, `JsonValue` dzielące `JsonNode`), drzewa wyrażeń (węzły `Expression`
zawierające inne wyrażenia), `CompositeFileProvider` i `CompositeChangeToken` w ASP.NET Core oraz drzewa UI w WPF, MAUI i Blazor. Wszystkie pozwalają pracować z węzłem bez
zastanawiania się, czy jest liściem, czy ma dzieci.

### Jak bezpiecznie przechodzić bardzo głębokie drzewo kompozytu? {senior}

Zastąpić rekurencję jawnym `Stack<T>` (w głąb) albo `Queue<T>` (wszerz): włożyć korzeń, a potem w pętli zdejmować węzeł, przetwarzać go i wkładać jego dzieci. Rekurencja używa
stosu wywołań, a przepełnienie stosu kończy proces .NET i nie da się go złapać. W teście iteracyjne zliczanie łańcucha o 200 000 poziomach zwróciło 200000, a wersja
rekurencyjna zakończyła się „Stack overflow.” Przechodzenie iteracyjne ułatwia też wykrywanie cykli zbiorem odwiedzonych węzłów.

### Jakie są ryzyka wzorca kompozytu? {mid}

Zbyt ogólny interfejs komponentu może zmusić liście do implementowania operacji, które ich nie dotyczą. Bardzo głębokie drzewa grożą przepełnieniem stosu przy operacjach
rekurencyjnych, a jeśli węzeł można dodać do kilku rodziców albo do własnego potomka, cykle czynią rekurencję nieskończoną. Wydajność może ucierpieć, gdy operacje wielokrotnie
przechodzą duże drzewa, co rozwiązuje cache'owanie zagregowanych wartości (np. rozmiarów folderów).

### Czym kompozyt różni się od dekoratora? {senior}

Oba używają rekurencyjnej kompozycji przez wspólny interfejs, ale dekorator opakowuje dokładnie jeden komponent, żeby dodać mu zachowanie, tworząc łańcuch, a kompozyt trzyma
dowolną liczbę dzieci, żeby reprezentować hierarchię część–całość, i agreguje ich wyniki, tworząc drzewo. Dekorator zmienia zachowanie jednego obiektu; kompozyt sprawia, że grupa
zachowuje się jak jeden obiekt.

### Jak zamodelować zestaw produktów, który może zawierać inne zestawy? {mid}

Zdefiniować wspólny interfejs `IPriced` z właściwością `Price`, zaimplementować go w `Product` (liść zwracający własną cenę) i w `Bundle` (kompozyt trzymający listę `IPriced`
i liczący sumę swoich elementów z własnym rabatem). Zagnieżdżone zestawy działają automatycznie: w teście zestaw z długopisem (10), notesem (20) i wewnętrznym zestawem atramentów
(15 + 15) z 10% rabatem kosztował 54.

### Czy drzewo komponentów UI to przykład kompozytu? {junior}

Tak. We frameworkach takich jak WPF, MAUI, Blazor czy React okno albo strona zawiera panele, które zawierają inne panele i kontrolki, a wszystkie dzielą wspólną bazę (element albo
komponent). Operacje takie jak układ, renderowanie czy propagacja zdarzeń są stosowane do korzenia i rekurencyjnie przechodzą przez drzewo, bez potrzeby osobnego traktowania
kontenerów i prostych kontrolek przez framework.
