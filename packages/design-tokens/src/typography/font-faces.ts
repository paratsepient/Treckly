/**
 * Локальне постачання Inter (SIL Open Font License 1.1).
 *
 * Файли шрифту копіюються з npm-пакета `@fontsource-variable/inter` у `fonts/inter/`
 * разом із текстом ліцензії й маніфестом SHA-256 (`scripts/fonts.ts`). Застосунок не
 * звертається до CDN: робоче середовище IndeX може не мати доступу до інтернету.
 *
 * Беремо лише variable `wght` normal для latin, latin-ext, cyrillic, cyrillic-ext.
 * Українська потребує cyrillic (зокрема Ґ ґ U+0490–0491), латиниця — для
 * технічних ідентифікаторів. Курсив, грецька та в'єтнамська не потрібні робочому UI.
 */

export const fontSourcePackage = "@fontsource-variable/inter";

/** Назва в @font-face збігається з першою в `fontFamilies.sans`, тому fallback спрацьовує без змін. */
export const fontFaceFamily = "Inter";

export interface FontFaceSubset {
  readonly subset: string;
  readonly file: string;
  readonly unicodeRange: string;
}

/** Діапазони перенесено з index.css пакета-джерела; порядок визначає порядок у fonts.css. */
export const interSubsets: readonly FontFaceSubset[] = [
  {
    subset: "cyrillic-ext",
    file: "inter-cyrillic-ext-wght-normal.woff2",
    unicodeRange:
      "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  },
  {
    subset: "cyrillic",
    file: "inter-cyrillic-wght-normal.woff2",
    unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  },
  {
    subset: "latin-ext",
    file: "inter-latin-ext-wght-normal.woff2",
    unicodeRange:
      "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  },
  {
    subset: "latin",
    file: "inter-latin-wght-normal.woff2",
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
];

/** Діапазон осі wght variable-файлу; шкала використовує лише 400–600. */
export const interWeightRange = "100 900";
