import { graphGridStep, inflate, right, bottom, snapPoint, strictlyInside, type Point, type Rect } from "./geometry.ts";

/**
 * Ортогональна маршрутизація ребер. Ребро виходить із сокета праворуч (схід) і входить
 * у сокет ліворуч (захід), між ними — горизонтальні й вертикальні відрізки, що обходять
 * ноди з відступом. Пошук — A* на розрідженій сітці ліній уздовж меж перешкод і кінців
 * ребер (orthogonal visibility graph): точок тисячі, а не мільйони, як на піксельній сітці.
 */

export interface RouteEdgeRequest {
  readonly id: string;
  /** Центр вихідного сокета (правий край ноди). */
  readonly from: Point;
  /** Центр вхідного сокета (лівий край ноди). */
  readonly to: Point;
  /** Ручні згини в порядку проходження. */
  readonly bends?: readonly Point[];
}

export interface RouteOptions {
  /** Ноди й згорнуті фрейми, які маршрут обходить. */
  readonly obstacles: readonly Rect[];
  /** Відступ маршруту від перешкоди; половина клітинки — лінія йде серединою проміжку. */
  readonly margin?: number;
  /** Ціна повороту в px довжини: менше зламів важливіше за трохи коротший шлях. */
  readonly bendPenalty?: number;
  /** Відстань між паралельними лініями різних ребер на спільному відрізку. */
  readonly laneGap?: number;
  readonly grid?: number;
}

export interface EdgeRoute {
  readonly id: string;
  readonly points: readonly Point[];
  /** Фактичні згини: ручні, зсунуті з нод на найближче вільне місце. */
  readonly bends: readonly Point[];
}

/** Напрямки руху: схід, південь, захід, північ (індекс — частина стану A*). */
const heading = { east: 0, south: 1, west: 2, north: 3 } as const;
type Dir = 0 | 1 | 2 | 3;
const reverse = (dir: Dir): Dir => ((dir + 2) % 4) as Dir;

/** Мінімальна бінарна купа за пріоритетом: A* без неї — квадратичний на тисячах точок. */
class MinHeap {
  private readonly items: { readonly priority: number; readonly value: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  peek(): number {
    return this.items[0]?.priority ?? Infinity;
  }

  push(priority: number, value: number): void {
    const items = this.items;
    items.push({ priority, value });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]!.priority <= items[index]!.priority) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!top || !last) return undefined;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const rightChild = left + 1;
        let smallest = index;
        if (left < items.length && items[left]!.priority < items[smallest]!.priority) smallest = left;
        if (rightChild < items.length && items[rightChild]!.priority < items[smallest]!.priority) smallest = rightChild;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top.value;
  }
}

const half = (value: number): number => Math.round(value * 2) / 2;

/** Найбільший зсув виносу, який ще вважається похибкою виміру сокета, а не справжньою перешкодою; px. */
const stubTolerance = 2;
const roundPoint = (point: Point): Point => ({ x: half(point.x), y: half(point.y) });
const roundRect = (rect: Rect): Rect => {
  const x = half(rect.x);
  const y = half(rect.y);
  return { x, y, width: half(rect.x + rect.width) - x, height: half(rect.y + rect.height) - y };
};

/** Відсортовані унікальні координати (з точністю до 0,5 px). */
function uniqueSorted(values: readonly number[]): number[] {
  const rounded = values.map((value) => Math.round(value * 2) / 2);
  return [...new Set(rounded)].sort((a, b) => a - b);
}

/** Перший індекс зі значенням ≥ value (бінарний пошук). */
function lowerBound(values: readonly number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid]! < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Сітка ліній маршрутизації. Межі перешкод входять у лінії, тож відрізок між сусідніми
 * лініями або весь усередині перешкоди, або весь поза нею — перевірка однією позначкою.
 */
class RoutingGrid {
  readonly xs: number[];
  readonly ys: number[];
  private readonly blockedPoint: Uint8Array;
  /** Відрізок від (i, j) до (i + 1, j). */
  private readonly blockedEast: Uint8Array;
  /** Відрізок від (i, j) до (i, j + 1). */
  private readonly blockedSouth: Uint8Array;

  constructor(obstacles: readonly Rect[], xs: readonly number[], ys: readonly number[]) {
    this.xs = uniqueSorted(xs);
    this.ys = uniqueSorted(ys);
    const size = this.xs.length * this.ys.length;
    this.blockedPoint = new Uint8Array(size);
    this.blockedEast = new Uint8Array(size);
    this.blockedSouth = new Uint8Array(size);
    for (const rect of obstacles) {
      // Індекси ліній строго всередині та ліній на межах перешкоди.
      const x0 = lowerBound(this.xs, rect.x);
      const x1 = lowerBound(this.xs, right(rect));
      const y0 = lowerBound(this.ys, rect.y);
      const y1 = lowerBound(this.ys, bottom(rect));
      for (let i = x0; i <= x1 && i < this.xs.length; i += 1) {
        for (let j = y0; j <= y1 && j < this.ys.length; j += 1) {
          const x = this.xs[i]!;
          const y = this.ys[j]!;
          const insideX = x > rect.x && x < right(rect);
          const insideY = y > rect.y && y < bottom(rect);
          const index = this.index(i, j);
          if (insideX && insideY) this.blockedPoint[index] = 1;
          // Горизонтальний відрізок усередині, якщо його рядок строго в межах по y, а сам він між межами по x.
          if (insideY && i < x1 && x >= rect.x) this.blockedEast[index] = 1;
          if (insideX && j < y1 && y >= rect.y) this.blockedSouth[index] = 1;
        }
      }
    }
  }

  index(i: number, j: number): number {
    return i * this.ys.length + j;
  }

  find(point: Point): number | null {
    const i = lowerBound(this.xs, Math.round(point.x * 2) / 2);
    const j = lowerBound(this.ys, Math.round(point.y * 2) / 2);
    if (this.xs[i] !== Math.round(point.x * 2) / 2 || this.ys[j] !== Math.round(point.y * 2) / 2) return null;
    return this.index(i, j);
  }

  point(index: number): Point {
    return { x: this.xs[Math.floor(index / this.ys.length)]!, y: this.ys[index % this.ys.length]! };
  }

  isFree(index: number): boolean {
    return this.blockedPoint[index] === 0;
  }

  /** Сусід у напрямку dir або null, якщо його немає чи відрізок закритий. */
  neighbour(index: number, dir: Dir): number | null {
    const ny = this.ys.length;
    const i = Math.floor(index / ny);
    const j = index % ny;
    let next: number | null = null;
    if (dir === heading.east && i + 1 < this.xs.length && !this.blockedEast[index]) next = index + ny;
    else if (dir === heading.west && i > 0 && !this.blockedEast[index - ny]) next = index - ny;
    else if (dir === heading.south && j + 1 < ny && !this.blockedSouth[index]) next = index + 1;
    else if (dir === heading.north && j > 0 && !this.blockedSouth[index - 1]) next = index - 1;
    return next !== null && this.isFree(next) ? next : null;
  }
}

/**
 * A* між двома точками сітки зі станом «точка + напрямок»: поворот коштує bendPenalty,
 * розворот назад заборонено (лінія лягла б на саму себе). endDir — бажаний напрямок
 * прибуття (у вхідний сокет — на схід); інший напрямок прибуття дорожчий. На ручному
 * згині розворот дозволено (reverseAtStart), але дорого: користувач сам поставив точку.
 */
function search(
  grid: RoutingGrid,
  start: number,
  startDir: Dir,
  goal: number,
  endDir: Dir | null,
  bendPenalty: number,
  reverseAtStart: boolean,
): { points: Point[]; dir: Dir } | null {
  if (!grid.isFree(start) || !grid.isFree(goal)) return null;
  const goalPoint = grid.point(goal);
  const heuristic = (index: number): number => {
    const point = grid.point(index);
    return Math.abs(point.x - goalPoint.x) + Math.abs(point.y - goalPoint.y);
  };
  const cost = new Map<number, number>();
  const previous = new Map<number, number>();
  const heap = new MinHeap();
  const state = (index: number, dir: Dir): number => index * 4 + dir;
  const startState = state(start, startDir);
  cost.set(startState, 0);
  heap.push(heuristic(start), startState);
  const arrival = (dir: Dir): number => (endDir === null || dir === endDir ? 0 : dir === reverse(endDir) ? bendPenalty * 2 : bendPenalty);
  let best: { readonly state: number; readonly total: number } | null = null;
  while (heap.size > 0) {
    if (best && heap.peek() >= best.total) break;
    const current = heap.pop()!;
    const index = Math.floor(current / 4);
    const dir = (current % 4) as Dir;
    const g = cost.get(current)!;
    if (index === goal) {
      const total = g + arrival(dir);
      if (!best || total < best.total) best = { state: current, total };
      continue;
    }
    const here = grid.point(index);
    for (const nextDir of [0, 1, 2, 3] as const) {
      const reversing = nextDir === reverse(dir);
      if (reversing && !(reverseAtStart && index === start)) continue;
      const next = grid.neighbour(index, nextDir);
      if (next === null) continue;
      const there = grid.point(next);
      const turn = nextDir === dir ? 0 : reversing ? bendPenalty * 2 : bendPenalty;
      const stepCost = g + Math.abs(there.x - here.x) + Math.abs(there.y - here.y) + turn;
      const nextState = state(next, nextDir);
      if (stepCost < (cost.get(nextState) ?? Infinity)) {
        cost.set(nextState, stepCost);
        previous.set(nextState, current);
        heap.push(stepCost + heuristic(next), nextState);
      }
    }
  }
  if (!best) return null;
  const points: Point[] = [];
  for (let cursor: number | undefined = best.state; cursor !== undefined; cursor = previous.get(cursor)) points.push(grid.point(Math.floor(cursor / 4)));
  return { points: points.reverse(), dir: (best.state % 4) as Dir };
}

/** Запасний маршрут, коли обійти перешкоди не вдалося (кінець усередині ноди під час руху). */
function fallbackLeg(from: Point, to: Point): Point[] {
  const middle = (from.x + to.x) / 2;
  return [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to];
}

/** Без повторів і проміжних точок на прямій: кожна точка — справжній злам. */
export function simplify(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) continue;
    const beforeLast = result[result.length - 2];
    if (last && beforeLast) {
      const collinear = (Math.abs(beforeLast.x - last.x) < 0.01 && Math.abs(last.x - point.x) < 0.01) || (Math.abs(beforeLast.y - last.y) < 0.01 && Math.abs(last.y - point.y) < 0.01);
      if (collinear) result.pop();
    }
    result.push(point);
  }
  return result;
}

/**
 * Згин на ноді (або надто близько) зсувається на найближчий вільний вузол сітки; якщо
 * поблизу вільного немає — згин ігнорується, маршрут будується автоматично.
 */
export function correctBend(bend: Point, obstacles: readonly Rect[], margin = graphGridStep / 2, grid = graphGridStep, radius = 12): Point | null {
  const inflated = obstacles.map((rect) => inflate(rect, margin));
  const free = (point: Point): boolean => inflated.every((rect) => !strictlyInside(point, rect));
  const start = snapPoint(bend, grid);
  if (free(start)) return start;
  for (let ring = 1; ring <= radius; ring += 1) {
    const candidates: Point[] = [];
    for (let i = -ring; i <= ring; i += 1) {
      candidates.push({ x: i, y: -ring }, { x: i, y: ring });
      if (i !== -ring && i !== ring) candidates.push({ x: -ring, y: i }, { x: ring, y: i });
    }
    candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const candidate of candidates) {
      const point = { x: start.x + candidate.x * grid, y: start.y + candidate.y * grid };
      if (free(point)) return point;
    }
  }
  return null;
}

interface Segment {
  readonly route: number;
  /** Індекс першої точки відрізка в маршруті. */
  readonly index: number;
  readonly at: number;
  readonly min: number;
  readonly max: number;
  /** Куди відходять сусідні відрізки: визначає порядок смуг без зайвих перетинів. */
  readonly order: number;
}

/**
 * Розведення спільних відрізків: ребра, що лягли на одну лінію, отримують паралельні
 * смуги з кроком laneGap, але не ширше за відступ від нод (лінії не заходять на ноди).
 * Перший і останній відрізки не зсуваються — вони прикріплені до сокетів.
 */
function separateLanes(routes: Point[][], laneGap: number, maxSpread: number): void {
  const horizontal: Segment[] = [];
  const vertical: Segment[] = [];
  routes.forEach((points, route) => {
    for (let index = 1; index < points.length - 2; index += 1) {
      const a = points[index]!;
      const b = points[index + 1]!;
      const before = points[index - 1]!;
      const after = points[index + 2]!;
      if (Math.abs(a.y - b.y) < 0.01) {
        horizontal.push({ route, index, at: a.y, min: Math.min(a.x, b.x), max: Math.max(a.x, b.x), order: before.y + after.y - 2 * a.y });
      } else {
        vertical.push({ route, index, at: a.x, min: Math.min(a.y, b.y), max: Math.max(a.y, b.y), order: before.x + after.x - 2 * a.x });
      }
    }
  });
  const shifts = (segments: readonly Segment[]): Map<Segment, number> => {
    const result = new Map<Segment, number>();
    const byLine = new Map<number, Segment[]>();
    for (const segment of segments) {
      const key = Math.round(segment.at * 2) / 2;
      byLine.set(key, [...(byLine.get(key) ?? []), segment]);
    }
    for (const line of byLine.values()) {
      line.sort((a, b) => a.min - b.min);
      // Компоненти відрізків, що перекриваються (дотик у точці — не перекриття).
      let group: Segment[] = [];
      let reach = -Infinity;
      const flush = (): void => {
        const routesInGroup = new Set(group.map((segment) => segment.route));
        if (routesInGroup.size > 1) {
          const ordered = [...group].sort((a, b) => a.order - b.order || a.route - b.route);
          const gap = Math.min(laneGap, (maxSpread * 2) / Math.max(1, ordered.length - 1));
          ordered.forEach((segment, lane) => result.set(segment, (lane - (ordered.length - 1) / 2) * gap));
        }
        group = [];
      };
      for (const segment of line) {
        if (group.length > 0 && segment.min >= reach - 0.5) flush();
        group.push(segment);
        reach = group.length === 1 ? segment.max : Math.max(reach, segment.max);
      }
      flush();
    }
    return result;
  };
  for (const [segment, shift] of shifts(horizontal)) {
    const points = routes[segment.route]!;
    points[segment.index] = { ...points[segment.index]!, y: points[segment.index]!.y + shift };
    points[segment.index + 1] = { ...points[segment.index + 1]!, y: points[segment.index + 1]!.y + shift };
  }
  for (const [segment, shift] of shifts(vertical)) {
    const points = routes[segment.route]!;
    points[segment.index] = { ...points[segment.index]!, x: points[segment.index]!.x + shift };
    points[segment.index + 1] = { ...points[segment.index + 1]!, x: points[segment.index + 1]!.x + shift };
  }
}

/**
 * Маршрути всіх ребер за один прохід: сітка ліній будується один раз для всіх ребер,
 * потім A* для кожного відрізка між кінцями й згинами, потім розведення смуг.
 */
export function routeEdges(edges: readonly RouteEdgeRequest[], { obstacles, margin = graphGridStep / 2, bendPenalty = graphGridStep * 2, laneGap = 6, grid = graphGridStep }: RouteOptions): EdgeRoute[] {
  // Півпіксельна точність: виміряні розміри дробові, а лінії сітки порівнюються точно.
  const inflated = obstacles.map((rect) => roundRect(inflate(rect, margin)));
  /**
   * Кінець виносу біля сокета має лягти на межу зони відступу власної ноди. Центр сокета
   * виміряний точно і через рамку стоїть на частку пікселя від контуру — тоді точка
   * опинялася б на півпікселя всередині зони, A* не знаходив шляху і ребро йшло навпростець
   * крізь ноди. Такий субпіксельний зсув притягується до межі.
   */
  const clearOfNode = (point: Point, side: "right" | "left"): Point => {
    let x = point.x;
    for (const rect of inflated) {
      if (!strictlyInside({ x, y: point.y }, rect)) continue;
      const edge = side === "right" ? right(rect) : rect.x;
      if (Math.abs(edge - x) <= stubTolerance) x = edge;
    }
    return { x, y: point.y };
  };
  const prepared = edges.map((edge) => ({
    edge: { ...edge, from: roundPoint(edge.from), to: roundPoint(edge.to) },
    start: clearOfNode(roundPoint({ x: edge.from.x + margin, y: edge.from.y }), "right"),
    end: clearOfNode(roundPoint({ x: edge.to.x - margin, y: edge.to.y }), "left"),
    bends: (edge.bends ?? []).flatMap((bend) => {
      const corrected = correctBend(bend, obstacles, margin, grid);
      return corrected ? [corrected] : [];
    }),
  }));
  const xs = inflated.flatMap((rect) => [rect.x, right(rect)]);
  const ys = inflated.flatMap((rect) => [rect.y, bottom(rect)]);
  for (const item of prepared) {
    for (const point of [item.start, item.end, ...item.bends]) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  const routingGrid = new RoutingGrid(inflated, xs, ys);
  const routes = prepared.map(({ edge, start, end, bends }) => {
    const waypoints = [start, ...bends, end];
    const points: Point[] = [edge.from, start];
    let dir: Dir = heading.east;
    for (let leg = 0; leg + 1 < waypoints.length; leg += 1) {
      const from = waypoints[leg]!;
      const to = waypoints[leg + 1]!;
      const last = leg + 2 === waypoints.length;
      const startIndex = routingGrid.find(from);
      const goalIndex = routingGrid.find(to);
      const found: { points: Point[]; dir: Dir } | null = startIndex !== null && goalIndex !== null ? search(routingGrid, startIndex, dir, goalIndex, last ? heading.east : null, bendPenalty, leg > 0) : null;
      if (found) {
        points.push(...found.points.slice(1));
        dir = found.dir;
      } else {
        points.push(...fallbackLeg(from, to).slice(1));
        dir = heading.east;
      }
    }
    points.push(edge.to);
    return simplify(points);
  });
  separateLanes(routes, laneGap, Math.max(0, margin - 2));
  return routes.map((points, index) => ({ id: prepared[index]!.edge.id, points, bends: prepared[index]!.bends }));
}

/** SVG-шлях ламаної із заокругленими кутами (радіус не більший за половину відрізка). */
export function routePath(points: readonly Point[], radius = 6): string {
  const first = points[0];
  if (!first) return "";
  let path = `M${first.x} ${first.y}`;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const before = points[index - 1]!;
    const after = points[index + 1];
    if (!after) {
      path += `L${point.x} ${point.y}`;
      continue;
    }
    const inLength = Math.hypot(point.x - before.x, point.y - before.y);
    const outLength = Math.hypot(after.x - point.x, after.y - point.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const enter = { x: point.x - ((point.x - before.x) / inLength) * r, y: point.y - ((point.y - before.y) / inLength) * r };
    const leave = { x: point.x + ((after.x - point.x) / outLength) * r, y: point.y + ((after.y - point.y) / outLength) * r };
    path += `L${enter.x} ${enter.y}Q${point.x} ${point.y} ${leave.x} ${leave.y}`;
  }
  return path;
}

/** Довжина від початку маршруту до найближчої до point точки на ньому. */
function distanceAlong(points: readonly Point[], point: Point): { readonly along: number; readonly distance: number } {
  let best = { along: 0, distance: Infinity };
  let travelled = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (length * length)));
    const projected = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < best.distance) best = { along: travelled + length * t, distance };
    travelled += length;
  }
  return best;
}

/** Відстань від точки до маршруту: щоб вибрати ребро під курсором. */
export const distanceToRoute = (points: readonly Point[], point: Point): number => distanceAlong(points, point).distance;

/**
 * Місце нового згину серед наявних: за положенням уздовж маршруту, тож новий згин
 * не змушує лінію повертатися назад до попереднього.
 */
export function bendInsertIndex(points: readonly Point[], bends: readonly Point[], point: Point): number {
  const at = distanceAlong(points, point).along;
  return bends.filter((bend) => distanceAlong(points, bend).along < at).length;
}
