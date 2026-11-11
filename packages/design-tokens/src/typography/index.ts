/**
 * Типографіка. Робочий текст — 14 px, щільні таблиці не опускаються нижче 13 px.
 * 12 px дозволено лише для службових підписів (overline), не для важливих даних.
 */

export const fontFamilies = {
  // Inter постачається локально (font-faces.ts → generated/fonts.css); решта — fallback до завантаження шрифту.
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // Моноширинний для ідентифікаторів, координат, кодів і часових міток.
  mono: 'ui-monospace, "Cascadia Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace',
} as const;

export type FontFamilyName = keyof typeof fontFamilies;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export type FontWeightName = keyof typeof fontWeights;

export interface TextStyle {
  readonly family: FontFamilyName;
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: FontWeightName;
  /** Трекінг у em. Збільшуємо лише для uppercase-підписів, де він потрібен для читабельності. */
  readonly letterSpacing: number;
  readonly textTransform?: "uppercase";
  readonly usage: string;
}

/** Висоти рядків кратні 4 px, щоб текст лягав у ту саму сітку, що й spacing. */
export const textStyles = {
  "heading-xl": {
    family: "sans",
    size: 28,
    lineHeight: 36,
    weight: "semibold",
    letterSpacing: -0.01,
    usage: "Заголовок сторінки або модуля. Один на екран.",
  },
  "heading-lg": {
    family: "sans",
    size: 22,
    lineHeight: 28,
    weight: "semibold",
    letterSpacing: -0.005,
    usage: "Заголовок розділу, діалогу.",
  },
  "heading-md": {
    family: "sans",
    size: 18,
    lineHeight: 24,
    weight: "semibold",
    letterSpacing: 0,
    usage: "Заголовок панелі, картки, групи полів.",
  },
  "heading-sm": {
    family: "sans",
    size: 16,
    lineHeight: 24,
    weight: "semibold",
    letterSpacing: 0,
    usage: "Підзаголовок усередині панелі.",
  },
  "body-lg": {
    family: "sans",
    size: 16,
    lineHeight: 24,
    weight: "regular",
    letterSpacing: 0,
    usage: "Довгі тексти, інструкції, описи.",
  },
  body: {
    family: "sans",
    size: 14,
    lineHeight: 20,
    weight: "regular",
    letterSpacing: 0,
    usage: "Основний робочий текст: поля, таблиці, меню.",
  },
  "body-strong": {
    family: "sans",
    size: 14,
    lineHeight: 20,
    weight: "medium",
    letterSpacing: 0,
    usage: "Мітки полів, кнопки, акценти в рядку.",
  },
  caption: {
    family: "sans",
    size: 13,
    lineHeight: 16,
    weight: "regular",
    letterSpacing: 0,
    usage: "Допоміжний текст, підказки під полями, щільні таблиці.",
  },
  overline: {
    family: "sans",
    size: 12,
    lineHeight: 16,
    weight: "semibold",
    letterSpacing: 0.06,
    textTransform: "uppercase",
    usage: "Службові підписи груп і колонок. Не для значень даних.",
  },
  mono: {
    family: "mono",
    size: 13,
    lineHeight: 20,
    weight: "regular",
    letterSpacing: 0,
    usage: "Технічні метадані: ідентифікатори, коди, час, координати.",
  },
} as const satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;
