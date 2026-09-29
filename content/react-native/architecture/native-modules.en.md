# Native modules and native components {senior}

JavaScript can't call platform APIs by itself. When no library covers what you need (a proprietary SDK, a device feature, heavy processing), you write a **native module**
(functions and events exposed to JS) or a **native component** (a native view rendered by React). In the New Architecture this means **Turbo Native Modules** and **Fabric Native
Components** defined by a **typed spec** that **Codegen** turns into glue code, or the higher-level **Expo Modules API** in Swift and Kotlin.

## Turbo Native Module: the spec

```ts
// specs/NativeDeviceInfo.ts: the file name must start with "Native"
import type { TurboModule, CodegenTypes } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getBatteryLevel(): number;                                   // synchronous call through JSI
  getDeviceName(): Promise<string>;                            // asynchronous
  setFlag(name: string, value: boolean): void;
  readonly onLevelChanged: CodegenTypes.EventEmitter<number>;  // events from native to JS
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceInfo');
```

Then `codegenConfig` in `package.json` tells Codegen where the specs are (`jsSrcsDir`), the library name, the Android package and the iOS module provider. You implement the
generated interface in **Kotlin/Java** (plus a package registered in the app) and **Objective-C++/Swift** (`.mm` files, `getTurboModule`).

Verified with `@react-native/codegen` 0.87:

- the spec above produced a `NativeModule` schema with typed methods (`NumberTypeAnnotation`, `PromiseTypeAnnotation`, `VoidTypeAnnotation`) and an `EventEmitterTypeAnnotation`
  for `onLevelChanged`;
- a spec with a method returning `any` **failed**: "TypeScript type annotation 'TSAnyKeyword' is unsupported in NativeModule specs". Types must be concrete so both sides can be
  generated;
- `TurboModuleRegistry.getEnforcing('NativeDoesNotExist')` threw "could not be found. Verify that a module by this name is registered", while `TurboModuleRegistry.get` returned
  `null`, so use `get` for optional modules.

## Sync vs async

JSI makes **synchronous** methods possible, which is great for fast lookups (a cached value, a device constant) but dangerous for slow work: a synchronous call blocks the JS
thread until native returns. Use `Promise` for I/O, network, or anything that can take time, and events for streams of updates.

## Native components

A **Fabric Native Component** exposes a native view (a map, a video player, a chart) as a React component: a spec file declares its props (with Codegen types such as `Int32`,
`Double`, `WithDefault`) and events, and native code implements the view. Commands (imperative calls such as `play()`) are declared separately.

## Expo Modules API

Expo Modules let you write modules and views in **Swift and Kotlin** with a declarative DSL (`Name`, `Function`, `AsyncFunction`, `Events`, `View`), built on JSI and supporting the
New Architecture. They work in any React Native app, not only Expo-managed ones. Expo's docs suggest Turbo Modules mainly when you need **C++**; otherwise the Expo API is usually
simpler. **Config plugins** complement them by modifying native project files (Info.plist, AndroidManifest, Gradle) during prebuild, so native setup stays reproducible.

Other options: **Nitro Modules** (Margelo), a JSI-based framework with its own code generator focused on performance, and plain **C++ Turbo Modules** shared by both platforms.

## Sources

- [Turbo Native Modules: introduction](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [Fabric Native Components: introduction](https://reactnative.dev/docs/fabric-native-components-introduction)
- [Codegen](https://reactnative.dev/docs/the-new-architecture/what-is-codegen)
- [Expo Modules API overview](https://docs.expo.dev/modules/overview/)
- [Nitro Modules](https://nitro.margelo.com/)

## Questions

### When do you need a native module? {junior}

When JavaScript and existing libraries can't do what you need: calling a platform API that RN or the ecosystem doesn't expose, integrating a native SDK (payments, analytics, a
hardware vendor), using a native UI component, or moving heavy computation (image processing, cryptography) to native code. Before writing one, check whether a maintained library
or an Expo module already exists.

### What steps are needed to create a Turbo Native Module? {mid}

Write a typed spec in TypeScript or Flow (a `Native*` file with an interface extending `TurboModule` and a `TurboModuleRegistry.getEnforcing` call), add `codegenConfig` to
`package.json`, run the build so Codegen generates the interfaces, implement them in Kotlin/Java and Objective-C++/Swift, register the module (a package on Android, a module provider on
iOS), and then import the spec file in JS and call its methods.

### What does Codegen do? {mid}

It parses the typed spec of a module or component at build time and generates the native interfaces and C++ glue that connect JS and native code through JSI. Both sides are generated
from one definition, so mismatched types are caught at build time instead of failing at runtime. Types must be supported and concrete: in a test, a method returning `any` made Codegen
fail with an "unsupported type annotation" error.

### What's the difference between synchronous and asynchronous native methods? {senior}

Synchronous methods (returning a value directly) run on the JS thread and block it until native code returns, which is only acceptable for very fast operations such as reading a
cached value or a constant. Asynchronous methods return a `Promise` and let native code do the work elsewhere, keeping the JS thread free. Anything involving I/O, the network, disk or
significant computation should be asynchronous.

### How do you send events from native code to JavaScript? {senior}

In a Turbo Native Module spec you declare an event emitter property, e.g. `readonly onLevelChanged: CodegenTypes.EventEmitter<number>`, which Codegen turns into a typed emitter the
native side calls; JS subscribes with `const sub = Module.onLevelChanged(listener)` and calls `sub.remove()` on cleanup. Older modules used `NativeEventEmitter`/`RCTDeviceEventEmitter` with
string event names. Always unsubscribe in a `useEffect` cleanup to avoid leaks.

### What is the difference between `TurboModuleRegistry.get` and `getEnforcing`? {mid}

`getEnforcing` throws if the module isn't registered, which is right for modules the app can't work without and gives an immediate, clear error ("could not be found. Verify that a
module by this name is registered"). `get` returns `null`, which suits optional modules or ones that exist only on one platform, so the JS code can check and fall back.

### What is a native component and how is it different from a native module? {mid}

A native module exposes functions, constants and events (e.g. device info or a payment SDK). A native component exposes a native view that React renders and lays out, with props,
events and commands, such as a map, a camera preview or a video player. In the New Architecture, components are Fabric Native Components defined by a spec of their props and events
and generated with Codegen.

### Why might you choose the Expo Modules API over writing a Turbo Module directly? {mid}

It lets you write modules and views in Swift and Kotlin with a concise declarative API, less boilerplate and consistent behavior across platforms, and it's built on JSI with New
Architecture support. It works in any React Native app. Turbo Modules are the better fit when you want to share C++ code between platforms or need lower-level control.

### What are config plugins? {senior}

Functions that modify native project configuration during Expo's prebuild step: adding permissions and usage descriptions to Info.plist and AndroidManifest, changing Gradle or Podfile
settings, adding native files. Libraries with native setup ship config plugins, and you list them in the app config, so the `ios` and `android` folders can be regenerated at any time
instead of being edited by hand.

### What are common pitfalls when writing native modules? {senior}

Blocking the JS thread with slow synchronous methods; doing UI work off the main thread (native UI must be updated on the main thread); leaking listeners or native resources because
subscriptions aren't cleaned up; mismatched types between the spec and the implementation (avoided by Codegen); and forgetting platform differences, e.g. implementing only one platform
or not handling permissions. Native code also needs its own tests, since JS unit tests only see mocks.
