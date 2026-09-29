# useTransition i useDeferredValue {mid}

Oba hooki należą do **renderowania współbieżnego** (concurrent rendering, React 18+). Pozwalają oznaczyć
część aktualizacji jako **mniej pilną**, żeby pilne interakcje (wpisywanie, klikanie) pozostały płynne,
nawet gdy przerenderowanie dużej części UI jest kosztowne.

- **Pilne** aktualizacje: odpowiedź na bezpośrednią akcję użytkownika (tekst w polu, stan przycisku)
  musi być natychmiastowa.
- **Transition**: przejście między widokami (wyniki wyszukiwania, zmiana zakładki, nawigacja) może chwilę
  poczekać, a React może je przerwać, jeśli pojawi się pilniejsza aktualizacja.

## useTransition

```tsx
function Tabs() {
  const [tab, setTab] = useState('about')
  const [isPending, startTransition] = useTransition()

  function selectTab(next: string) {
    startTransition(() => {
      setTab(next)              // aktualizacja o niskim priorytecie
    })
  }

  return (
    <>
      <TabButtons onSelect={selectTab} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <TabContent tab={tab} />   {/* może być kosztowny lub się zawieszać */}
      </div>
    </>
  )
}
```

- `isPending` sygnalizuje trwające przejście, więc można pokazać subtelny wskaźnik zamiast blokować UI.
- Render w ramach transition jest **przerywalny**: jeśli użytkownik w tym czasie kliknie inną zakładkę,
  React porzuci niedokończoną pracę.
- Jeśli nowa treść się **zawiesi** (Suspense), React **zachowa dotychczasowy UI** zamiast pokazywać
  fallback. Tak działają nawigacje w routerach.
- React 19: `startTransition` przyjmuje **funkcję async** (to jest „Action”). `isPending` jest `true`
  przez cały czas jej trwania. Aktualizacje stanu **po `await`** trzeba ponownie opakować
  w `startTransition`.
- Błędy rzucone w transition trafiają do najbliższego Error Boundary.
- Poza komponentem (np. w routerze) używa się samodzielnej funkcji `startTransition` z `react`.

**Ograniczenie**: nie steruje się transition wartością pola tekstowego. `setText` musi być pilne, bo
inaczej wpisywanie będzie się rwać. Dzieli się stan na pilny (tekst w polu) i odroczony (wyniki):

## useDeferredValue

Gdy nie kontrolujesz miejsca aktualizacji (np. wartość przychodzi w propsach), możesz **odroczyć samą
wartość**:

```tsx
function SearchPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />   {/* pilne */}
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <SlowResults query={deferredQuery} />                              {/* odroczone */}
      </div>
    </>
  )
}
```

- React najpierw renderuje ze **starą** wartością (pole reaguje natychmiast), a potem w tle próbuje
  renderu z nową. Jeśli w międzyczasie przyjdzie kolejny znak, porzuca ten render.
- `SlowResults` powinien być w `memo`, żeby pilny render ze starą wartością był tani.
- React 19: drugi argument `initialValue` (`useDeferredValue(query, '')`) pozwala przy pierwszym renderze
  pokazać lekką wartość początkową, a potem docelową.
- W odróżnieniu od debounce **nie ma stałego opóźnienia**: na szybkim urządzeniu wynik pojawia się niemal
  od razu, a na wolnym render jest przerywany zamiast blokować wątek.

## Kiedy co

| Sytuacja | Narzędzie |
| --- | --- |
| masz dostęp do `setState`, które wywołuje kosztowny render | `useTransition` / `startTransition` |
| wartość przychodzi z zewnątrz (props, inny hook) | `useDeferredValue` |
| chcesz ograniczyć liczbę zapytań sieciowych | debounce / throttle (to nie problem renderowania) |
| akcja z formularzem i stanem wysyłki | Actions: `useActionState` (React 19) |

## Źródła

- [useTransition (react.dev)](https://react.dev/reference/react/useTransition)
- [useDeferredValue (react.dev)](https://react.dev/reference/react/useDeferredValue)
- [startTransition (react.dev)](https://react.dev/reference/react/startTransition)
- [React 19: Actions (react.dev)](https://react.dev/blog/2024/12/05/react-19#actions)

## Pytania

### Do czego służy `useTransition`? {mid}

Do oznaczania aktualizacji stanu jako niepilnych. React renderuje je z niższym priorytetem i może je
przerwać, gdy przyjdzie pilniejsza aktualizacja (np. wpisywanie), więc UI pozostaje responsywny. Zwraca
`[isPending, startTransition]`, gdzie `isPending` pozwala pokazać wskaźnik trwającego przejścia.
Typowe zastosowania to zmiana zakładek, filtrowanie dużych list i nawigacja.

### Czym różni się `useTransition` od `useDeferredValue`? {mid}

`useTransition` opakowuje **aktualizację stanu**, więc potrzebny jest dostęp do `setState`. `useDeferredValue`
odracza **wartość**, co jest przydatne, gdy przychodzi ona z propsów lub innego hooka i nie kontrolujesz
miejsca aktualizacji. Efekt jest podobny: pilny render ze starą wartością, a potem przerywalny render z nową.

### Dlaczego nie można użyć transition do aktualizacji wartości pola tekstowego? {mid}

Pole kontrolowane musi odzwierciedlać wpisany znak natychmiast. Jeśli `setText` byłoby w transition, React
mógłby opóźnić lub porzucić tę aktualizację i wpisywanie działałoby z opóźnieniem lub gubiło znaki. Stan
dzieli się na pilny (tekst w polu) i niepilny (np. wyniki), albo używa `useDeferredValue` dla wartości
przekazywanej do kosztownego komponentu.

### Czym `useDeferredValue` różni się od debounce? {senior}

Debounce czeka stały czas po ostatniej zmianie, nawet na szybkim urządzeniu, i nie przerywa trwającego
renderu. `useDeferredValue` nie ma sztucznego opóźnienia: React od razu próbuje wyrenderować nową wartość
w tle i porzuca ten render, gdy przyjdzie kolejna zmiana, a pilny render nie jest blokowany. Debounce nadal
ma sens do ograniczania liczby zapytań sieciowych, bo to problem sieci, a nie renderowania.

### Co się dzieje z Suspense, gdy aktualizacja jest w transition? {senior}

Jeśli nowa treść się zawiesi, React nie zastępuje już widocznej treści fallbackiem, tylko zachowuje stary UI
do momentu, aż nowe dane będą gotowe, a `isPending` jest `true`. Bez transition widoczna treść zostałaby
zastąpiona spinnerem. Na tym opierają się płynne nawigacje w routerach i frameworkach.

### Jak działa `startTransition` z funkcją asynchroniczną w React 19? {senior}

Funkcja async przekazana do `startTransition` to Action. `isPending` jest `true` od startu do zakończenia całej
funkcji, a błędy trafiają do Error Boundary. Aktualizacje stanu wykonane **po** `await` nie są jednak
automatycznie oznaczane jako transition (ograniczenie kontekstu asynchronicznego w JS), więc trzeba je ponownie
opakować w `startTransition`. Do formularzy i kolejkowania akcji wygodniejszy jest `useActionState`.

### Jak zoptymalizować wyszukiwarkę, w której filtrowanie dużej listy spowalnia wpisywanie? {mid}

Trzymać tekst pola w zwykłym stanie (pilny), a do listy przekazywać `useDeferredValue(query)`. Komponent listy
opakować w `memo`, żeby pilny render ze starą wartością był tani, i pokazać przyciemnienie, gdy
`query !== deferredQuery`. Jeśli filtrowanie odbywa się na serwerze, dodatkowo debounce'ować zapytania.
Przy bardzo długich listach pomaga wirtualizacja.

### Czy transition sprawia, że obliczenia wykonują się w osobnym wątku? {mid}

Nie. React nadal renderuje na głównym wątku. Transition dzieli render na mniejsze części i sprawdza między
nimi, czy nie czeka pilniejsza praca, dzięki czemu może oddać sterowanie przeglądarce i przerwać render.
Pojedyncza bardzo wolna funkcja (np. synchroniczne sortowanie miliona elementów w jednym komponencie) nadal
zablokuje wątek. Do tego służą Web Workery albo podział pracy.

### Co zwraca `isPending` i jak go użyć w UI? {junior}

`true`, gdy transition rozpoczęta przez `startTransition` z tego hooka jeszcze się nie zakończyła (w React 19
także przez cały czas trwania funkcji async). Służy do subtelnej informacji zwrotnej: przyciemnienia starej
treści, spinnera w przycisku, blokady ponownego kliknięcia. Stara treść pozostaje przy tym widoczna.

### Czym jest renderowanie współbieżne? {senior}

To zdolność Reacta (od wersji 18) do przygotowywania kilku wersji UI jednocześnie oraz do przerywania,
wstrzymywania i porzucania renderu. Pilne aktualizacje mogą wyprzedzić trwający render niepilny. Umożliwiają
to Fiber i scheduler z priorytetami. Z perspektywy programisty włącza się je przez `startTransition`,
`useDeferredValue` i Suspense, a warunkiem poprawności jest czysty render.
