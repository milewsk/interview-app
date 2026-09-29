# Lists: FlatList, SectionList and FlashList {mid}

Almost every app is a list: feeds, chats, search results, settings. Rendering 1,000 rows as native views would be slow and eat memory, so React Native provides **virtualized
lists**: `FlatList` and `SectionList` (built on `VirtualizedList`) render only a **window** of items around the viewport. Knowing how that window works, why items re-render (or
don't), and how to tune it is a classic mid-level interview topic.

## FlatList basics

```tsx
const renderItem = useCallback(({ item }: { item: Message }) => <MessageRow message={item} />, []);

<FlatList
  data={messages}
  keyExtractor={item => item.id}                         // stable, unique keys (default: item.key, then item.id, then index)
  renderItem={renderItem}
  ItemSeparatorComponent={Separator}
  ListHeaderComponent={<Header />}
  ListEmptyComponent={<Text>No messages</Text>}
  onEndReached={loadMore}                                // infinite scrolling
  onEndReachedThreshold={0.5}                            // in visible lengths from the end
  refreshing={isRefreshing}
  onRefresh={refresh}                                    // pull to refresh
/>
```

Verified in Jest with 1,000 items: `FlatList` rendered **10** items initially (`initialNumToRender` defaults to 10), while a `ScrollView` with `map` rendered all **1,000**.
`ListEmptyComponent` and `ListHeaderComponent` rendered for an empty list, and a `SectionList` with two sections rendered two headers and three items.

## Why items don't update: `extraData`

`FlatList` is a **`PureComponent`**: it re-renders only when its props change by reference. If the list depends on state that isn't in `data` (e.g. the selected ID), pass it as
**`extraData`**. Verified with a class component whose `data`, `renderItem` and `keyExtractor` were all stable:

- without `extraData`, pressing an item set `selected` but **the check mark didn't appear**;
- with `extraData={selected}`, it appeared.

With inline arrow functions (`keyExtractor={i => i.id}`) the list re-rendered anyway, because a new function is a new prop. That hides the bug but re-renders every visible item
on every parent render, which is exactly what memoizing `renderItem` and the row component (`React.memo`) is meant to avoid.

## Performance tuning

Defaults from the docs:

| Prop | Default | Effect |
|---|---|---|
| `initialNumToRender` | 10 | items in the first render; enough to fill the screen |
| `maxToRenderPerBatch` | 10 | items rendered per batch while scrolling |
| `updateCellsBatchingPeriod` | 50 ms | delay between batches |
| `windowSize` | 21 | rendered area in viewport heights (10 above, 10 below, 1 visible) |
| `removeClippedSubviews` | `true` on Android | detaches off-screen views from the native hierarchy |

- **`getItemLayout`** for fixed-height rows removes async measurement and makes `scrollToIndex` work immediately.
- Keep rows light: memoized components, no heavy work in render, small cached thumbnails instead of full-size images.
- Blank areas while scrolling fast mean the JS thread can't render fast enough: lighten rows, increase `windowSize`/batch sizes (costing memory and responsiveness), or switch
  to FlashList.

## FlashList

**FlashList** (Shopify) is a drop-in alternative that **recycles** item components instead of unmounting and mounting them: when an item leaves the viewport, the same component
instance is re-rendered with a different `item`. Version 2 is built for the New Architecture and **no longer needs `estimatedItemSize`** or other size estimates, and masonry
layouts are a `masonry` prop. The recycling caveat: **local `useState` in a row survives** into the next item it's reused for, so reset it (FlashList provides
`useRecyclingState`) or keep per-item state outside the row.

## Sources

- [FlatList](https://reactnative.dev/docs/flatlist)
- [SectionList](https://reactnative.dev/docs/sectionlist)
- [Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- [FlashList v2 changes](https://shopify.github.io/flash-list/docs/v2-changes)
- [FlashList: recycling](https://shopify.github.io/flash-list/docs/recycling)

## Questions

### Why use `FlatList` instead of mapping items inside a `ScrollView`? {junior}

`ScrollView` renders every child immediately: in a test, 1,000 items meant 1,000 rendered rows, which costs startup time and memory for native views. `FlatList` virtualizes: it
initially renders 10 items and then keeps only a window around the viewport mounted, rendering more in batches as you scroll. It also provides separators, headers, empty states,
pull-to-refresh and infinite scrolling.

### What is `keyExtractor` and why does it matter? {junior}

It returns a unique, stable key for each item, used as the React key and for caching measurements. By default the list uses `item.key`, then `item.id`, then the index. Index keys
break when items are inserted, removed or reordered: React reuses the wrong rows and state or animations jump to other items. Use a real ID from the data.

### What is `extraData` for? {mid}

`FlatList` is a `PureComponent`, so it re-renders only when its props change by reference. If rows depend on something outside `data`, such as the selected item or a filter, the list
won't know it changed. Passing that value as `extraData` makes the list re-render. In a test with stable props, the selection mark didn't appear without `extraData` and did with it.

### Why can inline functions in `renderItem` hurt list performance? {mid}

A new function is created on every render of the parent, so `FlatList`'s props change and it re-renders every visible row, even if the data didn't change. Wrapping `renderItem` in
`useCallback`, defining `keyExtractor` outside the component, and memoizing the row component with `React.memo` keeps unchanged rows from re-rendering. Remember to pass
`extraData` when you do this and the rows depend on other state.

### What does `getItemLayout` do? {mid}

It tells the list each item's length and offset upfront (`({ length: 72, offset: 72 * index, index })`), so it doesn't have to measure rows asynchronously after rendering. This
speeds up rendering, avoids layout jumps and lets `scrollToIndex` and `initialScrollIndex` jump to items that haven't been rendered yet. It's only possible when rows have a fixed or
computable size.

### How do you implement infinite scrolling and pull to refresh? {mid}

Use `onEndReached` with `onEndReachedThreshold` (how far from the end, in visible lengths, to trigger it) to load the next page, guarding against duplicate calls while a request is in
flight, and show a spinner in `ListFooterComponent`. For pull to refresh, pass `refreshing` and `onRefresh` (or a `RefreshControl`). Libraries like TanStack Query's
`useInfiniteQuery` handle pages, loading states and deduplication.

### What do `windowSize`, `initialNumToRender` and `maxToRenderPerBatch` control? {senior}

`initialNumToRender` (default 10) is the number of items in the first render, which should just fill the screen. `maxToRenderPerBatch` (10) and `updateCellsBatchingPeriod` (50 ms)
control how many items are rendered per batch while scrolling and how often. `windowSize` (21) is the mounted area measured in viewport heights. Bigger values reduce blank areas but
increase memory use and JS work; smaller values do the opposite.

### How does FlashList differ from FlatList? {mid}

FlatList unmounts items that leave the render window and mounts new ones, which creates and destroys components and native views while scrolling. FlashList recycles: an item
component that scrolls out of view is re-rendered with a new item's data, which is cheaper and reduces blank cells. FlashList v2 is built for the New Architecture and doesn't need
size estimates. The API is almost the same, so switching is usually easy.

### What is the pitfall of local state in recycled list items? {senior}

With recycling, the same component instance shows different items over time, so `useState` in a row keeps the value set for a previous item: an "expanded" flag or a text input's
value can appear on an unrelated row. Keep per-item state keyed by item ID outside the row (in the parent or a store), or use FlashList's `useRecyclingState`, which resets state when
the item changes.

### When would you use `SectionList`? {junior}

When data is grouped under headers, such as contacts by letter, settings groups or messages by date. It takes `sections` (each with its own `data` and extra fields like `title`),
`renderItem` and `renderSectionHeader`, supports sticky headers (default on iOS), and has the same virtualization and performance props as `FlatList`.
