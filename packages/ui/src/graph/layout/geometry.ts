/**
 * Базова геометрія полотна графа. Чисті функції без DOM: розкладку, колізії й маршрути
 * можна перевірити в тестах без браузера, а полотно лише вимірює розміри нод.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Крок сітки полотна, px світу. Дорівнює --ix-space-5: ноди, фрейми й згини стоять у
 * вузлах сітки, тож вирівнювання видно без лінійки. Це ж мінімальний проміжок між нодами.
 */
export const graphGridStep = 20;

/** «|| 0» прибирає -0: інакше він потрапляв би в дані розкладки й порівняння. */
export const snap = (value: number, step = graphGridStep): number => Math.round(value / step) * step || 0;

/** Округлення вгору до кроку: зсув, що розводить ноди, не має бути меншим за потрібний. */
export const snapUp = (value: number, step = graphGridStep): number => Math.ceil(value / step - 1e-9) * step || 0;

export const snapPoint = (point: Point, step = graphGridStep): Point => ({ x: snap(point.x, step), y: snap(point.y, step) });

export const translate = (rect: Rect, dx: number, dy: number): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

export const inflate = (rect: Rect, margin: number): Rect => ({
  x: rect.x - margin,
  y: rect.y - margin,
  width: rect.width + margin * 2,
  height: rect.height + margin * 2,
});

export const right = (rect: Rect): number => rect.x + rect.width;
export const bottom = (rect: Rect): number => rect.y + rect.height;
export const centre = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/**
 * Прямокутники ближчі один до одного, ніж gap (або перетинаються). Рівно gap — дозволено:
 * сусідні ноди через одну клітинку не конфліктують.
 */
export function conflicts(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < right(b) + gap && b.x < right(a) + gap && a.y < bottom(b) + gap && b.y < bottom(a) + gap;
}

/** Точка строго всередині: межа вважається вільною (по ній ідуть маршрути ребер). */
export const strictlyInside = (point: Point, rect: Rect): boolean =>
  point.x > rect.x && point.x < right(rect) && point.y > rect.y && point.y < bottom(rect);

export const containsPoint = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x && point.x <= right(rect) && point.y >= rect.y && point.y <= bottom(rect);

/** Найменший прямокутник, що охоплює всі; null для порожнього переліку. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return { x, y, width: Math.max(...rects.map(right)) - x, height: Math.max(...rects.map(bottom)) - y };
}
