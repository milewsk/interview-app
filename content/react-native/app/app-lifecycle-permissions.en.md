# App lifecycle, permissions and notifications {mid}

Mobile apps don't just open and close: they go to the **background**, get **suspended** or killed by the OS, come back through **notifications and links**, and must ask for
**permissions** before using the camera, location or notifications. Web developers rarely deal with this, so it's a frequent source of mid-level interview questions.

## App state

`AppState.currentState` and the `change` event report:

- **`active`**: in the foreground;
- **`background`**: another app, the home screen, or (Android) another activity such as a system picker;
- **`inactive`** (**iOS only**): transitions, the app switcher, Notification Center, an incoming call.

Android also emits `focus`/`blur` (e.g. when the notification drawer is pulled down, the state stays `active` but `blur` fires), and iOS emits `memoryWarning`.

```ts
useEffect(() => {
  const sub = AppState.addEventListener('change', state => {
    if (state === 'active') refreshData();          // coming back to the foreground
    else pauseVideo();
  });
  return () => sub.remove();
}, []);
```

Typical uses: refetch data or check auth when returning to the foreground (TanStack Query's `focusManager`), pause media and timers, save drafts, hide sensitive content in the app
switcher. Once in the background, **JS may stop running** at any moment, and the OS can kill the app entirely to free memory, so persist important state early.

## Android back button

`BackHandler.addEventListener('hardwareBackPress', handler)` registers a handler; handlers run **from the most recently added**, returning `true` consumes the press. Verified in
Jest (Android platform): with a screen handler returning `false` and a modal handler returning `true`, a press called only the modal handler; after removing it, the screen handler ran
and then **`exitApp`** was called; with no handlers, the press called `exitApp` directly. Navigation libraries register their own handler to go back in the stack.

## Links into the app

`Linking.getInitialURL()` returns the URL that launched the app, the `url` event delivers links while it's running, `Linking.openURL()` opens other apps (`tel:`, `mailto:`, `https:`),
and `Linking.openSettings()` opens the app's system settings (needed after a permanent permission denial). Navigation libraries wire deep links for you.

## Permissions

- **Android**: dangerous permissions (camera, location, contacts, notifications on Android 13+) must be declared in `AndroidManifest.xml` **and** requested at runtime.
  `PermissionsAndroid.request` returns `granted`, `denied` or **`never_ask_again`**, after which the system dialog no longer appears and the user must enable it in settings.
- **iOS**: each protected resource needs a **usage description** string in Info.plist (e.g. `NSCameraUsageDescription`), shown in the system prompt; the prompt appears only once,
  and later changes happen in Settings.
- Best practice: ask **in context** (when the user taps "Scan"), explain why first, handle denial gracefully, and offer a link to settings. Libraries such as Expo modules
  (`requestPermissionsAsync`) or `react-native-permissions` unify both platforms.

## Push notifications

Remote notifications go through **APNs** (Apple) and **FCM** (Google). The app asks for permission, gets a device token, and sends it to your server, which sends notifications through
the providers (or through the Expo push service, which forwards to them with an Expo push token). Android requires a **notification channel**, and Android 13+ requires the
`POST_NOTIFICATIONS` runtime permission. Expo's docs say push can be tested on physical devices, Android emulators with Google Play services, or iOS simulators with Xcode 14+. Handle
three cases: notification received in the foreground, tapped while in the background, and tapped when the app was killed (opening the right screen through a deep link).

## Background work

Background execution is strictly limited. `expo-background-task` uses **WorkManager** on Android (minimum interval **15 minutes**) and **BGTaskScheduler** on iOS, and the **OS decides
when tasks run**; on iOS, swiping the app away in the app switcher terminates it and stops its background tasks until the next launch. For guaranteed delivery of important events, use
push notifications and server-side logic instead of polling in the background.

## Sources

- [AppState](https://reactnative.dev/docs/appstate)
- [BackHandler](https://reactnative.dev/docs/backhandler)
- [Linking](https://reactnative.dev/docs/linking)
- [PermissionsAndroid](https://reactnative.dev/docs/permissionsandroid)
- [Expo push notifications setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [BackgroundTask (Expo)](https://docs.expo.dev/versions/latest/sdk/background-task/)

## Questions

### What states can a React Native app be in? {junior}

`active` (in the foreground), `background` (the user is in another app or on the home screen, or on Android another activity is on top), and on iOS only `inactive`, a transitional state
during the app switcher, Notification Center or an incoming call. `AppState.currentState` gives the current value and the `change` event reports changes; subscriptions are removed with
`subscription.remove()`.

### What would you do when the app returns to the foreground? {mid}

Refresh data that may be stale (TanStack Query's `focusManager` can do it automatically), check that the session or token is still valid, resume media or timers, re-check permissions the
user may have changed in Settings, and handle any pending deep link or notification. Keep the work light, since it runs every time the user switches back.

### Why can't you rely on JavaScript running in the background? {mid}

When an app goes to the background, the OS suspends it after a short time to save battery and can kill it entirely under memory pressure, without notice. Timers and JS work stop. Save
important state as soon as the app leaves the foreground (or continuously), and use platform mechanisms for background work: push notifications, scheduled background tasks (which the OS
runs when it decides) or specialized APIs for location, audio and downloads.

### How does the Android back button work in React Native? {mid}

Handlers registered with `BackHandler.addEventListener('hardwareBackPress', ...)` are called from the most recently added; the first one returning `true` consumes the event, and if none
does, the default behavior runs and exits the app (`exitApp`). In a test, a modal handler returning `true` stopped the press; after removing it, the screen handler returned `false` and the
app exited. Navigation libraries handle back navigation, so custom handlers are for special cases and should be active only while the screen is focused.

### How do runtime permissions differ between iOS and Android? {mid}

On Android, dangerous permissions must be declared in the manifest and requested at runtime; the result can be `granted`, `denied` or `never_ask_again`, after which only the settings screen
can grant it. On iOS, every protected resource needs a usage description in Info.plist, shown in the prompt, and the prompt is displayed only once. Both platforms let users change
permissions in settings at any time, so check the status before use.

### What should you do when a user permanently denies a permission? {mid}

Don't block the app or keep asking: explain what the feature needs and why, offer an alternative flow if possible, and provide a button that opens the app's settings with
`Linking.openSettings()`. When the app returns to the foreground, check the permission again, since the user may have enabled it.

### How do push notifications work in a React Native app? {mid}

The app requests notification permission, obtains a push token (a device token from APNs/FCM, or an Expo push token) and sends it to your backend with the user's ID. The backend sends a
notification through APNs/FCM (directly or via a service like Expo's), which delivers it to the device. The app handles notifications received in the foreground, and taps that open it from
the background or a killed state, typically navigating to a screen through the notification's data. Android also needs a notification channel.

### Why must you declare usage descriptions on iOS? {junior}

iOS requires every app that accesses protected resources (camera, microphone, location, photos, contacts) to explain why, with a string in Info.plist that appears in the permission prompt.
Accessing the resource without it makes the system terminate the app, and App Review rejects vague descriptions. In Expo, you set them in the app config or through config plugins.

### How do you run tasks in the background? {senior}

Use platform schedulers through libraries like `expo-background-task`: WorkManager on Android (minimum 15-minute interval) and BGTaskScheduler on iOS, where the OS decides when and
whether tasks run, and a user swiping the app away on iOS stops them. Tasks must be short and idempotent. For time-critical updates, send push notifications from the server; for
continuous work like navigation, audio or uploads, use the dedicated background modes and APIs.

### How do you handle opening the app from a notification? {senior}

Attach data (e.g. a URL or screen and ID) to the notification. When the user taps it, handle three cases: app in the foreground (a listener receives it), app in the background (a
response listener fires), and app killed (read the last notification response or initial URL at startup). Route through the navigation library's deep linking, and wait until navigation and
authentication are ready before navigating.
