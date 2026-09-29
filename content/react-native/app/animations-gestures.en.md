# Animations and gestures {senior}

Smooth animations and gestures are what make an app feel native. The core question is **which thread runs the animation**: if every frame is computed in JavaScript, a busy JS
thread makes the animation stutter. React Native offers the built-in **`Animated`** API (with the **native driver**) and `LayoutAnimation`; most production apps use **Reanimated**
and **Gesture Handler** from Software Mansion, which run animations and gesture tracking on the **UI thread**.

## Animated

```tsx
const opacity = useRef(new Animated.Value(0)).current;

useEffect(() => {
  Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
}, []);

const rotate = progress.interpolate({ inputRange: [0, 100], outputRange: ['0deg', '180deg'] });
<Animated.View style={{ opacity, transform: [{ rotate }] }} />
```

- Values (`Animated.Value`), drivers (`timing`, `spring`, `decay`), composition (`sequence`, `parallel`, `stagger`, `loop`) and `interpolate` for mapping ranges, including colors and
  angles; `extrapolate: 'clamp'` stops values outside the range.
- Verified in Jest with fake timers: a linear 300 ms `timing` from 0 to 100 was at **50** after 150 ms (opacity 0.50, rotation `90deg`), finished with `finished: true`; a clamped
  interpolation stayed at 10; a `sequence` ran the second animation after the first; and `stopAnimation` after 100 ms of a 1 s animation called the start callback with
  **`finished: false`** and reported the current value.
- **`useNativeDriver: true`** sends the animation to the native side once, and frames are computed on the UI thread, so it keeps running when the JS thread is busy. In RN 0.87
  the native driver allows only non-layout properties: `transform`, `opacity`, colors, border radii, `elevation`, `zIndex`, `filter` and a few more (from the source's allowlist);
  animating `width`, `top` or `margin` with it is rejected ("Style property ... is not supported by native animated module"). RN 0.85 introduced a new shared animation backend
  that allows layout props, but in 0.87 it's still an **experimental opt-in** (feature flag off by default).
- `Animated.event` maps scroll or gesture events directly to values (`onScroll` with `useNativeDriver: true` for collapsing headers).
- **`LayoutAnimation`** animates the next layout change automatically ("fire and forget"), handy for expanding or reordering items.

## Reanimated

```tsx
const offset = useSharedValue(0);
const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));   // a worklet, runs on the UI thread
<Animated.View style={style} />
offset.value = withSpring(100);
```

**Shared values** live on the UI thread, and **worklets** (functions marked by the Babel plugin) run there, so animations and gesture-driven updates don't touch the JS thread.
Reanimated 4 works **only on the New Architecture**, requires the separate **`react-native-worklets`** package with its Babel plugin (`react-native-worklets/plugin`, listed last),
and adds **CSS-like animations and transitions**. Layout animations (`entering`, `exiting`, `layout`) animate mounting, unmounting and position changes.

## Gesture Handler

Gesture Handler recognizes gestures **natively on the UI thread** instead of through the JS responder system (`PanResponder`), which makes them smooth and lets them cooperate with
native scroll views. Version 3 (RN 0.82+) has hook-based gestures:

```tsx
const pan = usePanGesture({
  onUpdate: e => { offset.value = e.translationX; },       // worklet on the UI thread with Reanimated
  onDeactivate: () => { offset.value = withSpring(0); },
});
<GestureDetector gesture={pan}><Animated.View style={style} /></GestureDetector>
```

Hooks exist for tap, pan, pinch, rotation, fling, long press, hover and native gestures, with `onBegin`, `onActivate`, `onUpdate`, `onDeactivate` and `onFinalize` callbacks, and
composition hooks `useSimultaneousGestures`, `useExclusiveGestures` and `useCompetingGestures` (e.g. pinch and rotate at the same time, double tap before single tap). The app root
needs `GestureHandlerRootView`. The older `Gesture.Pan()` builder API is still exported.

## Sources

- [Animations (React Native)](https://reactnative.dev/docs/animations)
- [Animated](https://reactnative.dev/docs/animated)
- [LayoutAnimation](https://reactnative.dev/docs/layoutanimation)
- [React Native 0.85: New Animation Backend](https://reactnative.dev/blog/2026/04/07/react-native-0.85)
- [Reanimated: getting started](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/)
- [React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler)

## Questions

### What does `useNativeDriver: true` do? {mid}

It serializes the animation configuration and sends it to the native side before it starts, so each frame is calculated and applied on the UI thread without going through JavaScript.
The animation stays smooth even when the JS thread is busy (e.g. rendering a new screen). The limitation is that only non-layout properties are supported by default: `transform`,
`opacity`, colors and a few others, not `width`, `height`, `top` or `margin`.

### Why can't you animate `width` with the native driver, and what do you do instead? {mid}

Layout properties require recalculating layout (Yoga) for the view and its siblings on every frame, which the classic native animated module doesn't do, so they're rejected with "not
supported by native animated module". Use `transform: [{ scaleX }]` or `translateX` instead, animate with `useNativeDriver: false` on the JS thread for small cases, use
`LayoutAnimation`, or Reanimated. RN 0.85 added an experimental backend that allows layout props with the native driver, but it's opt-in.

### What is the difference between Animated and Reanimated? {mid}

Animated is built into React Native: animations are declared in JS and, with the native driver, run on the UI thread, but only for supported properties, and logic during the animation
(reacting to gestures, conditions) runs in JS. Reanimated runs worklets on the UI thread with shared values, so animation logic, gesture handling and style calculations all stay off the
JS thread, supports any style property, and adds layout animations and CSS-style animations. Most complex, gesture-driven interactions use Reanimated.

### What are worklets and shared values? {senior}

A worklet is a JavaScript function that the Babel plugin prepares so it can run in a separate runtime on the UI thread (for example the function passed to `useAnimatedStyle` or a
gesture callback). Shared values (`useSharedValue`) hold data accessible from both the JS thread and the UI thread; reading and writing `.value` inside worklets updates animations without a
React render. Worklets can't directly use JS-thread values or call JS functions except through explicit helpers (`scheduleOnRN` / `runOnJS`-style APIs).

### Why use Gesture Handler instead of `PanResponder`? {mid}

`PanResponder` runs in the JS responder system: every touch move goes through the JS thread, so gestures lag when JS is busy, and they conflict with native scroll views. Gesture Handler
recognizes gestures natively on the UI thread, cooperates with native components (scroll views, buttons), supports composing gestures (simultaneous, exclusive), and with Reanimated
updates the UI directly on the UI thread for smooth dragging, swiping and pinching.

### How do you combine multiple gestures? {senior}

With composition: in Gesture Handler 3, `useSimultaneousGestures` lets gestures be active together (pinch and rotate on a photo), `useExclusiveGestures` gives priority in order
(double tap wins over single tap), and `useCompetingGestures` lets the first one to activate cancel the others. Relations with gestures outside the detector (e.g. a parent scroll view) can
also be configured so a horizontal swipe doesn't block vertical scrolling.

### When is `LayoutAnimation` useful? {mid}

When you want the next layout change animated automatically without animating individual values: expanding an accordion, inserting or removing list items, reordering. You call
`LayoutAnimation.configureNext(...)` before the state update, and native code animates views to their new positions and sizes. It's "fire and forget", with no control during the
animation and no interruption; Reanimated's layout animations give more control.

### How do you animate a header based on scroll position? {mid}

Map the scroll offset to an animated value and interpolate header styles from it. With Animated: `onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}` on an
`Animated.ScrollView` or `Animated.FlatList`, then `translateY` and `opacity` interpolated from `scrollY` with `extrapolate: 'clamp'`. With Reanimated: `useAnimatedScrollHandler` and
`useAnimatedStyle`. Both keep the animation on the UI thread.

### What happens to an animation that is interrupted? {mid}

Calling `stop()` or `stopAnimation()`, or starting a new animation on the same value, stops the running one and calls its completion callback with `finished: false` (in a test, a 1 s
animation stopped after 100 ms reported `finished: false` and its current value). Completion callbacks should check `finished` before, for example, navigating or unmounting, and
spring animations can continue smoothly from the current value and velocity.

### How do you test components with animations? {senior}

Use Jest fake timers to advance time and check values or final state, as `Animated` animations run on timers in the test environment (in a test, advancing 150 ms of a 300 ms linear
animation gave the halfway value). Reanimated and Gesture Handler provide Jest setup and utilities (such as mocks and helpers to fire gestures). Visual smoothness itself can't be
tested in Jest; check it on devices, ideally low-end ones, with the performance monitor.
