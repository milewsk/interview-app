# Stan aplikacji: lokalny, współdzielony i globalny {mid}

„Zarządzanie stanem” zaczyna się od pytania, **jaki to rodzaj stanu** i **gdzie powinien żyć**. Różne
rodzaje mają różne najlepsze narzędzia:

| Rodzaj | Przykład | Gdzie trzymać |
| --- | --- | --- |
| lokalny UI | czy menu jest otwarte, tekst w polu | `useState` / `useReducer` w komponencie |
| współdzielony przez kilka komponentów | wybrany element listy i jego szczegóły | podniesiony do wspólnego rodzica |
| globalny klienta | motyw, język, koszyk, stan sesji | kontekst albo store (Zustand, Redux Toolkit, Jotai) |
| serwerowy | lista produktów, profil użytkownika | biblioteka cache: TanStack Query, SWR, RTK Query |
| w URL | filtry, strona, zakładka, wyszukiwana fraza | parametry ścieżki i query stringa (router) |
| formularza | wartości pól, błędy walidacji | React Hook Form / TanStack Form / Actions |

## Zasady

- **Kolokacja**: trzymaj stan jak najbliżej miejsca użycia. Podnoś go tylko wtedy, gdy potrzebuje go więcej
  komponentów.
- **Jedno źródło prawdy**: ta sama informacja nie powinna żyć w dwóch miejscach (np. w propsie i skopiowana
  do stanu), bo prędzej czy później się rozjadą.
- **Stan wyprowadzony** liczy się w renderze, a nie przechowuje: `const total = items.reduce(...)` zamiast
  `useState` + efektu.
- **Minimalny stan**: zamiast `selectedItem` (kopia obiektu) trzymaj `selectedId` i wyszukaj element.
- **URL jako stan**: filtry i paginacja w adresie dają linki do udostępnienia, działający przycisk wstecz
  i odświeżenie strony bez utraty stanu.
- **Stanu serwera nie kopiuje się do globalnego store'a**. Ma własny cykl życia (cache, nieaktualność,
  odświeżanie), którym lepiej zarządzają dedykowane biblioteki.

## Podnoszenie stanu

```tsx
function Accordion() {
  const [activeIndex, setActiveIndex] = useState(0)   // stan u wspólnego rodzica
  return (
    <>
      <Panel isActive={activeIndex === 0} onShow={() => setActiveIndex(0)} />
      <Panel isActive={activeIndex === 1} onShow={() => setActiveIndex(1)} />
    </>
  )
}
```

## Stan globalny: kontekst czy store

**Kontekst + `useReducer`** wystarcza dla rzadko zmieniających się danych. Nie ma jednak selektorów, więc każda
zmiana renderuje wszystkich konsumentów.

**Zustand**: minimalny store bez providera, z selektorami:

```tsx
import { create } from 'zustand'

type CartStore = { items: CartItem[]; add: (item: CartItem) => void; clear: () => void }

const useCart = create<CartStore>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  clear: () => set({ items: [] }),
}))

const count = useCart((s) => s.items.length)   // render tylko, gdy zmieni się liczba
const add = useCart((s) => s.add)
```

**Redux Toolkit**: standard dla dużych aplikacji z wieloma zespołami. `createSlice` (reducery z Immerem, więc
można „mutować” szkic), `configureStore` (DevTools i middleware w zestawie), selektory z memoizacją
(`createSelector`), a do stanu serwera RTK Query. Daje przewidywalność, historię akcji i time-travel
debugging, kosztem większej ilości kodu niż Zustand.

**Jotai / Recoil-podobne atomy**: stan jako drobne, niezależne atomy łączone w pochodne. Dobre, gdy stan jest
„rozproszony” po wielu niezależnych kawałkach.

Wszystkie te biblioteki integrują się z Reactem przez `useSyncExternalStore`, co zapewnia spójność przy
renderowaniu współbieżnym.

## Źródła

- [Choosing the state structure (react.dev)](https://react.dev/learn/choosing-the-state-structure)
- [Sharing state between components (react.dev)](https://react.dev/learn/sharing-state-between-components)
- [useSyncExternalStore (react.dev)](https://react.dev/reference/react/useSyncExternalStore)
- [Redux Toolkit: Why RTK is how to use Redux today](https://redux.js.org/introduction/why-rtk-is-redux-today)
- [Zustand (GitHub)](https://github.com/pmndrs/zustand)

## Pytania

### Jakie rodzaje stanu występują w aplikacji React i gdzie je trzymać? {mid}

Lokalny stan UI (w komponencie), współdzielony przez kilka komponentów (podniesiony do wspólnego rodzica),
globalny stan klienta (kontekst lub store), stan serwera (biblioteka cache, np. TanStack Query), stan w URL
(router) i stan formularzy (biblioteka formularzy lub Actions). Najczęstszy błąd to traktowanie wszystkiego
jako „globalnego stanu” i wrzucanie do jednego store'a.

### Co oznacza „podnoszenie stanu” (lifting state up)? {junior}

Przeniesienie stanu z kilku komponentów do ich najbliższego wspólnego rodzica, który przekazuje wartość w dół
przez propsy, a zmiany przyjmuje przez callbacki. Dzięki temu rodzeństwo jest zsynchronizowane i ma jedno źródło
prawdy. Stan podnosi się tylko tak wysoko, jak to konieczne.

### Dlaczego nie kopiować propsów ani danych wyprowadzonych do stanu? {mid}

Kopia tworzy drugie źródło prawdy: gdy prop się zmieni, stan zostanie stary, a synchronizowanie ich efektem daje
dodatkowe rendery i chwilowo niespójny UI. Wartości wyprowadzone (sumy, przefiltrowane listy, pełne imię) liczy się
w trakcie renderu, w razie potrzeby z `useMemo`. Stan powinien zawierać minimalny zestaw danych, z których da się
wyliczyć resztę.

### Kiedy trzymać stan w URL? {mid}

Gdy opisuje, **co** użytkownik ogląda: filtry, sortowanie, numer strony, wybraną zakładkę, frazę wyszukiwania,
identyfikator otwartego elementu. Taki stan przetrwa odświeżenie, można go udostępnić linkiem, a przyciski wstecz
i naprzód działają zgodnie z oczekiwaniami. W React Router służą do tego parametry ścieżki i `useSearchParams`.

### Czym różni się Zustand od Redux Toolkit? {mid}

Oba to zewnętrzne store'y z selektorami. Zustand jest minimalistyczny: store to hook tworzony przez `create`,
nie wymaga providera, akcji ani reducerów, a zmiany robi się przez `set`. Redux Toolkit narzuca strukturę (slice'y,
akcje, reducery z Immerem, middleware), ma rozbudowane DevTools z historią i RTK Query do danych z serwera. Lepiej
sprawdza się w dużych zespołach, które potrzebują przewidywalności i konwencji.

### Dlaczego nie trzymać danych z API w globalnym store'ie (np. Redux)? {mid}

Stan serwera ma inne problemy niż stan klienta: cache, deduplikację zapytań, nieaktualność, odświeżanie w tle,
ponawianie, unieważnianie po mutacjach i paginację. Ręczna obsługa tego w reducerach to dużo powtarzalnego kodu
i błędów. Biblioteki TanStack Query, SWR czy RTK Query robią to deklaratywnie, a globalny store zostaje dla
prawdziwego stanu klienta.

### Jak selektory w store'ach ograniczają rendery? {senior}

Komponent subskrybuje tylko wynik selektora (np. `s => s.items.length`). Po zmianie store'a biblioteka porównuje
nowy wynik z poprzednim (domyślnie `Object.is`) i renderuje komponent tylko przy różnicy. Selektor zwracający nowy
obiekt przy każdym wywołaniu (np. `s => ({ a: s.a, b: s.b })`) psuje to i wymaga porównania płytkiego
(`useShallow` w Zustand, `shallowEqual` w Reduksie) albo memoizowanych selektorów (`createSelector`).

### Jak store'y integrują się z renderowaniem współbieżnym? {senior}

Przez `useSyncExternalStore`. React wymaga, by odczyt zewnętrznego źródła w trakcie renderu był spójny: podczas
przerywalnego renderu różne komponenty nie mogą zobaczyć różnych wersji danych (tzw. tearing). Hook subskrybuje
store, wymusza synchroniczny render przy zmianie i obsługuje wartość dla SSR i hydracji. Własne store'y też
powinny z niego korzystać.

### Co to jest kolokacja stanu i dlaczego jest ważna? {junior}

Trzymanie stanu jak najbliżej komponentów, które go używają. Zmiana takiego stanu renderuje tylko małe poddrzewo,
kod jest łatwiejszy do zrozumienia i usunięcia, a komponenty łatwiej użyć ponownie. Globalny stan „na wszelki
wypadek” zwiększa sprzężenie i liczbę renderów. Stan podnosi się dopiero wtedy, gdy potrzebuje go więcej miejsc.

### Kiedy wystarczy kontekst, a kiedy potrzebna jest biblioteka do stanu? {mid}

Kontekst (z `useState`/`useReducer`) wystarcza dla danych globalnych zmieniających się rzadko: motywu, języka,
użytkownika, flag funkcji. Bibliotekę warto wybrać, gdy stan globalny zmienia się często i korzysta z niego wiele
komponentów (potrzebne selektory), gdy logika aktualizacji jest złożona, gdy potrzebne są DevTools i middleware,
albo gdy stan musi żyć poza drzewem Reacta.
