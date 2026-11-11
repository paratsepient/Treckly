/**
 * Позиція підказки — окремий випадок спільного розрахунку плаваючих шарів
 * (центрування на тригері, зазор TOOLTIP_GAP).
 */
import { computeFloatingPosition, type FloatingPosition, type FloatingSide, type Rect, type Size } from "../internal/position.ts";

export { VIEWPORT_MARGIN, type Rect, type Size } from "../internal/position.ts";

/** Бік підказки: top/bottom для елементів у рядку, right/left — для вертикальних колонок (навігація). */
export type TooltipPlacement = FloatingSide;
export type TooltipPosition = FloatingPosition;

/** Відстань між тригером і підказкою. */
export const TOOLTIP_GAP = 8;

export function computeTooltipPosition(anchor: Rect, tooltip: Size, viewport: Size, preferred: TooltipPlacement): TooltipPosition {
  return computeFloatingPosition(anchor, tooltip, viewport, preferred, TOOLTIP_GAP, "center");
}
