# Renderowanie, rekoncyliacja i klucze {mid}

„Render” w React to **wywołanie funkcji komponentu** w celu uzyskania nowego opisu UI, a nie
malowanie ekranu. Aktualizacja przebiega w trzech krokach:

1. **Wyzwolenie (trigger)**: pierwsze montowanie (`createRoot(...).render(<App />)`) albo zmiana stanu
   komponentu lub któregoś z przodków (także zmiana kontekstu, z którego komponent korzysta).
2. **Faza render**: React wywołuje funkcje komponentów i porównuje nowe drzewo elementów z poprzednim
   (**rekoncyliacja**). Ta faza musi być czysta, a React może ją przerwać, powtórzyć lub porzucić.
3. **Faza commit**: React nanosi na DOM **minimalny** zestaw zmian, podpina refy i uruchamia efekty
   layoutu. Następnie przeglądarka maluje ekran, a potem uruchamiane są `useEffect`.

Jeśli wynik renderu jest taki sam jak poprzednio, DOM nie jest dotykany. Sam render nie oznacza
kosztownej operacji na DOM.

## Wirtualny DOM i heurystyki rekoncyliacji

Drzewo elementów bywa nazywane „wirtualnym DOM”. Pełne porównanie dwóch drzew jest kosztowne
(O(n³)), więc React stosuje dwie heurystyki i działa w O(n):

- **Inny typ elementu na tej samej pozycji** (np. `<div>` zamiast `<section>`, `Counter` zamiast
  `Timer`) oznacza, że całe poddrzewo jest usuwane i montowane od nowa, **razem ze stanem**.
- **Ten sam typ** oznacza aktualizację propsów istniejącej instancji. Stan zostaje zachowany.
- **Listy** porównuje się po **kluczach** (`key`), które mówią, który element jest który między renderami.

Wewnętrzna struktura, na której React to realizuje, to **Fiber**. Pozwala dzielić pracę na kawałki,
nadawać priorytety i przerywać render (renderowanie współbieżne, np. przy `startTransition`).

## Stan jest przypisany do pozycji w drzewie

```tsx
{isFancy ? <Counter fancy /> : <Counter />}   // ten sam typ i pozycja: stan zachowany
{isPlayerA ? <Counter key="A" /> : <Counter key="B" />} // różne klucze: osobne stany
```

Pułapka: **definiowanie komponentu wewnątrz innego komponentu**. Przy każdym renderze rodzica powstaje
nowa funkcja, czyli **nowy typ**, więc React odmontowuje wewnętrzny komponent i traci jego stan (oraz
focus w polach formularza).

```tsx
function Parent() {
  function Inner() { /* 🔴 nowy typ przy każdym renderze Parent */ }
  return <Inner />
}
```

## Klucze w listach

```tsx
{todos.map((todo) => <TodoItem key={todo.id} todo={todo} />)}
```

- Klucz musi być **stabilny** i **unikalny wśród rodzeństwa**. Najlepszy jest identyfikator z danych.
- **Indeks jako klucz** działa, gdy lista się nie zmienia. Przy wstawianiu, usuwaniu czy sortowaniu stan
  (np. tekst w `<input>`, zaznaczenie) zostaje przy **pozycji**, a nie przy elemencie, więc „przeskakuje”
  między wierszami.
- **Losowy klucz** (`Math.random()`, `crypto.randomUUID()` w renderze) zmienia się przy każdym renderze,
  więc każdy element jest za każdym razem odmontowywany i montowany od nowa. To katastrofa dla
  wydajności i stanu.
- Klucz nie jest przekazywany jako prop. Jeśli komponent potrzebuje identyfikatora, podaje się go osobno.
- Zmiana `key` to celowy sposób na **zresetowanie stanu** komponentu (`<Profile key={userId} />`).

## Kiedy komponent się renderuje

- Gdy zmieni się jego stan albo kontekst, z którego korzysta.
- Gdy **renderuje się rodzic**. Domyślnie dzieci renderują się ponownie niezależnie od tego, czy ich
  propsy się zmieniły. Pominąć to można przez `memo` albo przez strukturę (stan niżej, `children`).
- Ustawienie stanu na tę samą wartość (`Object.is`) pozwala Reactowi pominąć render.
- Aktualizacje stanu są **grupowane** (batching): kilka `setState` w jednym zdarzeniu daje jeden render.

## StrictMode

W developmencie `<StrictMode>` dwukrotnie wywołuje funkcje komponentów, inicjalizatory stanu i reducery,
a efekty montuje, odmontowuje i montuje ponownie. Celem jest wykrycie nieczystego renderu i brakującego
cleanupu. W produkcji nie ma to miejsca.

## Źródła

- [Render and commit (react.dev)](https://react.dev/learn/render-and-commit)
- [Preserving and resetting state (react.dev)](https://react.dev/learn/preserving-and-resetting-state)
- [Rendering lists: keys (react.dev)](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)
- [StrictMode (react.dev)](https://react.dev/reference/react/StrictMode)
- [Reconciliation (legacy React docs)](https://legacy.reactjs.org/docs/reconciliation.html)

## Pytania

### Co powoduje ponowne renderowanie komponentu? {junior}

Zmiana jego stanu (`setState`, `dispatch`), zmiana wartości kontekstu, z którego korzysta, oraz render
rodzica, bo domyślnie dzieci renderują się razem z nim, nawet jeśli propsy się nie zmieniły. Zmiana
zwykłej zmiennej czy refa **nie** wywołuje renderu.

### Czym różni się faza render od fazy commit? {mid}

W fazie render React wywołuje komponenty i wylicza różnice między starym a nowym drzewem. Ta faza jest
czysta, może zostać przerwana lub powtórzona i nie dotyka DOM. W fazie commit React synchronicznie nanosi
zmiany na DOM, aktualizuje refy i uruchamia `useLayoutEffect`. `useEffect` wykonują się po commicie,
zwykle po namalowaniu ekranu.

### Czym jest rekoncyliacja i jakie heurystyki stosuje React? {mid}

To porównanie nowego drzewa elementów z poprzednim w celu wyznaczenia minimalnych zmian w DOM. Zamiast
kosztownego ogólnego algorytmu React zakłada, że elementy różnych typów dają różne poddrzewa (inny typ
oznacza odmontowanie i zamontowanie od nowa, ze stanem), a elementy listy identyfikuje po `key`. Dzięki
temu porównanie działa w czasie liniowym.

### Dlaczego nie używać indeksu tablicy jako klucza? {mid}

Klucz ma identyfikować element między renderami. Indeks identyfikuje tylko **pozycję**, więc po
wstawieniu, usunięciu lub posortowaniu elementów React przypisze stan komponentu (np. tekst w polu,
zaznaczenie, focus) do niewłaściwego elementu, bo stan zostaje przy pozycji. Indeks jest akceptowalny
tylko dla statycznych list, które nigdy się nie zmieniają ani nie mają stanu.

### Co się stanie, gdy jako klucz podasz `Math.random()`? {mid}

Klucz będzie inny przy każdym renderze, więc React uzna każdy element za nowy: odmontuje stary
i zamontuje nowy. Tracony jest stan i focus, efekty uruchamiają się od nowa, a DOM jest przebudowywany
przy każdym renderze. Klucze muszą być stabilne, najlepiej pochodzić z danych (`id`).

### Dlaczego nie definiuje się komponentu wewnątrz innego komponentu? {mid}

Przy każdym renderze rodzica powstaje nowa funkcja, a React porównuje typy przez referencję, więc widzi
nowy typ komponentu. Wewnętrzny komponent jest przez to odmontowywany i montowany od nowa przy każdym
renderze rodzica: traci stan, focus i uruchamia efekty ponownie. Komponenty definiuje się na
najwyższym poziomie modułu i przekazuje im dane przez propsy.

### Czy dziecko renderuje się ponownie, gdy renderuje się rodzic, a propsy dziecka się nie zmieniły? {junior}

Tak, domyślnie tak. React renderuje całe poddrzewo komponentu, którego stan się zmienił. Zwykle nie jest
to problem, bo render jest tani, a DOM zmienia się tylko przy faktycznych różnicach. Gdy jest, można
użyć `memo` (z stabilnymi propsami), przenieść stan niżej albo przekazać poddrzewo jako `children`.

### Jak zresetować stan komponentu? {mid}

Zmieniając jego `key`: `<ProfileForm key={userId} />`. Inny klucz oznacza dla Reacta inny komponent, więc
stary jest odmontowywany, a nowy montowany ze świeżym stanem. Ten sam efekt daje zmiana typu elementu
lub pozycji w drzewie. To lepsze niż efekt, który ręcznie zeruje stan po zmianie propsa.

### Dlaczego w trybie deweloperskim komponent renderuje się dwa razy? {junior}

To działanie `StrictMode`. W developmencie React celowo wywołuje funkcje komponentów, inicjalizatory
i reducery dwukrotnie oraz montuje efekty dwa razy, żeby ujawnić nieczyste rendery i brakujące cleanupy.
Wynik drugiego wywołania jest używany, a pierwszy odrzucany. W produkcji podwójnego wywołania nie ma.

### Czym jest React Fiber i co umożliwia? {senior}

To wewnętrzna architektura rekoncyliacji (od React 16), w której każdy komponent w drzewie ma węzeł
„fiber” z informacją o typie, propsach, stanie i powiązaniach. Praca renderu jest dzielona na jednostki,
które można wstrzymać, wznowić, porzucić lub nadać im priorytet. Na tym opiera się renderowanie
współbieżne: `startTransition`, `useDeferredValue` i Suspense, gdzie pilne aktualizacje (np. wpisywanie)
mogą przerwać mniej pilny render.
