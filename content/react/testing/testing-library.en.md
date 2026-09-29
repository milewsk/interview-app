# Testing components: React Testing Library {mid}

Testing Library's guiding principle: **"The more your tests resemble the way your software is used, the more confidence they
can give you."** You test **behavior visible to the user** (what they see, click and type), not implementation details (state,
function names, component structure). Such tests survive refactoring.

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('adds a task to the list', async () => {
  const user = userEvent.setup()
  render(<TodoApp />)

  await user.type(screen.getByRole('textbox', { name: /new task/i }), 'Buy milk')
  await user.click(screen.getByRole('button', { name: /add/i }))

  expect(screen.getByRole('listitem')).toHaveTextContent('Buy milk')
})
```

## Queries and their priority

1. **Accessible to everyone**: `getByRole` (preferred, with the `name` option), `getByLabelText` (form fields),
   `getByPlaceholderText`, `getByText`, `getByDisplayValue`.
2. **Semantic**: `getByAltText`, `getByTitle`.
3. **Last resort**: `getByTestId`.

Since `getByRole` finds elements the way a screen reader does, a test that "can't find the button" often points to an
**accessibility problem** (a missing label, a `div` instead of a `button`).

| Variant | 0 matches | 1 match | >1 match | Async |
| --- | --- | --- | --- | --- |
| `getBy…` | throws | element | throws | no |
| `queryBy…` | `null` | element | throws | no |
| `findBy…` | throws (after timeout) | element | throws | yes, retries |
| `getAllBy…` / `queryAllBy…` / `findAllBy…` | throws / `[]` / throws | array | array | as above |

- `getBy` for elements that **must** exist.
- `queryBy` for asserting an element's **absence**: `expect(screen.queryByText('Error')).not.toBeInTheDocument()`.
- `findBy` (or `waitFor`) for elements that appear **asynchronously**.

## Interactions: `user-event` vs `fireEvent`

`fireEvent` dispatches **a single DOM event**. `user-event` simulates **a full interaction** the way a browser does: `type` performs
focus, keyboard events and an `input` for every character, and `click` fires pointerdown, mousedown, focus, pointerup and click. You
call `userEvent.setup()` before rendering, and the methods are **async** and must be awaited. `fireEvent` remains for cases
`user-event` doesn't cover.

## Asynchrony and `act`

- RTL wraps state changes after events in `act()` automatically. The "not wrapped in act(...)" warning usually means the test **didn't
  wait** for an asynchronous update (a missing `await findBy…`/`waitFor`), or the update happens after the test has finished.
- `waitFor(() => expect(...))` retries the assertion until it passes (or times out). It should contain an assertion, not side effects.

## Dependencies and mocks

- **APIs**: instead of mocking `fetch` in every test, use **MSW** (Mock Service Worker), which intercepts network requests. The component
  then runs its real fetching code.
- **Providers** (router, QueryClient, theme, i18n): a custom `renderWithProviders` function or the `render(ui, { wrapper })` option.
- Every test should start with fresh state (a new `QueryClient`, clean `localStorage`), otherwise tests affect each other.
- Assertions read better with `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toBeDisabled`, `toHaveTextContent`).

## Where RTL sits in the testing pyramid

- **Unit tests**: pure functions, reducers, hooks (`renderHook`).
- **Component integration tests** (RTL + Vitest/Jest, a jsdom/happy-dom environment): the most value in React apps. You test a screen or
  feature together with its children.
- **E2E** (Playwright, Cypress): key paths in a real browser with the backend.
- **Snapshots** detect changes but don't tell you whether the behavior is correct, and they're easy to update without thinking. Use them
  sparingly.

## Sources

- [Guiding principles (Testing Library)](https://testing-library.com/docs/guiding-principles)
- [About queries: priority (Testing Library)](https://testing-library.com/docs/queries/about)
- [user-event intro (Testing Library)](https://testing-library.com/docs/user-event/intro)
- [Common mistakes with React Testing Library (Kent C. Dodds)](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Mock Service Worker](https://mswjs.io/)

## Questions

### What is React Testing Library's philosophy? {junior}

Test the way a person uses the app: find elements by role, label and text, click and type via `user-event`, and check what's visible.
You don't check component state, internal function calls or the tree structure. Such tests give confidence that the feature works and
don't break on refactors that don't change behavior.

### What is the query priority order, and why does `getByRole` come first? {mid}

First the queries accessible to everyone (`getByRole`, `getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`), then
the semantic ones (`getByAltText`, `getByTitle`), and finally `getByTestId`. `getByRole` finds elements the way assistive technologies do
(role and accessible name), so the test verifies accessibility along the way. If a button can't be found by its role, a screen reader user
has a problem too.

### How do `getBy`, `queryBy` and `findBy` differ? {junior}

`getBy` returns the element or throws if it's missing or there are several, so it's for elements that must exist. `queryBy` returns `null`
when the element is missing, which lets you assert absence. `findBy` returns a promise and retries until a timeout, so it's for elements
that appear asynchronously. The `All` variants return arrays.

### How does `user-event` differ from `fireEvent`? {mid}

`fireEvent` dispatches one DOM event. `user-event` simulates a whole user interaction with a sequence of events, as in a browser (focus,
keyboard, `input`, pointer and click), plus extra checks, e.g. it won't click a disabled button. It's closer to reality, so it's
recommended. The methods are async, and you create an instance with `userEvent.setup()` before rendering.

### Where does the warning "An update to X inside a test was not wrapped in act(...)" come from? {mid}

The component updated its state at a moment the test didn't wait for, usually after an async operation finished (a fetch, a timer). The fix
is to wait for the result of that update in a user-visible way: `await screen.findBy…`, `await waitFor(...)`, or awaiting the `user-event`
action. Manually wrapping in `act` is rarely needed, because RTL does it inside its functions.

### How do you test a component that fetches data from an API? {mid}

Mock the network, not modules: MSW intercepts requests and returns defined responses, so the component and the fetching library run as in
production. The test renders the component (with providers, e.g. a new `QueryClient` with retries disabled), waits for the data via
`findBy…` and checks the result. Separate MSW handlers test the error and empty-list states.

### Why not test implementation details? {mid}

Tests that check internal state, private function calls or component structure break on every refactor (false alarms) even though the
behavior didn't change, and they let user-visible bugs through (false confidence). Behavior tests have the opposite properties: they're
resilient to code changes and catch real regressions.

### How do you test a component that needs providers (router, context, QueryClient)? {mid}

Pass them via the `wrapper` option of `render`/`renderHook`, or write your own `renderWithProviders` function that creates fresh instances
(e.g. `createMemoryRouter` with `initialEntries`, a new `QueryClient`) for every test. That keeps tests isolated, with no state carried
between them.

### How do you check that an element disappeared or doesn't exist? {junior}

Absence is checked with `queryBy…`: `expect(screen.queryByText('Loading')).not.toBeInTheDocument()`, because `getBy…` would throw. To wait
for removal after an async operation, use `await waitForElementToBeRemoved(() => screen.queryByText('Loading'))` or `waitFor` with an
assertion.

### What are the downsides of snapshot tests? {mid}

They detect every change in the rendered output but don't tell you whether the change is correct. With large snapshots, reviewers approve
updates without reading them, and the test stops protecting anything. They're also brittle with CSS class or structure changes. Explicit
behavior assertions work better, with snapshots in small doses, e.g. for generated data.
