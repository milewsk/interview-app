# Expo, builds and releases {mid}

**Expo** is a framework and set of services around React Native: SDK modules (camera, notifications, file system...), **Expo Router**, config-driven native projects,
development builds, and cloud services (**EAS Build, Submit, Update**). The React Native docs recommend starting new apps with a framework, and Expo is the default choice today.
Interview questions focus on Expo Go vs development builds, what "prebuild" does, and what can be shipped **over the air**.

## Versions move together

An **Expo SDK** pins a React Native version and compatible library versions. Checked: a new SDK 57 project (`create-expo-app`) uses **React Native 0.86.3** and React 19.2 while
RN 0.87 is already out, since SDKs follow RN with a delay. `npx expo install <package>` installs the version matching the SDK, and `npx expo install --check` reports mismatches: after
installing `react-native-reanimated@4.7.0` manually, it reported "expected version: 4.5.1".

## Expo Go vs development builds

- **Expo Go** is a prebuilt app from the stores with a **fixed set of native libraries**: great for learning and prototypes, but you can't add custom native code or change native
  configuration.
- A **development build** is "your own version of Expo Go" (with `expo-dev-client`): any native libraries and config. You rebuild it only when native things change (installing a
  library with native code, changing the app config, upgrading the SDK); JS changes just need `npx expo start`.

## Continuous Native Generation (prebuild)

The `android/` and `ios/` folders are **generated** from `app.json`/`app.config.ts` and **config plugins** by `npx expo prebuild`, and new projects ignore them in git. Verified on
Windows (which generated only `android/`): adding `android.permissions: ["android.permission.CAMERA"]` and `scheme: "expoapp"` to `app.json` produced a `CAMERA` permission and an
intent filter for `expoapp://` in `AndroidManifest.xml`, and `gradle.properties` contained `newArchEnabled=true`, `hermesEnabled=true` and `edgeToEdgeEnabled=true`. Upgrading becomes
"update dependencies and the config, then `prebuild --clean`" instead of merging native template changes by hand. Projects can also commit and edit native folders directly
(the "bare" workflow) and still use Expo modules.

## Building, submitting, updating

- **EAS Build** builds signed binaries in the cloud (or locally with `--local`) from build profiles in `eas.json` (development, preview, production), managing credentials
  (keystores, certificates, provisioning profiles).
- **EAS Submit** uploads builds to App Store Connect and Google Play.
- `npx expo export` produces the JS bundle and assets; verified for Android: the bundle was emitted as Hermes bytecode (`index-<hash>.hbc`, 1.4 MB).
- **EAS Update** delivers **over-the-air (OTA) updates** of JS and assets to installed apps, published to **channels/branches**, with rollbacks by republishing a previous update. It
  **can't** change native code or dependencies, permissions or the SDK version. A **runtime version** (policies such as `appVersion` or `fingerprint`) ties updates to compatible
  native builds; an update needing native code that the build doesn't have would crash or roll back. Store rules still apply: OTA updates must not change the app's purpose.

## Without Expo

The React Native Community CLI (`npx @react-native-community/cli init`) creates a project with committed native folders that you maintain yourself; upgrades use the Upgrade Helper
diff. It suits teams with strong native expertise or brownfield apps (RN inside an existing native app), though Expo modules and EAS can be used there as well.

## Sources

- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- [Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)
- [Get started with React Native (frameworks)](https://reactnative.dev/docs/environment-setup)

## Questions

### What is Expo and why is it the recommended way to start? {junior}

Expo is a framework around React Native with a large SDK of native modules, file-based routing (Expo Router), generated native projects driven by configuration, development builds, and
cloud services for building, submitting and updating apps. It removes most native setup and upgrade work, so teams focus on the app. The React Native docs recommend starting with a
framework, and Expo is the main one.

### What is the difference between Expo Go and a development build? {junior}

Expo Go is a single app from the stores that can run your JS but contains only a fixed set of native libraries and configuration, so custom native code, many third-party native libraries and
native config changes don't work there. A development build is your own app binary with `expo-dev-client`, including exactly the native code your project needs, while keeping fast JS
iteration. Real projects use development builds; Expo Go is for learning and quick prototypes.

### When do you need a new native build and when is a JS update enough? {mid}

A new build is needed when anything native changes: adding or updating a library with native code, changing permissions or app config, upgrading the Expo SDK or React Native version.
Changes to JavaScript, TypeScript and assets only need a Metro reload in development, and in production can be delivered as an OTA update to builds with a compatible runtime version.

### What does `npx expo prebuild` do? {mid}

It generates the `android` and `ios` native projects from a template plus your app config and config plugins (permissions, schemes, icons, splash screen, native settings), which is called
Continuous Native Generation. Native folders become build artifacts you can delete and regenerate (`--clean`) rather than code you maintain, so upgrades and native changes are
reproducible. In a test, a camera permission and URL scheme defined in `app.json` appeared in the generated Android manifest.

### What are over-the-air updates and what are their limits? {mid}

OTA updates (EAS Update, or similar services) download a new JS bundle and assets to an installed app, so fixes reach users without a store release. They can't change native code, native
dependencies, permissions or the SDK version, which need a new binary. Store policies allow them as long as the app's purpose doesn't change. Use channels to target builds, staged
rollouts, and republishing of a previous update as a rollback.

### What is a runtime version? {senior}

A value that marks which native build an update is compatible with: an update is only delivered to builds with the same runtime version. Policies like `appVersion` (tied to the app
version) or `fingerprint` (a hash of everything affecting native code) set it automatically. If an update needing a new native module were sent to an old build, JS would call native code
that doesn't exist, causing crashes; the runtime version prevents that.

### How do you keep dependency versions compatible in an Expo project? {mid}

Install libraries with `npx expo install`, which picks the version matching your SDK, and run `npx expo install --check` (or `expo-doctor`) to find mismatches: in a test, manually
installing a newer Reanimated made the check report the expected version for the SDK. Upgrade the SDK as a unit with `npx expo install expo@<version> --fix`, then regenerate native
projects.

### How does EAS Build handle signing? {mid}

Build profiles in `eas.json` define development, preview and production builds. EAS can generate and store credentials (Android keystore, iOS distribution certificate and provisioning
profiles) or use your own, and builds signed binaries in the cloud or locally, then EAS Submit uploads them to the stores. Keeping credentials managed centrally avoids lost keystores,
which would prevent updating an Android app.

### When would you not use Expo's managed native generation? {senior}

When the team maintains substantial custom native code that's hard to express as config plugins, in brownfield apps where React Native is embedded in an existing native app, or with
build systems that require committed native projects. Even then, you can use Expo modules, EAS Build and EAS Update in a "bare" project with committed `android` and `ios` folders;
the trade-off is handling native template changes during upgrades yourself.

### How do you manage environments (dev, staging, production)? {mid}

Use a dynamic `app.config.ts` that reads environment variables to set the app name, bundle identifier, icons and API URLs per variant, EAS build profiles that set those variables, and
separate update channels per environment. Public values can be exposed to JS with the `EXPO_PUBLIC_` prefix; secrets must stay out of the app, since anything bundled can be read.
