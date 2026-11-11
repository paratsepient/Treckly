/**
 * Розрахунок контрасту за WCAG 2.2 (визначення relative luminance і contrast ratio).
 *
 * Важливо: результат не округлюється перед порівнянням із порогом.
 * WCAG прямо забороняє округлювати 4.499 до 4.5, тому порівнюємо сире значення.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value);
}

/** Розбирає `#RRGGBB` у канали 0–255. Скорочений чи lowercase формат не приймаємо, щоб реєстр був однорідним. */
export function parseHex(hex: string): Rgb {
  if (!isHexColor(hex)) {
    throw new Error(`Некоректний HEX: ${hex}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/**
 * Накладає напівпрозорий колір на непрозорий фон.
 * Браузер змішує кольори в гамма-кодованому sRGB, тому лінеаризація тут не потрібна.
 */
export function composite(top: Rgb, alpha: number, below: Rgb): Rgb {
  if (alpha < 0 || alpha > 1) {
    throw new Error(`Alpha поза діапазоном 0–1: ${alpha}`);
  }
  const mix = (a: number, b: number): number => a * alpha + b * (1 - alpha);
  return {
    r: mix(top.r, below.r),
    g: mix(top.g, below.g),
    b: mix(top.b, below.b),
  };
}

function linearize(channel: number): number {
  const c = channel / 255;
  // Поріг 0.04045 — актуальне значення sRGB, на яке посилається WCAG 2.2.
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  );
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Для відображення відкидаємо, а не округлюємо, щоб 4.499 не показувалося як 4.50. */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}
