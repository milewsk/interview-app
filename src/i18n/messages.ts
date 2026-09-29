import type { Lang } from '../content/types'

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
type Message = string | PluralForms

const en = {
  appTitle: 'Interview Prep',
  'nav.label': 'Topics',
  'nav.home': 'Home',
  'lang.label': 'Language',
  'nav.expand': 'Expand {title}',
  'nav.collapse': 'Collapse {title}',
  'theme.toDark': 'Switch to dark mode',
  'theme.toLight': 'Switch to light mode',
  'home.title': 'Review before your interview',
  'home.intro': 'Pick a category to browse topics, read the notes and test yourself with interview questions.',
  'home.empty': 'No content yet. Add markdown files to the content/ folder.',
  'category.topics': { one: '{count} topic', other: '{count} topics' },
  'category.empty': 'This category is empty.',
  'progress.summary': 'Mastered {mastered} of {total}',
  'progress.label': 'Progress',
  'difficulty.label': 'Level',
  'difficulty.junior': 'Junior',
  'difficulty.mid': 'Mid',
  'difficulty.senior': 'Senior',
  'status.label': 'Status',
  'status.new': 'New',
  'status.review': 'To review',
  'status.mastered': 'Mastered',
  'topic.questions': 'Interview questions',
  'topic.showAnswer': 'Show answer',
  'topic.hideAnswer': 'Hide answer',
  'topic.fallback': 'This topic is not available in English yet. Showing the {lang} version.',
  'notFound.title': 'Page not found',
  'notFound.body': 'There is no category or topic at this address.',
  'notFound.back': 'Back to home',
  'error.title': 'Something went wrong',
  loading: 'Loading…',
} as const satisfies Record<string, Message>

export type MessageKey = keyof typeof en
type Messages = { [K in MessageKey]: (typeof en)[K] extends string ? string : PluralForms }

const pl: Messages = {
  appTitle: 'Powtórka przed rozmową',
  'nav.label': 'Zagadnienia',
  'nav.home': 'Start',
  'lang.label': 'Język',
  'nav.expand': 'Rozwiń: {title}',
  'nav.collapse': 'Zwiń: {title}',
  'theme.toDark': 'Włącz tryb ciemny',
  'theme.toLight': 'Włącz tryb jasny',
  'home.title': 'Powtórka przed rozmową techniczną',
  'home.intro': 'Wybierz kategorię, przeczytaj notatki i sprawdź się na pytaniach rekrutacyjnych.',
  'home.empty': 'Brak treści. Dodaj pliki markdown do folderu content/.',
  'category.topics': {
    one: '{count} zagadnienie',
    few: '{count} zagadnienia',
    many: '{count} zagadnień',
    other: '{count} zagadnienia',
  },
  'category.empty': 'Ta kategoria jest pusta.',
  'progress.summary': 'Opanowane: {mastered} z {total}',
  'progress.label': 'Postęp',
  'difficulty.label': 'Poziom',
  'difficulty.junior': 'Junior',
  'difficulty.mid': 'Mid',
  'difficulty.senior': 'Senior',
  'status.label': 'Status',
  'status.new': 'Nowe',
  'status.review': 'Do powtórki',
  'status.mastered': 'Opanowane',
  'topic.questions': 'Pytania rekrutacyjne',
  'topic.showAnswer': 'Pokaż odpowiedź',
  'topic.hideAnswer': 'Ukryj odpowiedź',
  'topic.fallback': 'To zagadnienie nie ma jeszcze wersji polskiej. Wyświetlam wersję {lang}.',
  'notFound.title': 'Nie znaleziono strony',
  'notFound.body': 'Pod tym adresem nie ma kategorii ani zagadnienia.',
  'notFound.back': 'Wróć na start',
  'error.title': 'Coś poszło nie tak',
  loading: 'Ładowanie…',
}

export const messages: Record<Lang, Messages> = { en, pl }

export const LANG_NAMES: Record<Lang, string> = { pl: 'Polski', en: 'English' }

export type Params = Record<string, string | number>

export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  const message = messages[lang][key]
  let text: string
  if (typeof message === 'string') {
    text = message
  } else {
    const count = Number(params.count ?? 0)
    const rule = new Intl.PluralRules(lang).select(count)
    text = message[rule] ?? message.other
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
