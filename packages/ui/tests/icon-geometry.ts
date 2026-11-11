/**
 * Геометрія іконок для тестів: jsdom не вміє getTotalLength, тож шлях SVG розбирається
 * тут і перетворюється на рівномірні точки вздовж лінії. Підтримано команди, які дають
 * помічники набору: M L H V C S A Z (абсолютні й відносні).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SampledPath {
  readonly points: readonly Point[];
  /** Кінці незамкнених підшляхів: там лінії навмисно з'єднуються з іншими. */
  readonly ends: readonly Point[];
}

const argCount: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, a: 7, z: 0 };

type Segment = (t: number) => Point;

function arcSegment(from: Point, rxIn: number, ryIn: number, angle: number, large: boolean, sweep: boolean, to: Point): Segment {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  // Перехід від кінцевих точок до центру дуги (SVG 1.1, додаток F.6.5).
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2;
  const cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;
  const angleBetween = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angleBetween(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angleBetween((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  return (t) => {
    const theta = start + delta * t;
    return {
      x: cx + rx * cos * Math.cos(theta) - ry * sin * Math.sin(theta),
      y: cy + rx * sin * Math.cos(theta) + ry * cos * Math.sin(theta),
    };
  };
}

const cubicSegment = (p0: Point, p1: Point, p2: Point, p3: Point): Segment => (t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

const lineSegment = (a: Point, b: Point): Segment => (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function sampleSegment(segment: Segment, step: number): Point[] {
  // Довжину оцінюємо ламаною: точності достатньо, щоб крок між точками був ≈ step.
  let length = 0;
  let previous = segment(0);
  for (let i = 1; i <= 32; i += 1) {
    const point = segment(i / 32);
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  const count = Math.max(2, Math.ceil(length / step));
  return Array.from({ length: count + 1 }, (_, i) => segment(i / count));
}

export function samplePath(d: string, step = 0.1): SampledPath {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const points: Point[] = [];
  const ends: Point[] = [];
  let index = 0;
  let current: Point = { x: 0, y: 0 };
  let subpathStart: Point = current;
  let subpathPoints: Point[] = [];
  let lastControl: Point | null = null;
  let command = "";

  const closeSubpath = (closed: boolean) => {
    if (subpathPoints.length > 1 && !closed) ends.push(subpathPoints[0]!, subpathPoints[subpathPoints.length - 1]!);
    points.push(...subpathPoints);
    subpathPoints = [];
  };
  const add = (segment: Segment) => {
    const sampled = sampleSegment(segment, step);
    subpathPoints.push(...(subpathPoints.length > 0 ? sampled.slice(1) : sampled));
  };

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      index += 1;
      if (command.toLowerCase() === "z") {
        add(lineSegment(current, subpathStart));
        current = subpathStart;
        closeSubpath(true);
        lastControl = null;
        continue;
      }
    }
    const lower = command.toLowerCase();
    const relative = command === lower;
    const args = tokens.slice(index, index + argCount[lower]!).map(Number);
    if (args.length < argCount[lower]! || args.some(Number.isNaN)) throw new Error(`Невідомий шлях: ${d}`);
    index += argCount[lower]!;
    const at = (x: number, y: number): Point => (relative ? { x: current.x + x, y: current.y + y } : { x, y });
    let control: Point | null = null;
    switch (lower) {
      case "m": {
        closeSubpath(false);
        current = at(args[0]!, args[1]!);
        subpathStart = current;
        // Наступні пари після M — неявні L.
        command = relative ? "l" : "L";
        break;
      }
      case "l": {
        const next = at(args[0]!, args[1]!);
        add(lineSegment(current, next));
        current = next;
        break;
      }
      case "h": {
        const next = { x: relative ? current.x + args[0]! : args[0]!, y: current.y };
        add(lineSegment(current, next));
        current = next;
        break;
      }
      case "v": {
        const next = { x: current.x, y: relative ? current.y + args[0]! : args[0]! };
        add(lineSegment(current, next));
        current = next;
        break;
      }
      case "c": {
        const p1 = at(args[0]!, args[1]!);
        const p2 = at(args[2]!, args[3]!);
        const next = at(args[4]!, args[5]!);
        add(cubicSegment(current, p1, p2, next));
        control = p2;
        current = next;
        break;
      }
      case "s": {
        const p1 = lastControl ? { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y } : current;
        const p2 = at(args[0]!, args[1]!);
        const next = at(args[2]!, args[3]!);
        add(cubicSegment(current, p1, p2, next));
        control = p2;
        current = next;
        break;
      }
      case "a": {
        const next = at(args[5]!, args[6]!);
        add(arcSegment(current, args[0]!, args[1]!, args[2]!, args[3] === 1, args[4] === 1, next));
        current = next;
        break;
      }
    }
    lastControl = control;
  }
  closeSubpath(false);
  return { points, ends };
}

/** Просторова сітка для пошуку найближчої точки без повного перебору. */
export function nearestDistance(points: readonly Point[], cell = 2.5): (point: Point) => number {
  const grid = new Map<string, Point[]>();
  for (const point of points) {
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(point);
    else grid.set(key, [point]);
  }
  return (point) => {
    const cx = Math.floor(point.x / cell);
    const cy = Math.floor(point.y / cell);
    let best = Number.POSITIVE_INFINITY;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          best = Math.min(best, Math.hypot(point.x - other.x, point.y - other.y));
        }
      }
    }
    return best;
  };
}
