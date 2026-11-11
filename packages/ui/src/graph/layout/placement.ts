import { bottom, conflicts, graphGridStep, right, snapUp, translate, type Point, type Rect } from "./geometry.ts";

/** Об'єкт розкладки: нода чи фрейм (як суцільний блок) у світових координатах. */
export interface PlacementItem {
  readonly id: string;
  readonly rect: Rect;
  /** Закріплений об'єкт не зсувається: розсування крізь нього неможливе. */
  readonly pinned?: boolean;
}

export interface PlacementRequest {
  /** Переміщувана нода чи група — вже в бажаному (прив'язаному до сітки) положенні. */
  readonly moving: readonly PlacementItem[];
  /** Решта видимих об'єктів у поточному положенні. */
  readonly others: readonly PlacementItem[];
  readonly gap?: number;
  readonly grid?: number;
  /** Найбільший зсув однієї сусідньої ноди; далі розсування вважається неможливим. */
  readonly maxPush?: number;
  /** Радіус пошуку вільного місця, клітинок сітки. */
  readonly searchRadius?: number;
}

/**
 * clear — місце вільне; push — сусіди розсунуті; relocate — група зсунута на найближче
 * вільне місце (offset); blocked — вільного місця поблизу немає, переміщення скасовується.
 */
export type PlacementStrategy = "clear" | "push" | "relocate" | "blocked";

export interface PlacementResult {
  readonly strategy: PlacementStrategy;
  /** Додатковий зсув переміщуваної групи від бажаного положення (relocate). */
  readonly offset: Point;
  /** Нові лівий-верхній кути розсунутих сусідів. */
  readonly pushed: ReadonlyMap<string, Point>;
}

type Direction = "right" | "down" | "left" | "up";
const directions: readonly Direction[] = ["right", "down", "left", "up"];

/** Розсування без межі може тягнутися ланцюгом безкінечно (кільце нод); межа ітерацій страхує. */
const maxPushRounds = 200;

/** Зсув, що виводить other за межу blocker у напрямку direction із проміжком gap. */
function shiftAway(blocker: Rect, other: Rect, direction: Direction, gap: number, grid: number): Point {
  switch (direction) {
    case "right":
      return { x: snapUp(right(blocker) + gap - other.x, grid), y: 0 };
    case "left":
      return { x: -snapUp(right(other) + gap - blocker.x, grid), y: 0 };
    case "down":
      return { x: 0, y: snapUp(bottom(blocker) + gap - other.y, grid) };
    case "up":
      return { x: 0, y: -snapUp(bottom(other) + gap - blocker.y, grid) };
  }
}

/**
 * Розсування в одному напрямку: кожен об'єкт, що конфліктує з переміщуваною групою чи
 * вже зсунутим сусідом, зсувається далі в тому ж напрямку (ланцюгом). Один напрямок для
 * всього ланцюга — інакше сусіди штовхали б одне одного назад і рух не сходився б.
 */
function pushInDirection(
  moving: readonly Rect[],
  others: readonly PlacementItem[],
  direction: Direction,
  gap: number,
  grid: number,
  maxPush: number,
): { readonly pushed: Map<string, Point>; readonly cost: number } | null {
  const positions = new Map(others.map((item) => [item.id, item.rect]));
  const origin = new Map(others.map((item) => [item.id, item.rect]));
  const pushedIds = new Set<string>();
  for (let round = 0; round < maxPushRounds; round += 1) {
    let changed = false;
    const blockers: Rect[] = [...moving, ...[...pushedIds].map((id) => positions.get(id)!)];
    for (const item of others) {
      const current = positions.get(item.id)!;
      for (const blocker of blockers) {
        if (blocker === current || !conflicts(blocker, current, gap)) continue;
        if (item.pinned) return null;
        const shift = shiftAway(blocker, current, direction, gap, grid);
        const next = translate(current, shift.x, shift.y);
        const start = origin.get(item.id)!;
        if (Math.abs(next.x - start.x) > maxPush || Math.abs(next.y - start.y) > maxPush) return null;
        positions.set(item.id, next);
        pushedIds.add(item.id);
        changed = true;
        break;
      }
    }
    if (!changed) {
      const pushed = new Map<string, Point>();
      let cost = 0;
      for (const id of pushedIds) {
        const rect = positions.get(id)!;
        const start = origin.get(id)!;
        pushed.set(id, { x: rect.x, y: rect.y });
        cost += Math.abs(rect.x - start.x) + Math.abs(rect.y - start.y);
      }
      return { pushed, cost };
    }
  }
  return null;
}

const fits = (moving: readonly Rect[], obstacles: readonly Rect[], gap: number): boolean =>
  moving.every((rect) => obstacles.every((obstacle) => !conflicts(rect, obstacle, gap)));

/**
 * Найближче вільне положення групи: кільця навколо бажаного місця з кроком сітки,
 * у кільці — за евклідовою відстанню (кандидати ближче до курсора раніше).
 */
export function findFreeOffset(moving: readonly Rect[], obstacles: readonly Rect[], gap = graphGridStep, grid = graphGridStep, radius = 30): Point | null {
  for (let ring = 1; ring <= radius; ring += 1) {
    const candidates: Point[] = [];
    for (let i = -ring; i <= ring; i += 1) {
      candidates.push({ x: i, y: -ring }, { x: i, y: ring });
      if (i !== -ring && i !== ring) candidates.push({ x: -ring, y: i }, { x: ring, y: i });
    }
    candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const candidate of candidates) {
      const offset = { x: candidate.x * grid, y: candidate.y * grid };
      if (fits(moving.map((rect) => translate(rect, offset.x, offset.y)), obstacles, gap)) return offset;
    }
  }
  return null;
}

const noOffset: Point = { x: 0, y: 0 };
const nothingPushed: ReadonlyMap<string, Point> = new Map();

/**
 * Розміщення переміщуваної ноди чи групи. Порядок: місце вільне → розсунути сусідів
 * (напрямок із найменшим сумарним зсувом, закріплені не рухаються) → найближче вільне
 * місце для самої групи → скасування. Між об'єктами лишається щонайменше gap (одна клітинка).
 */
export function resolvePlacement({ moving, others, gap = graphGridStep, grid = graphGridStep, maxPush = graphGridStep * 12, searchRadius = 30 }: PlacementRequest): PlacementResult {
  const rects = moving.map((item) => item.rect);
  if (fits(rects, others.map((item) => item.rect), gap)) return { strategy: "clear", offset: noOffset, pushed: nothingPushed };
  let best: { readonly pushed: Map<string, Point>; readonly cost: number } | null = null;
  for (const direction of directions) {
    const attempt = pushInDirection(rects, others, direction, gap, grid, maxPush);
    if (attempt && (!best || attempt.cost < best.cost)) best = attempt;
  }
  if (best) return { strategy: "push", offset: noOffset, pushed: best.pushed };
  const offset = findFreeOffset(rects, others.map((item) => item.rect), gap, grid, searchRadius);
  return offset ? { strategy: "relocate", offset, pushed: nothingPushed } : { strategy: "blocked", offset: noOffset, pushed: nothingPushed };
}

/** Напрямна вирівнювання: вертикальна (axis x) чи горизонтальна лінія між двома об'єктами. */
export interface AlignmentGuide {
  readonly axis: "x" | "y";
  /** Координата лінії. */
  readonly at: number;
  /** Протяжність уздовж іншої осі. */
  readonly from: number;
  readonly to: number;
}

/**
 * Напрямні для об'єкта в остаточному положенні: збіг лівого краю, центру чи правого краю
 * (верху, центру, низу) з іншим об'єктом. Однакові лінії зливаються в одну довшу.
 */
export function alignmentGuides(target: Rect, others: readonly Rect[], tolerance = 0.5): readonly AlignmentGuide[] {
  const lines = new Map<string, AlignmentGuide>();
  const add = (axis: "x" | "y", at: number, from: number, to: number): void => {
    const key = `${axis}:${Math.round(at * 2) / 2}`;
    const existing = lines.get(key);
    lines.set(key, existing ? { ...existing, from: Math.min(existing.from, from), to: Math.max(existing.to, to) } : { axis, at, from, to });
  };
  const xs = (rect: Rect): readonly number[] => [rect.x, rect.x + rect.width / 2, right(rect)];
  const ys = (rect: Rect): readonly number[] => [rect.y, rect.y + rect.height / 2, bottom(rect)];
  for (const other of others) {
    for (const a of xs(target)) {
      if (xs(other).some((b) => Math.abs(a - b) < tolerance)) add("x", a, Math.min(target.y, other.y), Math.max(bottom(target), bottom(other)));
    }
    for (const a of ys(target)) {
      if (ys(other).some((b) => Math.abs(a - b) < tolerance)) add("y", a, Math.min(target.x, other.x), Math.max(right(target), right(other)));
    }
  }
  return [...lines.values()];
}
