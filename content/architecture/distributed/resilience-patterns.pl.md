# Wzorce odporności: timeout, retry, circuit breaker {mid}

W systemie rozproszonym wywołania innych serwisów i baz **będą** się nie udawać: timeouty, zerwane połączenia, przeciążone
zależności, wdrożenia. Wzorce odporności (resilience) pozwalają aplikacji przetrwać **przejściowe** błędy i nie dopuścić,
żeby jedna zawodząca zależność położyła cały system. W .NET dostarczają ich **Polly** i zbudowany na nim pakiet
`Microsoft.Extensions.Http.Resilience`.

## Timeout

Nigdy nie czekaj w nieskończoność: wywołanie bez timeoutu trzyma wątek, połączenie i żądanie wywołującego, dopóki coś się
nie podda. Ustawia się timeouty **na próbę** oraz **całkowity** timeout operacji łącznie z ponowieniami i przekazuje
`CancellationToken`, żeby praca była naprawdę przerywana. Polly rzuca `TimeoutRejectedException` (sprawdzone po 100 ms),
a nie standardowy `TimeoutException`.

## Retry (ponawianie)

Ponawia się operację, która zawiodła z **przejściowym** błędem (timeout, HTTP 5xx, 408, 429, zerwane połączenie):

- **Tylko błędy przejściowe**: 400 Bad Request czy wyjątek walidacji zawiodą znowu. W teście `ArgumentException` nie był
  ponawiany, bo strategia obsługiwała tylko `HttpRequestException`.
- **Wykładniczy backoff**: czekaj dłużej po każdej porażce (sprawdzone: 100 ms, potem 200 ms), żeby przeciążona zależność miała
  czas dojść do siebie.
- **Jitter**: losuj opóźnienia, żeby wielu klientów nie ponawiało w zsynchronizowanych falach (thundering herd).
- **Limit** prób i całkowity timeout.
- **Tylko operacje idempotentne**: ponowienie `POST`, który faktycznie się udał, ale zgubiono odpowiedź, może utworzyć duplikat
  zamówienia. Dokumentacja Microsoftu ostrzega właśnie przed tym i daje `DisableForUnsafeHttpMethods()`; alternatywą są klucze
  idempotencji.
- **Ponawiaj tylko w jednej warstwie**: ponowienia w kliencie, bramce i serwisie się mnożą (3 × 3 × 3 = 27 prób).

## Circuit breaker (bezpiecznik)

Gdy zależność ciągle zawodzi, ponawianie tylko dokłada obciążenia i każe wywołującym czekać. Circuit breaker śledzi błędy
i na jakiś czas **przestaje wywoływać**:

- **Zamknięty**: wywołania przechodzą; błędy są liczone.
- **Otwarty**: po przekroczeniu progu błędów wywołania od razu kończą się błędem (`BrokenCircuitException`), nie dotykając
  zależności.
- **Półotwarty**: po czasie przerwy przepuszcza wywołanie próbne; sukces zamyka obwód, porażka znowu go otwiera.

W teście z progiem 50% błędów i minimum 4 wywołań: `fail, fail, fail, fail, open, open, open`, więc zależność wywołano tylko
4 razy na 7, a po 1-sekundowej przerwie kolejne wywołanie się udało.

## Inne wzorce

- **Fallback**: zwróć wynik zdegradowany (dane z cache, wartość domyślną), gdy wywołanie zawiedzie (sprawdzone: „cached value”).
- **Bulkhead** (izolacja, grodzie): ogranicz równoczesne wywołania każdej zależności (osobna pula połączeń albo semafor), żeby
  jedna wolna zależność nie wyczerpała wszystkich wątków i połączeń.
- **Rate limiting**: ogranicz liczbę wysyłanych lub przyjmowanych żądań.
- **Hedging**: wyślij drugie równoległe żądanie, jeśli pierwsze jest wolne, i użyj tego, które odpowie pierwsze.
- **Health checki i łagodna degradacja**: raportuj zdrowie zależności i utrzymuj działanie podstawowych funkcji, gdy zawodzą
  funkcje opcjonalne.

## W .NET

```csharp
builder.Services.AddHttpClient<CatalogClient>(c => c.BaseAddress = new("https://catalog"))
    .AddStandardResilienceHandler(o => o.Retry.DisableForUnsafeHttpMethods());
```

`AddStandardResilienceHandler` (pakiet `Microsoft.Extensions.Http.Resilience`) łączy pięć strategii, od zewnętrznej do
wewnętrznej: rate limiter (1000 zezwoleń), całkowity timeout (30 s), retry (3 próby, wykładniczy backoff z jitterem, bazowe
opóźnienie 2 s), circuit breaker (10% błędów, minimum 100 żądań, okno 30 s, przerwa 5 s) i timeout próby (10 s). Obsługuje
HTTP 5xx, 408, 429, `HttpRequestException` i `TimeoutRejectedException`. Własne potoki buduje się przez
`ResiliencePipelineBuilder` z Polly.

**Kolejność** ma znaczenie: całkowity timeout na zewnątrz retry ogranicza całą operację, a timeout próby wewnątrz retry
ogranicza każdą próbę.

## Źródła

- [Build resilient HTTP apps (.NET)](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [Polly documentation](https://www.pollydocs.org/)
- [Retry pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Circuit breaker pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [Bulkhead pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
- [Timeouts, retries and backoff with jitter (Amazon Builders' Library)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

## Pytania

### Czym jest błąd przejściowy? {junior}

To tymczasowa awaria, która prawdopodobnie zniknie, jeśli operację powtórzy się po krótkim czasie: chwilowy problem sieci, timeout, zerwane połączenie, restart serwisu
podczas wdrożenia, dławienie (HTTP 429) albo tymczasowy błąd serwera (5xx). To przeciwieństwo błędu trwałego, jak niepoprawne dane (400), brak uprawnień (403) czy
nieistniejący zasób (404), którego ponawianie nie naprawi.

### Kiedy ponawiać operację, a kiedy nie? {mid}

Ponawia się tylko błędy przejściowe, ograniczoną liczbę razy, z wykładniczym backoffem i jitterem, i tylko operacje idempotentne (bezpieczne do dwukrotnego wykonania). Nie
ponawia się błędów klienta, jak 400 czy 404, błędów walidacji czy autoryzacji ani na ślepo operacji nieidempotentnych, jak `POST` tworzący zamówienie, bo pierwsza próba mogła
się udać, a zgubiono tylko odpowiedź. Ponowień nie powinno się też nakładać w wielu warstwach.

### Czym jest wykładniczy backoff z jitterem? {mid}

Wykładniczy backoff zwiększa opóźnienie między ponowieniami po każdej porażce (np. 100 ms, 200 ms, 400 ms), dając przeciążonej zależności czas na powrót zamiast ją zasypywać.
Jitter dodaje losowość do opóźnień, żeby wielu klientów, którzy zawiedli w tym samym momencie, nie ponawiało w zsynchronizowanych falach (problem thundering herd), co przy każdym
ponowieniu odtwarzałoby przeciążenie.

### Jak działa circuit breaker? {mid}

Opakowuje wywołania zależności i śledzi błędy. Dopóki odsetek błędów jest akceptowalny, jest zamknięty i wywołania przechodzą. Gdy błędy przekroczą próg w oknie pomiarowym,
otwiera się: wywołania od razu kończą się błędem, nie docierając do zależności, co chroni zarówno wywołującego (brak czekania), jak i zależność (brak dodatkowego obciążenia).
Po czasie przerwy przechodzi w stan półotwarty i przepuszcza wywołanie próbne; sukces go zamyka, porażka znowu otwiera.

### Po co łączyć retry z circuit breakerem? {mid}

Ponowienia radzą sobie z krótkimi, sporadycznymi awariami, ale gdy zależność leży dłużej, mnożą obciążenie i czas oczekiwania. Circuit breaker wykrywa, że błędy są trwałe,
i sprawia, że wywołania szybko kończą się błędem, dopóki zależność nie wróci. Razem odzyskują działanie po krótkich zakłóceniach i nie marnują zasobów podczas awarii;
w standardowym potoku Polly circuit breaker siedzi wewnątrz retry, więc liczy każdą próbę.

### Dlaczego timeout to najważniejszy mechanizm odporności? {mid}

Bez timeoutów wolna albo zawieszona zależność każe wywołującym czekać w nieskończoność, trzymając wątki, połączenia i pamięć, aż sam wywołujący przestanie odpowiadać, a awaria
przeniesie się wyżej. Timeouty ograniczają czas każdego wywołania, zamieniają zawieszenia w błędy, które mogą obsłużyć inne mechanizmy (retry, fallback, circuit breaker),
i trzeba je łączyć z anulowaniem, żeby porzucona praca faktycznie się zatrzymała.

### Czym jest wzorzec bulkhead? {senior}

To izolowanie zasobów per zależność albo per konsument, jak wodoszczelne przedziały w statku: np. osobna pula połączeń, pula wątków albo limit współbieżności (semafor) dla każdego
serwisu, który się wywołuje. Jeśli jedna zależność zwolni, może wyczerpać tylko swój przedział, a wywołania innych zależności działają dalej. Zapobiega to temu, żeby jedna awaria
zużyła wszystkie wspólne zasoby aplikacji.

### Co konfiguruje `AddStandardResilienceHandler`? {mid}

Potok pięciu strategii dla `HttpClient`, od zewnętrznej do wewnętrznej: rate limiter, całkowity timeout żądania (30 s), retry (3 próby z wykładniczym backoffem i jitterem),
circuit breaker (otwiera się przy 10% błędów przy co najmniej 100 żądaniach w 30 s, przerwa 5 s) i timeout pojedynczej próby (10 s). Traktuje 5xx, 408, 429,
`HttpRequestException` i timeouty jako przejściowe. Ponowienia dla metod niebezpiecznych, jak `POST`, można wyłączyć przez `DisableForUnsafeHttpMethods`.

### Jak ponowienia mogą pogorszyć awarię? {senior}

Jeśli każda warstwa ponawia (klient, API gateway, serwis, sterownik bazy), pojedyncza awaria mnoży się w wiele prób, a gdy zależność jest przeciążona, zsynchronizowane ponowienia
bez backoffu i jittera dokładają jeszcze więcej obciążenia dokładnie wtedy, gdy najmniej sobie z nim radzi (burza ponowień). Ponawianie operacji nieidempotentnych może też
tworzyć duplikaty. Środki zaradcze to ponawianie w jednej warstwie, backoff z jitterem, budżety lub limity ponowień, circuit breakery i idempotentność.

### Czym jest fallback i kiedy jest właściwy? {junior}

To wcześniej zdefiniowany alternatywny wynik używany, gdy operacja zawiedzie: dane z cache lub nieaktualne, wartość domyślna, uproszczona odpowiedź albo żądanie zakolejkowane do
późniejszego przetworzenia. Jest właściwy, gdy zdegradowana odpowiedź jest dla użytkownika lepsza niż błąd, np. pokazanie rekomendacji z cache, gdy serwis rekomendacji nie
działa. Nie jest właściwy, gdy wynik musi być poprawny i aktualny, jak autoryzacja płatności.
