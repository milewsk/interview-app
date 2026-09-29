# Listy: FlatList, SectionList i FlashList {mid}

Prawie każda aplikacja to lista: feedy, czaty, wyniki wyszukiwania, ustawienia. Wyrenderowanie 1000 wierszy jako natywnych
widoków byłoby wolne i zjadałoby pamięć, więc React Native dostarcza **listy wirtualizowane**: `FlatList` i `SectionList`
(zbudowane na `VirtualizedList`) renderują tylko **okno** elementów wokół widocznego obszaru. Wiedza o tym, jak działa to okno,
dlaczego elementy się przerenderowują (albo nie) i jak je stroić, to klasyczny temat rozmów na poziomie mid.

## Podstawy FlatList

```tsx
const renderItem = useCallback(({ item }: { item: Message }) => <MessageRow message={item} />, []);

<FlatList
  data={messages}
  keyExtractor={item => item.id}                         // stabilne, unikalne klucze (domyślnie item.key, potem item.id, potem indeks)
  renderItem={renderItem}
  ItemSeparatorComponent={Separator}
  ListHeaderComponent={<Header />}
  ListEmptyComponent={<Text>No messages</Text>}
  onEndReached={loadMore}                                // nieskończone przewijanie
  onEndReachedThreshold={0.5}                            // w długościach widocznego obszaru od końca
  refreshing={isRefreshing}
  onRefresh={refresh}                                    // pull to refresh
/>
```

Sprawdzone w Jest z 1000 elementów: `FlatList` wyrenderował na początku **10** elementów (`initialNumToRender` ma domyślnie 10),
a `ScrollView` z `map` wyrenderował wszystkie **1000**. `ListEmptyComponent` i `ListHeaderComponent` wyrenderowały się dla
pustej listy, a `SectionList` z dwiema sekcjami wyrenderował dwa nagłówki i trzy elementy.

## Dlaczego elementy się nie aktualizują: `extraData`

`FlatList` to **`PureComponent`**: przerenderowuje się tylko wtedy, gdy jego propsy zmieniają się referencyjnie. Jeśli lista
zależy od stanu, którego nie ma w `data` (np. identyfikatora zaznaczonego elementu), trzeba go przekazać jako **`extraData`**.
Sprawdzone na komponencie klasowym, w którym `data`, `renderItem` i `keyExtractor` były stabilne:

- bez `extraData` naciśnięcie elementu ustawiło `selected`, ale **znacznik się nie pojawił**;
- z `extraData={selected}` się pojawił.

Z funkcjami strzałkowymi w miejscu (`keyExtractor={i => i.id}`) lista i tak się przerenderowała, bo nowa funkcja to nowy prop.
To ukrywa błąd, ale przerenderowuje każdy widoczny element przy każdym renderze rodzica, a właśnie tego ma unikać memoizacja
`renderItem` i komponentu wiersza (`React.memo`).

## Strojenie wydajności

Wartości domyślne z dokumentacji:

| Prop | Domyślnie | Efekt |
|---|---|---|
| `initialNumToRender` | 10 | elementy w pierwszym renderze; tyle, żeby wypełnić ekran |
| `maxToRenderPerBatch` | 10 | elementy renderowane w jednej partii podczas przewijania |
| `updateCellsBatchingPeriod` | 50 ms | odstęp między partiami |
| `windowSize` | 21 | renderowany obszar w wysokościach ekranu (10 powyżej, 10 poniżej, 1 widoczny) |
| `removeClippedSubviews` | `true` na Androidzie | odłącza niewidoczne widoki od natywnej hierarchii |

- **`getItemLayout`** dla wierszy o stałej wysokości usuwa asynchroniczne mierzenie i sprawia, że `scrollToIndex` działa od razu.
- Wiersze powinny być lekkie: zmemoizowane komponenty, brak ciężkiej pracy w renderze, małe cache'owane miniatury zamiast obrazów
  w pełnym rozmiarze.
- Puste obszary przy szybkim przewijaniu oznaczają, że wątek JS nie nadąża z renderowaniem: należy odchudzić wiersze, zwiększyć
  `windowSize`/rozmiar partii (kosztem pamięci i responsywności) albo przejść na FlashList.

## FlashList

**FlashList** (Shopify) to zamiennik, który **recyklinguje** komponenty elementów zamiast je odmontowywać i montować: gdy element
opuszcza widoczny obszar, ta sama instancja komponentu jest renderowana ponownie z innym `item`. Wersja 2 jest zbudowana pod New
Architecture i **nie potrzebuje już `estimatedItemSize`** ani innych szacunków rozmiaru, a layouty masonry to prop `masonry`.
Pułapka recyklingu: **lokalny `useState` w wierszu przetrwa** do następnego elementu, do którego wiersz zostanie użyty ponownie,
więc trzeba go resetować (FlashList dostarcza `useRecyclingState`) albo trzymać stan elementów poza wierszem.

## Źródła

- [FlatList](https://reactnative.dev/docs/flatlist)
- [SectionList](https://reactnative.dev/docs/sectionlist)
- [Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- [FlashList v2 changes](https://shopify.github.io/flash-list/docs/v2-changes)
- [FlashList: recycling](https://shopify.github.io/flash-list/docs/recycling)

## Pytania

### Dlaczego używać `FlatList` zamiast mapowania elementów w `ScrollView`? {junior}

`ScrollView` renderuje każde dziecko od razu: w teście 1000 elementów oznaczało 1000 wyrenderowanych wierszy, co kosztuje czas startu i pamięć na natywne widoki. `FlatList`
wirtualizuje: na początku renderuje 10 elementów, a potem trzyma zamontowane tylko okno wokół widocznego obszaru i dorenderowuje kolejne partiami podczas przewijania. Dostarcza też
separatory, nagłówki, stany puste, pull-to-refresh i nieskończone przewijanie.

### Czym jest `keyExtractor` i dlaczego ma znaczenie? {junior}

Zwraca unikalny, stabilny klucz dla każdego elementu, używany jako klucz React i do cache'owania pomiarów. Domyślnie lista używa `item.key`, potem `item.id`, potem indeksu. Klucze
z indeksu psują się przy wstawianiu, usuwaniu albo zmianie kolejności elementów: React używa niewłaściwych wierszy, a stan czy animacje przeskakują na inne elementy. Należy używać
prawdziwego identyfikatora z danych.

### Do czego służy `extraData`? {mid}

`FlatList` to `PureComponent`, więc przerenderowuje się tylko, gdy jego propsy zmieniają się referencyjnie. Jeśli wiersze zależą od czegoś spoza `data`, np. zaznaczonego elementu
albo filtra, lista nie wie, że to się zmieniło. Przekazanie tej wartości jako `extraData` powoduje przerenderowanie listy. W teście ze stabilnymi propsami znacznik zaznaczenia nie
pojawił się bez `extraData`, a pojawił się z nim.

### Dlaczego funkcje w miejscu w `renderItem` mogą szkodzić wydajności listy? {mid}

Przy każdym renderze rodzica tworzona jest nowa funkcja, więc propsy `FlatList` się zmieniają i przerenderowuje on każdy widoczny wiersz, nawet jeśli dane się nie zmieniły.
Opakowanie `renderItem` w `useCallback`, zdefiniowanie `keyExtractor` poza komponentem i memoizacja komponentu wiersza przez `React.memo` chronią niezmienione wiersze przed
przerenderowaniem. Trzeba wtedy pamiętać o `extraData`, jeśli wiersze zależą od innego stanu.

### Co robi `getItemLayout`? {mid}

Podaje liście z góry długość i przesunięcie każdego elementu (`({ length: 72, offset: 72 * index, index })`), więc nie musi ona asynchronicznie mierzyć wierszy po wyrenderowaniu.
Przyspiesza to renderowanie, zapobiega skokom layoutu i pozwala `scrollToIndex` oraz `initialScrollIndex` przeskakiwać do elementów, które nie zostały jeszcze wyrenderowane. Jest
możliwe tylko wtedy, gdy wiersze mają stały albo obliczalny rozmiar.

### Jak zaimplementować nieskończone przewijanie i pull to refresh? {mid}

Użyć `onEndReached` z `onEndReachedThreshold` (jak daleko od końca, w długościach widocznego obszaru, ma się wywołać), żeby wczytać następną stronę, zabezpieczając się przed
podwójnymi wywołaniami w trakcie trwającego żądania, i pokazać wskaźnik w `ListFooterComponent`. Dla pull to refresh przekazać `refreshing` i `onRefresh` (albo `RefreshControl`).
Biblioteki takie jak `useInfiniteQuery` z TanStack Query obsługują strony, stany ładowania i deduplikację.

### Czym sterują `windowSize`, `initialNumToRender` i `maxToRenderPerBatch`? {senior}

`initialNumToRender` (domyślnie 10) to liczba elementów w pierwszym renderze, która powinna akurat wypełnić ekran. `maxToRenderPerBatch` (10) i `updateCellsBatchingPeriod` (50 ms)
sterują tym, ile elementów renderuje się w partii podczas przewijania i jak często. `windowSize` (21) to zamontowany obszar mierzony w wysokościach ekranu. Większe wartości zmniejszają
puste obszary, ale zwiększają zużycie pamięci i pracę JS; mniejsze działają odwrotnie.

### Czym FlashList różni się od FlatList? {mid}

FlatList odmontowuje elementy, które opuszczają okno renderowania, i montuje nowe, co podczas przewijania tworzy i niszczy komponenty oraz natywne widoki. FlashList recyklinguje:
komponent elementu, który zniknął z widoku, jest renderowany ponownie z danymi nowego elementu, co jest tańsze i ogranicza puste komórki. FlashList v2 jest zbudowany pod New
Architecture i nie potrzebuje szacunków rozmiaru. API jest prawie takie samo, więc zamiana jest zwykle łatwa.

### Na czym polega pułapka lokalnego stanu w recyklingowanych elementach listy? {senior}

Przy recyklingu ta sama instancja komponentu pokazuje w czasie różne elementy, więc `useState` w wierszu zachowuje wartość ustawioną dla poprzedniego elementu: flaga „rozwinięty”
albo wartość pola tekstowego może pojawić się w niepowiązanym wierszu. Stan elementów trzyma się poza wierszem, z kluczem po identyfikatorze (w rodzicu albo w store), albo używa
`useRecyclingState` z FlashList, który resetuje stan przy zmianie elementu.

### Kiedy użyć `SectionList`? {junior}

Gdy dane są pogrupowane pod nagłówkami, np. kontakty według litery, grupy ustawień czy wiadomości według daty. Przyjmuje `sections` (każda z własnym `data` i dodatkowymi polami,
jak `title`), `renderItem` i `renderSectionHeader`, obsługuje przyklejone nagłówki (domyślnie na iOS) i ma te same propsy wirtualizacji i wydajności co `FlatList`.
