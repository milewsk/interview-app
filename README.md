# interview-app

Aplikacja do powtórki materiału przed rozmowami technicznymi. Zagadnienia to pliki Markdown
pogrupowane w kategorie o dowolnej głębokości (np. React → Hooki → useEffect). Każde zagadnienie
ma notatkę i listę pytań rekrutacyjnych z ukrytymi odpowiedziami. Interfejs i treści są
dostępne po polsku i po angielsku, a postęp nauki zapisuje się w przeglądarce (localStorage).

Stack: Vite 8, React 19, TypeScript, React Router 8 (data mode), Tailwind CSS 4, Vitest.

## Uruchomienie

Wymagany Node 24 (plik `.node-version`; z [fnm](https://github.com/Schniz/fnm): `fnm use`).

```bash
npm install
npm run dev      # serwer deweloperski
npm test         # testy (Vitest, tryb watch)
npm run build    # typecheck + build produkcyjny do dist/
npm run lint     # oxlint
```

## Dodawanie treści

Treść leży w folderze [`content/`](content). **Folder = kategoria**, **plik = zagadnienie**.
Ścieżka pliku wyznacza adres URL:

```
content/
  _meta.json                  # kolejność kategorii najwyższego poziomu
  react/
    _meta.json                # tytuły PL/EN i kolejność elementów
    hooks/
      _meta.json
      use-effect.pl.md        # → /react/hooks/use-effect (wersja polska)
      use-effect.en.md        # → /react/hooks/use-effect (wersja angielska)
```

### `_meta.json` (opcjonalny)

```json
{
  "title": { "pl": "Hooki", "en": "Hooks" },
  "order": ["use-state", "use-effect"]
}
```

Elementy spoza `order` trafiają na koniec, alfabetycznie. Bez `title` nazwa powstaje ze slugu
(`event-loop` → „Event loop”).

### Plik zagadnienia

- `nazwa.pl.md` i/lub `nazwa.en.md`. Jeśli brakuje wersji w wybranym języku, aplikacja pokaże
  drugą wersję z informacją o tym.
- Pierwszy nagłówek `# …` to tytuł.
- Sekcja `## Pytania` (lub `## Questions`) zawiera pytania: każdy nagłówek `### …` to pytanie,
  a wszystko pod nim (do następnego `###`) to odpowiedź. Można w niej używać kodu, list i tabel.
- Pozostała treść to notatka.
- **Poziom trudności** (`{junior}`, `{mid}`, `{senior}`) dopisuje się na końcu tytułu i każdego
  pytania. Treści celują w poziom **mid**. Test wymaga etykiet i tych samych poziomów w wersji PL i EN.

```markdown
# useEffect {mid}

Notatka z przykładami kodu…

## Pytania

### Kiedy uruchamia się `useEffect`? {junior}

Po renderze i zatwierdzeniu zmian w DOM…
```

Ograniczenia formatu:

- W odpowiedziach nie używaj nagłówków `##` ani podkreśleń `---` pod linią tekstu
  (to też nagłówek `##`), bo zakończą sekcję pytań. Linia pozioma `---` poprzedzona pustą
  linią jest w porządku.
- Kolorowanie składni obsługuje: `js`/`jsx`, `ts`/`tsx`, `html`/`xml`, `css`, `json`, `bash`,
  `csharp`/`cs`, `sql`.
  Inne języki można dopisać w [src/components/rehypeHighlight.ts](src/components/rehypeHighlight.ts).

Po dodaniu pliku uruchom `npm test`. Test [content.test.ts](src/content/content.test.ts) sprawdza,
czy każde zagadnienie ma tytuł i pytania z odpowiedziami, a każda kategoria ma tytuł PL i EN
w `_meta.json`.

## Wdrożenie

Aplikacja używa `createBrowserRouter`, więc hosting statyczny musi kierować wszystkie ścieżki
do `index.html` (Netlify: `/* /index.html 200` w `_redirects`, Vercel: rewrite). Przy hostingu
w podkatalogu ustaw `base` w `vite.config.ts`, a router przejmie go przez `import.meta.env.BASE_URL`.
