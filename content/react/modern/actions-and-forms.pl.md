# Actions i formularze w React 19 {mid}

**Action** to funkcja (zwykle asynchroniczna) uruchomiona w **transition**. React 19 zbudował wokół niej
zestaw narzędzi, które zastępują ręczne zarządzanie flagami `isLoading`, błędami, kolejnością zapytań
i resetem formularza.

## `<form action={fn}>`

```tsx
function Newsletter() {
  async function subscribe(formData: FormData) {
    await api.subscribe(String(formData.get('email')))
  }
  return (
    <form action={subscribe}>
      <input name="email" type="email" required />
      <SubmitButton />
    </form>
  )
}
```

- React sam wywołuje funkcję z `FormData`, bez `e.preventDefault()`.
- Funkcja działa jako Action (w transition), więc aktualizacje stanu nie blokują UI, a błędy trafiają do
  Error Boundary.
- Po **udanej** akcji React **resetuje niekontrolowane pola** formularza (`defaultValue`).
- `action` przyjmują też `<button formAction={...}>` i `<input type="submit" formAction>`.

## `useActionState`

```tsx
const [state, formAction, isPending] = useActionState(
  async (prevState: State, formData: FormData): Promise<State> => {
    const result = await api.updateName(String(formData.get('name')))
    return result.ok ? { error: null } : { error: result.message }
  },
  { error: null },               // stan początkowy
)

<form action={formAction}>
  <input name="name" />
  <button disabled={isPending}>Zapisz</button>
  {state.error && <p role="alert">{state.error}</p>}
</form>
```

- Funkcja dostaje **poprzedni stan** i **payload** (przy formularzu: `FormData`), a zwraca nowy stan.
  Działa jak reducer, który może być asynchroniczny.
- Kolejne wywołania są **kolejkowane i wykonywane po kolei**, a każde dostaje wynik poprzedniego, co
  eliminuje wyścigi.
- `isPending` jest `true`, dopóki jakaś akcja trwa. `dispatchAction` ma stałą tożsamość.
- `dispatchAction` wywołany ręcznie (poza `action`) trzeba opakować w `startTransition`.
- Trzeci argument `permalink` służy progresywnemu ulepszaniu z Server Functions: formularz wysłany przed
  załadowaniem JS przeniesie na podany URL.

## `useFormStatus`

```tsx
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending, data } = useFormStatus()   // status formularza-RODZICA
  return <button disabled={pending}>{pending ? 'Wysyłanie…' : 'Wyślij'}</button>
}
```

Hook czyta stan **najbliższego formularza nadrzędnego**, więc musi być wywołany w komponencie
renderowanym **wewnątrz** `<form>`, a nie w komponencie, który ten formularz renderuje. Dzięki temu
przycisk wielokrotnego użytku nie potrzebuje propsów.

## `useOptimistic`

```tsx
const [optimisticLikes, addOptimistic] = useOptimistic(likes, (current, delta: number) => current + delta)

async function like() {
  addOptimistic(1)             // natychmiast w UI
  await api.like(postId)       // prawdziwy zapis
  setLikes((l) => l + 1)       // docelowy stan
}
<form action={like}><button>♥ {optimisticLikes}</button></form>
```

- Wartość optymistyczna jest widoczna **tylko w trakcie akcji**. Po jej zakończeniu React pokazuje
  prawdziwy stan w tym samym renderze, bez ręcznego wycofywania. Jeśli akcja się nie powiedzie, UI
  automatycznie wraca do poprzedniej wartości.
- Setter trzeba wywołać wewnątrz Action lub `startTransition`, bo inaczej React ostrzeże.

## `use` z promise

`use(promise)` odczytuje wynik promise'a w renderze, zawieszając komponent (Suspense), a odrzucenie trafia do
Error Boundary. Promise musi być stabilny (cache, Server Component). Stosuje się go do danych, a nie do
wysyłki formularzy.

## Źródła

- [React 19: Actions (react.dev)](https://react.dev/blog/2024/12/05/react-19#actions)
- [useActionState (react.dev)](https://react.dev/reference/react/useActionState)
- [useFormStatus (react.dev)](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [useOptimistic (react.dev)](https://react.dev/reference/react/useOptimistic)
- [&lt;form&gt; (react.dev)](https://react.dev/reference/react-dom/components/form)

## Pytania

### Czym jest Action w React 19? {mid}

To funkcja (zwykle asynchroniczna) wykonywana w transition, np. przekazana do `<form action>`,
`startTransition` albo `useActionState`. React śledzi jej stan: udostępnia `isPending`, kieruje błędy do Error
Boundary, obsługuje optymistyczne aktualizacje i resetuje formularz po sukcesie. Dzięki temu nie trzeba ręcznie
zarządzać flagami ładowania, błędami i kolejnością zapytań.

### Co robi `<form action={fn}>` inaczej niż `onSubmit`? {mid}

React sam zapobiega przeładowaniu strony, wywołuje funkcję z `FormData` i uruchamia ją jako Action
(w transition, z obsługą `useFormStatus` i Error Boundary). Po udanej akcji automatycznie resetuje niekontrolowane
pola. W połączeniu z Server Function formularz działa nawet przed załadowaniem JavaScriptu (progressive
enhancement). `onSubmit` wymaga ręcznego `preventDefault`, zbierania danych i zarządzania stanem.

### Jak działa `useActionState`? {mid}

`const [state, dispatchAction, isPending] = useActionState(fn, initialState)`. Funkcja `fn(prevState, payload)`
zwraca (także asynchronicznie) nowy stan, jak reducer. Przekazuje się `dispatchAction` do `<form action>` albo
wywołuje w `startTransition`. Wywołania są kolejkowane i wykonywane po kolei, każde z wynikiem poprzedniego, więc
nie ma wyścigów. `isPending` informuje o trwającej akcji, co wystarcza do obsługi błędów i komunikatów zwrotnych
formularza.

### Dlaczego `useFormStatus` musi być wywołany w komponencie wewnątrz formularza? {mid}

Hook odczytuje status **najbliższego nadrzędnego** `<form>`, podobnie jak kontekst. W komponencie, który sam
renderuje `<form>`, nad nim nie ma formularza, więc `pending` zawsze będzie `false`. Wydziela się więc np.
`SubmitButton` i renderuje go wewnątrz formularza, a przycisk wie o stanie wysyłki bez przekazywania propsów.

### Czym jest `useOptimistic` i jak wycofuje zmiany? {senior}

Hook pokazuje tymczasową, optymistyczną wartość, dopóki trwa Action: `const [optimistic, setOptimistic] =
useOptimistic(value, reducer)`. Po zakończeniu akcji React renderuje prawdziwy `value` w tym samym renderze, więc
nie ma osobnego kroku czyszczenia. Jeśli akcja się nie powiodła, a stan źródłowy się nie zmienił, UI wraca do
poprzedniej wartości. Setter musi być wywołany w Action lub `startTransition`.

### Jak obsłużyć błędy walidacji serwera w formularzu z Actions? {mid}

Zwrócić je jako część stanu z funkcji przekazanej do `useActionState` (np. `{ errors: { email: 'Zajęty' } }`)
i wyświetlić przy polach. Wyjątki, których się nie spodziewamy, trafią do Error Boundary. Warto też zwracać
wpisane wartości, żeby po błędzie przywrócić pola, bo niekontrolowany formularz resetuje się tylko po sukcesie.

### Jak `useActionState` rozwiązuje problem wyścigów przy wielokrotnym wysłaniu? {senior}

Kolejne wywołania `dispatchAction` nie biegną równolegle, tylko są kolejkowane: każde czeka na zakończenie
poprzedniego i dostaje jego wynik jako `prevState`. Stan końcowy odpowiada więc kolejności działań użytkownika,
a nie kolejności odpowiedzi sieci. Przy zwykłym `startTransition` z async funkcją kolejność odpowiedzi trzeba
obsługiwać samodzielnie.

### Czy Actions wymagają Server Components lub frameworka? {junior}

Nie. `<form action>`, `useActionState`, `useFormStatus` i `useOptimistic` działają w zwykłej aplikacji po stronie
klienta, z funkcjami asynchronicznymi wywołującymi API. Framework z Server Functions (`'use server'`) dodaje
możliwość wywoływania kodu serwera bezpośrednio i progressive enhancement, gdy formularz działa bez JS.

### Co się stanie z polami formularza po udanej akcji? {mid}

React automatycznie resetuje **niekontrolowane** pola do wartości `defaultValue`, tak jak natywny reset
formularza, więc po dodaniu komentarza pole jest puste bez dodatkowego kodu. Kontrolowane pola (`value` + stan)
nie są resetowane, bo wartość należy do stanu. Ręcznie można wywołać `requestFormReset` z `react-dom`.

### Jak zablokować przycisk wysyłki na czas trwania akcji? {junior}

Użyć `isPending` z `useActionState` (`<button disabled={isPending}>`) albo `pending` z `useFormStatus`
w komponencie przycisku renderowanym wewnątrz formularza. Oba są `true` przez cały czas trwania asynchronicznej
akcji, co zapobiega podwójnemu wysłaniu i daje informację zwrotną.
