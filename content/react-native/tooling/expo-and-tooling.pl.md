# Expo, buildy i wydania {mid}

**Expo** to framework i zestaw usług wokół React Native: moduły SDK (kamera, powiadomienia, system plików...), **Expo Router**,
projekty natywne sterowane konfiguracją, development buildy i usługi chmurowe (**EAS Build, Submit, Update**). Dokumentacja React
Native zaleca zaczynanie nowych aplikacji od frameworka, a Expo jest dziś domyślnym wyborem. Pytania na rozmowach dotyczą Expo Go
kontra development buildy, tego, co robi „prebuild”, i tego, co można wysłać **over the air**.

## Wersje idą razem

**Expo SDK** przypina wersję React Native i zgodne wersje bibliotek. Sprawdzone: nowy projekt SDK 57 (`create-expo-app`) używa
**React Native 0.86.3** i Reacta 19.2, choć RN 0.87 jest już wydany, bo SDK podążają za RN z opóźnieniem. `npx expo install <pakiet>`
instaluje wersję pasującą do SDK, a `npx expo install --check` zgłasza niezgodności: po ręcznej instalacji
`react-native-reanimated@4.7.0` zgłosił „expected version: 4.5.1”.

## Expo Go a development buildy

- **Expo Go** to gotowa aplikacja ze sklepów ze **stałym zestawem bibliotek natywnych**: świetna do nauki i prototypów, ale nie da
  się w niej dodać własnego kodu natywnego ani zmienić konfiguracji natywnej.
- **Development build** to „twoja własna wersja Expo Go” (z `expo-dev-client`): dowolne biblioteki natywne i konfiguracja. Przebudowuje
  się go tylko przy zmianach natywnych (instalacja biblioteki z kodem natywnym, zmiana konfiguracji aplikacji, aktualizacja SDK);
  zmiany JS wymagają tylko `npx expo start`.

## Continuous Native Generation (prebuild)

Foldery `android/` i `ios/` są **generowane** z `app.json`/`app.config.ts` i **config plugins** przez `npx expo prebuild`, a nowe projekty
ignorują je w gicie. Sprawdzone na Windowsie (który wygenerował tylko `android/`): dodanie `android.permissions: ["android.permission.CAMERA"]`
i `scheme: "expoapp"` do `app.json` dało uprawnienie `CAMERA` i intent filter dla `expoapp://` w `AndroidManifest.xml`, a `gradle.properties`
zawierał `newArchEnabled=true`, `hermesEnabled=true` i `edgeToEdgeEnabled=true`. Aktualizacja sprowadza się do „zaktualizuj zależności
i konfigurację, potem `prebuild --clean`” zamiast ręcznego scalania zmian w szablonie natywnym. Projekty mogą też commitować i bezpośrednio
edytować foldery natywne (workflow „bare”) i nadal korzystać z modułów Expo.

## Budowanie, publikacja, aktualizacje

- **EAS Build** buduje podpisane binaria w chmurze (albo lokalnie z `--local`) według profili w `eas.json` (development, preview,
  production) i zarządza poświadczeniami (keystore, certyfikaty, profile provisioningowe).
- **EAS Submit** wysyła buildy do App Store Connect i Google Play.
- `npx expo export` tworzy bundle JS i zasoby; sprawdzone dla Androida: bundle powstał jako bajtkod Hermesa (`index-<hash>.hbc`, 1,4 MB).
- **EAS Update** dostarcza **aktualizacje over the air (OTA)** JS i zasobów do zainstalowanych aplikacji, publikowane na **kanały/gałęzie**,
  z wycofaniem przez ponowną publikację wcześniejszej aktualizacji. **Nie może** zmienić kodu natywnego ani zależności, uprawnień czy wersji
  SDK. **Runtime version** (polityki takie jak `appVersion` albo `fingerprint`) wiąże aktualizacje ze zgodnymi buildami natywnymi;
  aktualizacja wymagająca kodu natywnego, którego build nie ma, spowodowałaby awarię albo wycofanie. Zasady sklepów nadal obowiązują:
  aktualizacje OTA nie mogą zmieniać przeznaczenia aplikacji.

## Bez Expo

React Native Community CLI (`npx @react-native-community/cli init`) tworzy projekt z commitowanymi folderami natywnymi, które utrzymuje się
samemu; aktualizacje korzystają z diffu Upgrade Helper. Pasuje to zespołom z mocnymi kompetencjami natywnymi albo aplikacjom brownfield
(RN wewnątrz istniejącej aplikacji natywnej), choć i tam można używać modułów Expo i EAS.

## Źródła

- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- [Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)
- [Get started with React Native (frameworks)](https://reactnative.dev/docs/environment-setup)

## Pytania

### Czym jest Expo i dlaczego to zalecany sposób na start? {junior}

Expo to framework wokół React Native z dużym SDK modułów natywnych, routingiem opartym na plikach (Expo Router), projektami natywnymi generowanymi z konfiguracji, development buildami
i usługami chmurowymi do budowania, publikacji i aktualizacji aplikacji. Usuwa większość pracy przy konfiguracji natywnej i aktualizacjach, więc zespoły skupiają się na aplikacji.
Dokumentacja React Native zaleca zaczynanie od frameworka, a Expo jest głównym z nich.

### Czym różni się Expo Go od development builda? {junior}

Expo Go to jedna aplikacja ze sklepów, która potrafi uruchomić twój JS, ale zawiera tylko stały zestaw bibliotek i konfiguracji natywnej, więc własny kod natywny, wiele zewnętrznych
bibliotek natywnych i zmiany konfiguracji natywnej tam nie działają. Development build to twoja własna binarka z `expo-dev-client`, zawierająca dokładnie ten kod natywny, którego
potrzebuje projekt, przy zachowaniu szybkiej iteracji JS. Prawdziwe projekty używają development buildów; Expo Go służy do nauki i szybkich prototypów.

### Kiedy potrzebny jest nowy build natywny, a kiedy wystarczy aktualizacja JS? {mid}

Nowy build jest potrzebny, gdy zmienia się cokolwiek natywnego: dodanie albo aktualizacja biblioteki z kodem natywnym, zmiana uprawnień albo konfiguracji aplikacji, aktualizacja Expo
SDK albo wersji React Native. Zmiany w JavaScripcie, TypeScripcie i zasobach wymagają w developmencie tylko przeładowania Metro, a w produkcji można je dostarczyć jako aktualizację OTA do
buildów ze zgodną runtime version.

### Co robi `npx expo prebuild`? {mid}

Generuje projekty natywne `android` i `ios` z szablonu oraz twojej konfiguracji aplikacji i config plugins (uprawnienia, schematy, ikony, ekran startowy, ustawienia natywne), co nazywa się
Continuous Native Generation. Foldery natywne stają się artefaktami budowania, które można usunąć i wygenerować ponownie (`--clean`), a nie kodem do utrzymania, więc aktualizacje i zmiany
natywne są powtarzalne. W teście uprawnienie do kamery i schemat URL zdefiniowane w `app.json` pojawiły się w wygenerowanym manifeście Androida.

### Czym są aktualizacje over the air i jakie mają ograniczenia? {mid}

Aktualizacje OTA (EAS Update albo podobne usługi) pobierają nowy bundle JS i zasoby do zainstalowanej aplikacji, więc poprawki trafiają do użytkowników bez wydania w sklepie. Nie mogą zmienić
kodu natywnego, zależności natywnych, uprawnień ani wersji SDK, które wymagają nowej binarki. Zasady sklepów na nie pozwalają, o ile nie zmienia się przeznaczenie aplikacji. Do celowania
w buildy służą kanały, a do tego stopniowe wdrażanie i ponowna publikacja wcześniejszej aktualizacji jako wycofanie.

### Czym jest runtime version? {senior}

To wartość oznaczająca, z którym buildem natywnym zgodna jest aktualizacja: aktualizacja trafia tylko do buildów z tą samą runtime version. Polityki takie jak `appVersion` (powiązana z wersją
aplikacji) albo `fingerprint` (skrót wszystkiego, co wpływa na kod natywny) ustawiają ją automatycznie. Gdyby aktualizacja wymagająca nowego modułu natywnego trafiła do starego builda, JS
wywoływałby nieistniejący kod natywny i powodował awarie; runtime version temu zapobiega.

### Jak utrzymać zgodność wersji zależności w projekcie Expo? {mid}

Instalować biblioteki przez `npx expo install`, który wybiera wersję pasującą do SDK, i uruchamiać `npx expo install --check` (albo `expo-doctor`), żeby znaleźć niezgodności: w teście ręczna
instalacja nowszego Reanimated sprawiła, że sprawdzenie podało wersję oczekiwaną dla SDK. SDK aktualizuje się jako całość przez `npx expo install expo@<wersja> --fix`, a potem generuje
projekty natywne ponownie.

### Jak EAS Build obsługuje podpisywanie? {mid}

Profile w `eas.json` definiują buildy development, preview i production. EAS może wygenerować i przechowywać poświadczenia (keystore Androida, certyfikat dystrybucyjny i profile
provisioningowe iOS) albo użyć twoich, buduje podpisane binaria w chmurze albo lokalnie, a EAS Submit wysyła je do sklepów. Centralne zarządzanie poświadczeniami chroni przed utratą
keystore'a, która uniemożliwiłaby aktualizowanie aplikacji na Androida.

### Kiedy nie używać generowania natywnego zarządzanego przez Expo? {senior}

Gdy zespół utrzymuje dużo własnego kodu natywnego, trudnego do wyrażenia config plugins, w aplikacjach brownfield, w których React Native jest osadzony w istniejącej aplikacji natywnej,
albo przy systemach budowania wymagających commitowanych projektów natywnych. Nawet wtedy można używać modułów Expo, EAS Build i EAS Update w projekcie „bare” z commitowanymi folderami
`android` i `ios`; kompromisem jest samodzielna obsługa zmian w szablonie natywnym przy aktualizacjach.

### Jak zarządzać środowiskami (dev, staging, produkcja)? {mid}

Używać dynamicznego `app.config.ts`, który czyta zmienne środowiskowe i ustawia nazwę aplikacji, identyfikator bundle'a, ikony i adresy API dla każdego wariantu, profili EAS ustawiających
te zmienne i osobnych kanałów aktualizacji dla środowisk. Publiczne wartości można udostępnić JS prefiksem `EXPO_PUBLIC_`; sekrety muszą zostać poza aplikacją, bo wszystko, co trafia do
bundle'a, da się odczytać.
