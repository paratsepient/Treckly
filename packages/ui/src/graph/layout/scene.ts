import { bottom, centre, conflicts, containsPoint, graphGridStep, right, snap, snapUp, translate, type Point, type Rect } from "./geometry.ts";
import { alignmentGuides, findFreeOffset, resolvePlacement, type AlignmentGuide, type PlacementItem, type PlacementStrategy } from "./placement.ts";
import { correctBend, type RouteEdgeRequest } from "./routing.ts";

/**
 * Сцена полотна: ноди, фрейми й ребра в координатах світу. З неї виводяться видимість
 * (згорнуті фрейми), перешкоди для маршрутів і план переміщення. Чисті функції: полотно
 * лише вимірює розміри нод і передає сюди.
 */

export interface SceneNode {
  readonly id: string;
  readonly rect: Rect;
  readonly pinned?: boolean;
  /**
   * Фрейм, якому належить нода. Явне поле, а не «центр усередині»: інакше нода, поставлена
   * на місце згорнутого фрейма, зникала б разом із його вмістом.
   */
  readonly frame?: string;
  /** Центри сокетів у координатах світу за id порту. */
  readonly ports: ReadonlyMap<string, Point>;
}

export interface SceneFrame {
  readonly id: string;
  /** Розгорнутий прямокутник (зберігається і в згорнутому стані). */
  readonly rect: Rect;
  readonly collapsed?: boolean;
}

export interface SceneEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly bends?: readonly Point[];
}

export interface Scene {
  readonly nodes: readonly SceneNode[];
  readonly frames: readonly SceneFrame[];
}

/** Згорнутий фрейм — компактний блок у лівому верхньому куті розгорнутого. */
export const collapsedFrameSize = { width: graphGridStep * 12, height: graphGridStep * 3 } as const;

export function collapsedFrameRect(frame: Rect): Rect {
  return { x: frame.x, y: frame.y, width: Math.min(frame.width, collapsedFrameSize.width), height: Math.min(frame.height, collapsedFrameSize.height) };
}

/** Фактичний прямокутник фрейма на полотні з урахуванням згортання. */
export const frameFootprint = (frame: SceneFrame): Rect => (frame.collapsed ? collapsedFrameRect(frame.rect) : frame.rect);

/**
 * Фрейм під нодою після скидання: розгорнутий фрейм, що містить центр ноди; з кількох —
 * найменший. Згорнутий фрейм нод не приймає — його площа на полотні лише компактний блок.
 */
export function frameAt(frames: readonly SceneFrame[], rect: Rect): string | null {
  const point = centre(rect);
  const candidates = frames.filter((frame) => !frame.collapsed && containsPoint(frame.rect, point));
  candidates.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
  return candidates[0]?.id ?? null;
}

/** Власники нод: лише наявні фрейми (посилання на видалений фрейм ігнорується). */
function owners(scene: Scene): Map<string, string> {
  const frames = new Set(scene.frames.map((frame) => frame.id));
  const owner = new Map<string, string>();
  for (const node of scene.nodes) if (node.frame !== undefined && frames.has(node.frame)) owner.set(node.id, node.frame);
  return owner;
}

export interface VisibleScene {
  /** Ноди, сховані згорнутими фреймами. */
  readonly hidden: ReadonlySet<string>;
  /** Учасники кожного фрейма (зокрема згорнутого). */
  readonly members: ReadonlyMap<string, readonly string[]>;
  /** Перешкоди для маршрутів: видимі ноди й згорнуті фрейми. */
  readonly obstacles: readonly Rect[];
  /** Ребра з координатами кінців; внутрішні ребра згорнутих фреймів відсутні. */
  readonly edges: readonly RouteEdgeRequest[];
}

/**
 * Видима сцена. Ребро до схованої ноди під'єднується до краю згорнутого фрейма (вхідні —
 * ліворуч, вихідні — праворуч), кінці розподіляються по висоті, щоб лінії не зливалися;
 * ребро всередині одного згорнутого фрейма ховається разом із нодами.
 */
export function visibleScene(scene: Scene, edges: readonly SceneEdge[]): VisibleScene {
  const owner = owners(scene);
  const frames = new Map(scene.frames.map((frame) => [frame.id, frame]));
  const members = new Map<string, string[]>(scene.frames.map((frame) => [frame.id, []]));
  const hidden = new Set<string>();
  for (const node of scene.nodes) {
    const frameId = owner.get(node.id);
    if (!frameId) continue;
    members.get(frameId)!.push(node.id);
    if (frames.get(frameId)!.collapsed) hidden.add(node.id);
  }
  const portOwner = new Map<string, SceneNode>();
  for (const node of scene.nodes) for (const port of node.ports.keys()) portOwner.set(port, node);

  type Side = "in" | "out";
  const collapsedEnds = new Map<string, { frame: string; side: Side; edge: string }[]>();
  const resolved: { edge: SceneEdge; from: Point | string; to: Point | string }[] = [];
  for (const edge of edges) {
    const source = portOwner.get(edge.from);
    const target = portOwner.get(edge.to);
    if (!source || !target) continue;
    const sourceFrame = hidden.has(source.id) ? owner.get(source.id)! : null;
    const targetFrame = hidden.has(target.id) ? owner.get(target.id)! : null;
    if (sourceFrame && sourceFrame === targetFrame) continue;
    const end = (frame: string | null, side: Side, node: SceneNode, port: string): Point | string => {
      if (!frame) return node.ports.get(port)!;
      const key = `${frame}:${side}`;
      collapsedEnds.set(key, [...(collapsedEnds.get(key) ?? []), { frame, side, edge: edge.id }]);
      return key;
    };
    resolved.push({ edge, from: end(sourceFrame, "out", source, edge.from), to: end(targetFrame, "in", target, edge.to) });
  }
  // Кінці на краю згорнутого фрейма: рівномірно по висоті в порядку ребер.
  const slot = (key: string, edgeId: string): Point => {
    const ends = collapsedEnds.get(key)!;
    const first = ends[0]!;
    const rect = collapsedFrameRect(frames.get(first.frame)!.rect);
    const index = ends.findIndex((item) => item.edge === edgeId);
    return { x: first.side === "out" ? rect.x + rect.width : rect.x, y: rect.y + ((index + 1) * rect.height) / (ends.length + 1) };
  };
  const point = (value: Point | string, edgeId: string): Point => (typeof value === "string" ? slot(value, edgeId) : value);
  const obstacles = [
    ...scene.nodes.filter((node) => !hidden.has(node.id)).map((node) => node.rect),
    ...scene.frames.filter((frame) => frame.collapsed).map((frame) => collapsedFrameRect(frame.rect)),
  ];
  return {
    hidden,
    members,
    obstacles,
    edges: resolved.map(({ edge, from, to }) => ({ id: edge.id, from: point(from, edge.id), to: point(to, edge.id), bends: edge.bends })),
  };
}

export type MoveSubject = { readonly kind: "node"; readonly id: string } | { readonly kind: "frame"; readonly id: string };

export interface MovePlan {
  readonly strategy: PlacementStrategy;
  /** Нові лівий-верхній кути нод: переміщувана, учасники фрейма, розсунуті сусіди. */
  readonly nodes: ReadonlyMap<string, Point>;
  readonly frames: ReadonlyMap<string, Point>;
  /** Остаточне положення переміщуваного об'єкта — контур попереднього результату. */
  readonly target: Rect;
  readonly guides: readonly AlignmentGuide[];
  /** Ноди, що рухалися разом із фреймом: згини ребер між ними зсуваються на shift. */
  readonly carried: ReadonlySet<string>;
  readonly shift: Point;
  /** Зміни належності: нода увійшла у фрейм (id) чи вийшла з нього (null). */
  readonly membership: ReadonlyMap<string, string | null>;
}

const framePrefix = "frame:";

/**
 * План переміщення ноди чи фрейма на зсув delta (px світу, без прив'язки): положення
 * прив'язується до сітки, далі resolvePlacement розсуває сусідів або шукає вільне місце.
 * Закріплені ноди не рухаються — ні як сусіди, ні як учасники перенесеного фрейма.
 */
export function planMove(scene: Scene, subject: MoveSubject, delta: Point, gap = graphGridStep): MovePlan | null {
  const view = visibleScene(scene, []);
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const frames = new Map(scene.frames.map((frame) => [frame.id, frame]));
  let origin: Rect;
  let carried: string[] = [];
  let excluded: Set<string>;
  if (subject.kind === "node") {
    const node = nodes.get(subject.id);
    if (!node || node.pinned || view.hidden.has(node.id)) return null;
    origin = node.rect;
    excluded = new Set([node.id]);
  } else {
    const frame = frames.get(subject.id);
    if (!frame) return null;
    origin = frameFootprint(frame);
    const inside = view.members.get(frame.id) ?? [];
    carried = inside.filter((id) => !nodes.get(id)!.pinned);
    // Закріплені учасники лишаються на місці й не заважають самому фрейму.
    excluded = new Set(inside);
  }
  const desired = { ...origin, x: snap(origin.x + delta.x), y: snap(origin.y + delta.y) };
  const others: PlacementItem[] = [
    ...scene.nodes.filter((node) => !excluded.has(node.id) && !view.hidden.has(node.id)).map((node) => ({ id: node.id, rect: node.rect, pinned: node.pinned })),
    // Фрейми не розсуваються: для ноди перешкода лише згорнутий фрейм, для фрейма — будь-який інший.
    ...scene.frames
      .filter((frame) => frame.id !== (subject.kind === "frame" ? subject.id : null) && (subject.kind === "frame" || frame.collapsed))
      .map((frame) => ({ id: `${framePrefix}${frame.id}`, rect: frameFootprint(frame), pinned: true })),
  ];
  const placement = resolvePlacement({ moving: [{ id: subject.id, rect: desired }], others, gap });
  const target = placement.strategy === "blocked" ? origin : translate(desired, placement.offset.x, placement.offset.y);
  const shift = { x: target.x - origin.x, y: target.y - origin.y };
  const nodeMoves = new Map<string, Point>();
  const frameMoves = new Map<string, Point>();
  if (subject.kind === "node") nodeMoves.set(subject.id, { x: target.x, y: target.y });
  else {
    const frame = frames.get(subject.id)!;
    frameMoves.set(subject.id, { x: frame.rect.x + shift.x, y: frame.rect.y + shift.y });
    for (const id of carried) {
      const rect = nodes.get(id)!.rect;
      nodeMoves.set(id, { x: rect.x + shift.x, y: rect.y + shift.y });
    }
  }
  for (const [id, point] of placement.pushed) nodeMoves.set(id, point);
  // Належність перераховується для нод, що змінили місце відносно фреймів: переміщена й
  // розсунуті ноди, закріплені учасники, від яких відійшов фрейм. Перенесені — лишаються.
  const movedFrames = scene.frames.map((frame) => {
    const moved = frameMoves.get(frame.id);
    return moved ? { ...frame, rect: { ...frame.rect, x: moved.x, y: moved.y } } : frame;
  });
  const membership = new Map<string, string | null>();
  const reconsider = [...nodeMoves.keys()].filter((id) => !carried.includes(id));
  if (subject.kind === "frame") reconsider.push(...(view.members.get(subject.id) ?? []).filter((id) => !carried.includes(id)));
  for (const id of reconsider) {
    const current = nodes.get(id)!;
    const moved = nodeMoves.get(id);
    const next = frameAt(movedFrames, moved ? { ...current.rect, x: moved.x, y: moved.y } : current.rect);
    if (next !== (current.frame ?? null)) membership.set(id, next);
  }
  const finalRects = others
    .filter((item) => !item.id.startsWith(framePrefix))
    .map((item) => {
      const moved = nodeMoves.get(item.id);
      return moved ? { ...item.rect, x: moved.x, y: moved.y } : item.rect;
    });
  return {
    strategy: placement.strategy,
    nodes: nodeMoves,
    frames: frameMoves,
    target,
    guides: alignmentGuides(target, [...finalRects, ...others.filter((item) => item.id.startsWith(framePrefix)).map((item) => item.rect)]),
    carried: new Set(carried),
    shift,
    membership,
  };
}

/**
 * Розгортання фрейма: поки він був згорнутий, на його місце могли поставити ноди. Повний
 * прямокутник розміщується як переміщуваний об'єкт — сусіди розсуваються, а якщо це
 * неможливо, фрейм із вмістом переходить на найближче вільне місце.
 */
export function planExpand(scene: Scene, frameId: string, gap = graphGridStep): MovePlan | null {
  const frame = scene.frames.find((item) => item.id === frameId);
  if (!frame || !frame.collapsed) return null;
  const expanded: Scene = { ...scene, frames: scene.frames.map((item) => (item.id === frameId ? { ...item, collapsed: false } : item)) };
  return planMove(expanded, { kind: "frame", id: frameId }, { x: 0, y: 0 }, gap);
}

/**
 * Згини після переміщення: усередині перенесеного фрейма йдуть разом із ним, а згин,
 * що опинився на ноді, зсувається на найближче вільне місце. Повертає лише змінені ребра.
 * scene — уже після плану (applyPlan): перешкоди мають стояти на нових місцях.
 */
export function adjustBends(edges: readonly SceneEdge[], scene: Scene, plan: Pick<MovePlan, "carried" | "shift">): Map<string, readonly Point[]> {
  const owner = new Map<string, string>();
  for (const node of scene.nodes) for (const port of node.ports.keys()) owner.set(port, node.id);
  const view = visibleScene(scene, []);
  const obstacles = view.obstacles;
  const changed = new Map<string, readonly Point[]>();
  for (const edge of edges) {
    if (!edge.bends || edge.bends.length === 0) continue;
    const carried = plan.carried.has(owner.get(edge.from) ?? "") && plan.carried.has(owner.get(edge.to) ?? "");
    const moved = carried ? edge.bends.map((bend) => ({ x: bend.x + plan.shift.x, y: bend.y + plan.shift.y })) : edge.bends;
    const corrected = moved.flatMap((bend) => {
      const point = correctBend(bend, obstacles);
      return point ? [point] : [];
    });
    const same = corrected.length === edge.bends.length && corrected.every((bend, index) => bend.x === edge.bends![index]!.x && bend.y === edge.bends![index]!.y);
    if (!same) changed.set(edge.id, corrected);
  }
  return changed;
}

/** Сцена після плану: нові положення й належність нод, положення фреймів (порти — разом із нодою). */
export function applyPlan(scene: Scene, plan: Pick<MovePlan, "nodes" | "frames" | "membership">): Scene {
  return {
    nodes: scene.nodes.map((original) => {
      const membership = plan.membership.get(original.id);
      const node = membership === undefined ? original : { ...original, frame: membership ?? undefined };
      const moved = plan.nodes.get(node.id);
      if (!moved) return node;
      const dx = moved.x - node.rect.x;
      const dy = moved.y - node.rect.y;
      return { ...node, rect: { ...node.rect, x: moved.x, y: moved.y }, ports: new Map([...node.ports].map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }])) };
    }),
    frames: scene.frames.map((frame) => {
      const moved = plan.frames.get(frame.id);
      return moved ? { ...frame, rect: { ...frame.rect, x: moved.x, y: moved.y } } : frame;
    }),
  };
}

/**
 * Вирівнювання виділених нод у стовпчик (vertical) чи ряд (horizontal) із проміжком у
 * клітинку. Порядок — за поточним положенням уздовж осі, початок — найлівіша (найвища)
 * нода в стовпчику (ряду). Закріплені й сховані ноди не рухаються. Якщо стовпчик лягає на
 * інші ноди — розсування або вільне місце, як для кидка.
 */
export function planArrange(scene: Scene, ids: readonly string[], axis: "vertical" | "horizontal", gap = graphGridStep): MovePlan | null {
  const view = visibleScene(scene, []);
  const selected = new Set(ids);
  const items = scene.nodes.filter((node) => selected.has(node.id) && !node.pinned && !view.hidden.has(node.id));
  if (items.length < 2) return null;
  const along = (rect: Rect): number => (axis === "vertical" ? rect.y : rect.x);
  const across = (rect: Rect): number => (axis === "vertical" ? rect.x : rect.y);
  items.sort((a, b) => along(a.rect) - along(b.rect) || across(a.rect) - across(b.rect));
  const line = snap(Math.min(...items.map((node) => across(node.rect))));
  let cursor = snap(along(items[0]!.rect));
  const arranged = items.map((node) => {
    const rect = axis === "vertical" ? { ...node.rect, x: line, y: cursor } : { ...node.rect, x: cursor, y: line };
    cursor = snapUp((axis === "vertical" ? bottom(rect) : right(rect)) + gap);
    return { id: node.id, rect };
  });
  const others: PlacementItem[] = [
    ...scene.nodes.filter((node) => !selected.has(node.id) && !view.hidden.has(node.id)).map((node) => ({ id: node.id, rect: node.rect, pinned: node.pinned })),
    // Закріплені виділені ноди лишаються — і заважають, як будь-які інші.
    ...scene.nodes.filter((node) => selected.has(node.id) && node.pinned && !view.hidden.has(node.id)).map((node) => ({ id: node.id, rect: node.rect, pinned: true })),
    ...scene.frames.filter((frame) => frame.collapsed).map((frame) => ({ id: `${framePrefix}${frame.id}`, rect: frameFootprint(frame), pinned: true })),
  ];
  const placement = resolvePlacement({ moving: arranged, others, gap });
  if (placement.strategy === "blocked") return { strategy: "blocked", nodes: new Map(), frames: new Map(), target: arranged[0]!.rect, guides: [], carried: new Set(), shift: { x: 0, y: 0 }, membership: new Map() };
  const nodes = new Map<string, Point>(arranged.map((item) => [item.id, { x: item.rect.x + placement.offset.x, y: item.rect.y + placement.offset.y }]));
  for (const [id, point] of placement.pushed) nodes.set(id, point);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const membership = new Map<string, string | null>();
  for (const [id, point] of nodes) {
    const node = byId.get(id)!;
    const next = frameAt(scene.frames, { ...node.rect, x: point.x, y: point.y });
    if (next !== (node.frame ?? null)) membership.set(id, next);
  }
  return { strategy: placement.strategy, nodes, frames: new Map(), target: arranged[0]!.rect, guides: [], carried: new Set(), shift: { x: 0, y: 0 }, membership };
}

/**
 * Місце для нової ноди з центром у точці: вузол сітки, щонайменше клітинка до видимих
 * нод і згорнутих фреймів; якщо зайнято — найближче вільне.
 */
export function freePlacement(scene: Scene, point: Point, size: { readonly width: number; readonly height: number }, gap = graphGridStep): Point {
  const view = visibleScene(scene, []);
  const rect = { x: snap(point.x - size.width / 2), y: snap(point.y - size.height / 2), ...size };
  const obstacles = [...scene.nodes.filter((node) => !view.hidden.has(node.id)).map((node) => node.rect), ...scene.frames.filter((frame) => frame.collapsed).map(frameFootprint)];
  const offset = obstacles.every((other) => !conflicts(rect, other, gap)) ? { x: 0, y: 0 } : (findFreeOffset([rect], obstacles, gap) ?? { x: 0, y: 0 });
  return { x: rect.x + offset.x, y: rect.y + offset.y };
}
