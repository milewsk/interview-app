# Polecenie (command) {mid}

**Polecenie** zamienia żądanie w **samodzielny obiekt**, który zawiera wszystko, czego potrzeba do jego wykonania. Gdy akcja
jest obiektem, można ją przekazywać, przechowywać, kolejkować, logować, ponawiać i **cofać**. Kod, który wyzwala akcję
(**wywołujący**, invoker: przycisk, menu, harmonogram), nie musi wiedzieć, co ona robi ani który obiekt (**odbiorca**,
receiver) wykonuje pracę.

## Cofanie i ponawianie

```csharp
public interface ICommand { void Execute(); void Undo(); }

public class InsertText(TextEditor editor, string text) : ICommand
{
    public void Execute() => editor.Text += text;
    public void Undo() => editor.Text = editor.Text[..^text.Length];
}

public class DeleteLast(TextEditor editor, int count) : ICommand
{
    private string _removed = "";                                   // polecenie zapamiętuje, czego potrzebuje do cofnięcia
    public void Execute() { _removed = editor.Text[^count..]; editor.Text = editor.Text[..^count]; }
    public void Undo() => editor.Text += _removed;
}

public class CommandHistory
{
    private readonly Stack<ICommand> _undo = new(), _redo = new();
    public void Execute(ICommand c) { c.Execute(); _undo.Push(c); _redo.Clear(); }
    public void Undo() { var c = _undo.Pop(); c.Undo(); _redo.Push(c); }
    public void Redo() { var c = _redo.Pop(); c.Execute(); _undo.Push(c); }
}
```

W teście: wstaw „Hello”, wstaw „ world”, usuń ostatnie 6 znaków → `Hello`; cofnij → `Hello world`; cofnij → `Hello`; ponów →
`Hello world`. Wykonanie nowego polecenia po cofnięciu wyczyściło stos ponowień. **Makropolecenie** z dwoma wstawieniami wykonało
oba i cofnęło oba, w odwrotnej kolejności.

## Inne zastosowania

- **Kolejki i praca w tle**: polecenia trafiają do kolejki (`Channel<T>`, broker komunikatów) i są wykonywane później przez
  workera; w teście worker odczytał z kanału dwa zadania `SendEmail` i wykonał je po kolei. Serializowalne polecenia można
  utrwalać, ponawiać i wysyłać do innych procesów.
- **Polecenia CQRS**: `record PlaceOrder(...)` z osobnym handlerem to obiekt polecenia: dane żądania są oddzielone od jego
  wykonania, a mediator albo szyna komunikatów dostarcza je do handlera. W przeciwieństwie do polecenia GoF logikę zawiera
  handler, a nie samo polecenie.
- **UI**: `ICommand` z WPF/MAUI (`Execute`, `CanExecute`, `CanExecuteChanged`) wiąże przyciski i pozycje menu z akcjami;
  `RelayCommand`/`AsyncRelayCommand` z MVVM Toolkit opakowują delegaty.
- W C# **delegat** (`Action`, `Func<Task>`) to najlżejsze polecenie, gdy nie potrzeba cofania, metadanych ani serializacji.

## Źródła

- [Command (refactoring.guru)](https://refactoring.guru/design-patterns/command)
- [Commanding overview (WPF)](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/commanding-overview)
- [RelayCommand (MVVM Toolkit)](https://learn.microsoft.com/en-us/dotnet/communitytoolkit/mvvm/relaycommand)
- [Channels (.NET)](https://learn.microsoft.com/en-us/dotnet/core/extensions/channels)

## Pytania

### Czym jest wzorzec polecenia? {junior}

To wzorzec behawioralny, który zamyka żądanie w obiekcie ze wszystkim, czego potrzeba do jego wykonania: odbiorcą, akcją i parametrami. Obiekt wyzwalający akcję (wywołujący)
tylko woła `Execute()` i nie wie, co się dzieje. Ponieważ akcje stają się obiektami, można je przechowywać, kolejkować, logować, ponawiać i cofać.

### Jakie role występują we wzorcu polecenia? {junior}

Polecenie deklaruje metodę wykonania (`Execute`, często `Undo`). Konkretne polecenie wiąże akcję z odbiorcą i trzyma jej parametry. Odbiorca to obiekt wykonujący właściwą pracę
(edytor tekstu, konto). Wywołujący wyzwala polecenia, nie znając ich szczegółów (przycisk, pasek narzędzi, harmonogram, menedżer cofania). Klient tworzy polecenia i konfiguruje je
odbiorcami.

### Jak zaimplementować cofanie i ponawianie za pomocą poleceń? {mid}

Każde polecenie implementuje `Undo()` i trzyma stan potrzebny do odwrócenia siebie (np. usunięty tekst). Obiekt historii wykonuje polecenia i odkłada je na stos cofania; cofnięcie
zdejmuje polecenie, woła `Undo` i odkłada je na stos ponowień; ponowienie robi odwrotnie. Wykonanie nowego polecenia czyści stos ponowień. Alternatywą przy złożonym stanie jest
zapamiętywanie migawek (memento) zamiast operacji odwrotnych.

### Czym jest makropolecenie? {mid}

To polecenie złożone z innych poleceń (wzorzec kompozytu zastosowany do poleceń): jego wykonanie wykonuje dzieci po kolei, a cofnięcie cofa je w odwrotnej kolejności. Pozwala
nagrywać i odtwarzać sekwencje akcji albo traktować wieloetapową operację jako jedną cofalną jednostkę.

### Jak wzorzec polecenia wykorzystuje się do kolejkowania i przetwarzania w tle? {mid}

Skoro polecenie jest obiektem z danymi, można je umieścić w kolejce i wykonać później w innym komponencie: w procesie przez `Channel<T>` czytany przez serwis w tle albo jako
zserializowany komunikat wysłany do brokera i obsłużony przez inny serwis. Oddziela to przyjęcie żądania od jego wykonania, wygładza skoki obciążenia i pozwala ponawiać. Polecenia
przekraczające granice procesów muszą być serializowalne, a ich handlery idempotentne.

### Jak polecenia CQRS mają się do wzorca polecenia GoF? {senior}

Oba reprezentują żądanie jako obiekt, ale w CQRS polecenie to zwykle prosty obiekt danych (`record PlaceOrder(...)`) opisujący zamiar zmiany stanu, a logikę zawiera osobny handler;
mediator albo szyna komunikatów kieruje polecenie do handlera. We wzorcu GoF sam obiekt polecenia wykonuje akcję na odbiorcy i często obsługuje cofanie. Polecenia CQRS nazywa się
w trybie rozkazującym, waliduje i mogą zostać odrzucone.

### Czym jest `ICommand` w WPF i MAUI? {mid}

To interfejs z `Execute(object)`, `CanExecute(object)` i zdarzeniem `CanExecuteChanged`, używany do wiązania elementów UI (przycisków, pozycji menu, skrótów klawiszowych) z akcjami
w view modelu zamiast handlerów zdarzeń w code-behind. Kontrolka sama się wyłącza, gdy `CanExecute` zwraca false. Implementacje takie jak `RelayCommand` i `AsyncRelayCommand` z MVVM
Toolkit opakowują delegaty, więc nie pisze się klasy na każdą akcję.

### Kiedy wystarczy delegat zamiast klasy polecenia? {mid}

Gdy akcja nie ma cofania ani metadanych i nie jest serializowana: `Action` albo `Func<Task>` zapisane w liście albo przekazane do harmonogramu to polecenie we wszystkim poza nazwą.
Klasa jest lepsza, gdy polecenie potrzebuje `Undo`, nazwy lub opisu do logowania i historii, walidacji, musi być serializowane do kolejki albo jego handler potrzebuje wstrzykniętych
zależności.

### Jakie są wady wzorca polecenia? {mid}

Każda akcja staje się klasą (albo poleceniem i handlerem), co dodaje wiele małych typów i pośredniość, więc proste operacje trudniej prześledzić. Cofanie wymaga, żeby każde polecenie
poprawnie zapamiętywało i przywracało stan, co jest podatne na błędy przy operacjach ze skutkami poza odbiorcą (wysyłka e-maili, wywołania API), których naprawdę nie da się cofnąć
i które zamiast tego wymagają akcji kompensujących.

### Jak sprawić, żeby kolejkowane polecenia można było bezpiecznie ponawiać? {senior}

Uczynić handlery idempotentnymi: nadać każdemu poleceniu unikalny identyfikator i zapisywać przetworzone identyfikatory (albo korzystać z naturalnej idempotencji, np. „ustaw status
na Paid” zamiast „dodaj płatność”), żeby polecenie dostarczone dwukrotnie po awarii albo przekroczeniu czasu nie miało dodatkowego efektu. Łączy się to z utrwaleniem polecenia przed
jego potwierdzeniem (np. wzorzec outbox), polityką ponowień z odstępami i kolejką martwych komunikatów dla poleceń, które ciągle zawodzą.
