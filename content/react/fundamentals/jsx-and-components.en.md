# JSX, components and props {junior}

A **component** is a function that returns a description of UI. **JSX** is an HTML-like syntax that a
compiler (Babel, SWC, esbuild) turns into calls to functions that create **elements**, plain objects
describing what should appear on screen.

```tsx
function Greeting({ name }: { name: string }) {
  return <h1 className="title">Hello, {name}!</h1>
}

// after compilation (automatic JSX runtime):
import { jsx as _jsx } from 'react/jsx-runtime'
function Greeting({ name }) {
  return _jsx('h1', { className: 'title', children: ['Hello, ', name, '!'] })
}
```

## JSX rules

- JavaScript expressions go inside `{}`: variables, calls, operators. You can't put statements (`if`,
  `for`) there.
- Attributes are camelCase: `className`, `htmlFor`, `onClick`, `tabIndex`. `style` takes an object
  `{{ marginTop: 8 }}`.
- A component returns **one** root element. Wrap several elements in a **fragment** `<>...</>` (or
  `<Fragment key={...}>` when you need a key).
- Component names start with a **capital letter**: `<Button />` is a component, `<button />` an HTML tag.
- `false`, `null`, `undefined` and `true` render nothing, but **`0` and `NaN` do**:

```tsx
{count && <Badge count={count} />}      // 🔴 renders "0" when count === 0
{count > 0 && <Badge count={count} />}  // ✅
{isAdmin ? <AdminPanel /> : <Guest />}  // a condition with an alternative
```

## Element, component, instance

- **Component**: a function (or class), e.g. `Greeting`.
- **Element**: an immutable object returned by JSX, e.g. `{ type: Greeting, props: { name: 'Alice' } }`.
  Cheap to create, because it's just a description.
- **Instance**: a "live" copy of a component in the tree. React keeps its state and effects with it.

## Props

- Props are passed like attributes and received as the **first argument** of the function (usually
  destructured, with defaults: `function Avatar({ size = 40 })`).
- Props are **read-only**. A component can't change them, and changing data is handled by state.
- **One-way data flow**: data flows down through props, and information flows up through **callbacks**
  passed as props:

```tsx
function Parent() {
  const [value, setValue] = useState('')
  return <SearchBox value={value} onChange={setValue} />
}
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} />
}
```

- **`children`** is a special prop holding the content between the tags. It lets you build container
  components (`<Card><p>...</p></Card>`).
- Spreading `{...props}` passes all props on. It's handy in wrapper components, but it's easy to pass
  something unwanted to the DOM.

## Component purity

Rendering must be **pure**: for the same props, state and context it returns the same JSX and has no side
effects (it doesn't modify outside variables, send requests or change the DOM). This lets React render
repeatedly, interrupt rendering and skip it. In `StrictMode` (dev) React calls render twice precisely to
detect impurity.

## Security: XSS

React **escapes** text inserted with `{}`, so `'<b>x</b>'` shows up as text, not HTML. Raw HTML goes in only
through `dangerouslySetInnerHTML={{ __html: html }}`, and then it must be sanitized first (e.g. DOMPurify).
Also watch out for an `href` attribute built from user data (`javascript:`).

## Sources

- [Writing markup with JSX (react.dev)](https://react.dev/learn/writing-markup-with-jsx)
- [Passing props to a component (react.dev)](https://react.dev/learn/passing-props-to-a-component)
- [Conditional rendering (react.dev)](https://react.dev/learn/conditional-rendering)
- [Keeping components pure (react.dev)](https://react.dev/learn/keeping-components-pure)
- [Introducing the new JSX transform (React blog)](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)

## Questions

### What is JSX and what is it compiled to? {junior}

It's an HTML-like extension of JavaScript syntax. The compiler turns every tag into a call to a function
that creates an element: `jsx()` from `react/jsx-runtime` in the new runtime, `React.createElement()` in the
old one. The result is a plain object describing the element type and its props. That's why only
expressions, not statements, can go inside `{}`.

### How is a component different from an element? {junior}

A component is a function (or class) that returns a description of UI. An element is the result of JSX, a
lightweight, immutable `{ type, props }` object saying what to render. React calls components to get
elements and updates the DOM based on them. An instance, in turn, is a "live" copy of a component in the
tree, to which React attaches state.

### Why must a component's name start with a capital letter? {junior}

That's how JSX tells components from HTML elements. `<button>` compiles to the type `'button'` (a string,
a DOM tag), and `<Button>` to a reference to the `Button` variable. A component named with a lowercase letter
would be treated as an unknown HTML tag.

### Can a component modify its props? How does a child pass data to its parent? {junior}

No. Props are read-only, and data flows one way: top-down. A child tells its parent about changes by calling
a **callback** passed in props (e.g. `onChange(value)`). The parent updates its state, and the new value comes
back down as a prop. This is the "lifting state up" pattern.

### What does `{items.length && <List items={items} />}` render for an empty array? {junior}

It renders `0`. The `&&` operator returns the first falsy value, the number `0`, and React renders numbers. It
renders nothing only for `false`, `null`, `undefined` and `true`. Correct: `items.length > 0 && ...` or a
ternary.

### What is the `children` prop for? {junior}

It contains everything placed between a component's opening and closing tags. It lets you build container
components (`Card`, `Modal`, `Layout`) that don't know exactly what they display. It's React's core
composition mechanism, instead of inheritance.

### What is a fragment, and when does it need a key? {mid}

A fragment (`<>...</>`) groups several elements without adding a DOM node, because a component must return
one root element, and an extra `div` could break layout or semantics (e.g. inside a table). The short syntax
can't take a key, so when rendering a list of fragments you use `<Fragment key={item.id}>`.

### How does React protect against XSS, and when does that protection not apply? {mid}

Text inserted with `{}` is escaped, so HTML markup shows as text. The protection doesn't apply to
`dangerouslySetInnerHTML` (the HTML must be sanitized, e.g. with DOMPurify), to URLs from user data in
`href`/`src` (e.g. `javascript:`), to direct DOM manipulation via refs, or to server rendering that injects
data into scripts without proper escaping.

### What does it mean for a component to be pure? {mid}

For the same props, state and context it returns the same JSX and has no side effects during render: it
doesn't modify outside variables or objects passed in props, doesn't send requests, doesn't change the DOM.
Side effects belong in event handlers and effects. Purity lets React safely render repeatedly (StrictMode),
interrupt rendering (concurrent features) and memoize (React Compiler).

### Does every component have to return something? {junior}

Yes, but it can be `null`, meaning "render nothing". A component can also return a string, a number, an array
of elements (with keys) or a fragment. Returning `undefined` has been allowed since React 18, but it usually
signals a forgotten `return`, so it's better to return `null` explicitly.
