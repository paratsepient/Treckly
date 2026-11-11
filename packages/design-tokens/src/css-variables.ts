import { semanticColorNames, type SemanticColorName } from "./semantic/themes.ts";

/**
 * Єдине правило іменування CSS custom properties. Його використовують і генератор,
 * і застосунок, тому назва змінної не може розійтися з тим, що лежить у tokens.css.
 */
export const cssPrefix = "ix";

export type CssVariableGroup =
  | "color"
  | "font"
  | "space"
  | "radius"
  | "shadow"
  | "duration"
  | "easing"
  | "focus"
  | "layout"
  | "tonal"
  | "well"
  | "control"
  | "raised";

/**
 * Семантичні кольори не мають префікса групи (`--ix-surface`), бо саме їх
 * найчастіше пишуть у компонентах. Примітиви отримують `color-`, щоб їх
 * було легко помітити й заборонити в коді компонентів.
 */
export function cssVariableName(group: CssVariableGroup | null, name: string): string {
  return group === null ? `--${cssPrefix}-${name}` : `--${cssPrefix}-${group}-${name}`;
}

export const semanticColorVariables: Readonly<Record<SemanticColorName, string>> =
  Object.fromEntries(
    semanticColorNames.map((name) => [name, `var(${cssVariableName(null, name)})`]),
  ) as Record<SemanticColorName, string>;
