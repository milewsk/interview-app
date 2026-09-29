# Stan serwerowy i pobieranie danych {mid}

Dane z API to nie „zwykły stan”. Należą do serwera, mogą się zmienić bez wiedzy klienta, są asynchroniczne
i współdzielone przez wiele komponentów. Stąd problemy, których nie ma przy stanie lokalnym: **cache**,
**nieaktualność**, **deduplikacja** zapytań, **wyścigi**, ponawianie, odświeżanie i **unieważnianie** po
zmianach.

## Dlaczego nie tylko `useEffect` + `useState`

Ręczne pobieranie w efekcie działa dla prostych przypadków, ale zwykle brakuje w nim:

- anulowania i ochrony przed wyścigami (odpowiedzi w złej kolejności),
- cache: każde zamontowanie komponentu to nowe zapytanie, a powrót na stronę pokazuje spinner,
- deduplikacji: dwa komponenty potrzebujące tych samych danych robią dwa zapytania,
- odświeżania nieaktualnych danych i unieważniania ich po mutacji,
- ochrony przed **wodospadami** (waterfall): rodzic pobiera, renderuje dziecko, które dopiero wtedy
  zaczyna swoje zapytanie.

## TanStack Query (React Query)

```tsx
const queryClient = new QueryClient()
<QueryClientProvider client={queryClient}><App /></QueryClientProvider>

function Todos() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['todos', { status: 'open' }],     // klucz cache: tablica, zależności zapytania
    queryFn: ({ signal }) => fetchTodos({ status: 'open' }, signal),
    staleTime: 60_000,                           // przez minutę dane uznawane za świeże
  })
  if (isPending) return <Spinner />
  if (isError) return <ErrorMessage error={error} />
  return <TodoList todos={data} />
}

function AddTodo() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),  // odśwież listy
  })
  return <button onClick={() => mutation.mutate({ title: 'Nowe' })} disabled={mutation.isPending}>Dodaj</button>
}
```

Kluczowe pojęcia (v5):

- **`queryKey`** identyfikuje dane w cache. Wszystko, od czego zależy zapytanie (id, filtry), musi być
  w kluczu. Komponenty z tym samym kluczem współdzielą dane i jedno zapytanie.
- **`staleTime`** (domyślnie **0**): jak długo dane są „świeże”. Nieaktualne dane są pokazywane od razu
  z cache, a w tle pobierane ponownie, np. przy zamontowaniu, **powrocie fokusu na okno** czy odzyskaniu
  połączenia.
- **`gcTime`** (domyślnie **5 minut**, dawniej `cacheTime`): jak długo nieużywane dane zostają w cache.
- Nieudane zapytania są **ponawiane 3 razy** z wykładniczym opóźnieniem.
- **Mutacje** + `invalidateQueries` albo **optymistyczne aktualizacje** (`onMutate` ze zmianą cache
  i wycofaniem w `onError`).
- `prefetchQuery`, `useInfiniteQuery` (paginacja „wczytaj więcej”), `useSuspenseQuery` (integracja
  z Suspense).

Alternatywy: **SWR** (lżejszy, podobna idea stale-while-revalidate) i **RTK Query** (w ekosystemie Redux).

## Inne miejsca pobierania danych

- **Loadery routera** (React Router data mode, TanStack Router): dane pobierane **równolegle z ładowaniem
  kodu trasy**, jeszcze przed renderem, bez wodospadów. Router obsługuje też stany ładowania i błędy.
- **Server Components** (Next.js, React Router framework mode): komponent pobiera dane na serwerze
  (`async function Page()`), a do klienta trafia wynik.
- **`use(promise)` + Suspense**: promise tworzony wyżej (np. w loaderze lub Server Component)
  i odczytywany w komponencie.

## Wodospady i równoległość

```tsx
// 🔴 wodospad: posts zaczyna się dopiero po user
const user = useQuery({ queryKey: ['user', id], queryFn: ... })
const posts = useQuery({ queryKey: ['posts', user.data?.id], queryFn: ..., enabled: !!user.data })

// ✅ niezależne zapytania startują równolegle
const [user, posts] = useQueries({ queries: [userQuery(id), postsQuery(id)] })
```

Zależności między zapytaniami bywają konieczne. Warto jednak rozpoczynać pobieranie jak najwyżej (loader,
prefetch przy najechaniu na link), a nie dopiero w głęboko zagnieżdżonym komponencie.

## Źródła

- [TanStack Query: Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Query: Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query: Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [You might not need an effect: fetching data (react.dev)](https://react.dev/learn/you-might-not-need-an-effect#fetching-data)
- [React Router: data loading](https://reactrouter.com/start/data/data-loading)

## Pytania

### Czym stan serwerowy różni się od stanu klienta? {mid}

Stan serwera należy do serwera: jest asynchroniczny, może zmienić się bez wiedzy klienta (inni użytkownicy),
bywa nieaktualny i jest współdzielony przez wiele komponentów. Wymaga więc cache, odświeżania, deduplikacji,
ponawiania i unieważniania po mutacjach. Stan klienta (np. otwarte menu, motyw) jest w pełni kontrolowany przez
aplikację i synchroniczny.

### Jakie problemy ma pobieranie danych w `useEffect`? {mid}

Brak cache (każde zamontowanie to zapytanie i spinner), brak deduplikacji (kilka komponentów robi to samo
zapytanie), wyścigi bez cleanupu, wodospady (dziecko zaczyna pobierać dopiero po wyrenderowaniu rodzica), brak
odświeżania i unieważniania oraz dużo powtarzalnego kodu na stany ładowania i błędu. Dlatego React zaleca
biblioteki lub mechanizmy frameworka.

### Czym są `staleTime` i `gcTime` w TanStack Query? {mid}

`staleTime` (domyślnie 0) określa, jak długo dane uznaje się za świeże. Świeże dane nie są pobierane ponownie,
a nieaktualne są pokazywane z cache i odświeżane w tle przy określonych zdarzeniach. `gcTime` (domyślnie 5 minut,
dawniej `cacheTime`) określa, jak długo dane **nieużywane** przez żaden komponent zostają w pamięci, zanim zostaną
usunięte. To dwie niezależne rzeczy.

### Dlaczego TanStack Query pobiera dane ponownie po powrocie do karty przeglądarki? {mid}

Domyślnie `refetchOnWindowFocus` jest włączone, a przy `staleTime: 0` dane są od razu uznawane za nieaktualne.
Powrót fokusu to sygnał, że użytkownik mógł długo nie patrzeć, a dane mogły się zmienić. Zapytanie odbywa się
w tle, a UI pokazuje dane z cache. Zachowanie zmienia się przez `staleTime` albo wyłączenie tej opcji.

### Jak odświeżyć listę po dodaniu elementu? {mid}

W `useMutation` w `onSuccess` wywołać `queryClient.invalidateQueries({ queryKey: ['todos'] })`. Wszystkie zapytania
z pasującym prefiksem klucza zostaną oznaczone jako nieaktualne i aktywne pobiorą się ponownie. Alternatywnie można
ręcznie zaktualizować cache (`setQueryData`) danymi zwróconymi przez serwer, co oszczędza jedno zapytanie.

### Jak zrobić optymistyczną aktualizację w TanStack Query? {senior}

W `onMutate` anulować trwające zapytania (`cancelQueries`), zapamiętać poprzednią wartość z cache (`getQueryData`),
zapisać nową przez `setQueryData` i zwrócić poprzednią jako kontekst. W `onError` przywrócić poprzednią wartość z
kontekstu, a w `onSettled` unieważnić zapytanie, żeby zsynchronizować się z serwerem. Prostszy wariant korzysta
ze zmiennych mutacji (`mutation.variables`) do wyświetlenia tymczasowego elementu w UI, bez ruszania cache.

### Dlaczego wszystko, od czego zależy zapytanie, musi być w `queryKey`? {mid}

Klucz identyfikuje dane w cache. Jeśli `queryFn` używa np. `userId` spoza klucza, zapytania dla różnych
użytkowników współdzieliłyby wpis w cache, a zmiana `userId` nie wywołałaby pobrania nowych danych. Pokazywane
byłyby dane innego użytkownika. Klucz działa jak tablica zależności efektu. Pomaga w tym reguła lintera
`@tanstack/query/exhaustive-deps`.

### Czym jest wodospad zapytań i jak go unikać? {mid}

Sekwencja, w której kolejne zapytanie zaczyna się dopiero po zakończeniu poprzedniego, bo komponent zlecający je
renderuje się dopiero, gdy rodzic dostanie swoje dane. Czas ładowania to suma wszystkich zapytań. Rozwiązania:
uruchamiać niezależne zapytania równolegle (`useQueries`, `Promise.all`), pobierać dane w loaderach tras lub na
serwerze, prefetchować przy najechaniu na link i spłaszczać zależności w API.

### Jaką rolę pełnią loadery routera w pobieraniu danych? {mid}

Loader trasy (np. w React Router) uruchamia się przy nawigacji, **zanim** wyrenderuje się komponent, równolegle
z ładowaniem kodu trasy i loaderami tras zagnieżdżonych. Eliminuje to wodospady typu „wyrenderuj i dopiero pobierz”.
Router zarządza też stanem nawigacji (`useNavigation`) i błędami (`errorElement`). Często łączy się go z TanStack
Query: loader wykonuje prefetch do cache, a komponent czyta z cache.

### Czym różni się `isPending` od `isFetching` w TanStack Query v5? {mid}

`isPending` oznacza, że zapytanie **nie ma jeszcze żadnych danych** (pierwsze ładowanie), więc pokazuje się
szkielet lub spinner. `isFetching` oznacza, że **trwa jakiekolwiek pobieranie**, także odświeżanie w tle, gdy
dane z cache są już wyświetlone. Wtedy wystarczy subtelny wskaźnik. W v5 `isLoading` to `isPending && isFetching`.
