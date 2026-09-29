# Actions and forms in React 19 {mid}

An **Action** is a function (usually async) run in a **transition**. React 19 built a set of tools around it that replace
manually managing `isLoading` flags, errors, request ordering and form resets.

## `<form action={fn}>`

```tsx
function Newsletter() {
  async function subscribe(formData: FormData) {
    await api.subscribe(String(formData.get('email')))
  }
  return (
    <form action={subscribe}>
      <input name="email" type="email" required />
      <SubmitButton />
    </form>
  )
}
```

- React calls the function with `FormData` itself, without `e.preventDefault()`.
- The function runs as an Action (in a transition), so state updates don't block the UI, and errors go to an Error Boundary.
- After a **successful** action, React **resets the form's uncontrolled fields** (`defaultValue`).
- `<button formAction={...}>` and `<input type="submit" formAction>` accept actions too.

## `useActionState`

```tsx
const [state, formAction, isPending] = useActionState(
  async (prevState: State, formData: FormData): Promise<State> => {
    const result = await api.updateName(String(formData.get('name')))
    return result.ok ? { error: null } : { error: result.message }
  },
  { error: null },               // initial state
)

<form action={formAction}>
  <input name="name" />
  <button disabled={isPending}>Save</button>
  {state.error && <p role="alert">{state.error}</p>}
</form>
```

- The function receives the **previous state** and the **payload** (for a form: `FormData`) and returns the new state. It works
  like a reducer that can be async.
- Successive calls are **queued and run one after another**, each receiving the previous result, which eliminates races.
- `isPending` is `true` while any action is running. `dispatchAction` has a stable identity.
- A `dispatchAction` called manually (outside `action`) must be wrapped in `startTransition`.
- The third argument, `permalink`, is for progressive enhancement with Server Functions: a form submitted before JS loads
  navigates to the given URL.

## `useFormStatus`

```tsx
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending, data } = useFormStatus()   // status of the PARENT form
  return <button disabled={pending}>{pending ? 'Sending…' : 'Send'}</button>
}
```

The hook reads the state of the **nearest parent form**, so it must be called in a component rendered **inside** the `<form>`, not in
the component that renders the form. That way a reusable button needs no props.

## `useOptimistic`

```tsx
const [optimisticLikes, addOptimistic] = useOptimistic(likes, (current, delta: number) => current + delta)

async function like() {
  addOptimistic(1)             // immediately in the UI
  await api.like(postId)       // the real write
  setLikes((l) => l + 1)       // the target state
}
<form action={like}><button>♥ {optimisticLikes}</button></form>
```

- The optimistic value is visible **only during the action**. When it finishes, React shows the real state in the same render, with no
  manual rollback. If the action fails, the UI automatically returns to the previous value.
- The setter must be called inside an Action or `startTransition`, otherwise React warns.

## `use` with a promise

`use(promise)` reads a promise's result during render, suspending the component (Suspense), and a rejection goes to an Error Boundary.
The promise must be stable (a cache, a Server Component). It's for data, not for submitting forms.

## Sources

- [React 19: Actions (react.dev)](https://react.dev/blog/2024/12/05/react-19#actions)
- [useActionState (react.dev)](https://react.dev/reference/react/useActionState)
- [useFormStatus (react.dev)](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [useOptimistic (react.dev)](https://react.dev/reference/react/useOptimistic)
- [&lt;form&gt; (react.dev)](https://react.dev/reference/react-dom/components/form)

## Questions

### What is an Action in React 19? {mid}

A function (usually async) run in a transition, e.g. passed to `<form action>`, `startTransition` or `useActionState`. React tracks
its state: it exposes `isPending`, routes errors to an Error Boundary, supports optimistic updates and resets the form on success.
You don't have to manage loading flags, errors and request ordering by hand.

### What does `<form action={fn}>` do differently from `onSubmit`? {mid}

React itself prevents the page reload, calls the function with `FormData` and runs it as an Action (in a transition, with
`useFormStatus` and Error Boundary support). After a successful action it automatically resets uncontrolled fields. Combined with a
Server Function, the form works even before JavaScript loads (progressive enhancement). `onSubmit` requires a manual
`preventDefault`, collecting the data and managing state.

### How does `useActionState` work? {mid}

`const [state, dispatchAction, isPending] = useActionState(fn, initialState)`. The function `fn(prevState, payload)` returns (possibly
asynchronously) the new state, like a reducer. You pass `dispatchAction` to `<form action>` or call it in `startTransition`. Calls are
queued and run in order, each with the previous result, so there are no races. `isPending` reports an ongoing action, which is enough
to handle a form's errors and feedback messages.

### Why must `useFormStatus` be called in a component inside the form? {mid}

The hook reads the status of the **nearest parent** `<form>`, much like context. In the component that renders the `<form>` itself,
there's no form above it, so `pending` is always `false`. So you extract e.g. a `SubmitButton` and render it inside the form, and the
button knows the submission status without props.

### What is `useOptimistic`, and how does it roll back changes? {senior}

The hook shows a temporary, optimistic value while an Action is running: `const [optimistic, setOptimistic] = useOptimistic(value,
reducer)`. When the action finishes, React renders the real `value` in the same render, so there's no separate cleanup step. If the
action failed and the source state didn't change, the UI returns to the previous value. The setter must be called in an Action or
`startTransition`.

### How do you handle server validation errors in a form with Actions? {mid}

Return them as part of the state from the function passed to `useActionState` (e.g. `{ errors: { email: 'Taken' } }`) and display them
next to the fields. Unexpected exceptions go to an Error Boundary. It's also worth returning the submitted values so the fields can be
restored after an error, because an uncontrolled form is reset only on success.

### How does `useActionState` solve races on repeated submissions? {senior}

Successive `dispatchAction` calls don't run in parallel; they're queued: each waits for the previous one to finish and receives its
result as `prevState`. The final state therefore follows the order of the user's actions, not the order of network responses. With a
plain `startTransition` and an async function, you have to handle response ordering yourself.

### Do Actions require Server Components or a framework? {junior}

No. `<form action>`, `useActionState`, `useFormStatus` and `useOptimistic` work in an ordinary client-side app, with async functions
calling an API. A framework with Server Functions (`'use server'`) adds the ability to call server code directly and progressive
enhancement, where the form works without JS.

### What happens to form fields after a successful action? {mid}

React automatically resets **uncontrolled** fields to their `defaultValue`, like a native form reset, so after adding a comment the field
is empty with no extra code. Controlled fields (`value` + state) aren't reset, because the value belongs to state. You can trigger it
manually with `requestFormReset` from `react-dom`.

### How do you disable the submit button while the action runs? {junior}

Use `isPending` from `useActionState` (`<button disabled={isPending}>`) or `pending` from `useFormStatus` in a button component rendered
inside the form. Both are `true` for the whole duration of the async action, which prevents double submission and gives feedback.
