# useContext i Context API {mid}

Kontekst pozwala przekazać wartość **w głąb drzewa** bez przepychania jej przez propsy na każdym poziomie
(prop drilling). Typowe zastosowania: motyw, zalogowany użytkownik, język, konfiguracja, zależności
(klient API).

```tsx
const ThemeContext = createContext<'light' | 'dark'>('light')   // wartość domyślna

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  return (
    <ThemeContext value={theme}>          {/* React 19; wcześniej <ThemeContext.Provider value> */}
      <Toolbar />
    </ThemeContext>
  )
}

function Button() {
  const theme = useContext(ThemeContext)   // albo use(ThemeContext)
  return <button className={theme}>OK</button>
}
```

## Jak to działa

- Komponent odczytuje wartość **najbliższego providera powyżej** w drzewie. Zagnieżdżony provider
  nadpisuje wartość dla swojego poddrzewa.
- Bez providera `useContext` zwraca **wartość domyślną** z `createContext`. Nie jest to stan „globalny”,
  tylko wartość zapasowa.
- Gdy wartość providera się zmieni (porównanie `Object.is`), **wszyscy konsumenci** renderują się
  ponownie, **nawet jeśli są opakowani w `memo`**, bo `memo` porównuje tylko propsy.
- `use(Context)` (React 19) działa jak `useContext`, ale można go wywołać warunkowo lub w pętli.
- W React 19 sam obiekt kontekstu może być providerem (`<Ctx value>`). `Ctx.Provider` nadal działa,
  ale ma zostać oznaczony jako przestarzały.

## Pułapki wydajności

**Nowy obiekt przy każdym renderze providera** sprawia, że renderują się wszyscy konsumenci, nawet gdy
dane się nie zmieniły:

```tsx
<AuthContext value={{ user, login, logout }}>           {/* 🔴 nowy obiekt za każdym razem */}

const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
<AuthContext value={value}>                               {/* ✅ */}
```

Kontekst **nie ma selektorów**: komponent korzystający z jednego pola i tak renderuje się po zmianie
dowolnego pola wartości. Rozwiązania:

- **podział kontekstów**: osobno dane, które często się zmieniają, i te stabilne (np. `StateContext`
  i `DispatchContext` przy `useReducer`, bo `dispatch` ma stałą tożsamość),
- przeniesienie providera niżej, bliżej konsumentów,
- dla często zmieniającego się stanu globalnego: zewnętrzny store z subskrypcją fragmentów
  (Zustand, Redux, `useSyncExternalStore`).

## Kontekst to nie „zarządzanie stanem”

Kontekst to mechanizm **przekazywania** wartości (wstrzykiwanie zależności). Sam stan nadal żyje
w `useState` / `useReducer` providera. Połączenie kontekstu z reducerem wystarcza w wielu aplikacjach,
ale przy dużej liczbie aktualizacji i konsumentów dedykowane biblioteki są wydajniejsze.

## Źródła

- [useContext (react.dev)](https://react.dev/reference/react/useContext)
- [Passing data deeply with context (react.dev)](https://react.dev/learn/passing-data-deeply-with-context)
- [Scaling up with reducer and context (react.dev)](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [React 19: Context as a provider (react.dev)](https://react.dev/blog/2024/12/05/react-19#context-as-a-provider)

## Pytania

### Do czego służy Context API? {junior}

Do przekazywania wartości wielu komponentom w głębi drzewa bez przekazywania jej przez propsy na każdym
poziomie pośrednim. Sprawdza się przy danych potrzebnych w wielu miejscach i zmieniających się rzadko:
motyw, zalogowany użytkownik, język, konfiguracja, klient API. Dla danych lokalnych lepsze są propsy
i kompozycja.

### Co zwróci `useContext`, jeśli nad komponentem nie ma providera? {junior}

Wartość domyślną podaną w `createContext(defaultValue)`. Nie jest to współdzielony stan, tylko wartość
zapasowa. Jeśli domyślna wartość nie ma sensu, stosuje się `createContext<T | null>(null)` i hook,
który rzuca błąd, gdy provider nie istnieje.

### Które komponenty renderują się po zmianie wartości kontekstu? {mid}

Wszystkie komponenty, które go odczytują (`useContext`/`use`) pod danym providerem, także opakowane
w `memo`, bo `memo` porównuje tylko propsy. Komponenty pośrednie, które kontekstu nie czytają, nie
renderują się z tego powodu (o ile nie renderuje się ich rodzic). Zmiana jest wykrywana przez `Object.is`
na wartości providera.

### Dlaczego obiekt przekazany jako `value` warto opakować w `useMemo`? {mid}

Literał `{ user, logout }` to nowy obiekt przy każdym renderze providera, więc `Object.is` zawsze uzna
wartość za zmienioną i wszyscy konsumenci się przerenderują, nawet gdy `user` jest ten sam. `useMemo`
(i `useCallback` dla funkcji) sprawia, że nowa referencja powstaje tylko przy faktycznej zmianie danych.

### Jak ograniczyć rendery konsumentów kontekstu, który często się zmienia? {senior}

Podzielić go na mniejsze konteksty, np. stan i akcje osobno, bo `dispatch` z `useReducer` jest stabilny,
więc komponenty wywołujące akcje się nie renderują. Przenieść provider bliżej konsumentów. Przy stanie
globalnym zmieniającym się często użyć store'a z selektorami (Zustand, Redux Toolkit, `useSyncExternalStore`),
który renderuje tylko komponenty zależne od zmienionego fragmentu.

### Czy Context API zastępuje Reduxa? {mid}

Częściowo. Kontekst tylko przekazuje wartość, a stan trzyma `useState`/`useReducer`. Dla prostego stanu
globalnego (motyw, użytkownik) to wystarczy. Redux Toolkit czy Zustand dają selektory (render tylko przy
zmianie potrzebnego fragmentu), middleware, DevTools z historią akcji i wygodną obsługę złożonych
aktualizacji. Stan serwerowy lepiej trzymać w TanStack Query niż w którymkolwiek z nich.

### Czym różni się `use(Context)` od `useContext(Context)`? {mid}

Zwracają to samo, ale `use` (React 19) nie podlega zasadom hooków w zakresie kolejności wywołań: można
go wywołać w `if` czy w pętli, np. tylko wtedy, gdy komponent faktycznie potrzebuje wartości. Nadal trzeba
go wywołać w komponencie lub hooku. `use` przyjmuje też promise, co łączy odczyt danych z Suspense.

### Jak zmienić wartość kontekstu z komponentu w głębi drzewa? {junior}

Przekazać przez kontekst również funkcję aktualizującą, np. `{ theme, setTheme }` albo `dispatch`
z `useReducer`. Stan i tak żyje w komponencie providera, a konsument wywołuje przekazaną funkcję. Warto
ustabilizować ją (`useCallback`, `dispatch` jest stabilny) i często trzymać w osobnym kontekście.

### Co się stanie przy zagnieżdżeniu dwóch providerów tego samego kontekstu? {junior}

Komponent odczyta wartość **najbliższego** providera powyżej siebie. Wewnętrzny provider nadpisuje wartość
dla swojego poddrzewa, co pozwala np. użyć ciemnego motywu w jednej sekcji strony albo nadpisać zależności
w testach.

### Jakie są wady nadużywania kontekstu? {mid}

Komponenty stają się zależne od providera, więc trudniej je używać ponownie i testować w izolacji. Każda
zmiana wartości renderuje wszystkich konsumentów, co przy dużym, często zmieniającym się kontekście szkodzi
wydajności. Przepływ danych jest też mniej jawny niż przy propsach. Zanim sięgnie się po kontekst, warto
sprawdzić kompozycję (`children`, sloty) albo przeniesienie stanu.
