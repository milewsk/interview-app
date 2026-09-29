# Nawigacja {mid}

React Native nie ma wbudowanego routera ani historii przeglądarki: nawigację dostarczają biblioteki. Dwie główne opcje to
**React Navigation** (nawigatory definiowane w kodzie) i **Expo Router** (routing oparty na plikach, domyślny w nowych projektach
Expo). Dzielą te same pojęcia, więc pytania na rozmowach dotyczą **stosów, zakładek, parametrów, cyklu życia nawigacji i deep
linkingu**.

## Nawigatory

```tsx
const Stack = createNativeStackNavigator<RootStackParamList>();

<NavigationContainer linking={linking}>
  <Stack.Navigator>
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="Details" component={DetailsScreen} options={{ title: 'Order' }} />
  </Stack.Navigator>
</NavigationContainer>

navigation.navigate('Details', { id: 42 });      // przejdź do ekranu, przekazując parametry
navigation.push('Details', { id: 43 });          // zawsze dodaj nowy wpis
navigation.goBack();  navigation.popTo('Home');  navigation.popToTop();
```

- **Native stack** korzysta z natywnej nawigacji platformy (UINavigationController / fragmenty Androida przez
  `react-native-screens`): natywne przejścia i gesty. Stack oparty na JS daje więcej możliwości dostosowania.
- Nawigatory **bottom tabs**, **drawer** i **material top tabs** można **zagnieżdżać** (zakładki w stosie, stos w każdej zakładce).
- Ekrany dostają `navigation` i `route` (`route.params`), a komponenty-dzieci używają `useNavigation()` i `useRoute()`.

Sprawdzone z React Navigation 7 w Jest:

- `navigate('Details', { id: 42 })` pokazało „Details 42”;
- `push('Details', { id: 43 })` dodało wpis: `Home > Details42 > Details43`;
- `navigate('Details', { id: 44 })` z ekranu `Details` **nie dodało** wpisu, tylko zaktualizowało bieżący:
  `Home > Details42 > Details44` (nową kopię daje `push`);
- `navigate('Home')` z `Home > A > B` **dodało** nowy wpis (`Home > A > B > Home`): od v7 `navigate` nie cofa się do wcześniejszych
  ekranów; `popTo('A')` i `navigate('A', undefined, { pop: true })` wróciły do `Home > A`;
- dwa wywołania `goBack()` wróciły do `Home`;
- licznik w zakładce **zachował stan** po przełączeniu na inną zakładkę i z powrotem: ekrany zakładek pozostają zamontowane.

## Cykl życia ekranu

Ekrany w stosie **pozostają zamontowane**, gdy przechodzi się dalej, więc `useEffect` nie wykonuje się ponownie po powrocie.
Sprawdzone: przejście z Home do Details zalogowało `Home blur`, a powrót `Home focus`. Do odświeżania danych, uruchamiania
i zatrzymywania subskrypcji albo obsługi przycisku wstecz tylko wtedy, gdy ekran jest widoczny, używa się **`useFocusEffect`**
(albo zdarzeń `focus`/`blur`, `useIsFocused`).

## Parametry i typy

Parametry powinny być **małe i serializowalne** (identyfikator, a nie cały obiekt z funkcjami), bo są częścią stanu nawigacji
używanego przy deep linkach i utrwalaniu stanu. Definiuje się typ listy parametrów (`type RootStackParamList = { Details: { id: string } }`),
żeby wywołania `navigate` były sprawdzane typami; React Navigation 7 ma też **statyczne API**, które wywodzi typy z konfiguracji.

## Deep linking

Konfiguracja linkowania mapuje ścieżki URL na ekrany:

```ts
const linking = {
  prefixes: ['myapp://', 'https://example.com'],
  config: { screens: { Home: '', Details: 'item/:id', Profile: 'user/:name' } },
};
```

Sprawdzone przez `getStateFromPath`: `item/42?ref=mail` zamieniło się w trasę `Details` z parametrami `{ id: "42", ref: "mail" }`
(**napisy**; do konwersji służy `parse`, np. funkcja `parse` zamieniła `ann` na `ANN`), nieznana ścieżka zwróciła `undefined`,
a `getPathFromState` zamieniło `Details` z `id: 7` na `/item/7`. Po stronie systemu potrzebny jest własny schemat URL, a dla linków
`https` **universal links** (iOS, `apple-app-site-association`) i **App Links** (Android, `assetlinks.json`).

## Expo Router

Pliki w katalogu `app/` stają się trasami: `app/index.tsx` to `/`, `app/item/[id].tsx` to `/item/:id`, `_layout.tsx` definiuje
nawigator (Stack, Tabs) dla folderu, a grupy takie jak `(tabs)` porządkują pliki bez wpływu na URL. Każdy ekran jest
**automatycznie dostępny przez deep link**, trasy mogą być **statycznie typowane**, a ta sama struktura działa na webie. Nawiguje
się przez `<Link href="/item/42">` albo `router.push()`, a parametry odczytuje przez `useLocalSearchParams()`. Expo Router używał
pakietów React Navigation jako zależności; obecne wersje (sprawdzone: 57) zawierają własną kopię kodu React Navigation, dostępną pod
`expo-router/react-navigation`.

## Źródła

- [React Navigation: getting started](https://reactnavigation.org/docs/getting-started)
- [Moving between screens](https://reactnavigation.org/docs/navigating)
- [Navigation lifecycle](https://reactnavigation.org/docs/navigation-lifecycle)
- [Deep linking](https://reactnavigation.org/docs/deep-linking)
- [Configuring links](https://reactnavigation.org/docs/configuring-links)
- [Expo Router introduction](https://docs.expo.dev/router/introduction/)

## Pytania

### Jakie są główne opcje nawigacji w React Native? {junior}

React Native nie ma wbudowanej nawigacji. React Navigation definiuje nawigatory (stack, tabs, drawer) i ekrany w kodzie i jest najpopularniejszą biblioteką. Expo Router buduje routing
oparty na plikach na tych samych pojęciach: pliki w `app/` stają się trasami, z automatycznymi deep linkami i obsługą weba; jest domyślny w nowych projektach Expo. Istnieją alternatywy
nastawione na natywność, ale te dwie pokrywają większość aplikacji.

### Czym różni się native stack od stosu opartego na JS? {mid}

Native stack używa prymitywów nawigacji platformy przez `react-native-screens`, więc przejścia, gesty i nagłówki są natywne, wydajne i wyglądają standardowo dla platformy. Stack w JS
implementuje przejścia w JavaScripcie z bibliotekami gestów i animacji, co pozwala bardziej dostosować animacje i nagłówki kosztem wydajności. Zwykle domyślnym wyborem jest native stack.

### Czym różni się `navigate` od `push`? {mid}

`navigate` znaczy „przejdź do tego ekranu”: jeśli już na nim jesteś, nie dodaje nowego wpisu (w teście przejście z `Details` do `Details` z nowymi parametrami zaktualizowało bieżący ekran),
ale od v7, jeśli ekran jest wcześniej w stosie, dodaje nowy wpis zamiast się cofać (w teście `Home > A > B` zmieniło się w `Home > A > B > Home`); do cofnięcia
służy `popTo` albo `navigate(name, params, { pop: true })`. `push` zawsze dodaje nowy wpis, czego potrzeba przy zagłębianiu się, np. produkt → powiązany produkt. `goBack`, `popTo`
i `popToTop` cofają.

### Dlaczego `useEffect` nie wykonuje się, gdy wracam na ekran? {mid}

Ekrany w stosie pozostają zamontowane, gdy przechodzi się dalej, a zakładki, gdy się z nich przełącza, więc powrót nie montuje ich ponownie. Do uruchamiania kodu za każdym razem, gdy
ekran dostaje fokus (i sprzątania przy blur), służy `useFocusEffect`, a do przerenderowania przy zmianie fokusu `useIsFocused`. W teście wyjście z ekranu i powrót zalogowały `Home blur`,
a potem `Home focus`.

### Jak przekazywać dane między ekranami? {mid}

Przekazywać małe, serializowalne parametry, np. identyfikatory (`navigate('Details', { id })`), i wczytywać pełne dane na ekranie docelowym, zwykle z cache, jak TanStack Query, albo ze
store'u. Przekazywanie całych obiektów duplikuje dane, które mogą się zdezaktualizować, psuje deep linki i utrwalanie stanu, a przekazywanie funkcji powoduje ostrzeżenia, bo stan musi
być serializowalny. Wyniki zwracane wstecz przekazuje się przez nawigację wstecz z parametrami albo wspólny stan.

### Jak typować nawigację w TypeScript? {mid}

Zdefiniować listę parametrów dla każdego nawigatora (`type RootStackParamList = { Home: undefined; Details: { id: string } }`), przekazać ją do `createNativeStackNavigator<RootStackParamList>()`
i typować propsy ekranów pomocnikami w rodzaju `NativeStackScreenProps<RootStackParamList, 'Details'>`. Wtedy wywołania `navigate` i `route.params` są sprawdzane. Statyczne API React
Navigation 7 i typowane trasy Expo Router potrafią wywieść te typy automatycznie.

### Jak działa deep linking? {mid}

System otwiera aplikację z URL-em (własny schemat, np. `myapp://item/42`, albo link `https` jako universal link / App Link), a biblioteka nawigacji mapuje ścieżkę na stan nawigacji według
konfiguracji ścieżek i parametrów. Parametry z URL-i przychodzą jako napisy (w teście `item/42` dało `id: "42"`), więc trzeba je sparsować i zwalidować. Nieznane ścieżki powinny prowadzić
do ekranu zastępczego, a ekrany za logowaniem wymagają przekierowania po zalogowaniu.

### Czym są universal links i App Links? {senior}

Pozwalają, żeby zwykłe URL-e `https` otwierały aplikację zamiast przeglądarki, gdy jest zainstalowana. Domena potwierdza własność, udostępniając plik: `apple-app-site-association` dla
universal links na iOS i `assetlinks.json` dla App Links na Androidzie, a aplikacja deklaruje powiązane domeny. W przeciwieństwie do własnych schematów nie może ich przejąć inna
aplikacja, a gdy aplikacji nie ma, otwiera się strona internetowa.

### Jak obsłużyć przepływy uwierzytelniania w nawigacji? {mid}

Renderować różne zestawy ekranów zależnie od stanu logowania: gdy użytkownik nie jest zalogowany, nawigator zawiera tylko ekrany logowania, a po zalogowaniu ekrany aplikacji, więc nie
da się cofnąć do ekranu logowania, a chronione ekrany nie istnieją dla niezalogowanych. React Navigation dokumentuje ten wzorzec warunkowy, a Expo Router daje chronione trasy
i przekierowania w layoutach. Podczas przywracania tokenu pokazuje się ekran powitalny.

### Jak Expo Router mapuje pliki na trasy? {junior}

Pliki w `app/` stają się trasami według ścieżki: `index.tsx` to `/`, `settings.tsx` to `/settings`, `[id].tsx` to segment dynamiczny odczytywany przez `useLocalSearchParams()`, `_layout.tsx`
definiuje nawigator opakowujący folder (stack, tabs), a foldery w nawiasach, jak `(tabs)`, grupują trasy bez zmiany URL-a. Każda trasa jest automatycznie dostępna przez deep link
i działa na webie.
