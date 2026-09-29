# Kod specyficzny dla platformy {mid}

React Native współdzieli większość kodu między iOS a Androidem, ale platformy różnią się konwencjami UI (przycisk wstecz, wzorce
nawigacji, pickery dat), możliwościami natywnymi, uprawnieniami i drobnymi szczegółami renderowania. RN daje dwa narzędzia do
obsługi różnic: **moduł `Platform`** do małych rozgałęzień w pliku i **rozszerzenia plików specyficzne dla platformy** do całych
implementacji. Dobry wybór utrzymuje wspólny kod w porządku i zapobiega rozsypaniu `if (ios)` po całym projekcie.

## Moduł `Platform`

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'android' ? 8 : 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},                                      // web i inne platformy
    }),
  },
});

if (Platform.OS === 'android' && Platform.Version >= 33) {
  // Android 13+: poproś o POST_NOTIFICATIONS w czasie działania
}
```

- `Platform.OS`: `'ios'`, `'android'`, a na innych platformach `'web'`, `'windows'`, `'macos'`.
- `Platform.select` wybiera wartość po kluczu z pierwszeństwem **`ios`/`android` → `native` → `default`**. Sprawdzone w Jest:
  z presetem iOS zwróciło wartość `ios`, a z platformą Android wartość `android`; `{ native, default }` zwróciło `native` na obu.
- `Platform.Version` to na Androidzie **liczba, poziom API** (np. 33), a na iOS **napis** w rodzaju `"18.2"`, więc wersje iOS
  porównuje się przez `parseInt(Platform.Version, 10)`.
- Dodatkowo: `Platform.isPad`, `Platform.isTV`, `Platform.constants`.

## Pliki specyficzne dla platformy

```
DatePicker.ios.tsx       // używany przez Metro przy bundlowaniu dla iOS
DatePicker.android.tsx   // używany przy bundlowaniu dla Androida
Storage.native.ts        // iOS i Android (Metro)
Storage.ts               // wybierany przez bundlery webowe i Node
```

Importuje się `./DatePicker` bez rozszerzenia, a bundler wybiera właściwy plik. Sprawdzone z presetem Jest: ten sam
`import Btn from './Button'` wskazał `Button.ios.js` przy domyślnej platformie iOS i `Button.android.js` przy
`defaultPlatform: 'android'`; `Only.native.js` wygrał z `Only.js` na obu.

Zasady z dokumentacji: `Platform` dla małych, odizolowanych różnic, rozszerzenia plików, gdy implementacje różnią się istotnie.
Oba pliki powinny mieć **to samo eksportowane API** (i wspólny `.d.ts` albo typ), inaczej sprawdzanie typów i importy się rozjadą.

## Poza iOS i Androidem

- **React Native Web** (używany przez Expo dla weba) renderuje komponenty RN do DOM; różnice obsługują pliki `.web.tsx`
  i `Platform.OS === 'web'`.
- Platformy spoza głównego repozytorium: Windows i macOS (Microsoft), TV (`react-native-tvos`), visionOS.
- Moduły Expo i wiele bibliotek udostępnia jedno API w JS z osobnymi implementacjami natywnymi, więc większość aplikacji sama
  potrzebuje niewielu rozgałęzień platformowych.

## Częste różnice, o których trzeba pamiętać

Sprzętowy przycisk wstecz na Androidzie (`BackHandler`, obsługiwany przez biblioteki nawigacji), modele uprawnień i monity w czasie
działania, konfiguracja powiadomień push (APNs vs FCM), zachowanie klawiatury, pasek statusu i wcięcia edge-to-edge, czcionki
i renderowanie tekstu, cienie (`shadow*` vs `elevation`), pickery daty i czasu, haptyka oraz zasady sklepów.

## Źródła

- [Platform-specific code](https://reactnative.dev/docs/platform-specific-code)
- [Platform API](https://reactnative.dev/docs/platform)
- [BackHandler](https://reactnative.dev/docs/backhandler)
- [React Native for Web](https://necolas.github.io/react-native-web/)

## Pytania

### Jak pisać kod specyficzny dla platformy w React Native? {junior}

Przy małych różnicach używa się modułu `Platform`: sprawdza `Platform.OS` (`'ios'`, `'android'`, `'web'`...) albo wybiera wartości przez `Platform.select({ ios, android, native, default })`.
Przy większych różnicach tworzy się osobne pliki, np. `Component.ios.tsx` i `Component.android.tsx`, i importuje `./Component`; bundler wybiera plik dla docelowej platformy.

### Jakie jest pierwszeństwo kluczy w `Platform.select`? {mid}

Wygrywa klucz konkretnej platformy (`ios` albo `android`), potem `native` (dowolna platforma natywna), potem `default` (używany na webie i innych platformach). Zatem
`{ native: A, default: B }` zwraca `A` na iOS i Androidzie oraz `B` na webie. Jeśli żaden klucz nie pasuje i nie ma `default`, zwraca `undefined`.

### Czym różni się `Platform.Version` na iOS i Androidzie? {mid}

Na Androidzie to liczba, poziom API (np. 33 dla Androida 13), według którego definiowane są sprawdzenia funkcji i zmiany uprawnień. Na iOS to napis z wersją systemu (np. `"18.2"`),
więc przed porównaniem trzeba go sparsować (`parseInt(Platform.Version, 10)`). Pomieszanie tych dwóch prowadzi do porównań, które po cichu nie działają.

### Jak działają rozszerzenia plików specyficzne dla platformy? {junior}

Metro rozwiązuje importy, próbując najpierw rozszerzeń platformowych: przy bundlowaniu dla iOS `import './Button'` wczytuje `Button.ios.tsx`, jeśli istnieje, potem `Button.native.tsx`,
potem `Button.tsx`. Pliki `.native` są wspólne dla iOS i Androida, a bundlery webowe je ignorują i używają zwykłego pliku. Oba warianty powinny eksportować to samo API, żeby reszta kodu
nie musiała wiedzieć, który został wczytany.

### Kiedy użyć osobnych plików zamiast sprawdzania `Platform.OS`? {mid}

Gdy implementacje różnią się istotnie, np. innymi natywnymi komponentami, innymi bibliotekami albo zupełnie innymi layoutami. Osobne pliki zachowują czytelność każdej wersji i pozwalają
na importy tylko dla jednej platformy bez wczytywania kodu drugiej. Dla wartości paddingu czy jednego propa prostszy jest `Platform.select` w miejscu.

### Jak dostosować layout do tabletów albo telewizorów? {mid}

`Platform.isPad` (iOS) i `Platform.isTV` rozpoznają niektóre typy urządzeń, ale decyzje o layoucie lepiej opierać na dostępnym miejscu: odczytywać `useWindowDimensions()` i
przełączać layouty na progach szerokości (np. widok lista-szczegóły powyżej 768 dp), bo tablety z Androidem, urządzenia składane, podzielony ekran i okna o zmiennym rozmiarze
zmieniają szerokość bez zmiany typu urządzenia. Aplikacje na telewizory potrzebują też nawigacji opartej na fokusie zamiast dotyku.

### Czym jest React Native Web? {mid}

To biblioteka implementująca komponenty i API React Native na DOM, dzięki czemu te same komponenty renderują się w przeglądarce. Expo używa jej dla platformy web. Różnice obsługuje się
przez `Platform.OS === 'web'` i pliki `.web.tsx`. Pozwala współdzielić dużą część kodu między mobilem a webem, choć kwestie specyficzne dla weba (SEO, routing, semantyka dostępności,
responsywne layouty) nadal wymagają uwagi.

### Jak zachować spójność typów między plikami specyficznymi dla platform? {senior}

TypeScript rozwiązuje `./Button` do `Button.tsx` albo `.d.ts`, a nie do plików `.ios`/`.android`, więc importy plików tylko platformowych mogą nie przejść sprawdzania typów. Typowe
rozwiązania: wspólny `Button.types.ts`, który obie implementacje importują i spełniają, `Button.d.ts` deklarujący publiczne API albo skonfigurowanie `moduleSuffixes`
(`[".ios", ".android", ".native", ""]`) w `tsconfig`. Testy powinny pokrywać każdy wariant platformowy.

### Jakie różnice platform najczęściej wpływają na aplikacje wieloplatformowe? {mid}

Sprzętowy przycisk wstecz na Androidzie, różne modele uprawnień i monity, usługi powiadomień push (APNs vs FCM), klawiatura i wcięcia edge-to-edge, cienie (propsy `shadow*` vs
`elevation`), czcionki i metryki tekstu, natywne pickery oraz zasady przeglądu w sklepach. Projektowanie ekranów z myślą o konwencjach obu platform i testowanie na prawdziwych
urządzeniach obu typów jest pewniejsze niż łatanie różnic na końcu.

### Jak testować zachowanie specyficzne dla platformy? {senior}

Testy jednostkowe mogą przełączać platformy: preset Jest dla React Native domyślnie używa iOS, a drugi projekt Jest z `haste.defaultPlatform: 'android'` uruchamia te same testy na
plikach androidowych i z `Platform.OS` Androida. W teście w tym środowisku ten sam import wskazał `Button.ios.js` w jednej konfiguracji i `Button.android.js` w drugiej. Różnice
natywne (uprawnienia, gesty, renderowanie) nadal wymagają testów E2E albo ręcznych sprawdzeń na obu platformach.
