# Moduły i komponenty natywne {senior}

JavaScript nie może sam wywoływać API platformy. Gdy żadna biblioteka nie pokrywa tego, czego potrzebujesz (zamknięte SDK,
funkcja urządzenia, ciężkie przetwarzanie), piszesz **moduł natywny** (funkcje i zdarzenia udostępnione JS) albo **komponent
natywny** (natywny widok renderowany przez React). W New Architecture oznacza to **Turbo Native Modules** i **Fabric Native
Components** zdefiniowane **typowaną specyfikacją**, którą **Codegen** zamienia na kod łączący, albo wyższego poziomu **Expo Modules
API** w Swifcie i Kotlinie.

## Turbo Native Module: specyfikacja

```ts
// specs/NativeDeviceInfo.ts: nazwa pliku musi zaczynać się od "Native"
import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getBatteryLevel(): number;                                   // wywołanie synchroniczne przez JSI
  getDeviceName(): Promise<string>;                            // asynchroniczne
  setFlag(name: string, value: boolean): void;
  readonly onLevelChanged: CodegenTypes.EventEmitter<number>;  // zdarzenia z natywnego kodu do JS
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceInfo');
```

Następnie `codegenConfig` w `package.json` mówi Codegenowi, gdzie są specyfikacje (`jsSrcsDir`), jaka jest nazwa biblioteki,
pakiet Androida i dostawca modułów iOS. Wygenerowany interfejs implementuje się w **Kotlinie/Javie** (plus pakiet rejestrowany
w aplikacji) i w **Objective-C++/Swifcie** (pliki `.mm`, `getTurboModule`).

Sprawdzone z `@react-native/codegen` 0.87:

- powyższa specyfikacja dała schemat `NativeModule` z typowanymi metodami (`NumberTypeAnnotation`, `PromiseTypeAnnotation`,
  `VoidTypeAnnotation`) i `EventEmitterTypeAnnotation` dla `onLevelChanged`;
- specyfikacja z metodą zwracającą `any` **nie przeszła**: „TypeScript type annotation 'TSAnyKeyword' is unsupported in
  NativeModule specs”. Typy muszą być konkretne, żeby dało się wygenerować obie strony;
- `TurboModuleRegistry.getEnforcing('NativeDoesNotExist')` rzuciło „could not be found. Verify that a module by this name is
  registered”, a `TurboModuleRegistry.get` zwróciło `null`, więc dla modułów opcjonalnych używa się `get`.

## Synchronicznie czy asynchronicznie

JSI umożliwia metody **synchroniczne**, co jest świetne przy szybkich odczytach (wartość z cache, stała urządzenia), ale
niebezpieczne przy wolnej pracy: synchroniczne wywołanie blokuje wątek JS, dopóki kod natywny nie wróci. Do I/O, sieci i wszystkiego,
co może trwać, używa się `Promise`, a do strumieni aktualizacji zdarzeń.

## Komponenty natywne

**Fabric Native Component** udostępnia natywny widok (mapę, odtwarzacz wideo, wykres) jako komponent React: plik specyfikacji
deklaruje jego propsy (z typami Codegena, jak `Int32`, `Double`, `WithDefault`) i zdarzenia, a kod natywny implementuje widok.
Polecenia (wywołania imperatywne, jak `play()`) deklaruje się osobno.

## Expo Modules API

Expo Modules pozwalają pisać moduły i widoki w **Swifcie i Kotlinie** deklaratywnym DSL (`Name`, `Function`, `AsyncFunction`,
`Events`, `View`), zbudowanym na JSI i obsługującym New Architecture. Działają w każdej aplikacji React Native, nie tylko
zarządzanej przez Expo. Dokumentacja Expo sugeruje Turbo Modules głównie wtedy, gdy potrzebny jest **C++**; w innych przypadkach API
Expo jest zwykle prostsze. Uzupełniają je **config plugins**, które modyfikują pliki projektów natywnych (Info.plist,
AndroidManifest, Gradle) podczas prebuildu, dzięki czemu konfiguracja natywna pozostaje powtarzalna.

Inne opcje: **Nitro Modules** (Margelo), framework oparty na JSI z własnym generatorem kodu, nastawiony na wydajność, oraz zwykłe
**Turbo Modules w C++** wspólne dla obu platform.

## Źródła

- [Turbo Native Modules: introduction](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [Fabric Native Components: introduction](https://reactnative.dev/docs/fabric-native-components-introduction)
- [Codegen](https://reactnative.dev/docs/the-new-architecture/what-is-codegen)
- [Expo Modules API overview](https://docs.expo.dev/modules/overview/)
- [Nitro Modules](https://nitro.margelo.com/)

## Pytania

### Kiedy potrzebny jest moduł natywny? {junior}

Gdy JavaScript i istniejące biblioteki nie potrafią zrobić tego, czego potrzebujesz: wywołać API platformy, którego nie udostępnia RN ani ekosystem, zintegrować natywne SDK (płatności,
analityka, producent sprzętu), użyć natywnego komponentu UI albo przenieść ciężkie obliczenia (przetwarzanie obrazu, kryptografia) do kodu natywnego. Przed napisaniem własnego warto
sprawdzić, czy nie istnieje utrzymywana biblioteka albo moduł Expo.

### Jakie kroki są potrzebne, żeby utworzyć Turbo Native Module? {mid}

Napisać typowaną specyfikację w TypeScript albo Flow (plik `Native*` z interfejsem rozszerzającym `TurboModule` i wywołaniem `TurboModuleRegistry.getEnforcing`), dodać `codegenConfig`
do `package.json`, uruchomić build, żeby Codegen wygenerował interfejsy, zaimplementować je w Kotlinie/Javie i Objective-C++/Swifcie, zarejestrować moduł (pakiet na Androidzie,
dostawca modułów na iOS), a potem zaimportować plik specyfikacji w JS i wywoływać jego metody.

### Co robi Codegen? {mid}

W czasie budowania parsuje typowaną specyfikację modułu albo komponentu i generuje natywne interfejsy oraz kod łączący w C++, który spina JS i kod natywny przez JSI. Obie strony są
generowane z jednej definicji, więc niezgodne typy są wykrywane w czasie budowania, a nie zawodzą w czasie działania. Typy muszą być obsługiwane i konkretne: w teście metoda zwracająca
`any` sprawiła, że Codegen zgłosił błąd „unsupported type annotation”.

### Czym różnią się synchroniczne i asynchroniczne metody natywne? {senior}

Metody synchroniczne (zwracające wartość bezpośrednio) działają w wątku JS i blokują go do powrotu kodu natywnego, co jest dopuszczalne tylko przy bardzo szybkich operacjach, jak
odczyt wartości z cache albo stałej. Metody asynchroniczne zwracają `Promise` i pozwalają kodowi natywnemu wykonać pracę gdzie indziej, zostawiając wątek JS wolnym. Wszystko, co
dotyczy I/O, sieci, dysku albo istotnych obliczeń, powinno być asynchroniczne.

### Jak wysyłać zdarzenia z kodu natywnego do JavaScriptu? {senior}

W specyfikacji Turbo Native Module deklaruje się właściwość emitera zdarzeń, np. `readonly onLevelChanged: CodegenTypes.EventEmitter<number>`, którą Codegen zamienia na typowany emiter
wywoływany po stronie natywnej; JS subskrybuje przez `const sub = Module.onLevelChanged(listener)` i przy sprzątaniu wywołuje `sub.remove()`. Starsze moduły używały
`NativeEventEmitter`/`RCTDeviceEventEmitter` z nazwami zdarzeń jako napisami. Subskrypcję zawsze usuwa się w funkcji sprzątającej `useEffect`, żeby uniknąć wycieków.

### Czym różni się `TurboModuleRegistry.get` od `getEnforcing`? {mid}

`getEnforcing` rzuca wyjątek, jeśli moduł nie jest zarejestrowany, co jest właściwe dla modułów, bez których aplikacja nie działa, i daje od razu jasny błąd („could not be found. Verify
that a module by this name is registered”). `get` zwraca `null`, co pasuje do modułów opcjonalnych albo istniejących tylko na jednej platformie, więc kod JS może to sprawdzić i użyć
rozwiązania zastępczego.

### Czym jest komponent natywny i czym różni się od modułu natywnego? {mid}

Moduł natywny udostępnia funkcje, stałe i zdarzenia (np. informacje o urządzeniu albo SDK płatności). Komponent natywny udostępnia natywny widok, który React renderuje i układa, z propsami,
zdarzeniami i poleceniami, np. mapę, podgląd kamery albo odtwarzacz wideo. W New Architecture komponenty to Fabric Native Components zdefiniowane specyfikacją propsów i zdarzeń
i generowane przez Codegen.

### Dlaczego można wybrać Expo Modules API zamiast pisać Turbo Module bezpośrednio? {mid}

Pozwala pisać moduły i widoki w Swifcie i Kotlinie zwięzłym deklaratywnym API, z mniejszą ilością szablonowego kodu i spójnym zachowaniem na obu platformach, a jest zbudowane na JSI
z obsługą New Architecture. Działa w każdej aplikacji React Native. Turbo Modules lepiej pasują, gdy chce się współdzielić kod C++ między platformami albo potrzeba kontroli na niższym
poziomie.

### Czym są config plugins? {senior}

To funkcje, które modyfikują konfigurację projektu natywnego w kroku prebuild w Expo: dodają uprawnienia i opisy użycia do Info.plist i AndroidManifest, zmieniają ustawienia Gradle
albo Podfile, dodają pliki natywne. Biblioteki wymagające konfiguracji natywnej dostarczają config plugins, które wpisuje się w konfigurację aplikacji, więc foldery `ios` i `android`
można w każdej chwili wygenerować od nowa zamiast edytować je ręcznie.

### Jakie są częste pułapki przy pisaniu modułów natywnych? {senior}

Blokowanie wątku JS wolnymi metodami synchronicznymi; wykonywanie pracy UI poza wątkiem głównym (natywne UI trzeba aktualizować w wątku głównym); wycieki listenerów albo zasobów
natywnych przez nieusunięte subskrypcje; niezgodność typów między specyfikacją a implementacją (której zapobiega Codegen); oraz zapominanie o różnicach platform, np. implementacja tylko
jednej platformy albo brak obsługi uprawnień. Kod natywny potrzebuje też własnych testów, bo testy jednostkowe JS widzą tylko mocki.
