/**
 * Розміри каркаса застосунку. Значення inspector і max-width взято з
 * чернетки «PageShell & Layout» (Notion, статус ЗАПРОПОНОВАНО) і потребують затвердження.
 * Sidebar — лише колонка іконок (рішення 2026-11-04): ширина колишнього згорнутого стану.
 * Ширина ContextPanel у чернетці відсутня — 280 px обрано як середнє між
 * мінімумом читабельного дерева (240) і шириною інспектора (360).
 */
export const layoutSizes = {
  "sidebar-rail-width": 64,
  "context-panel-width": 280,
  "inspector-width": 360,
  "panel-min-width": 240,
  "panel-max-width": 480,
  /** Висота шапки = висота вкладки колонки навігації (space-12), рішення 2026-11-04. */
  "header-height": 48,
  "content-max-width": 1200,
} as const;

export type LayoutSizeName = keyof typeof layoutSizes;

/**
 * Межі режимів layout (мінімальна ширина viewport у CSS px).
 * У CSS media queries змінні не працюють, тому режим обчислює JS
 * з цього самого джерела і передає його атрибутом data-layout-mode.
 */
export const layoutBreakpoints = {
  /** ≥ 768: sidebar завжди видимий (колонка іконок), панелі — Drawer. */
  medium: 768,
  /** ≥ 1024: ContextPanel закріплюється поруч із поверхнею. */
  large: 1024,
  /** ≥ 1280: Inspector закріплюється. */
  wide: 1280,
} as const;

export type LayoutMode = "compact" | "medium" | "large" | "wide";

export function layoutModeForWidth(width: number): LayoutMode {
  if (width >= layoutBreakpoints.wide) return "wide";
  if (width >= layoutBreakpoints.large) return "large";
  if (width >= layoutBreakpoints.medium) return "medium";
  return "compact";
}
