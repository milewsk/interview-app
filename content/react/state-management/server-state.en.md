# Server state and data fetching {mid}

API data isn't "ordinary state". It belongs to the server, can change without the client knowing, is asynchronous and is
shared by many components. That brings problems local state doesn't have: **caching**, **staleness**, request
**deduplication**, **races**, retries, refetching and **invalidation** after changes.

## Why not just `useEffect` + `useState`

Manual fetching in an effect works for simple cases, but it usually lacks:

- cancellation and race protection (responses arriving out of order),
- caching: every mount is a new request, and returning to a page shows a spinner,
- deduplication: two components needing the same data make two requests,
- refreshing stale data and invalidating it after a mutation,
- protection from **waterfalls**: a parent fetches, renders a child, and only then does the child start its request.

## TanStack Query (React Query)

```tsx
const queryClient = new QueryClient()
<QueryClientProvider client={queryClient}><App /></QueryClientProvider>

function Todos() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['todos', { status: 'open' }],     // cache key: an array, the query's dependencies
    queryFn: ({ signal }) => fetchTodos({ status: 'open' }, signal),
    staleTime: 60_000,                           // data counts as fresh for a minute
  })
  if (isPending) return <Spinner />
  if (isError) return <ErrorMessage error={error} />
  return <TodoList todos={data} />
}

function AddTodo() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),  // refresh the lists
  })
  return <button onClick={() => mutation.mutate({ title: 'New' })} disabled={mutation.isPending}>Add</button>
}
```

Key concepts (v5):

- **`queryKey`** identifies data in the cache. Everything the query depends on (ids, filters) must be in the key. Components
  with the same key share the data and a single request.
- **`staleTime`** (default **0**): how long data is "fresh". Stale data is shown immediately from the cache and refetched in the
  background, e.g. on mount, when the **window regains focus** or when the network reconnects.
- **`gcTime`** (default **5 minutes**, formerly `cacheTime`): how long unused data stays in the cache.
- Failed queries are **retried 3 times** with exponential backoff.
- **Mutations** + `invalidateQueries`, or **optimistic updates** (`onMutate` changing the cache with a rollback in `onError`).
- `prefetchQuery`, `useInfiniteQuery` ("load more" pagination), `useSuspenseQuery` (Suspense integration).

Alternatives: **SWR** (lighter, the same stale-while-revalidate idea) and **RTK Query** (in the Redux ecosystem).

## Other places to fetch data

- **Router loaders** (React Router data mode, TanStack Router): data is fetched **in parallel with loading the route's code**,
  before rendering, with no waterfalls. The router also handles loading states and errors.
- **Server Components** (Next.js, React Router framework mode): the component fetches data on the server
  (`async function Page()`), and the result is sent to the client.
- **`use(promise)` + Suspense**: a promise created higher up (e.g. in a loader or a Server Component) and read in the component.

## Waterfalls and parallelism

```tsx
// 🔴 a waterfall: posts starts only after user
const user = useQuery({ queryKey: ['user', id], queryFn: ... })
const posts = useQuery({ queryKey: ['posts', user.data?.id], queryFn: ..., enabled: !!user.data })

// ✅ independent queries start in parallel
const [user, posts] = useQueries({ queries: [userQuery(id), postsQuery(id)] })
```

Dependencies between queries are sometimes necessary. Still, start fetching as high as possible (a loader, a prefetch on link
hover) rather than in a deeply nested component.

## Sources

- [TanStack Query: Overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Query: Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query: Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [You might not need an effect: fetching data (react.dev)](https://react.dev/learn/you-might-not-need-an-effect#fetching-data)
- [React Router: data loading](https://reactrouter.com/start/data/data-loading)

## Questions

### How does server state differ from client state? {mid}

Server state belongs to the server: it's asynchronous, can change without the client knowing (other users), can become stale
and is shared by many components. So it needs caching, refetching, deduplication, retries and invalidation after mutations.
Client state (e.g. an open menu, the theme) is fully controlled by the app and synchronous.

### What problems does fetching data in `useEffect` have? {mid}

No caching (every mount means a request and a spinner), no deduplication (several components make the same request), races
without cleanup, waterfalls (a child starts fetching only after its parent renders), no refetching or invalidation, and lots of
repetitive code for loading and error states. That's why React recommends libraries or framework mechanisms.

### What are `staleTime` and `gcTime` in TanStack Query? {mid}

`staleTime` (default 0) sets how long data counts as fresh. Fresh data isn't refetched, while stale data is shown from the cache
and refreshed in the background on certain events. `gcTime` (default 5 minutes, formerly `cacheTime`) sets how long data **not
used** by any component stays in memory before it's removed. They're two independent things.

### Why does TanStack Query refetch data when you return to the browser tab? {mid}

`refetchOnWindowFocus` is on by default, and with `staleTime: 0` data is stale immediately. Regaining focus signals that the user
may have been away and the data may have changed. The request happens in the background while the UI shows cached data. You
change this with `staleTime` or by disabling the option.

### How do you refresh a list after adding an item? {mid}

In `useMutation`'s `onSuccess`, call `queryClient.invalidateQueries({ queryKey: ['todos'] })`. All queries whose keys match the
prefix are marked stale, and active ones refetch. Alternatively, update the cache manually (`setQueryData`) with the data the
server returned, which saves a request.

### How do you do an optimistic update in TanStack Query? {senior}

In `onMutate`, cancel ongoing queries (`cancelQueries`), save the previous cache value (`getQueryData`), write the new one with
`setQueryData` and return the previous value as context. In `onError`, restore the previous value from the context, and in
`onSettled` invalidate the query to resync with the server. A simpler variant uses the mutation's variables
(`mutation.variables`) to display a temporary item in the UI without touching the cache.

### Why must everything the query depends on be in the `queryKey`? {mid}

The key identifies the data in the cache. If `queryFn` uses e.g. a `userId` that isn't in the key, queries for different users
would share a cache entry, and changing `userId` wouldn't fetch new data. Another user's data would be shown. The key works like
an effect's dependency array. The `@tanstack/query/exhaustive-deps` lint rule helps with this.

### What is a request waterfall, and how do you avoid it? {mid}

A sequence where each request starts only after the previous one finishes, because the component issuing it renders only once its
parent has its data. The loading time is the sum of all requests. Fixes: run independent queries in parallel (`useQueries`,
`Promise.all`), fetch in route loaders or on the server, prefetch on link hover, and flatten dependencies in the API.

### What role do router loaders play in data fetching? {mid}

A route loader (e.g. in React Router) runs on navigation **before** the component renders, in parallel with loading the route's code
and the loaders of nested routes. This eliminates "render, then fetch" waterfalls. The router also manages navigation state
(`useNavigation`) and errors (`errorElement`). It's often combined with TanStack Query: the loader prefetches into the cache, and
the component reads from the cache.

### How does `isPending` differ from `isFetching` in TanStack Query v5? {mid}

`isPending` means the query **has no data yet** (the first load), so you show a skeleton or spinner. `isFetching` means **any fetch is
in progress**, including a background refetch while cached data is already displayed. Then a subtle indicator is enough. In v5,
`isLoading` equals `isPending && isFetching`.
