# Wzorce komponentów {mid}

React stawia na **kompozycję zamiast dziedziczenia**. Komponenty łączy się jak klocki: przez propsy,
`children` i hooki. Poniższe wzorce odpowiadają na pytanie, jak współdzielić logikę i budować elastyczne
API komponentów.

## Kompozycja: `children` i „sloty”

```tsx
function Card({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="card">
      <header>{header}</header>
      <div>{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  )
}

<Card header={<h2>Zamówienie</h2>} footer={<Button>Zapłać</Button>}>
  <OrderSummary />
</Card>
```

Przekazywanie JSX jako propsów („sloty”) pozwala uniknąć przepychania danych przez wiele poziomów
(prop drilling). Komponent pośredni nie musi znać danych, bo rodzic podaje gotowy element.

## Higher-Order Component (HOC)

Funkcja, która przyjmuje komponent i zwraca nowy, rozszerzony komponent:

```tsx
function withAuth<P extends object>(Component: React.ComponentType<P>) {
  function WithAuth(props: P) {
    const user = useUser()
    if (!user) return <Navigate to="/login" />
    return <Component {...props} />
  }
  WithAuth.displayName = `withAuth(${Component.displayName ?? Component.name})`
  return WithAuth
}
export default withAuth(Dashboard)
```

Wady: „wrapper hell” w drzewie, kolizje nazw propsów, trudniejsze typowanie i niejawne źródło propsów.
HOC trzeba tworzyć **poza** renderem (inaczej za każdym razem powstaje nowy typ komponentu).
Dziś stosuje się je głównie w bibliotekach i przy przekrojowych zadaniach, np. ochronie tras.

## Render props

Komponent przyjmuje funkcję, która zwraca JSX, i przekazuje jej dane:

```tsx
<MousePosition render={({ x, y }) => <Cursor x={x} y={y} />} />
```

Wadą jest zagnieżdżanie przy kilku takich komponentach. Większość zastosowań render props i HOC zastąpiły
**własne hooki** (`const { x, y } = useMousePosition()`), które dzielą logikę bez zmiany drzewa komponentów.

## Compound components

Kilka komponentów współpracuje przez wspólny kontekst, a użytkownik składa je swobodnie:

```tsx
const TabsContext = createContext<{ active: string; setActive: (id: string) => void } | null>(null)

function Tabs({ defaultTab, children }: { defaultTab: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultTab)
  return <TabsContext value={{ active, setActive }}>{children}</TabsContext>
}
function Tab({ id, children }: { id: string; children: ReactNode }) {
  const ctx = use(TabsContext)!
  return <button aria-selected={ctx.active === id} onClick={() => ctx.setActive(id)}>{children}</button>
}
function Panel({ id, children }: { id: string; children: ReactNode }) {
  return use(TabsContext)!.active === id ? <div>{children}</div> : null
}

<Tabs defaultTab="a">
  <Tab id="a">Opis</Tab><Tab id="b">Opinie</Tab>
  <Panel id="a">…</Panel><Panel id="b">…</Panel>
</Tabs>
```

Tak zbudowane są biblioteki komponentów (Radix UI, Headless UI, React Aria).

## Kontrolowany lub niekontrolowany komponent

Dobre komponenty wielokrotnego użytku działają w obu trybach, tak jak `<input>`: `value` + `onChange`
(kontrolowany) albo `defaultValue` (stan wewnętrzny):

```tsx
function Toggle({ on, defaultOn = false, onChange }: { on?: boolean; defaultOn?: boolean; onChange?: (v: boolean) => void }) {
  const [inner, setInner] = useState(defaultOn)
  const isControlled = on !== undefined
  const value = isControlled ? on : inner
  const toggle = () => {
    if (!isControlled) setInner(!value)
    onChange?.(!value)
  }
  return <button aria-pressed={value} onClick={toggle}>{value ? 'ON' : 'OFF'}</button>
}
```

## Inne wzorce

- **Headless components / hooks**: logika i dostępność bez wyglądu (`useCombobox`, TanStack Table), a
  wygląd należy do użytkownika.
- **Polimorficzny prop `as`**: `<Button as="a" href="...">` renderuje inny element z tym samym stylem.
- **Container / presentational**: podział na komponent pobierający dane i czysty komponent widoku. Kiedyś
  popularny, dziś często zastępowany przez hooki, ale nadal przydatny dla testowalności.

## Źródła

- [Passing JSX as children (react.dev)](https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children)
- [Reusing logic with custom Hooks (react.dev)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Passing data deeply with context (react.dev)](https://react.dev/learn/passing-data-deeply-with-context)
- [Higher-order components (legacy React docs)](https://legacy.reactjs.org/docs/higher-order-components.html)
- [Render props (legacy React docs)](https://legacy.reactjs.org/docs/render-props.html)

## Pytania

### Dlaczego React preferuje kompozycję zamiast dziedziczenia? {junior}

Kompozycja (propsy, `children`, sloty, hooki) wystarcza do każdego przypadku współdzielenia kodu między
komponentami, a jest bardziej elastyczna i czytelna. Dziedziczenie tworzy sztywne hierarchie i ukryte
zależności od klasy bazowej. Zespół Reacta pisał, że w tysiącach komponentów w Facebooku nie znalazł
przypadku, w którym poleciłby hierarchie dziedziczenia. Logikę niezwiązaną z UI wydziela się do hooków
lub modułów.

### Czym jest HOC i jakie ma wady? {mid}

To funkcja przyjmująca komponent i zwracająca nowy komponent z dodatkowym zachowaniem lub propsami (np.
`withAuth`, `connect` w starym Reduksie). Wady: dodatkowe warstwy w drzewie, kolizje nazw propsów, niejawne
źródło propsów, trudniejsze typowanie i konieczność ustawiania `displayName`. HOC nie wolno tworzyć
w trakcie renderu, bo za każdym razem powstałby nowy typ komponentu.

### Czym są render props i co je zastąpiło? {mid}

To wzorzec, w którym komponent dostaje funkcję zwracającą JSX (w `render` lub `children`) i wywołuje ją
z własnymi danymi, np. pozycją myszy. Pozwala dzielić logikę ze stanem, ale przy kilku takich komponentach
powstaje głębokie zagnieżdżenie. Większość zastosowań zastąpiły własne hooki, które zwracają dane
bezpośrednio, bez zmiany struktury drzewa.

### Czym są compound components? {mid}

To zestaw komponentów, które współpracują przez wspólny, ukryty stan (zwykle kontekst), np. `Tabs`, `Tab`
i `Panel` albo `Select` i `Option`. Użytkownik składa je deklaratywnie w dowolnej kolejności i strukturze,
a komponent nadrzędny zarządza stanem. Dzięki temu API jest elastyczne bez dziesiątek propsów
konfiguracyjnych.

### Jak uniknąć prop drillingu bez sięgania po kontekst? {mid}

Przez kompozycję: zamiast przekazywać dane przez kilka poziomów pośrednich komponentów, przekazuje się
gotowy JSX przez `children` lub inne propsy (sloty). Komponenty pośrednie tylko go umieszczają, nie znając
danych. Kontekst jest właściwy dla danych naprawdę globalnych (motyw, użytkownik, język), bo każda jego
zmiana renderuje konsumentów.

### Jak zaprojektować komponent, który działa w trybie kontrolowanym i niekontrolowanym? {senior}

Przyjąć zarówno `value` + `onChange`, jak i `defaultValue`. Jeśli przekazano `value` (różne od `undefined`),
komponent jest kontrolowany i tylko wywołuje `onChange`. W przeciwnym razie trzyma wartość we własnym stanie,
zainicjalizowanym z `defaultValue`, i też wywołuje `onChange`. Tryb nie powinien zmieniać się w trakcie życia
komponentu, więc warto to sprawdzać i ostrzegać.

### Kiedy wybrać własny hook, a kiedy komponent? {mid}

Hook, gdy współdzielona jest **logika ze stanem** (pobieranie danych, obsługa formularza, subskrypcja),
a każdy komponent renderuje ją po swojemu. Komponent, gdy współdzielony jest **fragment UI** z zachowaniem
(przycisk, modal, lista). Często łączy się oba: hook z logiką (headless) plus komponent korzystający z niego.

### Co to są komponenty headless? {mid}

Komponenty lub hooki dostarczające logikę, stan i dostępność (obsługa klawiatury, atrybuty ARIA), ale bez
własnego wyglądu, np. Radix UI, Headless UI, React Aria, TanStack Table. Użytkownik decyduje o markupie
i stylach. Rozwiązuje to częsty problem gotowych bibliotek UI, które trudno dopasować do własnego design
systemu.

### Dlaczego HOC musi mieć ustawiony `displayName` i przekazywać wszystkie propsy? {mid}

`displayName` sprawia, że w React DevTools i komunikatach błędów widać `withAuth(Dashboard)` zamiast
anonimowego wrappera, co ułatwia debugowanie. Przekazanie wszystkich propsów (`{...props}`) jest konieczne,
żeby opakowany komponent działał jak oryginał i HOC był przezroczysty dla użytkownika. Dotyczy to także
refa, który od React 19 jest zwykłym propem.

### Czym jest wzorzec polimorficznego propa `as`? {senior}

Komponent przyjmuje prop `as` określający, jaki element lub komponent wyrenderować, np.
`<Button as="a" href="/x">` albo `<Text as="h2">`. Zachowuje przy tym style i zachowanie. Upraszcza
utrzymanie spójnego wyglądu przy poprawnej semantyce HTML. Wyzwaniem jest typowanie w TypeScript: propsy
muszą zależeć od wybranego elementu (np. `href` tylko dla `a`), co wymaga typów generycznych.
