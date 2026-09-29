# Error Boundaries i Suspense {mid}

Dwa mechanizmy deklaratywnej obsługi „nieszczęśliwych ścieżek” w drzewie komponentów:

- **Error Boundary** łapie **błędy** rzucone podczas renderowania poddrzewa i pokazuje zastępczy UI.
- **Suspense** pokazuje **fallback**, dopóki poddrzewo **czeka** na coś (kod, dane).

Oba działają jak `try/catch` dla fragmentu drzewa i najczęściej występują razem.

## Error Boundary

Bez boundary nieobsłużony błąd w renderze **odmontowuje całą aplikację** (biały ekran). Boundary to
komponent klasowy z co najmniej jedną z metod:

```tsx
class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }                 // faza render: przełącz na fallback
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack)   // faza commit: logowanie (Sentry itp.)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
```

- **Nie ma wersji funkcyjnej**. W praktyce używa się biblioteki `react-error-boundary`
  (`<ErrorBoundary FallbackComponent={...} onReset={...} resetKeys={[...]}>`).
- Boundary łapie błędy w renderze, konstruktorach, metodach cyklu życia i efektach **potomków**.
- **Nie łapie** błędów w: handlerach zdarzeń, kodzie asynchronicznym (`setTimeout`, callbacki promise'ów
  poza renderem), SSR i w samym boundary. Wyjątkiem są błędy w `startTransition`, które boundary łapie.
  Błędy w handlerach obsługuje się `try/catch` i stanem, a z asynchronicznego kodu można je
  „przerzucić” do boundary przez ustawienie stanu, który rzuci błąd w renderze (tak działa
  `useErrorBoundary().showBoundary(error)`).
- **Granulacja**: jeden boundary na całą aplikację (ostatnia linia obrony) plus mniejsze wokół
  niezależnych sekcji (widget, panel, trasa), żeby awaria jednej części nie zabierała reszty.
- React 19: `createRoot(el, { onCaughtError, onUncaughtError, onRecoverableError })` pozwala centralnie
  raportować błędy.

## Suspense

```tsx
const Settings = lazy(() => import('./Settings'))   // osobny chunk

<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>
```

Komponent **zawiesza się** (suspends), gdy czeka na:

- kod ładowany przez `React.lazy`,
- dane odczytywane przez `use(promise)` albo biblioteki wspierające Suspense (TanStack Query
  `useSuspenseQuery`, Relay, frameworki z Server Components).

Samo pobieranie danych w `useEffect` **nie** aktywuje Suspense.

Zasady:

- Fallback pokazuje **najbliższy** `Suspense` w górę drzewa. Zagnieżdżone granice pozwalają ujawniać
  UI stopniowo (najpierw szkielet strony, potem szczegóły).
- Promise przekazany do `use` musi być **stabilny** (z cache albo z Server Component). Tworzenie go
  w renderze powoduje ciągłe zawieszanie.
- Odrzucony promise trafia do najbliższego **Error Boundary**, więc para `ErrorBoundary` + `Suspense`
  obsługuje stany „ładowanie” i „błąd”.
- Gdy już widoczna treść miałaby zostać zastąpiona fallbackiem, aktualizację można oznaczyć jako
  **transition** (`startTransition`, `useTransition`). React zostawi wtedy stary UI, zamiast pokazywać
  spinner (tak działają nawigacje w routerach).
- W SSR ze streamingiem granice Suspense wyznaczają fragmenty HTML wysyłane stopniowo.

## Źródła

- [Catching rendering errors with an error boundary (react.dev)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Suspense (react.dev)](https://react.dev/reference/react/Suspense)
- [lazy (react.dev)](https://react.dev/reference/react/lazy)
- [use (react.dev)](https://react.dev/reference/react/use)
- [react-error-boundary (GitHub)](https://github.com/bvaughn/react-error-boundary)

## Pytania

### Czym jest Error Boundary i co się dzieje bez niego? {junior}

To komponent, który łapie błędy rzucone podczas renderowania swojego poddrzewa i zamiast niego wyświetla
zastępczy UI. Bez żadnego boundary nieobsłużony błąd w renderze odmontowuje całe drzewo, więc użytkownik
widzi pustą stronę. Boundary ogranicza skutki awarii do fragmentu interfejsu.

### Jakich błędów Error Boundary nie złapie? {mid}

Błędów w handlerach zdarzeń, w kodzie asynchronicznym (`setTimeout`, callbacki promise'ów wykonywane poza
renderem), podczas renderowania po stronie serwera i w samym boundary, bo łapie tylko błędy potomków.
Wyjątkiem są błędy rzucone w `startTransition`. Błędy w handlerach obsługuje się `try/catch`, a do boundary
można je przekazać, ustawiając stan, który spowoduje rzucenie błędu w renderze.

### Dlaczego Error Boundary musi być komponentem klasowym? {mid}

Mechanizm opiera się na metodach cyklu życia `static getDerivedStateFromError` (aktualizacja stanu w fazie
render, by pokazać fallback) i `componentDidCatch` (efekty uboczne, np. logowanie, w fazie commit), a dla
nich nie ma odpowiedników w hookach. W praktyce nie pisze się własnej klasy, tylko używa
`react-error-boundary`, która daje wygodne API z resetowaniem i hookiem `useErrorBoundary`.

### Czym różnią się `getDerivedStateFromError` i `componentDidCatch`? {mid}

`getDerivedStateFromError` jest statyczna i wywoływana w fazie render. Zwraca nowy stan (np.
`{ hasError: true }`), więc musi być czysta. `componentDidCatch` działa w fazie commit i dostaje błąd oraz
`componentStack`, więc służy do efektów ubocznych, np. wysłania raportu do Sentry. Zwykle używa się obu.

### Gdzie umieszczać Error Boundaries? {mid}

Warstwowo: jeden na poziomie aplikacji jako ostatnia linia obrony, a mniejsze wokół niezależnych sekcji:
tras, widgetów, paneli, elementów z danymi z zewnątrz. Awaria komentarzy nie powinna wtedy zabrać całej
strony produktu. Zbyt drobne boundary zaśmiecają kod, a zbyt ogólne pokazują pusty ekran przy drobnym błędzie.

### Czym jest Suspense i na co może czekać komponent? {mid}

To granica, która wyświetla `fallback`, dopóki któryś komponent w jej poddrzewie jest zawieszony. Komponent
zawiesza się, gdy czeka na kod (`React.lazy`) albo dane odczytywane przez mechanizm zgodny z Suspense
(`use(promise)`, `useSuspenseQuery`, frameworki z Server Components). Zwykłe `useEffect` + `setState` nie
aktywuje Suspense.

### Jak połączyć Suspense z Error Boundary? {mid}

Owinąć `Suspense` w `ErrorBoundary`: `<ErrorBoundary fallback={<Error />}><Suspense fallback={<Spinner />}>`.
Czekanie pokazuje spinner, a odrzucony promise (np. błąd pobierania odczytanego przez `use`) trafia do
boundary. W ten sposób trzy stany (ładowanie, błąd, sukces) obsługuje się deklaratywnie, bez flag
`isLoading` / `error` w każdym komponencie.

### Jak uniknąć zastąpienia widocznej treści spinnerem przy przejściu? {senior}

Oznaczyć aktualizację jako transition (`startTransition` lub `useTransition`). Jeśli nowa treść się zawiesi,
React zostawi dotychczasowy UI zamiast pokazywać fallback najbliższego Suspense, a `isPending` pozwala pokazać
subtelny wskaźnik. Tak zachowują się nawigacje w nowoczesnych routerach. Fallback pojawi się tylko dla
nowych granic, które wcześniej nie miały treści.

### Dlaczego promise przekazany do `use` nie może być tworzony w renderze? {senior}

Każdy render tworzyłby nowy promise, a React porównuje je po referencji. Komponent zawieszałby się więc przy
każdej próbie wznowienia, co daje ciągły fallback albo pętlę. Promise musi być stabilny: pochodzić z cache
(np. `Map` po kluczu), z biblioteki do pobierania danych albo z Server Component, który przekazuje go jako prop.

### Jak zgłaszać błędy renderu centralnie w React 19? {mid}

Przez opcje `createRoot`: `onCaughtError` (błędy złapane przez boundary), `onUncaughtError` (nieobsłużone)
i `onRecoverableError` (błędy, z których React sam się podniósł, np. niezgodność hydracji). Dostają błąd
i `errorInfo.componentStack`, więc nadają się do wysyłki do systemu monitorowania bez dublowania logiki
w każdym boundary.
