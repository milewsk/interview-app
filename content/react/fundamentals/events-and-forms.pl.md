# Zdarzenia i formularze {mid}

## Obsługa zdarzeń

```tsx
<button onClick={handleClick}>Zapisz</button>              // ✅ przekazanie funkcji
<button onClick={() => remove(item.id)}>Usuń</button>      // ✅ funkcja z argumentem
<button onClick={handleClick()}>Zapisz</button>            // 🔴 wywołanie w trakcie renderu
```

- Handlery w camelCase (`onClick`, `onChange`, `onSubmit`, `onKeyDown`). Przekazuje się **funkcję**,
  a nie wynik jej wywołania.
- React przekazuje **SyntheticEvent**: opakowanie zdarzenia natywnego z tym samym API
  (`preventDefault`, `stopPropagation`, `target`, `currentTarget`) działające tak samo we wszystkich
  przeglądarkach. Oryginał jest w `e.nativeEvent`.
- `return false` **nie** blokuje akcji domyślnej. Trzeba jawnie wywołać `e.preventDefault()`.
- Zdarzenia bąbelkują przez **drzewo Reacta** (także przez portale). Faza przechwytywania to
  `onClickCapture`. Inaczej niż w natywnym DOM, `onFocus` i `onBlur` bąbelkują (React używa
  `focusin`/`focusout`).
- **Delegacja**: React nie podpina listenera do każdego elementu. Od React 17 rejestruje listenery na
  **kontenerze root** (wcześniej na `document`), co ułatwia współistnienie kilku wersji Reacta na stronie.
- Od React 17 nie ma już **event pooling**, więc obiekt zdarzenia można bezpiecznie czytać
  asynchronicznie.

## `onChange` w React

W natywnym DOM `change` dla pola tekstowego zachodzi po utracie fokusu. W React `onChange` działa jak
`input`: odpala się **przy każdej zmianie wartości** (każdym znaku).

## Komponenty kontrolowane i niekontrolowane

**Kontrolowane**: źródłem prawdy jest stan Reacta. Pole dostaje `value` i `onChange`.

```tsx
const [email, setEmail] = useState('')
<input value={email} onChange={(e) => setEmail(e.target.value)} />
```

Zalety: walidacja i formatowanie na bieżąco, pola zależne od siebie, łatwe resetowanie. Koszt: render
przy każdym znaku (zwykle pomijalny).

**Niekontrolowane**: źródłem prawdy jest DOM. Wartość początkową podaje się przez `defaultValue` /
`defaultChecked`, a odczytuje przez ref albo `FormData` przy wysyłce.

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
      <button>Zapisz</button>
    </form>
  )
}
```

Zalety: mniej kodu i renderów, co dobrze sprawdza się w dużych formularzach (na tym opiera się React Hook
Form). `<input type="file">` jest **zawsze** niekontrolowany, bo jego wartości nie da się ustawić
programowo.

Pułapki:

- `value` bez `onChange` daje pole **tylko do odczytu**, a React ostrzega w konsoli (jeśli to celowe,
  użyj `readOnly` albo `defaultValue`).
- Zmiana `value` z `undefined`/`null` na string przełącza pole z niekontrolowanego na kontrolowane,
  a React ostrzega: „A component is changing an uncontrolled input to be controlled”. Stan
  inicjalizuje się pustym stringiem, a nie `undefined`.
- Checkbox kontroluje się przez `checked`, a nie `value`. `<select>` i `<textarea>` używają `value`
  jak `<input>`.

## Formularze w praktyce

- Walidację często opisuje się schematem (np. Zod) i łączy z biblioteką formularzy (React Hook Form,
  TanStack Form).
- Walidacja po stronie klienta to wygoda użytkownika. **Serwer musi walidować zawsze**.
- React 19 dodaje `<form action={fn}>`, `useActionState` i `useFormStatus`, które obsługują wysyłkę,
  stan oczekiwania i błędy bez ręcznego `preventDefault` (osobne zagadnienie: Actions).
- Dostępność: każde pole potrzebuje etykiety (`<label htmlFor>` lub `aria-label`), a błędy powinny być
  powiązane z polem przez `aria-describedby`.

## Źródła

- [Responding to events (react.dev)](https://react.dev/learn/responding-to-events)
- [Common components: event object (react.dev)](https://react.dev/reference/react-dom/components/common#react-event-object)
- [&lt;input&gt;: controlled vs uncontrolled (react.dev)](https://react.dev/reference/react-dom/components/input)
- [React 17: changes to event delegation (React blog)](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html#changes-to-event-delegation)

## Pytania

### Czym jest SyntheticEvent? {junior}

To obiekt, który React przekazuje do handlerów zamiast natywnego zdarzenia. Ma to samo API
(`preventDefault`, `stopPropagation`, `target`, `currentTarget`), działa spójnie w różnych przeglądarkach,
a natywne zdarzenie jest dostępne w `e.nativeEvent`. Od React 17 nie jest już współdzielony (brak event
pooling), więc można go czytać asynchronicznie.

### Co jest nie tak z `<button onClick={handleClick()}>`? {junior}

Funkcja zostanie **wywołana w trakcie renderu**, a do `onClick` trafi jej wynik (często `undefined`). Jeśli
`handleClick` zmienia stan, powstaje nieskończona pętla renderów („Too many re-renders”). Należy przekazać
funkcję (`onClick={handleClick}`) albo opakować wywołanie z argumentem w strzałkę
(`onClick={() => handleClick(id)}`).

### Czym różnią się komponenty kontrolowane od niekontrolowanych? {junior}

W kontrolowanym wartość pola pochodzi ze stanu Reacta (`value` + `onChange`), więc React jest źródłem
prawdy. W niekontrolowanym wartość trzyma DOM: podaje się `defaultValue`, a odczytuje przez ref lub
`FormData`. Kontrolowane ułatwiają walidację na bieżąco i zależności między polami, a niekontrolowane
oznaczają mniej kodu i renderów.

### Kiedy lepiej wybrać pola niekontrolowane? {mid}

Gdy wartość jest potrzebna dopiero przy wysyłce (proste formularze, `FormData`), przy bardzo dużych
formularzach, gdzie render przy każdym znaku jest kosztowny (tak działa React Hook Form), przy integracji
z bibliotekami spoza Reacta oraz dla `<input type="file">`, który zawsze jest niekontrolowany.

### Skąd ostrzeżenie „A component is changing an uncontrolled input to be controlled”? {mid}

Pole najpierw dostało `value={undefined}` (lub `null`), więc React uznał je za niekontrolowane, a potem
string i stało się kontrolowane. Pole powinno przez cały czas być jednym albo drugim. Rozwiązanie:
inicjalizować stan pustym stringiem (`useState('')`) albo użyć `value={x ?? ''}`.

### Czym różni się `onChange` w React od natywnego zdarzenia `change`? {mid}

Natywne `change` dla pól tekstowych zachodzi dopiero po zatwierdzeniu wartości (zwykle utracie fokusu).
W React `onChange` odpala się przy każdej zmianie wartości, jak natywne `input`. Dlatego kontrolowane pola
aktualizują stan przy każdym znaku.

### Jak zablokować domyślną akcję formularza i czy `return false` wystarczy? {junior}

Trzeba wywołać `e.preventDefault()` w handlerze `onSubmit`. `return false` z handlera Reacta nie ma żadnego
efektu (w przeciwieństwie do atrybutów HTML w starym stylu). W React 19 przy `<form action={fn}>` React sam
zapobiega przeładowaniu strony i przekazuje `FormData` do akcji.

### Jak React obsługuje delegację zdarzeń i co zmieniło się w React 17? {mid}

React nie dodaje listenera do każdego elementu, tylko rejestruje po jednym listenerze na typ zdarzenia na
elemencie nadrzędnym i sam rozsyła zdarzenia do handlerów w drzewie. Do React 16 był to `document`, a od
React 17 kontener root, do którego montowana jest aplikacja. Dzięki temu kilka aplikacji lub wersji Reacta
na jednej stronie nie zakłóca sobie `stopPropagation`.

### Jak zdarzenia propagują się przez portale? {senior}

Zgodnie z **drzewem Reacta**, a nie drzewem DOM. Kliknięcie w elemencie renderowanym przez `createPortal`
do `document.body` (np. modal) bąbelkuje do komponentów-rodziców w React, nawet jeśli w DOM leży w innym
miejscu. Czasem to pożądane (np. obsługa kliknięć w modalu w komponencie, który go otworzył), a czasem
zaskakujące, np. gdy zewnętrzny handler zamyka menu.

### Dlaczego walidacja po stronie klienta nie wystarcza? {junior}

Kod klienta można obejść: wyłączyć JavaScript, wysłać żądanie bezpośrednio (curl, Postman) albo
zmodyfikować je w narzędziach deweloperskich. Walidacja w przeglądarce służy wygodzie użytkownika (szybka
informacja zwrotna), a bezpieczeństwo i spójność danych zapewnia wyłącznie walidacja na serwerze.
Współdzielony schemat (np. Zod) ułatwia utrzymanie obu w zgodzie.
