# Events and forms {mid}

## Handling events

```tsx
<button onClick={handleClick}>Save</button>                // ✅ passing a function
<button onClick={() => remove(item.id)}>Delete</button>    // ✅ a function with an argument
<button onClick={handleClick()}>Save</button>              // 🔴 called during render
```

- Handlers are camelCase (`onClick`, `onChange`, `onSubmit`, `onKeyDown`). You pass a **function**, not the
  result of calling it.
- React passes a **SyntheticEvent**: a wrapper around the native event with the same API (`preventDefault`,
  `stopPropagation`, `target`, `currentTarget`) that behaves the same in all browsers. The original is in
  `e.nativeEvent`.
- `return false` does **not** prevent the default action. Call `e.preventDefault()` explicitly.
- Events bubble through the **React tree** (including through portals). The capture phase is `onClickCapture`.
  Unlike the native DOM, `onFocus` and `onBlur` bubble (React uses `focusin`/`focusout`).
- **Delegation**: React doesn't attach a listener to every element. Since React 17 it registers listeners on the
  **root container** (previously on `document`), which makes several React versions on one page coexist more
  easily.
- Since React 17 there's no more **event pooling**, so the event object can safely be read asynchronously.

## `onChange` in React

In the native DOM, `change` for a text field fires after it loses focus. In React, `onChange` behaves like
`input`: it fires **on every value change** (every keystroke).

## Controlled and uncontrolled components

**Controlled**: React state is the source of truth. The field gets `value` and `onChange`.

```tsx
const [email, setEmail] = useState('')
<input value={email} onChange={(e) => setEmail(e.target.value)} />
```

Pros: live validation and formatting, interdependent fields, easy reset. Cost: a render on every keystroke
(usually negligible).

**Uncontrolled**: the DOM is the source of truth. You set the initial value with `defaultValue` /
`defaultChecked` and read it via a ref or `FormData` on submit.

```tsx
function Signup() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    save({ email: data.get('email') })
  }
  return (
    <form onSubmit={handleSubmit}>
      <input name="email" defaultValue="" />
      <button>Save</button>
    </form>
  )
}
```

Pros: less code and fewer renders, which suits large forms well (React Hook Form is built on this).
`<input type="file">` is **always** uncontrolled, because its value can't be set programmatically.

Pitfalls:

- `value` without `onChange` makes the field **read-only**, and React warns in the console (if intentional, use
  `readOnly` or `defaultValue`).
- Changing `value` from `undefined`/`null` to a string switches the field from uncontrolled to controlled, and
  React warns: "A component is changing an uncontrolled input to be controlled". Initialize state with an empty
  string, not `undefined`.
- A checkbox is controlled via `checked`, not `value`. `<select>` and `<textarea>` use `value` like `<input>`.

## Forms in practice

- Validation is often described with a schema (e.g. Zod) combined with a form library (React Hook Form,
  TanStack Form).
- Client-side validation is a user convenience. **The server must always validate**.
- React 19 adds `<form action={fn}>`, `useActionState` and `useFormStatus`, which handle submission, pending state
  and errors without a manual `preventDefault` (a separate topic: Actions).
- Accessibility: every field needs a label (`<label htmlFor>` or `aria-label`), and errors should be linked to the
  field via `aria-describedby`.

## Sources

- [Responding to events (react.dev)](https://react.dev/learn/responding-to-events)
- [Common components: event object (react.dev)](https://react.dev/reference/react-dom/components/common#react-event-object)
- [&lt;input&gt;: controlled vs uncontrolled (react.dev)](https://react.dev/reference/react-dom/components/input)
- [React 17: changes to event delegation (React blog)](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html#changes-to-event-delegation)

## Questions

### What is a SyntheticEvent? {junior}

It's the object React passes to handlers instead of the native event. It has the same API (`preventDefault`,
`stopPropagation`, `target`, `currentTarget`), behaves consistently across browsers, and the native event is
available as `e.nativeEvent`. Since React 17 it's no longer shared (no event pooling), so it can be read
asynchronously.

### What's wrong with `<button onClick={handleClick()}>`? {junior}

The function is **called during render**, and `onClick` receives its result (often `undefined`). If `handleClick`
changes state, you get an infinite render loop ("Too many re-renders"). Pass the function
(`onClick={handleClick}`) or wrap a call with an argument in an arrow (`onClick={() => handleClick(id)}`).

### How do controlled and uncontrolled components differ? {junior}

In a controlled one the field's value comes from React state (`value` + `onChange`), so React is the source of
truth. In an uncontrolled one the DOM holds the value: you give `defaultValue` and read it via a ref or
`FormData`. Controlled fields make live validation and field dependencies easier, while uncontrolled ones mean
less code and fewer renders.

### When are uncontrolled fields the better choice? {mid}

When the value is needed only on submit (simple forms, `FormData`), for very large forms where rendering on every
keystroke is costly (that's how React Hook Form works), when integrating non-React libraries, and for
`<input type="file">`, which is always uncontrolled.

### Where does the warning "A component is changing an uncontrolled input to be controlled" come from? {mid}

The field first got `value={undefined}` (or `null`), so React treated it as uncontrolled, and later a string, making
it controlled. A field should be one or the other the whole time. Fix: initialize state with an empty string
(`useState('')`) or use `value={x ?? ''}`.

### How is React's `onChange` different from the native `change` event? {mid}

The native `change` for text fields fires only when the value is committed (usually on blur). In React, `onChange`
fires on every value change, like the native `input` event. That's why controlled fields update state on every
keystroke.

### How do you prevent a form's default action, and is `return false` enough? {junior}

Call `e.preventDefault()` in the `onSubmit` handler. `return false` from a React handler has no effect (unlike
old-style HTML attributes). In React 19, with `<form action={fn}>`, React itself prevents the page reload and passes
`FormData` to the action.

### How does React handle event delegation, and what changed in React 17? {mid}

React doesn't add a listener to every element. It registers one listener per event type on an ancestor element and
dispatches events to the handlers in the tree itself. Up to React 16 that was `document`, and since React 17 it's
the root container the app is mounted into. So several apps or React versions on one page don't interfere with
each other's `stopPropagation`.

### How do events propagate through portals? {senior}

According to the **React tree**, not the DOM tree. A click in an element rendered by `createPortal` into
`document.body` (e.g. a modal) bubbles to its React parent components, even though in the DOM it lives elsewhere.
Sometimes that's desirable (e.g. handling clicks in the modal in the component that opened it), and sometimes
surprising, e.g. when an outer handler closes a menu.

### Why isn't client-side validation enough? {junior}

Client code can be bypassed: disable JavaScript, send the request directly (curl, Postman), or tamper with it in the
dev tools. Browser validation is for user convenience (quick feedback), and only server-side validation guarantees
security and data consistency. A shared schema (e.g. Zod) makes it easier to keep both in sync.
