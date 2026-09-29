# TypeScript with React {mid}

TypeScript in React is mostly about typing **props**, **state**, **events**, **refs** and **context**. Most types
come from inference, and you add explicit annotations where TS can't guess them.

## Props

```tsx
type AvatarProps = {
  src: string
  size?: number                      // optional
  onClick?: () => void
  children?: React.ReactNode         // anything renderable
}

function Avatar({ src, size = 40, children }: AvatarProps) { /* ... */ }
```

- `React.ReactNode` is the broadest "renderable" type (elements, strings, numbers, `null`, arrays).
  `React.ReactElement` / `JSX.Element` covers JSX elements only.
- `React.FC` is optional. Since React 18 it **doesn't add `children` implicitly**, so many teams write plain
  functions with a props type.
- `type` and `interface` work almost the same here. `type` is handier for unions.

### Extending native element props

```tsx
type ButtonProps = React.ComponentProps<'button'> & { variant?: 'primary' | 'ghost' }

function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button className={variant} {...rest} />   // type, disabled, onClick, aria-* all work
}
```

### Discriminated unions

Mutually exclusive props are described with a union. TS then enforces valid combinations:

```tsx
type LinkOrButton =
  | ({ as: 'button' } & React.ComponentProps<'button'>)
  | ({ as: 'link'; href: string } & React.ComponentProps<'a'>)

<Action as="link" />          // ❌ error: missing href
```

### Generic components

```tsx
function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => React.ReactNode }) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>
}

<List items={users} renderItem={(u) => u.name} />   // u: User, inferred
```

In `.tsx` files a generic arrow function needs `<T,>(props) => ...` to distinguish it from a JSX tag.

## State, refs, events

```tsx
const [user, setUser] = useState<User | null>(null)       // a type TS can't infer from null
const [count, setCount] = useState(0)                      // number via inference

const inputRef = useRef<HTMLInputElement>(null)           // a DOM ref
const timerRef = useRef<number | null>(null)              // a mutable value

function handleChange(e: React.ChangeEvent<HTMLInputElement>) { setName(e.target.value) }
function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault() }
const onClick: React.MouseEventHandler<HTMLButtonElement> = (e) => { /* ... */ }
```

In the React 19 types `useRef` **requires an argument** (`useRef<T>()` without one is an error), and DOM refs are
written as `useRef<HTMLDivElement>(null)`.

## Context

```tsx
type Auth = { user: User; logout: () => void }
const AuthContext = createContext<Auth | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx                                               // Auth, without null
}
```

A `null` default plus a guarding hook is the most popular pattern: consumers get a non-null type, and using it
outside the provider immediately throws a clear error.

## Reducers and exhaustive checks

```tsx
type Action = { type: 'add'; text: string } | { type: 'remove'; id: number }

function reducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add': return [...state, { id: Date.now(), text: action.text }]
    case 'remove': return state.filter((t) => t.id !== action.id)
    default: {
      const exhaustive: never = action   // compile error if a variant is missed
      return exhaustive
    }
  }
}
```

## Custom hooks returning a tuple

```tsx
function useToggle() {
  const [on, setOn] = useState(false)
  return [on, () => setOn((v) => !v)] as const   // readonly [boolean, () => void]
}
```

Without `as const` TS infers the array `(boolean | (() => void))[]`, and destructuring loses the types.

## Sources

- [Using TypeScript (react.dev)](https://react.dev/learn/typescript)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [React 19 upgrade guide: TypeScript changes (react.dev)](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#typescript-changes)
- [Narrowing: discriminated unions (TypeScript Handbook)](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

## Questions

### How do you type `children`? How does `ReactNode` differ from `ReactElement`? {junior}

`children?: React.ReactNode` accepts everything React can render: elements, strings, numbers, `null`,
`undefined`, arrays and fragments. `React.ReactElement` (and `JSX.Element`) is only a JSX element, so it won't
accept text or `null`. `ReactNode` is almost always the right type for `children`.

### Is it worth using `React.FC`? {mid}

It's not necessary. `React.FC` used to add `children` implicitly (a source of bugs) and made generic components
awkward. Since React 18 `children` must be declared explicitly. It's now a matter of style, and many teams prefer
plain functions with a typed props parameter, because they're simpler and work with generics.

### How do you type a text input's `onChange` handler? {junior}

`(e: React.ChangeEvent<HTMLInputElement>) => void`, which makes `e.target.value` a `string`. For a form use
`React.FormEvent<HTMLFormElement>`, for a click `React.MouseEvent<HTMLButtonElement>`. You can also type the whole
handler: `React.ChangeEventHandler<HTMLInputElement>`. With an inline function in JSX the type is inferred
automatically.

### How do you accept all of a native element's props in your component? {mid}

Extend the type with `React.ComponentProps<'button'>` (or `ComponentPropsWithoutRef` / `WithRef`) and pass the rest
through with a spread: `function Button({ variant, ...rest }: Props) { return <button {...rest} /> }`. The component
then supports `type`, `disabled`, `onClick`, `aria-*` attributes etc. without listing them by hand.

### How do you require `href` only in the "link" variant? {mid}

With a discriminated union: `{ as: 'button' } & ButtonProps | { as: 'link'; href: string } & AnchorProps`. TS allows only
valid combinations, and inside the component checking `props.as === 'link'` narrows the type, so `href` is available.
That's better than several optional props that can form invalid states.

### How do you type a context that has no sensible default value? {mid}

`createContext<Value | null>(null)` plus a custom hook that checks for `null` and throws ("must be used within
Provider"), and otherwise returns the value narrowed to `Value`. Consumers don't have to handle `null`, and using it
outside the provider is immediately visible. The `{} as Value` alternative hides that mistake.

### How do you write a generic component? {senior}

By parameterizing the function with a type: `function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactNode })`.
TS infers `T` from the passed `items`, so `renderItem` gets the correct item type. In `.tsx` files an arrow function
needs `<T,>(...)` so it isn't confused with JSX. It's useful for lists, tables, selects and form components.

### Why should a custom hook returning a tuple use `as const`? {mid}

Without it TS infers a plain array with a union type, e.g. `(boolean | (() => void))[]`. After destructuring
`const [on, toggle] = useToggle()` both variables have the union type, and `toggle()` won't compile. `as const` creates
the tuple `readonly [boolean, () => void]` with per-position types. The alternatives are an explicit return type or
returning an object.

### How do you make sure a reducer handles every action? {senior}

Describe actions as a discriminated union on a `type` field, and in the `default` branch assign the action to a variable
of type `never` (`const exhaustive: never = action`). If a new variant is added to the union and the `switch` doesn't
handle it, compilation fails. TS also narrows the type in each branch, so e.g. `action.text` is available only for `add`.

### How do you type `useRef` for a DOM element and for a mutable value? {mid}

For the DOM: `useRef<HTMLInputElement>(null)`, and when reading, guard with `ref.current?.focus()`, because it's `null`
before mounting. For a value: `useRef<number | null>(null)`, or `useRef(0)` when the initial value is known. In the
React 19 types `useRef` always requires an argument, and `current` is mutable (the split into a read-only `RefObject`
is gone).
