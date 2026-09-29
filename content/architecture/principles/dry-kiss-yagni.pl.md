# DRY, KISS, YAGNI i inne codzienne zasady {junior}

Poza SOLID kilka krótkich zasad kształtuje codzienne decyzje projektowe. Często ciągną w różne strony (DRY popycha ku
abstrakcji, YAGNI i KISS przeciw niej), więc rozmowy skupiają się mniej na definicjach, a bardziej na **osądzie**: kiedy
stosować którą i co się dzieje, gdy się przesadzi.

## DRY: Don't Repeat Yourself

„Każda porcja **wiedzy** musi mieć w systemie jedną, jednoznaczną, autorytatywną reprezentację” (*The Pragmatic
Programmer*).

- DRY dotyczy **wiedzy**, a nie tekstu. Stawka VAT, reguła walidacji czy mapowanie między wartościami enuma powinny być
  zdefiniowane raz; jeśli są zduplikowane, kopie w końcu się rozjadą.
- Dwa fragmenty kodu, które dziś wyglądają tak samo, ale reprezentują **inną wiedzę** (np. walidacja nazwy klienta i nazwy
  produktu), to nie duplikacja. Ich połączenie wiąże rzeczy zmieniające się z różnych powodów.
- **Zła abstrakcja**: wciśnięcie podobnie wyglądającego kodu w jedną wspólną funkcję, a potem dokładanie parametrów i `if`-ów
  dla każdego nowego wywołującego. Sandi Metz: „duplikacja jest dużo tańsza niż zła abstrakcja”. Przydatną heurystyką jest
  reguła trzech (abstrahuj przy trzecim powtórzeniu).

## KISS: Keep It Simple

Wybieraj najprostsze działające rozwiązanie. Prosty kod łatwiej czytać, testować, debugować i zmieniać. Oznaki
przekomplikowania: warstwy, które tylko przekazują wywołania, generyczne frameworki dla jednego przypadku użycia, sprytne
jednolinijkowce wymagające komentarza, wzorce zastosowane dlatego, że się je zna, a nie dlatego, że są potrzebne. Zasady
prostego projektu Kenta Becka, w kolejności ważności: przechodzi testy, ujawnia intencję, bez duplikacji, najmniej
elementów.

## YAGNI: You Aren't Gonna Need It

Zasada z Extreme Programming: nie buduj możliwości pod **przypuszczalne** przyszłe potrzeby. Martin Fowler wymienia koszty
takiej funkcji: koszt zbudowania, koszt opóźnienia (inne funkcje czekają), koszt noszenia dodatkowej złożoności i koszt
naprawy, gdy przypuszczenie okaże się błędne. YAGNI dotyczy **funkcji**, a nie utrzymywania kodu łatwym do zmiany:
refaktoryzacja, testy i czysta struktura to właśnie to, co czyni późniejsze dodanie funkcji tanim.

## Inne zasady, które usłyszysz

- **Separacja odpowiedzialności** (separation of concerns): różne obszary (UI, reguły biznesowe, dostęp do danych) żyją
  w różnych modułach.
- **Prawo Demeter** („rozmawiaj tylko z najbliższymi przyjaciółmi”): metoda powinna używać własnych pól, parametrów
  i obiektów, które tworzy, a nie sięgać przez łańcuchy w rodzaju `order.Customer.Address.City.Name`. Długie łańcuchy
  wiążą wywołującego ze strukturą wielu obiektów.
- **Tell, don't ask**: zamiast pytać obiekt o dane i decydować za niego
  (`if (account.Balance >= amount) account.Balance -= amount;`), powiedz mu, co ma zrobić (`account.Withdraw(amount)`),
  trzymając regułę w obiekcie, który jest właścicielem danych.
- **Fail fast**: waliduj dane wejściowe i niezmienniki wcześnie i rzucaj czytelny błąd, zamiast nosić niepoprawny stan,
  który zawiedzie daleko od źródła.
- **Zasada najmniejszego zaskoczenia**: API powinno zachowywać się tak, jak sugeruje nazwa; metoda `GetUser` nie powinna
  tworzyć użytkowników ani wysyłać e-maili.
- **Kompozycja zamiast dziedziczenia**: buduj zachowanie ze współpracujących obiektów zamiast głębokich hierarchii klas
  (zob. temat o OOP).

## Źródła

- [Yagni (Martin Fowler)](https://martinfowler.com/bliki/Yagni.html)
- [Beck design rules (Martin Fowler)](https://martinfowler.com/bliki/BeckDesignRules.html)
- [The wrong abstraction (Sandi Metz)](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- [Tell, don't ask (Martin Fowler)](https://martinfowler.com/bliki/TellDontAsk.html)
- [Architectural principles (.NET architecture guide)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles)

## Pytania

### Co oznacza DRY i czy każdy zduplikowany kod łamie tę zasadę? {junior}

„Don't Repeat Yourself”: każda porcja wiedzy (reguła biznesowa, stała, mapowanie) powinna mieć jedną autorytatywną reprezentację, więc zmianę wprowadza się
w jednym miejscu. Nie każdy podobnie wyglądający kod ją łamie: dwa fragmenty, które wyglądają podobnie, ale wyrażają inną wiedzę i zmieniają się z różnych powodów,
powinny zostać osobno, bo ich połączenie wiąże niezwiązane obszary.

### Czym jest „zła abstrakcja”? {mid}

To abstrakcja utworzona zbyt wcześnie z kodu, który tylko wyglądał podobnie: wspólna metoda albo klasa bazowa, która potem obrasta w parametry, flagi i warunki,
bo każdy nowy wywołujący potrzebuje czegoś trochę innego, aż nikt jej nie rozumie. Sandi Metz twierdzi, że duplikacja jest dużo tańsza niż zła abstrakcja, a
naprawą jest wklejenie jej z powrotem do wywołujących i pozwolenie, żeby właściwa abstrakcja się wyłoniła. Reguła trzech pomaga tego uniknąć.

### Co oznacza YAGNI? {junior}

„You Aren't Gonna Need It”: nie implementuj funkcji dla przewidywanych przyszłych wymagań, tylko dla obecnych. Spekulacyjna funkcja kosztuje czas budowy, opóźnia
inną pracę, dodaje złożoność, którą wszyscy muszą nosić, i często trzeba ją przerobić, bo prawdziwe wymaganie okazuje się inne. YAGNI nie zabrania utrzymywania
kodu czystym i przetestowanym, bo właśnie to czyni późniejsze dodanie funkcji tanim.

### Jak DRY koliduje z YAGNI/KISS? {mid}

DRY popycha do wyciągania wspólnych abstrakcji, gdy tylko pojawia się powtórzenie, a YAGNI i KISS do unikania abstrakcji, dopóki nie są wyraźnie potrzebne. Za dużo
DRY daje przedwczesne, złe abstrakcje; za mało daje niespójne kopie reguł. Pragmatyczna równowaga: zawsze deduplikować wiedzę biznesową (reguły, stałe), a drobną
duplikację kodu tolerować, dopóki wzorzec nie stanie się jasny (np. przy trzecim wystąpieniu).

### Czym jest Prawo Demeter? {mid}

To wskazówka, że metoda powinna wywoływać tylko metody własnego obiektu, swoich parametrów, obiektów, które tworzy, i swoich pól, a nie obiektów przez nie
zwracanych. Łańcuch w rodzaju `order.Customer.Address.City.Name` wiąże wywołującego z wewnętrzną strukturą czterech klas, więc zmiana którejkolwiek go psuje.
Rozwiązaniem jest zapytanie najbliższego obiektu o to, co potrzebne (`order.ShippingCityName()`), albo przekazanie potrzebnych danych bezpośrednio.

### Co oznacza „tell, don't ask”? {mid}

Zamiast pytać obiekt o jego dane i podejmować decyzje na zewnątrz (`if (account.Balance >= amount) account.Balance -= amount`), mówi się obiektowi, co ma zrobić
(`account.Withdraw(amount)`), i pozwala mu pilnować własnych reguł. Trzyma to zachowanie obok danych, których dotyczy, chroni niezmienniki (saldo nie może być
zmienione z zewnątrz) i unika powielania reguły w każdym wywołującym. To praktyczna forma hermetyzacji.

### Czym jest KISS i jakie są oznaki, że kod go łamie? {junior}

„Keep It Simple”: wybieraj najprostszy projekt spełniający wymagania. Oznaki naruszenia: warstwy lub interfejsy, które tylko przekazują wywołania, generyczne
frameworki zbudowane dla jednego przypadku użycia, konfiguracja rzeczy, które nigdy się nie zmieniają, sprytny kod wymagający wyjaśnienia oraz wzorce projektowe
użyte, bo są znane, a nie dlatego, że problem ich wymaga. Prosty kod łatwiej czytać, testować i zmieniać.

### Czym jest „fail fast”? {junior}

To wykrywanie niepoprawnych danych lub stanu tak wcześnie, jak się da, i przerywanie z czytelnym błędem, zamiast kontynuowania i awarii później w niezwiązanym
miejscu. Przykłady: klauzule strażnicze na początku metody (`ArgumentNullException.ThrowIfNull`), walidacja konfiguracji przy starcie, konstruktory odmawiające
utworzenia niepoprawnych obiektów. Błędy taniej diagnozować u źródła niż po uszkodzeniu danych.

### Czym jest separacja odpowiedzialności? {junior}

To podział programu na części, z których każda zajmuje się jednym obszarem, np. prezentacją, regułami biznesowymi i dostępem do danych, z wyraźnymi granicami
między nimi. Każdą część można wtedy zrozumieć, zmienić i przetestować niezależnie: zmiana UI nie wymaga ruszania reguł biznesowych, a zmiana bazy nie wpływa na
prezentację. Architektury warstwowe i czyste to zastosowania tej zasady na poziomie systemu.

### Kiedy duplikacja jest akceptowalna? {senior}

Gdy zduplikowany kod reprezentuje inną wiedzę, która dziś akurat wygląda tak samo, gdy duplikacja przekracza granice, które chcemy utrzymać niezależne (np. dwa
mikroserwisy mają własne DTO zamiast dzielić bibliotekę wiążącą ich wdrożenia), w testach, gdzie jawne powtórzenia często poprawiają czytelność, oraz wtedy, gdy
wciąż się uczymy, jaka jest właściwa abstrakcja. Do usunięcia jest duplikacja reguł biznesowych w obrębie jednego bounded contextu.
