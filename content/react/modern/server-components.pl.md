# Server Components i Server Functions {senior}

**React Server Components (RSC)** to komponenty renderowane **przed wysłaniem do przeglądarki**, w osobnym
środowisku (na serwerze przy każdym żądaniu albo raz w czasie budowania). Ich kod **nie trafia do bundla
klienta**. Do przeglądarki wysyłany jest wynik renderowania (RSC payload), który React łączy z interaktywnymi
**Client Components**.

```tsx
// Server Component (domyślny w frameworkach z RSC, np. Next.js App Router)
import db from './db'
import LikeButton from './LikeButton'   // Client Component

export default async function PostPage({ id }: { id: string }) {
  const post = await db.posts.find(id)          // dostęp do bazy / plików / sekretów
  return (
    <article>
      <h1>{post.title}</h1>
      <Markdown source={post.body} />            {/* ciężka biblioteka zostaje na serwerze */}
      <LikeButton postId={id} initialLikes={post.likes} />
    </article>
  )
}
```

```tsx
'use client'                                     // granica: ten moduł i jego importy trafiają do klienta
import { useState } from 'react'

export default function LikeButton({ postId, initialLikes }: { postId: string; initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes)
  return <button onClick={() => setLikes(likes + 1)}>♥ {likes}</button>
}
```

## Czym się różnią

| Server Component | Client Component |
| --- | --- |
| może być `async` i czytać dane bezpośrednio (baza, pliki, sekrety) | pobiera dane przez API |
| brak stanu, efektów, handlerów zdarzeń, API przeglądarki | `useState`, `useEffect`, `onClick`, `window` |
| kod nie trafia do bundla klienta | kod trafia do bundla |
| brak dyrektywy (domyślny w środowisku RSC) | moduł oznaczony `'use client'` (lub importowany przez taki moduł) |

**RSC to nie to samo co SSR.** SSR renderuje (także Client Components) do HTML dla szybkiego pierwszego
wyświetlenia, a potem kod klienta jest hydratowany. RSC określa, które komponenty w ogóle **nie wymagają kodu po
stronie klienta**. W praktyce frameworki łączą oba: RSC plus SSR plus streaming z Suspense.

## Zasady kompozycji

- `'use client'` oznacza **granicę w grafie modułów**: moduł i wszystko, co importuje, staje się kodem klienta.
  Nie trzeba go dodawać do każdego komponentu, tylko do punktów wejścia interaktywności.
- Client Component **nie może importować** Server Componentu, ale może go **dostać jako prop** (np. `children`).
  Wzorzec: serwerowy layout przekazuje serwerową treść do klienckiego wrappera.
- Propsy przekazywane z serwera do klienta muszą być **serializowalne**: prymitywy, tablice, zwykłe obiekty,
  `Date`, `Map`/`Set`, JSX, promise'y, Server Functions. **Nie** mogą to być zwykłe funkcje ani instancje klas.
- Promise przekazany z serwera można odczytać w kliencie przez `use(promise)` ze Suspense, co pozwala
  strumieniować dane.

## Server Functions (`'use server'`)

Funkcje asynchroniczne wykonywane na serwerze, które Client Component może wywołać jak zwykłą funkcję. React wysyła
wtedy żądanie do serwera. Dyrektywa `'use server'` stoi na początku pliku (wszystkie eksporty) albo w ciele
funkcji. Nie oznacza Server Componentów.

```tsx
// actions.ts
'use server'
export async function addComment(postId: string, formData: FormData) {
  const session = await auth()                        // ⚠️ zawsze autoryzacja
  const text = z.string().min(1).parse(formData.get('text'))   // ⚠️ zawsze walidacja
  await db.comments.create({ postId, text, userId: session.userId })
}
```

- Współpracują z `<form action>`, `useActionState` i `useTransition`. Formularz z Server Function działa nawet
  przed załadowaniem JS (progressive enhancement).
- **Bezpieczeństwo**: każda Server Function to w praktyce **publiczny endpoint HTTP**. Argumenty trzeba traktować
  jako niezaufane, a uwierzytelnienie, autoryzację i walidację wykonywać w funkcji.
- Od 2024 „Server Actions” to nazwa Server Functions użytych jako Action (np. w `action`).

## Wymagania

RSC wymaga frameworka lub bundlera z ich obsługą (np. Next.js App Router), bo trzeba podzielić graf modułów
i obsłużyć protokół RSC. W zwykłej aplikacji SPA na Vite z nich nie korzystamy. Działają tam za to Actions,
`use` i Suspense po stronie klienta.

## Źródła

- [Server Components (react.dev)](https://react.dev/reference/rsc/server-components)
- [Server Functions (react.dev)](https://react.dev/reference/rsc/server-functions)
- ['use client' (react.dev)](https://react.dev/reference/rsc/use-client)
- ['use server' (react.dev)](https://react.dev/reference/rsc/use-server)

## Pytania

### Czym są React Server Components? {mid}

To komponenty renderowane poza przeglądarką (na serwerze przy żądaniu lub w czasie budowania), których kod nie trafia
do bundla klienta. Mogą być asynchroniczne i czytać dane bezpośrednio z bazy czy plików. Do klienta wysyłany jest
wynik, łączony z interaktywnymi Client Components. Nie mają stanu, efektów ani handlerów zdarzeń.

### Czym RSC różnią się od SSR? {senior}

SSR renderuje komponenty (także klienckie) do HTML, żeby szybko wyświetlić stronę, ale cały ich kod i tak trafia do
przeglądarki i jest hydratowany. RSC decydują, które komponenty w ogóle nie potrzebują kodu po stronie klienta: renderują
się tylko w środowisku serwerowym, a klient dostaje wynik, a nie kod. Techniki są komplementarne i frameworki łączą je
ze streamingiem.

### Co oznacza dyrektywa `'use client'`? {mid}

Oznacza granicę w grafie modułów: plik z `'use client'` i wszystkie moduły, które importuje, są kodem klienta, więc trafiają
do bundla i mogą używać stanu, efektów i API przeglądarki. Nie trzeba jej dodawać do każdego komponentu, tylko w miejscach,
gdzie komponent serwerowy importuje interaktywny. Nie oznacza „renderuj tylko w przeglądarce”, bo takie komponenty nadal
mogą być wstępnie renderowane w SSR.

### Czy Client Component może renderować Server Component? {senior}

Nie może go **zaimportować**, bo import w module klienckim czyni go kodem klienta. Może go natomiast dostać jako prop, np.
`children`, od komponentu serwerowego: `<ClientTabs><ServerContent /></ClientTabs>`. Serwer renderuje wtedy treść,
a klient tylko ją umieszcza. To podstawowy wzorzec przeplatania obu rodzajów komponentów.

### Jakie propsy można przekazać z Server Component do Client Component? {mid}

Serializowalne: prymitywy, tablice, zwykłe obiekty, `Date`, `Map`, `Set`, typed arrays, elementy JSX, promise'y oraz Server
Functions. Nie można przekazać zwykłych funkcji (np. `onClick` zdefiniowanego na serwerze), instancji klas ani
niezarejestrowanych symboli, bo trzeba je przesłać przez sieć w RSC payload.

### Czym są Server Functions i jak je zabezpieczyć? {senior}

To funkcje oznaczone `'use server'`, wykonywane na serwerze, które komponenty klienckie wywołują jak zwykłe funkcje, a React
zamienia wywołanie na żądanie HTTP. W praktyce to publiczne endpointy: każdy może je wywołać z dowolnymi argumentami. Trzeba
więc w każdej sprawdzać uwierzytelnienie i uprawnienia, walidować argumenty (np. Zod), nie ufać identyfikatorom od klienta
i nie zwracać wrażliwych danych.

### Jakie korzyści dają Server Components? {mid}

Mniejszy bundle JS, bo biblioteki używane tylko do renderowania (Markdown, formatowanie, zapytania) zostają na serwerze.
Bezpośredni dostęp do danych i sekretów bez budowania osobnego API. Mniej wodospadów, bo dane pobiera się blisko źródła.
Streaming treści z Suspense. Lepsze SEO i szybsze pierwsze wyświetlenie w połączeniu z SSR.

### Jakie są ograniczenia i koszty Server Components? {senior}

Wymagają frameworka z obsługą RSC i serwera (lub prerenderingu). Nie mają stanu, efektów ani interaktywności. Model
mentalny jest bardziej złożony, bo trzeba pilnować granic `'use client'` i serializowalności propsów. Przy nawigacji
potrzebne są zapytania do serwera. Niektóre biblioteki (korzystające z kontekstu czy stanu) wymagają owinięcia
w komponenty klienckie.

### Czy `'use server'` oznacza Server Component? {junior}

Nie. Server Components nie mają żadnej dyrektywy, bo są domyślne w środowisku RSC. `'use server'` oznacza Server Functions,
czyli funkcje wywoływane z klienta i wykonywane na serwerze, na przykład do obsługi formularzy i mutacji.

### Jak Server Components współpracują z Suspense i streamingiem? {senior}

Asynchroniczny Server Component może czekać na dane, a otaczający `Suspense` pozwala serwerowi od razu wysłać resztę strony
z fallbackiem i dosłać zawieszoną część, gdy dane będą gotowe (streaming). Serwer może też przekazać do Client Componentu
niezakończony promise, który klient odczyta przez `use`, więc dane płyną równolegle z renderowaniem.
