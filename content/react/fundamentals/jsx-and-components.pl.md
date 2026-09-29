# JSX, komponenty i propsy {junior}

**Komponent** to funkcja zwracająca opis UI. **JSX** to składnia przypominająca HTML, którą
kompilator (Babel, SWC, esbuild) zamienia na wywołania funkcji tworzących **elementy**, czyli zwykłe
obiekty opisujące, co ma się pojawić na ekranie.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1 className="title">Cześć, {name}!</h1>
}

// po kompilacji (automatic JSX runtime):
import { jsx as _jsx } from 'react/jsx-runtime'
function Greeting({ name }) {
  return _jsx('h1', { className: 'title', children: ['Cześć, ', name, '!'] })
}
```

## Zasady JSX

- Wyrażenia JavaScript wstawia się w `{}`: zmienne, wywołania, operatory. Instrukcji (`if`, `for`)
  wstawić nie można.
- Atrybuty w camelCase: `className`, `htmlFor`, `onClick`, `tabIndex`. `style` przyjmuje obiekt
  `{{ marginTop: 8 }}`.
- Komponent zwraca **jeden** element nadrzędny. Kilka elementów opakowuje się we **fragment**
  `<>...</>` (albo `<Fragment key={...}>`, gdy potrzebny jest klucz).
- Nazwy komponentów zaczynają się **wielką literą**: `<Button />` to komponent, a `<button />` to tag HTML.
- `false`, `null`, `undefined` i `true` nie renderują niczego, ale **`0` i `NaN` już tak**:

```tsx
{count && <Badge count={count} />}      // 🔴 dla count === 0 wyświetli „0”
{count > 0 && <Badge count={count} />}  // ✅
{isAdmin ? <AdminPanel /> : <Guest />}  // warunek z alternatywą
```

## Element, komponent, instancja

- **Komponent**: funkcja (lub klasa), np. `Greeting`.
- **Element**: niemutowalny obiekt zwracany przez JSX, np. `{ type: Greeting, props: { name: 'Ala' } }`.
  Tanie do utworzenia, bo to tylko opis.
- **Instancja**: „żywy” egzemplarz komponentu w drzewie. React przechowuje z nim stan i efekty.

## Propsy

- Propsy przekazuje się jak atrybuty i odbiera jako **pierwszy argument** funkcji (zwykle z destrukturyzacją
  i wartościami domyślnymi: `function Avatar({ size = 40 })`).
- Propsy są **tylko do odczytu**. Komponent nie może ich zmieniać, a zmianę danych obsługuje stan.
- **Jednokierunkowy przepływ danych**: dane płyną w dół przez propsy, a informacje w górę przez
  **callbacki** przekazane jako propsy:

```tsx
function Parent() {
  const [value, setValue] = useState('')
  return <SearchBox value={value} onChange={setValue} />
}
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} />
}
```

- **`children`** to specjalny prop z zawartością między tagami. Pozwala budować komponenty-kontenery
  (`<Card><p>...</p></Card>`).
- Spread `{...props}` przekazuje wszystkie propsy dalej. Jest wygodny w komponentach opakowujących,
  ale łatwo nim przekazać coś niechcianego do DOM.

## Czystość komponentów

Render musi być **czysty**: dla tych samych propsów, stanu i kontekstu zwraca ten sam JSX i nie ma
efektów ubocznych (nie modyfikuje zmiennych spoza siebie, nie wysyła zapytań, nie zmienia DOM). Dzięki
temu React może renderować wielokrotnie, przerywać render i pomijać go. W `StrictMode` (dev) React
wywołuje render dwukrotnie właśnie po to, żeby wykryć nieczystość.

## Bezpieczeństwo: XSS

React **escapuje** tekst wstawiany w `{}`, więc `'<b>x</b>'` wyświetli się jako tekst, a nie HTML.
Surowy HTML wstawia się tylko przez `dangerouslySetInnerHTML={{ __html: html }}`, a wtedy trzeba go
najpierw zsanityzować (np. DOMPurify). Uwaga też na atrybut `href` z danymi od użytkownika
(`javascript:`).

## Źródła

- [Writing markup with JSX (react.dev)](https://react.dev/learn/writing-markup-with-jsx)
- [Passing props to a component (react.dev)](https://react.dev/learn/passing-props-to-a-component)
- [Conditional rendering (react.dev)](https://react.dev/learn/conditional-rendering)
- [Keeping components pure (react.dev)](https://react.dev/learn/keeping-components-pure)
- [Introducing the new JSX transform (React blog)](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)

## Pytania

### Czym jest JSX i na co jest kompilowany? {junior}

To rozszerzenie składni JavaScriptu przypominające HTML. Kompilator zamienia każdy tag na wywołanie
funkcji tworzącej element: w nowym runtime `jsx()` z `react/jsx-runtime`, w starym
`React.createElement()`. Wynikiem jest zwykły obiekt opisujący typ elementu i jego propsy. Dlatego
w `{}` można wstawiać tylko wyrażenia, a nie instrukcje.

### Czym różni się komponent od elementu? {junior}

Komponent to funkcja (lub klasa), która zwraca opis UI. Element to wynik JSX, czyli lekki,
niemutowalny obiekt `{ type, props }` mówiący, co wyrenderować. React wywołuje komponenty, żeby
dostać elementy, i na ich podstawie aktualizuje DOM. Instancja to z kolei „żywy” egzemplarz komponentu
w drzewie, z którym React wiąże stan.

### Dlaczego nazwa komponentu musi zaczynać się wielką literą? {junior}

JSX na tej podstawie odróżnia komponenty od elementów HTML. `<button>` kompiluje się do typu `'button'`
(string, tag DOM), a `<Button>` do referencji do zmiennej `Button`. Komponent nazwany małą literą
zostałby potraktowany jak nieznany tag HTML.

### Czy komponent może modyfikować swoje propsy? Jak dziecko przekazuje dane do rodzica? {junior}

Nie. Propsy są tylko do odczytu, a dane płyną w jedną stronę: z góry w dół. Dziecko informuje rodzica
o zmianach, wywołując **callback** przekazany w propsach (np. `onChange(value)`). Rodzic aktualizuje
swój stan, a nowa wartość wraca w dół jako prop. To wzorzec „podnoszenia stanu”.

### Co wyświetli `{items.length && <List items={items} />}` dla pustej tablicy? {junior}

Wyświetli `0`. Operator `&&` zwraca pierwszą fałszywą wartość, czyli liczbę `0`, a React renderuje
liczby. Nie wyświetla tylko `false`, `null`, `undefined` i `true`. Poprawnie: `items.length > 0 && ...`
albo operator trójargumentowy.

### Do czego służy prop `children`? {junior}

Zawiera wszystko, co umieszczono między tagiem otwierającym a zamykającym komponentu. Pozwala budować
komponenty-kontenery (`Card`, `Modal`, `Layout`), które nie wiedzą, co dokładnie wyświetlają. To
podstawowy mechanizm kompozycji w React, zamiast dziedziczenia.

### Czym jest fragment i kiedy potrzebuje klucza? {mid}

Fragment (`<>...</>`) grupuje kilka elementów bez dodawania węzła do DOM, bo komponent musi zwrócić
jeden element nadrzędny, a dodatkowy `div` mógłby zepsuć układ lub semantykę (np. w tabeli). Skróconej
składni nie da się oznaczyć kluczem, więc przy renderowaniu listy fragmentów używa się
`<Fragment key={item.id}>`.

### Jak React chroni przed XSS i kiedy ta ochrona nie działa? {mid}

Tekst wstawiany w `{}` jest escapowany, więc znaczniki HTML wyświetlają się jako tekst. Ochrona nie
działa przy `dangerouslySetInnerHTML` (HTML trzeba zsanityzować, np. DOMPurify), przy URL-ach z danych
użytkownika w `href`/`src` (np. `javascript:`), przy bezpośredniej manipulacji DOM przez refy oraz
przy renderowaniu po stronie serwera bez odpowiedniego escapowania danych wstrzykiwanych do skryptów.

### Co to znaczy, że komponent powinien być czysty? {mid}

Dla tych samych propsów, stanu i kontekstu zwraca ten sam JSX i w trakcie renderu nie ma efektów
ubocznych: nie modyfikuje zewnętrznych zmiennych ani obiektów przekazanych w propsach, nie wysyła
zapytań, nie zmienia DOM. Efekty uboczne należą do handlerów zdarzeń i efektów. Czystość pozwala
Reactowi bezpiecznie renderować wielokrotnie (StrictMode), przerywać render (funkcje współbieżne)
i memoizować (React Compiler).

### Czy każdy komponent musi coś zwracać? {junior}

Tak, ale może to być `null`, co oznacza „nic nie renderuj”. Komponent może też zwrócić string, liczbę,
tablicę elementów (z kluczami) albo fragment. Zwrócenie `undefined` jest dozwolone od React 18, ale
zwykle świadczy o zapomnianym `return`, dlatego lepiej jawnie zwracać `null`.
