# CLR, JIT i kompilacja w .NET {mid}

„Co się dzieje między napisaniem kodu C# a jego uruchomieniem?” to klasyczne pytanie otwierające. Krótka odpowiedź:
kompilator tworzy **IL**, a **CLR** zamienia go w kod maszynowy w czasie wykonania kompilatorem **JIT**, chyba że
aplikacja jest skompilowana z wyprzedzeniem (**AOT**).

## Od kodu źródłowego do kodu maszynowego

1. Kompilator C# **Roslyn** kompiluje pliki `.cs` do **IL** (Intermediate Language, też CIL/MSIL) plus **metadanych**
   (typy, składowe, referencje), spakowanych w **assembly** (`.dll` lub `.exe`). IL nie zależy od procesora.
2. Przy starcie **CLR** (Common Language Runtime) ładuje assembly, weryfikuje typy i przygotowuje środowisko: GC,
   wyjątki, system typów, bezpieczeństwo, interop.
3. Gdy metoda zostaje wywołana pierwszy raz, kompilator **JIT** (just-in-time) tłumaczy jej IL na kod natywny dla
   bieżącego procesora, a kolejne wywołania używają skompilowanego kodu.

```csharp
static int Add(int a, int b) => a + b;
// IL: 02 03 58 2A  →  ldarg.0, ldarg.1, add, ret
```

W teście pierwsze wywołanie metody (razem z JIT) zajęło ~150 µs, a kolejne było praktycznie darmowe.

## Kompilacja warstwowa i PGO

JIT musi pogodzić szybkość kompilacji z jakością kodu:

- **Tier 0**: szybka kompilacja bez optymalizacji (quick JIT) albo załadowanie kodu ReadyToRun, więc aplikacja szybko
  startuje.
- **Tier 1**: często wywoływane metody są kompilowane ponownie **w tle** z pełnymi optymalizacjami.
- **Dynamiczne PGO** (profile-guided optimization, domyślnie włączone od .NET 8): kod tier 0 zbiera profil (jakie typy
  naprawdę występują, które gałęzie są wybierane), a tier 1 go wykorzystuje, np. do dewirtualizacji wywołań przez
  interfejs i lepszego inliningu.

Oznacza to, że kod .NET przyspiesza po „rozgrzaniu”, a krótkie benchmarki bez rozgrzewki dają mylące wyniki, dlatego
BenchmarkDotNet wykonuje iteracje rozgrzewające.

## ReadyToRun i Native AOT

| | JIT (domyślnie) | ReadyToRun | Native AOT |
|---|---|---|---|
| Kiedy powstaje kod natywny | w czasie wykonania | przy publikacji, plus JIT w razie potrzeby | w całości przy publikacji |
| Start | wolniejszy | szybszy | najszybszy |
| Szczytowa wydajność | najlepsza (tier 1 + PGO) | dobra (gorące metody są kompilowane ponownie) | dobra, bez PGO w czasie wykonania |
| Rozmiar | mały | większy | samodzielny, przycięty |
| Ograniczenia | brak | brak | brak `Reflection.Emit`, brak dynamicznego ładowania assembly, wymagany trimming |

**Native AOT** (`<PublishAot>true</PublishAot>`) tworzy jeden samodzielny plik natywny bez JIT-a: szybszy start
i mniejsze zużycie pamięci, idealne dla funkcji serverless, kontenerów i narzędzi CLI. Ale cała aplikacja musi być
zgodna: brak generowania kodu w czasie wykonania (`System.Reflection.Emit`), brak `Assembly.LoadFile`, ograniczona
refleksja (trimming usuwa nieużywany kod), a biblioteki, które na tym polegają (część serializatorów, starsze ORM-y),
potrzebują zamiast tego generatorów kodu. Na Windows publikacja wymaga narzędzi C++ z Visual Studio (linkera).

## Inne pojęcia

- **Kod zarządzany** (managed): działa pod kontrolą CLR (GC, bezpieczeństwo typów, wyjątki). **Kod niezarządzany**
  (unmanaged): kod natywny (C/C++, API systemu), wywoływany przez P/Invoke.
- **CTS / CLS**: Common Type System definiuje typy wspólne dla języków .NET (C#, F#, VB), a Common Language
  Specification to podzbiór gwarantujący współpracę między językami.
- **BCL**: Base Class Library (`System.*`), a podstawowe typy są w `System.Private.CoreLib`.
- **Framework-dependent a self-contained**: aplikacja używa środowiska .NET zainstalowanego na maszynie albo przynosi
  własne (większa, ale niezależna).

## .NET, .NET Framework i .NET Standard

- **.NET Framework** (do 4.8.1): tylko Windows, w trybie utrzymania, dostaje tylko poprawki.
- **.NET** (dawniej .NET Core; .NET 5+): wieloplatformowy, open source, aktywnie rozwijany. Nowa wersja wychodzi
  **co listopad**. Wersje parzyste to **LTS** (3 lata wsparcia: .NET 8, .NET 10), nieparzyste to **STS** (2 lata:
  .NET 9).
- **.NET Standard**: specyfikacja API wspólnego dla starych implementacji, używana przez biblioteki działające i na
  .NET Framework, i na .NET. Nowy kod przeznaczony tylko dla nowoczesnego .NET celuje np. w `net10.0`.

## Źródła

- [Common Language Runtime (CLR) overview](https://learn.microsoft.com/en-us/dotnet/standard/clr)
- [Managed execution process](https://learn.microsoft.com/en-us/dotnet/standard/managed-execution-process)
- [Compilation config settings (tiered compilation, PGO)](https://learn.microsoft.com/en-us/dotnet/core/runtime-config/compilation)
- [ReadyToRun compilation](https://learn.microsoft.com/en-us/dotnet/core/deploying/ready-to-run)
- [Native AOT deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/)
- [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)

## Pytania

### Czym jest CLR i co robi? {junior}

Common Language Runtime to środowisko uruchomieniowe .NET. Ładuje assembly, kompiluje IL do kodu maszynowego przez JIT, zarządza pamięcią przez
garbage collector, obsługuje wyjątki, pilnuje bezpieczeństwa typów i zapewnia interop z kodem natywnym. Kod działający pod jego kontrolą nazywa
się kodem zarządzanym.

### Czym jest IL i po co .NET go używa? {junior}

Intermediate Language to niezależny od procesora zestaw instrukcji, do którego kompiluje się C# (i F#, VB), przechowywany w assembly razem
z metadanymi. Dzięki IL jedno assembly działa na różnych systemach i procesorach, języki mogą ze sobą współpracować, a JIT może optymalizować kod
pod konkretną maszynę, na której działa.

### Jak działa kompilacja JIT? {mid}

Przy pierwszym wywołaniu metody JIT kompiluje jej IL do kodu natywnego, a kolejne wywołania używają skompilowanej wersji. Przy kompilacji
warstwowej metoda najpierw kompiluje się szybko bez optymalizacji (tier 0), a jeśli jest często wywoływana, kompiluje się ponownie w tle
z pełnymi optymalizacjami (tier 1). Daje to szybki start i dobrą wydajność gorącego kodu.

### Czym jest kompilacja warstwowa i dynamiczne PGO? {senior}

Kompilacja warstwowa najpierw kompiluje metody szybko (tier 0), a często używane kompiluje ponownie z optymalizacjami (tier 1). Dynamiczne PGO,
domyślnie włączone od .NET 8, dodaje do kodu tier 0 instrumentację zapisującą, jakie typy i ścieżki kodu naprawdę występują, a tier 1 używa tego
profilu do dewirtualizacji, inliningu i układu kodu. W efekcie działająca aplikacja może być szybsza niż skompilowana czysto statycznie.

### Czym jest Native AOT i jakie ma ograniczenia? {mid}

Native AOT kompiluje całą aplikację do kodu natywnego przy publikacji i tworzy samodzielny plik bez JIT-a. Daje szybki start i małe zużycie
pamięci, co pasuje do serverless, kontenerów i narzędzi CLI. Ograniczenia: brak generowania kodu w czasie wykonania (`Reflection.Emit`), brak
dynamicznego ładowania assembly, wymagany trimming (nieużywany kod jest usuwany, więc refleksję trzeba adnotować), a niektóre biblioteki muszą
używać generatorów kodu zamiast refleksji.

### Czym różni się ReadyToRun od Native AOT? {senior}

ReadyToRun prekompiluje IL do kodu natywnego przy publikacji, ale zachowuje IL i JIT: start jest szybszy, gorące metody nadal są kompilowane
ponownie przez tier 1, a wszystkie funkcje .NET działają. Native AOT całkowicie usuwa JIT, więc aplikacja startuje najszybciej i zużywa najmniej
pamięci, ale ma ograniczenia: brak dynamicznego kodu i wymagany trimming. ReadyToRun to bezpieczna optymalizacja startu, a Native AOT to
poważniejsza decyzja architektoniczna.

### Jaka jest różnica między .NET Framework, .NET i .NET Standard? {junior}

.NET Framework to stara implementacja tylko dla Windows (ostatnia wersja 4.8.1), obecnie tylko utrzymywana. .NET (dawniej .NET Core, teraz .NET 5
i nowsze) jest wieloplatformowy, open source i aktywnie rozwijany, z nową wersją co roku. .NET Standard to specyfikacja wspólnego API, która
pozwala jednej bibliotece działać na obu, i ma znaczenie głównie dla bibliotek, które nadal muszą wspierać .NET Framework.

### Czym różnią się wersje LTS i STS? {junior}

Wersje LTS (Long Term Support) mają 3 lata wsparcia, a wersje STS (Standard Term Support) 2 lata. Nowa wersja główna wychodzi co listopad,
a numery parzyste to LTS (.NET 8, .NET 10), nieparzyste to STS (.NET 9, .NET 11). Systemy produkcyjne zwykle wybierają wersje LTS, żeby nie
aktualizować się co roku.

### Czym jest assembly? {junior}

To jednostka wdrożenia i wersjonowania w .NET: plik `.dll` lub `.exe` zawierający kod IL, metadane opisujące typy i składowe, manifest (nazwa,
wersja, referencje do innych assembly) i opcjonalnie zasoby. Assembly są ładowane przez CLR, referencjonowane przez projekty i dystrybuowane jako
pakiety NuGet.

### Dlaczego mikrobenchmark bez rozgrzewki może dawać mylące wyniki? {mid}

Pierwsze wywołania obejmują kompilację JIT, a przez jakiś czas kod działa jako niezoptymalizowany tier 0. Dopiero gdy stanie się gorący, jest
kompilowany ponownie z optymalizacjami i PGO. Pomiar wykonany za wcześnie pokazuje głównie koszt kompilacji i wolny kod. Dlatego narzędzia takie
jak BenchmarkDotNet wykonują iteracje rozgrzewające, powtarzają pomiary i raportują statystyki, a `Stopwatch` wokół pojedynczego wywołania nie
jest wiarygodnym benchmarkiem.
