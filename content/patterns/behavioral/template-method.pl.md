# Metoda szablonowa (template method) {mid}

**Metoda szablonowa** definiuje **szkielet algorytmu w klasie bazowej** i pozwala podklasom nadpisywać **konkretne kroki** bez
zmiany ogólnej struktury. Klasa bazowa kontroluje kolejność operacji, a podklasy dostarczają szczegółów. To ponowne użycie
przez dziedziczenie, z którego frameworki .NET korzystają intensywnie: `BackgroundService`, `Stream`,
`DbContext.OnModelCreating`, `AuthenticationHandler<T>` w ASP.NET Core.

## Struktura

```csharp
public abstract class DataExporter
{
    public string Export(int[] rows)                             // metoda szablonowa: stały szkielet, niewirtualna
    {
        var sb = new StringBuilder();
        sb.Append(Header());
        for (int i = 0; i < rows.Length; i++) sb.Append(FormatRow(rows[i], i == rows.Length - 1));
        sb.Append(Footer());
        return sb.ToString();
    }

    protected abstract string FormatRow(int row, bool last);    // krok wymagany: podklasy muszą go zaimplementować
    protected virtual string Header() => "";                     // hook: krok opcjonalny z domyślną implementacją
    protected virtual string Footer() => "";
}

public class CsvExporter : DataExporter
{
    protected override string Header() => "value\n";
    protected override string FormatRow(int r, bool last) => $"{r}\n";
}

public class JsonExporter : DataExporter
{
    protected override string Header() => "[";
    protected override string FormatRow(int r, bool last) => last ? $"{r}" : $"{r},";
    protected override string Footer() => "]";
}
```

Sprawdzone: dla `[1, 2, 3]` eksporter CSV zwrócił `value`, `1`, `2`, `3` w osobnych wierszach, a eksporter JSON `[1,2,3]`,
oba przez ten sam szkielet `Export`.

- **Kroki abstrakcyjne** trzeba zaimplementować; **hooki** to metody wirtualne z domyślną (często pustą) implementacją, które
  podklasy mogą nadpisać.
- Sama metoda szablonowa jest **niewirtualna** (w C# metody domyślnie nie są wirtualne), więc podklasy nie mogą zmienić
  kolejności kroków.
- Kroki są `protected`: to punkty rozszerzeń dla podklas, a nie część publicznego API.
- To „zasada Hollywood”: *nie dzwoń do nas, my zadzwonimy do ciebie*; klasa bazowa wywołuje kod podklasy.

## W .NET

- **`BackgroundService`**: `StartAsync`/`StopAsync` obsługują cykl życia, a nadpisuje się tylko `ExecuteAsync`. W teście
  `BackgroundService` liczący takty co 100 ms wykonał 4 takty i zatrzymał się czysto przy zatrzymaniu hosta, bo klasa bazowa
  anulowała token przekazany do `ExecuteAsync`.
- **`Stream`**: strumienie pochodne nadpisują `Read`/`Write`, a klasa bazowa buduje na nich `CopyTo`, `ReadAsync` i inne.
- **`DbContext`**: `OnConfiguring`/`OnModelCreating` to hooki wywoływane podczas inicjalizacji EF Core.
- **`AuthenticationHandler<TOptions>`**: implementuje się `HandleAuthenticateAsync`, a resztą przepływu schematu zajmuje się
  klasa bazowa.
- Metody przygotowania i sprzątania w **xUnit/NUnit**, hooki filtrów akcji w `Controller` (`OnActionExecuting`).

## Metoda szablonowa a strategia

Metoda szablonowa zmienia części algorytmu przez **dziedziczenie** (w czasie kompilacji, jedna podklasa na wariant); strategia
podmienia cały algorytm przez **kompozycję** (w czasie wykonania, wstrzyknięty obiekt). Współczesny kod C# często woli strategię
albo delegaty (np. przekazanie `Func<int, string> formatRow`), bo głębokie hierarchie dziedziczenia są sztywne i trudniej je
testować, ale metoda szablonowa pozostaje naturalnym wyborem we frameworkach, które dają klasę bazową do rozszerzenia.

## Źródła

- [Template Method (refactoring.guru)](https://refactoring.guru/design-patterns/template-method)
- [Worker services (BackgroundService)](https://learn.microsoft.com/en-us/dotnet/core/extensions/workers)

## Pytania

### Czym jest wzorzec metody szablonowej? {junior}

To wzorzec behawioralny, w którym klasa bazowa definiuje szkielet algorytmu w metodzie wywołującej sekwencję kroków, z których część jest abstrakcyjna albo wirtualna. Podklasy
nadpisują kroki, żeby dostarczyć konkretne zachowanie, ale nie mogą zmienić ogólnej struktury ani kolejności. Wspólny algorytm jest wykorzystywany ponownie, a w podklasach są tylko
różnice.

### Czym różni się krok abstrakcyjny od hooka? {mid}

Krok abstrakcyjny nie ma implementacji w klasie bazowej, więc każda podklasa musi go zaimplementować (np. formatowanie wiersza). Hook to metoda wirtualna z domyślną implementacją,
często pustą, którą podklasy mogą nadpisać, jeśli potrzebują (np. nagłówek albo stopka, `OnBeforeSave`). Hooki dają opcjonalne punkty rozszerzeń, nie zmuszając każdej podklasy do ich
implementowania.

### Dlaczego sama metoda szablonowa nie powinna być nadpisywalna? {mid}

Bo jej zadaniem jest ustalenie kolejności i struktury algorytmu; gdyby podklasy mogły ją nadpisać, mogłyby pomijać kroki, zmieniać kolejność albo łamać niezmienniki, na których
polega klasa bazowa. W C# metody domyślnie nie są wirtualne, więc wystarczy nie oznaczać metody szablonowej jako `virtual` (albo zapieczętować nadpisanie). Kroki robi się
`protected`, żeby były punktami rozszerzeń, a nie publicznym API.

### Czym jest zasada Hollywood? {mid}

„Nie dzwoń do nas, my zadzwonimy do ciebie”: komponenty wysokiego poziomu (klasa bazowa, framework) wywołują kod niskiego poziomu we właściwym momencie, zamiast kodu niskiego poziomu
wywołującego framework. Metoda szablonowa ją stosuje: klasa bazowa wywołuje nadpisane kroki podklasy. Frameworki opierają się na niej ogólnie i to odróżnia framework (wywołuje twój
kod) od biblioteki (ty ją wywołujesz).

### Podaj przykłady metody szablonowej w .NET. {mid}

`BackgroundService`, w którym nadpisuje się tylko `ExecuteAsync`, a klasa bazowa obsługuje uruchamianie i zatrzymywanie; `Stream`, w którym klasy pochodne implementują `Read`/`Write`
i dziedziczą `CopyTo` oraz asynchroniczne opakowania; `DbContext.OnModelCreating` i `OnConfiguring`; `AuthenticationHandler<T>.HandleAuthenticateAsync`; hooki kontrolerów i filtrów,
takie jak `OnActionExecuting`; oraz metody przygotowania i sprzątania we frameworkach testowych.

### Czym metoda szablonowa różni się od strategii? {mid}

Metoda szablonowa używa dziedziczenia: klasa bazowa ustala algorytm, a podklasy nadpisują jego części, wybierane w czasie kompilacji przez wybór podklasy. Strategia używa kompozycji:
cały algorytm to obiekt wstrzyknięty do kontekstu, który można podmienić w czasie wykonania. Metoda szablonowa unika powielania szkieletu; strategia unika dziedziczenia i pozwala łączyć
niezależne warianty.

### Jakie są wady metody szablonowej? {mid}

Opiera się na dziedziczeniu, które mocno wiąże podklasy z klasą bazową: zmiany w bazie mogą zepsuć podklasy (problem kruchej klasy bazowej), a klasa może mieć tylko jedną klasę
bazową, więc łączenie wariantów wymaga podklasy na każdą kombinację. Zrozumienie przepływu wymaga czytania i bazy, i podklasy. Wiele drobnych nadpisań może też naruszać zasadę
podstawienia Liskov, jeśli podklasy łamią założenia bazy.

### Jak zastąpić metodę szablonową kompozycją? {senior}

Wydzielić zmienne kroki do interfejsów albo delegatów i wstrzykiwać je: zamiast podklas nadpisujących `FormatRow`, `Header` i `Footer` eksporter przyjmuje `IRowFormatter` (albo
`Func<int, string>`) i opcjonalnych dostawców nagłówka i stopki. Szkielet zostaje w jednej nieabstrakcyjnej klasie, warianty można dowolnie łączyć i osobno testować, a nowe warianty
nie potrzebują hierarchii klas. To dobra zamiana, gdy niezależnych wariantów jest wiele.

### Jak `BackgroundService` wykorzystuje wzorzec metody szablonowej? {mid}

`BackgroundService` implementuje `IHostedService`: jego `StartAsync` uruchamia twoje `ExecuteAsync` i wraca, a `StopAsync` anuluje token zatrzymania i czeka na zakończenie
`ExecuteAsync`. Nadpisuje się tylko `ExecuteAsync`, wykonując pętlę do anulowania tokenu. Logika cyklu życia, w której łatwo o błąd, jest w klasie bazowej, a pisze się tylko samą pracę.

### Czy `OnModelCreating` w EF Core to metoda szablonowa? {senior}

To hook w metodzie szablonowej: proces budowania modelu w EF Core wykonuje stałą sekwencję (konwencje, wykrywanie typów encji z właściwości `DbSet`, stosowanie adnotacji danych)
i w określonym momencie wywołuje wirtualne `OnModelCreating`, w którym konfiguruje się model przez Fluent API. Implementacja bazowa nie robi nic istotnego, więc nadpisanie jest
opcjonalne; o tym, kiedy się wykona, decyduje framework, a wynik jest cache'owany per typ kontekstu.
