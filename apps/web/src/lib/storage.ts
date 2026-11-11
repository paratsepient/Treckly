/**
 * Дрібні налаштування перегляду (роль, тема) зберігаються в браузері. Сховище може бути
 * недоступним (приватне вікно, заблоковані дані), тому кожен виклик захищений, а застосунок
 * працює й без нього.
 */
export function readSetting(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // сховище недоступне — налаштування просто не збережеться
  }
}

export function clearSetting(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // сховище недоступне
  }
}

export const USER_KEY = "dsp.userId";
export const THEME_KEY = "dsp.theme";

export type Theme = "light" | "dark";

export function initialTheme(): Theme {
  const saved = readSetting(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
