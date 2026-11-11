/**
 * Розрахунок позиції плаваючого шару (підказка, popover, меню) у координатах viewport
 * (position: fixed). Чиста функція без DOM, щоб правила зіткнень перевірялися тестами напряму.
 */

export type FloatingSide = "top" | "bottom" | "left" | "right";
/** Вирівнювання вздовж сторони тригера: start — лівий/верхній край, end — правий/нижній. */
export type FloatingAlign = "start" | "center" | "end";

export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface FloatingPosition {
  readonly top: number;
  readonly left: number;
  /** Фактичний бік після можливого перевороту. */
  readonly placement: FloatingSide;
}

/** Мінімальний відступ шару від краю viewport. */
export const VIEWPORT_MARGIN = 8;

const opposite: Record<FloatingSide, FloatingSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const clamp = (value: number, min: number, max: number): number =>
  max < min ? min : Math.min(Math.max(value, min), max);

/** Вільне місце з кожного боку тригера з урахуванням зазору й поля viewport. */
function spaceOn(side: FloatingSide, anchor: Rect, viewport: Size, gap: number): number {
  switch (side) {
    case "top":
      return anchor.top - gap - VIEWPORT_MARGIN;
    case "bottom":
      return viewport.height - (anchor.top + anchor.height) - gap - VIEWPORT_MARGIN;
    case "left":
      return anchor.left - gap - VIEWPORT_MARGIN;
    case "right":
      return viewport.width - (anchor.left + anchor.width) - gap - VIEWPORT_MARGIN;
  }
}

/** Координата вздовж сторони тригера за вирівнюванням. */
function alignOn(start: number, length: number, size: number, align: FloatingAlign): number {
  if (align === "start") return start;
  if (align === "end") return start + length - size;
  return start + length / 2 - size / 2;
}

/**
 * Обирає бік і координати:
 * - бажаний бік, якщо шар вміщується;
 * - протилежний, якщо там вміщується, а на бажаному — ні;
 * - інакше бік (з цих двох) із більшим простором, з притисканням до меж екрана.
 * Уздовж сторони шар вирівнюється за `align` і зсувається від країв viewport.
 */
export function computeFloatingPosition(
  anchor: Rect,
  floating: Size,
  viewport: Size,
  preferred: FloatingSide,
  gap: number,
  align: FloatingAlign = "center",
): FloatingPosition {
  const vertical = preferred === "top" || preferred === "bottom";
  const need = vertical ? floating.height : floating.width;
  const flipped = opposite[preferred];

  let placement = preferred;
  if (spaceOn(preferred, anchor, viewport, gap) < need) {
    const there = spaceOn(flipped, anchor, viewport, gap);
    if (there >= need || there > spaceOn(preferred, anchor, viewport, gap)) {
      placement = flipped;
    }
  }

  let top: number;
  let left: number;
  if (placement === "top" || placement === "bottom") {
    top = placement === "top" ? anchor.top - gap - floating.height : anchor.top + anchor.height + gap;
    left = alignOn(anchor.left, anchor.width, floating.width, align);
  } else {
    left = placement === "left" ? anchor.left - gap - floating.width : anchor.left + anchor.width + gap;
    top = alignOn(anchor.top, anchor.height, floating.height, align);
  }

  return {
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - floating.height - VIEWPORT_MARGIN),
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - floating.width - VIEWPORT_MARGIN),
    placement,
  };
}
