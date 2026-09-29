# Optymalizacja wydajności aplikacji React {mid}

Pierwsza zasada: **najpierw zmierz**. Większość renderów jest tania, a optymalizacja „na oko” dodaje
złożoność bez efektu. Wąskie gardła zwykle leżą w: zbyt dużym bundlu JS, wodospadach zapytań, długich
listach, kosztownych obliczeniach w renderze i renderowaniu zbyt dużych poddrzew przy każdej zmianie.

## Jak mierzyć

- **React DevTools Profiler**: które komponenty renderowały się, ile razy, jak długo i **dlaczego**
  (opcja „Record why each component rendered”). Opcja podświetlania renderów pokazuje je na żywo.
- Komponent `<Profiler id="..." onRender={...}>` do programowego pomiaru.
- **Chrome DevTools, zakładka Performance**: długie zadania (long tasks > 50 ms), layout, malowanie.
- **Core Web Vitals** mierzone u prawdziwych użytkowników: **LCP** (ładowanie głównej treści), **INP**
  (responsywność na interakcje; w 2024 zastąpił FID) i **CLS** (przesunięcia układu). Lighthouse
  pokazuje wyniki laboratoryjne.
- Mierz **build produkcyjny**: tryb deweloperski React jest wielokrotnie wolniejszy (dodatkowe
  sprawdzenia, StrictMode).

## Mniej renderów

1. **Kolokacja stanu**: stan w najmniejszym komponencie, który go potrzebuje. Zmiana stanu w korzeniu
   renderuje całą aplikację.
2. **`children` / sloty**: elementy przekazane z góry nie renderują się przy zmianie stanu wrappera.
3. **`memo` + stabilne propsy** (`useCallback`, `useMemo`) dla kosztownych komponentów. Zamiast tego
   **React Compiler** memoizuje automatycznie.
4. **Podział kontekstów** i store'y z selektorami dla często zmieniającego się stanu globalnego.
5. Unikanie efektów, które tylko kopiują dane do stanu, bo każdy taki efekt to dodatkowy render.

## Mniej pracy w renderze

- Kosztowne obliczenia w `useMemo` albo wyliczone raz poza komponentem.
- `useTransition` / `useDeferredValue`, żeby kosztowny render nie blokował wpisywania.
- **Wirtualizacja długich list** (TanStack Virtual, react-window): renderowane są tylko wiersze widoczne na
  ekranie, a nie 10 000 węzłów DOM.
- Bardzo ciężkie obliczenia przenosi się do **Web Workera**.

## Mniej kodu na start

```tsx
const AdminPanel = lazy(() => import('./AdminPanel'))   // osobny chunk

<Suspense fallback={<Spinner />}>
  {isAdmin && <AdminPanel />}
</Suspense>
```

- **Code splitting** na poziomie tras (routery robią to natywnie) i dużych, rzadko używanych widoków (edytory,
  wykresy, panele admina).
- `React.lazy` tworzy się **na poziomie modułu**, a nie w komponencie, bo inaczej przy każdym renderze powstaje
  nowy typ i stan jest tracony.
- **Analiza bundla** (`rollup-plugin-visualizer`, `source-map-explorer`): duże zależności (daty, ikony,
  lodash) zastępuje się lżejszymi albo importuje punktowo, żeby działał tree-shaking.
- **Preload / prefetch** chunków i danych przy najechaniu na link.

## Obrazy i zasoby

- `loading="lazy"` dla obrazów poza ekranem, jawne `width`/`height` (zapobiega CLS), nowoczesne formaty
  (AVIF/WebP) i `srcset`.
- Czcionki z `font-display: swap`, a krytyczne zasoby z `preload`.

## Źródła

- [React Developer Tools: Profiler (react.dev)](https://react.dev/learn/react-developer-tools)
- [&lt;Profiler&gt; (react.dev)](https://react.dev/reference/react/Profiler)
- [lazy (react.dev)](https://react.dev/reference/react/lazy)
- [Web Vitals (web.dev)](https://web.dev/articles/vitals)
- [TanStack Virtual](https://tanstack.com/virtual/latest)

## Pytania

### Od czego zacząć optymalizację wolnej aplikacji React? {mid}

Od pomiaru na buildzie produkcyjnym. React DevTools Profiler pokazuje, które komponenty renderują się często
i długo oraz dlaczego. Zakładka Performance w Chrome pokazuje długie zadania, a Core Web Vitals (LCP, INP, CLS)
mierzą to, co odczuwa użytkownik. Optymalizuje się konkretne wąskie gardło, a nie wszystko naraz, i mierzy
ponownie po zmianie.

### Jakie są najczęstsze przyczyny zbędnych renderów i jak je usunąć? {mid}

Stan umieszczony za wysoko (renderuje duże poddrzewo), nowe obiekty i funkcje w propsach komponentów w `memo`,
duży kontekst z często zmieniającą się wartością i efekty, które kopiują dane do stanu. Rozwiązania: kolokacja
stanu, przekazywanie poddrzew jako `children`, `memo` ze stabilnymi propsami (albo React Compiler), podział
kontekstu lub store z selektorami, liczenie wartości w renderze.

### Czym jest code splitting i jak go zrobić w React? {junior}

Podział bundla JS na mniejsze części ładowane na żądanie, żeby pierwsze ładowanie zawierało tylko potrzebny kod.
W React robi się to przez `React.lazy(() => import('./Component'))` w połączeniu z `Suspense` dla fallbacku,
najczęściej na poziomie tras i dużych, rzadko używanych widoków. Routery i frameworki robią podział na trasy
automatycznie.

### Czym jest wirtualizacja list i kiedy jej użyć? {mid}

Renderowanie tylko tych elementów listy, które są aktualnie widoczne (plus mały bufor), zamiast wszystkich. Przy
przewijaniu elementy są podmieniane, a wysokość kontenera symuluje pełną listę. Stosuje się ją przy setkach
i tysiącach wierszy, gdy liczba węzłów DOM spowalnia render i przewijanie (TanStack Virtual, react-window).
Wadą są trudności z wyszukiwaniem w stronie (Ctrl+F) i elementami o zmiennej wysokości.

### Dlaczego wydajność mierzy się na buildzie produkcyjnym? {junior}

Tryb deweloperski React wykonuje dodatkowe sprawdzenia i ostrzeżenia, a w `StrictMode` podwójnie renderuje
komponenty i montuje efekty, więc jest znacznie wolniejszy. Wyniki z developmentu wprowadzają w błąd. Do
profilowania produkcji istnieje specjalny build z włączonym profilerem.

### Czym są Core Web Vitals? {mid}

To metryki Google opisujące doświadczenie użytkownika: **LCP** (Largest Contentful Paint, czas wyświetlenia
największego elementu treści, cel ≤ 2,5 s), **INP** (Interaction to Next Paint, responsywność na interakcje,
cel ≤ 200 ms; od 2024 zastąpił FID) i **CLS** (Cumulative Layout Shift, stabilność układu, cel ≤ 0,1). Mierzy
się je u prawdziwych użytkowników (biblioteka `web-vitals`, CrUX), a Lighthouse daje wyniki laboratoryjne.

### Jak React może pogorszyć INP i jak temu zaradzić? {senior}

Długi synchroniczny render po interakcji (np. przefiltrowanie dużej listy po wpisaniu znaku) blokuje wątek główny,
więc przeglądarka nie może namalować odpowiedzi. Pomaga podział na aktualizację pilną i niepilną (`useTransition`,
`useDeferredValue`), zmniejszenie renderowanego poddrzewa (kolokacja, `memo`), wirtualizacja, przeniesienie ciężkich
obliczeń do Web Workera i unikanie kosztownej pracy w handlerach.

### Dlaczego `React.lazy` należy wywoływać na poziomie modułu? {mid}

Wywołanie `lazy()` wewnątrz komponentu tworzy przy każdym renderze nowy komponent, czyli nowy typ. React
odmontowuje wtedy poprzedni i montuje nowy, co gubi stan i może powodować ponowne zawieszanie. Deklaracja poza
komponentem daje jeden stabilny typ. Chunk i tak jest pobierany dopiero przy pierwszym renderze.

### Jak zmniejszyć rozmiar bundla? {mid}

Przeanalizować go wizualizatorem, zastąpić ciężkie biblioteki lżejszymi (np. natywne `Intl` zamiast bibliotek
dat), importować punktowo, żeby działał tree-shaking (unikać `import * as` i importów z „beczek”), podzielić kod na
trasy i widoki (`lazy`), ładować rzadko używane funkcje dynamicznie (`await import()`) i nie wysyłać do klienta kodu,
który może działać na serwerze (Server Components).

### Kiedy użyć komponentu `<Profiler>`? {senior}

Gdy potrzebny jest programowy pomiar czasu renderu konkretnego poddrzewa, np. w testach wydajności, do zbierania
metryk w środowisku testowym albo do porównania wariantów implementacji. `onRender` dostaje `id`, fazę (`mount`,
`update`), czas renderu z memoizacją i bez niej oraz czasy rozpoczęcia i zatwierdzenia. W produkcji wymaga
specjalnego buildu profilującego, a do codziennej diagnostyki wystarcza Profiler w React DevTools.
