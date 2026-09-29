# Testowanie komponentów: React Testing Library {mid}

Zasada przewodnia Testing Library: **„Im bardziej testy przypominają sposób, w jaki używa się
oprogramowania, tym większą dają pewność”**. Testuje się **zachowanie widoczne dla użytkownika**
(co widzi, w co klika, co wpisuje), a nie szczegóły implementacji (stan, nazwy funkcji, strukturę
komponentów). Takie testy przeżywają refaktoryzację.

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('dodaje zadanie do listy', async () => {
  const user = userEvent.setup()
  render(<TodoApp />)

  await user.type(screen.getByRole('textbox', { name: /nowe zadanie/i }), 'Kupić mleko')
  await user.click(screen.getByRole('button', { name: /dodaj/i }))

  expect(screen.getByRole('listitem')).toHaveTextContent('Kupić mleko')
})
```

## Zapytania i ich priorytet

1. **Dostępne dla wszystkich**: `getByRole` (preferowane, z opcją `name`), `getByLabelText` (pola
   formularzy), `getByPlaceholderText`, `getByText`, `getByDisplayValue`.
2. **Semantyczne**: `getByAltText`, `getByTitle`.
3. **Ostateczność**: `getByTestId`.

Skoro `getByRole` znajduje elementy tak jak czytnik ekranu, test, który „nie może znaleźć przycisku”, często
wskazuje na **problem z dostępnością** (brak etykiety, `div` zamiast `button`).

| Wariant | 0 wyników | 1 wynik | >1 wynik | Asynchroniczny |
| --- | --- | --- | --- | --- |
| `getBy…` | wyjątek | element | wyjątek | nie |
| `queryBy…` | `null` | element | wyjątek | nie |
| `findBy…` | wyjątek (po timeoucie) | element | wyjątek | tak, ponawia |
| `getAllBy…` / `queryAllBy…` / `findAllBy…` | wyjątek / `[]` / wyjątek | tablica | tablica | jak wyżej |

- `getBy` do elementów, które **muszą** istnieć.
- `queryBy` do sprawdzania **braku** elementu: `expect(screen.queryByText('Błąd')).not.toBeInTheDocument()`.
- `findBy` (lub `waitFor`) do elementów, które pojawią się **asynchronicznie**.

## Interakcje: `user-event` a `fireEvent`

`fireEvent` wysyła **pojedyncze zdarzenie DOM**. `user-event` symuluje **pełną interakcję**, tak jak
przeglądarka: `type` wykonuje fokus, zdarzenia klawiatury i `input` dla każdego znaku, a `click` wywołuje
pointerdown, mousedown, focus, pointerup i click. Wywołuje się `userEvent.setup()` przed renderem, a metody
są **asynchroniczne** i trzeba je awaitować. `fireEvent` zostaje do przypadków, których `user-event` nie obsługuje.

## Asynchroniczność i `act`

- Zmiany stanu po zdarzeniach RTL opakowuje w `act()` automatycznie. Ostrzeżenie „not wrapped in act(...)”
  zwykle oznacza, że test **nie poczekał** na asynchroniczną aktualizację (brakuje `await findBy…`/`waitFor`)
  albo aktualizacja zachodzi już po zakończeniu testu.
- `waitFor(() => expect(...))` ponawia asercję do skutku (lub timeoutu). Wewnątrz powinna być asercja, a nie
  efekty uboczne.

## Zależności i mocki

- **API**: zamiast mockować `fetch` w każdym teście, lepiej użyć **MSW** (Mock Service Worker), który przechwytuje
  żądania sieciowe. Komponent korzysta wtedy z prawdziwego kodu pobierania.
- **Providery** (router, QueryClient, motyw, i18n): własna funkcja `renderWithProviders` albo opcja
  `render(ui, { wrapper })`.
- Każdy test powinien mieć świeży stan (nowy `QueryClient`, czysty `localStorage`), bo inaczej testy wpływają
  na siebie.
- Asercje czytelniej pisze się z matcherami `@testing-library/jest-dom` (`toBeInTheDocument`, `toBeDisabled`,
  `toHaveTextContent`).

## Gdzie RTL w piramidzie testów

- **Testy jednostkowe**: czyste funkcje, reducery, hooki (`renderHook`).
- **Testy integracyjne komponentów** (RTL + Vitest/Jest, środowisko jsdom/happy-dom): największa wartość w
  aplikacjach React. Testuje się ekran lub funkcję razem z dziećmi.
- **E2E** (Playwright, Cypress): kluczowe ścieżki w prawdziwej przeglądarce z backendem.
- **Snapshoty** wykrywają zmiany, ale nie mówią, czy zachowanie jest poprawne, i łatwo je bezrefleksyjnie
  aktualizować. Stosuje się je oszczędnie.

## Źródła

- [Guiding principles (Testing Library)](https://testing-library.com/docs/guiding-principles)
- [About queries: priority (Testing Library)](https://testing-library.com/docs/queries/about)
- [user-event intro (Testing Library)](https://testing-library.com/docs/user-event/intro)
- [Common mistakes with React Testing Library (Kent C. Dodds)](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Mock Service Worker](https://mswjs.io/)

## Pytania

### Jaka jest filozofia React Testing Library? {junior}

Testować tak, jak aplikacji używa człowiek: szukać elementów po roli, etykiecie i tekście, klikać i wpisywać przez
`user-event`, sprawdzać, co jest widoczne. Nie sprawdza się stanu komponentu, wywołań wewnętrznych funkcji ani struktury
drzewa. Takie testy dają pewność, że funkcja działa, i nie psują się przy refaktoryzacji, która nie zmienia zachowania.

### Jaka jest kolejność priorytetów zapytań i dlaczego `getByRole` jest pierwsze? {mid}

Najpierw zapytania dostępne dla wszystkich (`getByRole`, `getByLabelText`, `getByPlaceholderText`, `getByText`,
`getByDisplayValue`), potem semantyczne (`getByAltText`, `getByTitle`), a na końcu `getByTestId`. `getByRole` znajduje
elementy tak, jak technologie asystujące (rola i dostępna nazwa), więc test przy okazji weryfikuje dostępność. Jeśli nie
da się znaleźć przycisku po roli, użytkownik czytnika ekranu też ma problem.

### Czym różnią się `getBy`, `queryBy` i `findBy`? {junior}

`getBy` zwraca element albo rzuca wyjątek, gdy go nie ma lub jest ich kilka, więc służy do elementów, które muszą
istnieć. `queryBy` zwraca `null`, gdy elementu nie ma, co pozwala sprawdzać brak elementu. `findBy` zwraca promise
i ponawia wyszukiwanie do timeoutu, więc służy do elementów pojawiających się asynchronicznie. Warianty `All` zwracają
tablice.

### Czym różni się `user-event` od `fireEvent`? {mid}

`fireEvent` wysyła jedno zdarzenie DOM. `user-event` symuluje całą interakcję użytkownika z sekwencją zdarzeń, jak
w przeglądarce (fokus, klawiatura, `input`, pointer i kliknięcie) oraz dodatkowymi sprawdzeniami, np. nie kliknie
zablokowanego przycisku. Jest bliższe rzeczywistości, więc zalecane. Metody są asynchroniczne, a instancję tworzy się
przez `userEvent.setup()` przed renderem.

### Skąd ostrzeżenie „An update to X inside a test was not wrapped in act(...)”? {mid}

Komponent zaktualizował stan w momencie, na który test nie czekał, zwykle po zakończeniu asynchronicznej operacji
(fetch, timer). Rozwiązaniem jest poczekanie na efekt tej aktualizacji w sposób widoczny dla użytkownika:
`await screen.findBy…`, `await waitFor(...)` albo awaitowanie akcji `user-event`. Ręczne opakowywanie w `act` rzadko
jest potrzebne, bo RTL robi to w swoich funkcjach.

### Jak testować komponent pobierający dane z API? {mid}

Mockować sieć, a nie moduły: MSW przechwytuje żądania i zwraca zdefiniowane odpowiedzi, więc komponent i biblioteka
do pobierania działają jak w produkcji. Test renderuje komponent (z providerami, np. nowym `QueryClient` z wyłączonymi
ponowieniami), czeka na dane przez `findBy…` i sprawdza wynik. Osobne handlery MSW testują stany błędu i pustej listy.

### Dlaczego nie testować szczegółów implementacji? {mid}

Testy sprawdzające stan wewnętrzny, wywołania prywatnych funkcji czy strukturę komponentów psują się przy każdej
refaktoryzacji (fałszywe alarmy), choć zachowanie się nie zmieniło, a przepuszczają błędy widoczne dla użytkownika
(fałszywa pewność). Testy zachowania mają odwrotne właściwości: są odporne na zmiany kodu i wykrywają realne regresje.

### Jak testować komponent, który potrzebuje providerów (router, kontekst, QueryClient)? {mid}

Przekazać je w opcji `wrapper` do `render`/`renderHook` albo napisać własną funkcję `renderWithProviders`, która tworzy
świeże instancje (np. `createMemoryRouter` z `initialEntries`, nowy `QueryClient`) dla każdego testu. Dzięki temu testy
są izolowane i nie przenoszą stanu między sobą.

### Jak sprawdzić, że element zniknął lub nie istnieje? {junior}

Brak elementu sprawdza się przez `queryBy…`: `expect(screen.queryByText('Ładowanie')).not.toBeInTheDocument()`, bo
`getBy…` rzuciłby wyjątek. Na zniknięcie po operacji asynchronicznej czeka się przez
`await waitForElementToBeRemoved(() => screen.queryByText('Ładowanie'))` albo `waitFor` z asercją.

### Jakie są wady testów snapshotowych? {mid}

Wykrywają każdą zmianę w wyrenderowanym wyniku, ale nie mówią, czy zmiana jest poprawna. Przy dużych snapshotach
recenzenci zatwierdzają aktualizacje bez czytania, a test przestaje cokolwiek chronić. Są też kruche przy zmianach
klas CSS czy struktury. Lepiej sprawdzają się jawne asercje zachowania, a snapshoty w małej skali, np. dla wygenerowanych
danych.
