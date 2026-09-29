# Podstawowe komponenty {junior}

React Native renderuje **prawdziwe natywne widoki**, a nie HTML: `View` staje się `UIView` na iOS i `android.view.View`
(`ViewGroup`) na Androidzie. Piszesz komponenty React, a renderer mapuje niewielki zestaw **podstawowych komponentów** (core
components) na natywne widżety. Nie ma DOM, plików CSS ani `div`/`span`, więc wiedza o tym, co każdy komponent robi (i czego
nie robi), to podstawa każdej rozmowy o RN.

## Najważniejsze komponenty

| Komponent | Przeznaczenie | Odpowiednik z weba |
|---|---|---|
| `View` | kontener z layoutem, stylami, obsługą dotyku, dostępnością | `div` |
| `Text` | **jedyne miejsce na tekst**; obsługuje zagnieżdżanie i dziedziczenie stylów | `span`/`p` |
| `Image` | obrazy lokalne (`require`) i zdalne (`{ uri }`) | `img` |
| `TextInput` | wprowadzanie z klawiatury; kontrolowany przez `value` + `onChangeText` | `input` |
| `ScrollView` | przewijany kontener, który renderuje **wszystkie** dzieci | `div` z overflow |
| `FlatList`/`SectionList` | listy wirtualizowane (patrz temat o listach) | brak |
| `Pressable` | obsługa naciśnięć: `onPressIn`, `onPressOut`, `onPress`, `onLongPress` | `button` |
| `Switch`, `ActivityIndicator`, `Modal`, `KeyboardAvoidingView`, `RefreshControl` | widżety platformy i pomocnicze | brak |

## Reguły, które zaskakują programistów webowych

- **Napisy muszą być w `Text`.** Sprawdzone w Jest: `<View>hello</View>` rzuca „Text strings must be rendered within a `<Text>`
  component”. To samo łapie klasyczny błąd `{count && <Badge />}`, gdy `count` wynosi `0`: `0` renderuje się jako napis poza
  `Text` i aplikacja się wywraca.
- **Style tekstu dziedziczy tylko `Text`** i tylko od nadrzędnego `Text`:
  `<Text style={{ color: 'red' }}>Hello <Text style={{ fontWeight: 'bold' }}>world</Text></Text>` to jeden węzeł tekstowy
  („Hello world”), w którym „world” jest czerwone i pogrubione. `View` nie przekazuje dzieciom `color` ani `fontSize`.
- **Obrazy z sieci wymagają jawnych wymiarów** (dokumentacja mówi, że trzeba je podać ręcznie); obrazy statyczne z
  `require('./img.png')` biorą rozmiar z pliku, a warianty `@2x`/`@3x` są wybierane według gęstości pikseli. Domyślny
  `resizeMode` to `cover`.
- **`TextInput` jest kontrolowany jak na webie**: `value` + `onChangeText` (które daje napis, a nie zdarzenie). Sprawdzone:
  wpisanie „ANN@X.PL” z `onChangeText` zamieniającym na małe litery pokazuje `ann@x.pl`.
- **`Button`** to natywnie wyglądający przycisk z bardzo ograniczonymi stylami; przy własnym designie używa się `Pressable`
  z własną zawartością.

## Pressable

```tsx
<Pressable
  onPress={save}
  onLongPress={showMenu}                       // domyślnie po 500 ms (delayLongPress)
  hitSlop={10}                                 // większy obszar dotyku niż element wizualny
  disabled={saving}
  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
  android_ripple={{ color: '#ddd' }}
  accessibilityRole="button"
>
  <Text>Save</Text>
</Pressable>
```

Sprawdzone w React Native Testing Library: stuknięcie dało `in, out, press`, długie przytrzymanie `in, long, out` (bez
`press`), a `Pressable` z `disabled` nie wywołał niczego. `Pressable` zastępuje starsze `TouchableOpacity`/`TouchableHighlight`,
które dokumentacja opisuje jako mniej przyszłościowe.

## Bezpieczne obszary i klawiatura

- Treść musi omijać wycięcia ekranu, pasek statusu i wskaźnik ekranu głównego. Wbudowany `SafeAreaView` jest **przestarzały**
  (i działał tylko na iOS); używa się `react-native-safe-area-context` (`SafeAreaProvider`, `SafeAreaView`,
  `useSafeAreaInsets`). Na Androidzie 15+ aplikacje rysują **od krawędzi do krawędzi** (edge-to-edge), więc wcięcia mają
  znaczenie także tam.
- `KeyboardAvoidingView` przesuwa treść nad klawiaturę ekranową (zwykle `behavior="padding"` na iOS; na Androidzie często
  załatwia to `windowSoftInputMode`), a `Keyboard.dismiss()` chowa klawiaturę.

## Źródła

- [Core components and native components](https://reactnative.dev/docs/intro-react-native-components)
- [Text](https://reactnative.dev/docs/text)
- [Image](https://reactnative.dev/docs/image)
- [Pressable](https://reactnative.dev/docs/pressable)
- [SafeAreaView (deprecated)](https://reactnative.dev/docs/safeareaview)
- [react-native-safe-area-context](https://github.com/AppAndFlow/react-native-safe-area-context)

## Pytania

### Jak React Native renderuje UI w porównaniu z Reactem na webie? {junior}

React Native nie używa DOM ani WebView: jego renderer mapuje komponenty React na prawdziwe widoki platformy, więc `View` staje się `UIView` na iOS i androidowym `View`, `Text`
natywnym widokiem tekstu i tak dalej. Nadal pisze się komponenty, propsy, stan i hooki, ale ze stałym zestawem podstawowych komponentów zamiast elementów HTML i ze stylami
pisanymi w JavaScripcie zamiast CSS.

### Dlaczego tekst musi być opakowany w komponent `Text`? {junior}

Platformy natywne renderują tekst tylko przez dedykowane widoki tekstowe, a `View` nie potrafi wyświetlić napisu. React Native to wymusza: napis bezpośrednio w `View` rzuca „Text
strings must be rendered within a `<Text>` component”. Częstym źródłem tego błędu jest `{count && <Item />}` przy `count === 0`, co renderuje `0` jako goły napis; należy użyć
`count > 0 &&` albo operatora warunkowego.

### Jak działa dziedziczenie stylów w React Native? {mid}

Nie ma ogólnej kaskady CSS. Dziedziczone są tylko style tekstu i tylko między zagnieżdżonymi komponentami `Text`: `Text` wewnątrz `Text` dziedziczy kolor, rozmiar czcionki itd.
rodzica i razem tworzą jeden blok tekstu. `View` nie przekazuje stylów tekstu dzieciom, więc wspólną typografię zwykle realizuje się własnym komponentem `AppText` albo motywem.

### Czym jest `Pressable` i dlaczego wybierać go zamiast `TouchableOpacity`? {junior}

`Pressable` to podstawowy komponent wykrywający naciśnięcia, udostępniający `onPressIn`, `onPressOut`, `onPress` i `onLongPress` (domyślnie po 500 ms), a do tego `hitSlop`,
`pressRetentionOffset`, `disabled`, `android_ripple` oraz funkcję `style`/children dostającą `{ pressed }`, dzięki której można zaprojektować dowolną informację zwrotną. Starsze
komponenty Touchable mają na sztywno jeden rodzaj informacji zwrotnej; dokumentacja wskazuje `Pressable` jako bardziej elastyczne i przyszłościowe API.

### Jak zrobić kontrolowane pole tekstowe? {junior}

Trzymać wartość w stanie i przekazać `value` oraz `onChangeText` do `TextInput`; `onChangeText` dostaje nowy napis bezpośrednio (inaczej niż obiekt zdarzenia na webie). Przydatne
propsy to `keyboardType` (`email-address`, `numeric`), `secureTextEntry` dla haseł, `autoCapitalize`, `autoComplete`/`textContentType` dla autouzupełniania oraz `returnKeyType`
z `onSubmitEditing`.

### Co jest szczególnego w wyświetlaniu obrazów? {mid}

Obrazy statyczne importuje się przez `require('./img.png')`; bundler je dołącza i wybiera pliki `@2x`/`@3x` według gęstości ekranu, a ich rozmiar jest znany. Obrazy zdalne (`{ uri }`)
muszą mieć jawną szerokość i wysokość, bo rozmiar nie jest znany przed pobraniem. `resizeMode` (domyślnie `cover`, a także `contain`, `stretch`, `repeat`, `center`) steruje
skalowaniem. Dla cache'owania, placeholderów i wydajności aplikacje często używają bibliotek takich jak `expo-image`.

### Czym różni się `ScrollView` od `FlatList`? {junior}

`ScrollView` renderuje wszystkie dzieci naraz, co jest w porządku dla ekranu z ograniczoną treścią, ale marnuje pamięć i czas przy długich albo nieograniczonych listach. `FlatList`
wirtualizuje: renderuje tylko elementy w pobliżu widocznego obszaru, a resztę odmontowuje przy przewijaniu, i dodaje funkcje takie jak pull-to-refresh, nieskończone przewijanie
i separatory. Do list danych używa się `FlatList` (albo `SectionList`).

### Jak obsłużyć wycięcia ekranu i bezpieczne obszary? {mid}

Użyć `react-native-safe-area-context`: opakować aplikację w `SafeAreaProvider` i albo użyć jego `SafeAreaView` (z `edges`, żeby wybrać krawędzie), albo odczytać wcięcia przez
`useSafeAreaInsets()` i samemu dodać padding. Wbudowany `SafeAreaView` jest przestarzały i działał tylko na iOS. Przy edge-to-edge na Androidzie (wymuszanym w nowszych wersjach
Androida) te same wcięcia są potrzebne także na Androidzie.

### Co zrobić, gdy klawiatura ekranowa zasłania pola? {mid}

Opakować formularz w `KeyboardAvoidingView` (zwykle `behavior="padding"` na iOS; na Androidzie `softInputMode` okna często już zmienia rozmiar layoutu), długie formularze umieścić
w `ScrollView` z `keyboardShouldPersistTaps="handled"`, a klawiaturę chować przez `Keyboard.dismiss()` albo stuknięcie poza polem. Biblioteki takie jak
`react-native-keyboard-controller` dają dokładniejszą kontrolę i płynniejsze animacje.

### Kiedy użyć `Modal`? {junior}

Do treści prezentowanej nad bieżącym ekranem, takiej jak okna dialogowe, pickery czy nakładki pełnoekranowe: `Modal` renderuje się w osobnej natywnej warstwie i ma `visible`,
`animationType` (`slide`, `fade`), `transparent` oraz `onRequestClose` (wywoływane, gdy użytkownik naciśnie przycisk wstecz na Androidzie). W aplikacjach z biblioteką nawigacji ekrany modalne często
implementuje się zamiast tego jako trasy nawigatora z prezentacją modalną, żeby uczestniczyły w nawigacji i deep linkingu.
