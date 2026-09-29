# Component patterns {mid}

React favors **composition over inheritance**. Components fit together like building blocks: through props,
`children` and hooks. The patterns below answer how to share logic and build flexible component APIs.

## Composition: `children` and "slots"

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

<Card header={<h2>Order</h2>} footer={<Button>Pay</Button>}>
  <OrderSummary />
</Card>
```

Passing JSX as props ("slots") avoids pushing data through many levels (prop drilling). The intermediate
component doesn't need to know the data, because the parent supplies a ready element.

## Higher-Order Component (HOC)

A function that takes a component and returns a new, enhanced component:

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

Downsides: "wrapper hell" in the tree, prop name collisions, harder typing and an implicit source of props. HOCs
must be created **outside** render (otherwise a new component type is created every time). Today they're used
mainly in libraries and for cross-cutting concerns, e.g. protecting routes.

## Render props

A component takes a function that returns JSX and passes data to it:

```tsx
<MousePosition render={({ x, y }) => <Cursor x={x} y={y} />} />
```

The downside is nesting when you combine several of them. Most uses of render props and HOCs have been replaced by
**custom hooks** (`const { x, y } = useMousePosition()`), which share logic without changing the component tree.

## Compound components

Several components cooperate through a shared context, and the user composes them freely:

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
  <Tab id="a">Description</Tab><Tab id="b">Reviews</Tab>
  <Panel id="a">…</Panel><Panel id="b">…</Panel>
</Tabs>
```

Component libraries are built this way (Radix UI, Headless UI, React Aria).

## Controlled or uncontrolled component

Good reusable components work in both modes, like `<input>`: `value` + `onChange` (controlled) or `defaultValue`
(internal state):

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

## Other patterns

- **Headless components / hooks**: logic and accessibility without styling (`useCombobox`, TanStack Table), with the
  look left to the user.
- **The polymorphic `as` prop**: `<Button as="a" href="...">` renders a different element with the same styling.
- **Container / presentational**: splitting into a data-fetching component and a pure view component. Once popular,
  now often replaced by hooks, but still useful for testability.

## Sources

- [Passing JSX as children (react.dev)](https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children)
- [Reusing logic with custom Hooks (react.dev)](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Passing data deeply with context (react.dev)](https://react.dev/learn/passing-data-deeply-with-context)
- [Higher-order components (legacy React docs)](https://legacy.reactjs.org/docs/higher-order-components.html)
- [Render props (legacy React docs)](https://legacy.reactjs.org/docs/render-props.html)

## Questions

### Why does React prefer composition over inheritance? {junior}

Composition (props, `children`, slots, hooks) covers every case of sharing code between components, and it's more
flexible and readable. Inheritance creates rigid hierarchies and hidden dependencies on a base class. The React team
wrote that across thousands of components at Facebook they found no case where they'd recommend inheritance
hierarchies. Logic unrelated to UI goes into hooks or modules.

### What is a HOC, and what are its downsides? {mid}

A function that takes a component and returns a new component with extra behavior or props (e.g. `withAuth`,
`connect` in old Redux). Downsides: extra layers in the tree, prop name collisions, an implicit source of props,
harder typing and the need to set `displayName`. A HOC must not be created during render, because that would create a
new component type each time.

### What are render props, and what replaced them? {mid}

A pattern where a component receives a function returning JSX (in `render` or `children`) and calls it with its own
data, e.g. the mouse position. It shares stateful logic, but combining several of them leads to deep nesting. Most
uses have been replaced by custom hooks, which return data directly without changing the tree structure.

### What are compound components? {mid}

A set of components that cooperate through shared, hidden state (usually context), e.g. `Tabs`, `Tab` and `Panel`, or
`Select` and `Option`. The user composes them declaratively in any order and structure, and the parent component
manages the state. This gives a flexible API without dozens of configuration props.

### How do you avoid prop drilling without reaching for context? {mid}

Through composition: instead of passing data through several intermediate components, pass ready-made JSX via
`children` or other props (slots). The intermediate components just place it without knowing the data. Context is right
for truly global data (theme, user, language), because every change to it re-renders its consumers.

### How do you design a component that works in both controlled and uncontrolled mode? {senior}

Accept both `value` + `onChange` and `defaultValue`. If `value` is passed (not `undefined`), the component is controlled
and only calls `onChange`. Otherwise it keeps the value in its own state, initialized from `defaultValue`, and also calls
`onChange`. The mode shouldn't change over the component's lifetime, so it's worth checking and warning about it.

### When should you write a custom hook, and when a component? {mid}

A hook when you share **stateful logic** (data fetching, form handling, a subscription) and each component renders it
its own way. A component when you share **a piece of UI** with behavior (a button, a modal, a list). The two are often
combined: a hook with the logic (headless) plus a component that uses it.

### What are headless components? {mid}

Components or hooks that provide logic, state and accessibility (keyboard handling, ARIA attributes) but no styling,
e.g. Radix UI, Headless UI, React Aria, TanStack Table. The user controls markup and styles. This solves a common
problem with ready-made UI libraries, which are hard to fit to your own design system.

### Why must a HOC set `displayName` and forward all props? {mid}

`displayName` makes React DevTools and error messages show `withAuth(Dashboard)` instead of an anonymous wrapper, which
helps debugging. Forwarding all props (`{...props}`) is required so that the wrapped component behaves like the
original and the HOC is transparent to its users. This includes the ref, which is a regular prop since React 19.

### What is the polymorphic `as` prop pattern? {senior}

The component takes an `as` prop that determines which element or component to render, e.g. `<Button as="a" href="/x">`
or `<Text as="h2">`, while keeping its styling and behavior. It makes it easier to keep a consistent look with correct
HTML semantics. The challenge is typing it in TypeScript: the props must depend on the chosen element (e.g. `href` only
for `a`), which requires generic types.
