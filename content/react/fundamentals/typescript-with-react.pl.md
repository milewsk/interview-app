# TypeScript w React {mid}

TypeScript w React to głównie typowanie **propsów**, **stanu**, **zdarzeń**, **refów** i **kontekstu**.
Większość typów wynika z inferencji, a jawne adnotacje dodaje się tam, gdzie TS nie może ich zgadnąć.

## Propsy

```tsx
type AvatarProps = {
  src: string
  size?: number                      // opcjonalny
  onClick?: () => void
  children?: React.ReactNode         // wszystko, co da się wyrenderować
}

function Avatar({ src, size = 40, children }: AvatarProps) { /* ... */ }
```

- `React.ReactNode` to najszerszy typ „czegoś do wyrenderowania” (elementy, stringi, liczby, `null`,
  tablice). `React.ReactElement` / `JSX.Element` to tylko elementy JSX.
- `React.FC` jest opcjonalny. Od React 18 **nie dodaje niejawnie `children`**, więc wiele zespołów
  pisze zwykłe funkcje z typem propsów.
- `type` i `interface` działają tu niemal tak samo. `type` jest wygodniejszy przy uniach.

### Rozszerzanie propsów natywnych elementów

```tsx
type ButtonProps = React.ComponentProps<'button'> & { variant?: 'primary' | 'ghost' }

function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button className={variant} {...rest} />   // type, disabled, onClick, aria-* działają
}
```

### Unie dyskryminowane

Propsy, które wykluczają się nawzajem, opisuje się unią. TS wymusi wtedy poprawne kombinacje:

```tsx
type LinkOrButton =
  | ({ as: 'button' } & React.ComponentProps<'button'>)
  | ({ as: 'link'; href: string } & React.ComponentProps<'a'>)

<Action as="link" />          // ❌ błąd: brak href
```

### Komponenty generyczne

```tsx
function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => React.ReactNode }) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>
}

<List items={users} renderItem={(u) => u.name} />   // u: User, wywnioskowane
```

W plikach `.tsx` strzałka generyczna wymaga zapisu `<T,>(props) => ...`, żeby odróżnić ją od tagu JSX.

## Stan, refy, zdarzenia

```tsx
const [user, setUser] = useState<User | null>(null)       // typ, którego TS nie wywnioskuje z null
const [count, setCount] = useState(0)                      // number z inferencji

const inputRef = useRef<HTMLInputElement>(null)           // ref do DOM
const timerRef = useRef<number | null>(null)              // wartość mutowalna

function handleChange(e: React.ChangeEvent<HTMLInputElement>) { setName(e.target.value) }
function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault() }
const onClick: React.MouseEventHandler<HTMLButtonElement> = (e) => { /* ... */ }
```

W typach React 19 `useRef` **wymaga argumentu** (`useRef<T>()` bez niego jest błędem), a refy do DOM
zapisuje się jako `useRef<HTMLDivElement>(null)`.

## Kontekst

```tsx
type Auth = { user: User; logout: () => void }
const AuthContext = createContext<Auth | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx                                               // Auth, bez null
}
```

Wartość domyślna `null` i hook ze strażnikiem to najpopularniejszy wzorzec: konsumenci dostają typ bez
`null`, a użycie poza providerem od razu rzuca czytelny błąd.

## Reducer i wyczerpujące sprawdzanie

```tsx
type Action = { type: 'add'; text: string } | { type: 'remove'; id: number }

function reducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add': return [...state, { id: Date.now(), text: action.text }]
    case 'remove': return state.filter((t) => t.id !== action.id)
    default: {
      const exhaustive: never = action   // błąd kompilacji, jeśli pominięto wariant
      return exhaustive
    }
  }
}
```

## Własne hooki zwracające krotkę

```tsx
function useToggle() {
  const [on, setOn] = useState(false)
  return [on, () => setOn((v) => !v)] as const   // readonly [boolean, () => void]
}
```

Bez `as const` TS wywnioskuje tablicę `(boolean | (() => void))[]` i destrukturyzacja straci typy.

## Źródła

- [Using TypeScript (react.dev)](https://react.dev/learn/typescript)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [React 19 upgrade guide: TypeScript changes (react.dev)](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#typescript-changes)
- [Narrowing: discriminated unions (TypeScript Handbook)](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

## Pytania

### Jak otypować `children`? Czym różni się `ReactNode` od `ReactElement`? {junior}

`children?: React.ReactNode` przyjmuje wszystko, co React potrafi wyrenderować: elementy, stringi, liczby,
`null`, `undefined`, tablice i fragmenty. `React.ReactElement` (i `JSX.Element`) to wyłącznie element JSX,
więc nie przyjmie tekstu ani `null`. Do `children` prawie zawsze używa się `ReactNode`.

### Czy warto używać `React.FC`? {mid}

Nie jest to konieczne. Kiedyś `React.FC` dodawał niejawnie `children` (co było źródłem błędów) i utrudniał
komponenty generyczne. Od React 18 `children` trzeba deklarować jawnie. Obecnie to kwestia stylu, a wiele
zespołów woli zwykłe funkcje z typem propsów w parametrze, bo są prostsze i działają z generykami.

### Jak otypować handler zdarzenia `onChange` pola tekstowego? {junior}

`(e: React.ChangeEvent<HTMLInputElement>) => void`, dzięki czemu `e.target.value` jest typu `string`. Dla
formularza `React.FormEvent<HTMLFormElement>`, dla kliknięcia `React.MouseEvent<HTMLButtonElement>`. Można też
otypować cały handler: `React.ChangeEventHandler<HTMLInputElement>`. Przy funkcji inline w JSX typ jest
wnioskowany automatycznie.

### Jak przyjąć wszystkie propsy natywnego elementu w swoim komponencie? {mid}

Rozszerzyć typ o `React.ComponentProps<'button'>` (lub `ComponentPropsWithoutRef` / `WithRef`) i przekazać
resztę przez spread: `function Button({ variant, ...rest }: Props) { return <button {...rest} /> }`. Komponent
obsłuży wtedy `type`, `disabled`, `onClick`, atrybuty `aria-*` itd. bez ręcznego wyliczania.

### Jak wymusić, by prop `href` był wymagany tylko w wariancie „link”? {mid}

Unią dyskryminowaną: `{ as: 'button' } & ButtonProps | { as: 'link'; href: string } & AnchorProps`. TS pozwoli
tylko na poprawne kombinacje, a wewnątrz komponentu sprawdzenie `props.as === 'link'` zawęża typ, więc `href`
jest dostępny. To lepsze niż kilka opcjonalnych propsów, które mogą tworzyć niepoprawne stany.

### Jak otypować kontekst, który nie ma sensownej wartości domyślnej? {mid}

`createContext<Value | null>(null)` plus własny hook, który sprawdza `null` i rzuca błąd („must be used within
Provider”), a w przeciwnym razie zwraca wartość zawężoną do `Value`. Konsumenci nie muszą obsługiwać `null`,
a błąd użycia poza providerem jest od razu widoczny. Alternatywa `{} as Value` ukrywa ten błąd.

### Jak napisać komponent generyczny? {senior}

Parametryzując funkcję typem: `function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactNode })`.
TS wywnioskuje `T` z przekazanych `items`, więc `renderItem` dostaje poprawny typ elementu. W plikach `.tsx`
funkcja strzałkowa wymaga zapisu `<T,>(...)`, żeby nie mylić jej z JSX. Przydaje się w listach, tabelach,
selectach i komponentach formularzy.

### Dlaczego własny hook zwracający krotkę powinien używać `as const`? {mid}

Bez tego TS wywnioskuje zwykłą tablicę z unią typów, np. `(boolean | (() => void))[]`. Po destrukturyzacji
`const [on, toggle] = useToggle()` obie zmienne mają typ unii i `toggle()` się nie skompiluje. `as const`
tworzy krotkę `readonly [boolean, () => void]` z typami na pozycjach. Alternatywą jest jawny typ zwracany albo
zwracanie obiektu.

### Jak zapewnić, że reducer obsługuje wszystkie akcje? {senior}

Opisać akcje unią dyskryminowaną po polu `type` i w gałęzi `default` przypisać akcję do zmiennej typu `never`
(`const exhaustive: never = action`). Jeśli do unii dojdzie nowy wariant, a `switch` go nie obsłuży, kompilacja
się nie powiedzie. Dodatkowo TS zawęża typ w każdej gałęzi, więc np. `action.text` jest dostępne tylko przy `add`.

### Jak otypować `useRef` dla elementu DOM i dla wartości mutowalnej? {mid}

Dla DOM: `useRef<HTMLInputElement>(null)`, a przy odczycie trzeba sprawdzić `ref.current?.focus()`, bo przed
montowaniem jest `null`. Dla wartości: `useRef<number | null>(null)` albo `useRef(0)`, gdy wartość początkowa
jest znana. W typach React 19 `useRef` zawsze wymaga argumentu, a `current` jest mutowalne (zniknął podział
na `RefObject` tylko do odczytu).
