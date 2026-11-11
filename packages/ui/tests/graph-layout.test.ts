import test from "node:test";
import assert from "node:assert/strict";
import { conflicts, graphGridStep, snap, strictlyInside, type Point, type Rect } from "../src/graph/layout/geometry.ts";
import { alignmentGuides, findFreeOffset, resolvePlacement } from "../src/graph/layout/placement.ts";
import { bendInsertIndex, correctBend, routeEdges, routePath, simplify } from "../src/graph/layout/routing.ts";
import { adjustBends, applyPlan, collapsedFrameRect, freePlacement, planArrange, planExpand, planMove, visibleScene, type Scene, type SceneNode } from "../src/graph/layout/scene.ts";

const rect = (x: number, y: number, width = 160, height = 80): Rect => ({ x, y, width, height });

/** Нода з одним входом ліворуч і одним виходом праворуч посередині висоти. */
function node(id: string, x: number, y: number, extra: Partial<SceneNode> = {}): SceneNode {
  const r = rect(x, y);
  return {
    id,
    rect: r,
    ports: new Map([
      [`${id}:in`, { x: r.x, y: r.y + 40 }],
      [`${id}:out`, { x: r.x + r.width, y: r.y + 40 }],
    ]),
    ...extra,
  };
}

/** Жоден відрізок маршруту не проходить крізь внутрішність прямокутника. */
function crosses(points: readonly Point[], obstacle: Rect): boolean {
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (let t = 0; t <= 1; t += 0.05) {
      if (strictlyInside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, obstacle)) return true;
    }
  }
  return false;
}

/** Точка лежить на одному з відрізків (злам міг злитися з прямою після спрощення). */
function passesThrough(points: readonly Point[], target: Point): boolean {
  return points.some((a, index) => {
    const b = points[index + 1];
    if (!b) return false;
    const onX = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.x - target.x) < 0.01 && target.y >= Math.min(a.y, b.y) && target.y <= Math.max(a.y, b.y);
    const onY = Math.abs(a.y - b.y) < 0.01 && Math.abs(a.y - target.y) < 0.01 && target.x >= Math.min(a.x, b.x) && target.x <= Math.max(a.x, b.x);
    return onX || onY;
  });
}

const orthogonal = (points: readonly Point[]): boolean =>
  points.every((point, index) => index === 0 || Math.abs(point.x - points[index - 1]!.x) < 0.01 || Math.abs(point.y - points[index - 1]!.y) < 0.01);

// ---------- Сітка й колізії ----------

test("Сітка — 20 одиниць; проміжок рівно в одну клітинку не конфліктує", () => {
  assert.equal(graphGridStep, 20);
  assert.equal(snap(29), 20);
  assert.equal(snap(31), 40);
  assert.equal(conflicts(rect(0, 0), rect(180, 0), 20), false, "180 = 160 + 20");
  assert.equal(conflicts(rect(0, 0), rect(170, 0), 20), true);
});

test("resolvePlacement: вільне місце — без змін", () => {
  const result = resolvePlacement({ moving: [{ id: "a", rect: rect(0, 0) }], others: [{ id: "b", rect: rect(400, 0) }] });
  assert.equal(result.strategy, "clear");
  assert.equal(result.pushed.size, 0);
});

test("resolvePlacement: нода на іншій розсуває сусіда з проміжком у клітинку, ланцюгом", () => {
  // Знизу й зверху закріплені ноди: лишається праворуч (ланцюгом) чи ліворуч (дорожче).
  const result = resolvePlacement({
    moving: [{ id: "a", rect: rect(100, 0) }],
    others: [
      { id: "b", rect: rect(200, 0) },
      { id: "c", rect: rect(380, 0) },
      { id: "below", rect: rect(100, 100), pinned: true },
      { id: "above", rect: rect(200, -160), pinned: true },
    ],
  });
  assert.equal(result.strategy, "push");
  // b на 280 (100 + 160 + 20), c — далі за b; сумарний зсув 160 менший, ніж ліворуч (280).
  assert.deepEqual(result.pushed.get("b"), { x: 280, y: 0 });
  assert.deepEqual(result.pushed.get("c"), { x: 460, y: 0 });
  // Без закріплених — найдешевше вниз, і c не зачеплено.
  const free = resolvePlacement({ moving: [{ id: "a", rect: rect(100, 0) }], others: [{ id: "b", rect: rect(200, 0) }, { id: "c", rect: rect(380, 0) }] });
  assert.deepEqual(free.pushed.get("b"), { x: 200, y: 100 });
  assert.equal(free.pushed.has("c"), false);
});

test("resolvePlacement: закріплена нода не рухається — розсування в інший бік або вільне місце", () => {
  const pinnedOnly = resolvePlacement({ moving: [{ id: "a", rect: rect(100, 0) }], others: [{ id: "b", rect: rect(200, 0), pinned: true }] });
  assert.equal(pinnedOnly.strategy, "relocate");
  assert.equal(pinnedOnly.pushed.size, 0);
  const moved = rect(100 + pinnedOnly.offset.x, 0 + pinnedOnly.offset.y);
  assert.equal(conflicts(moved, rect(200, 0), 20), false);
  // Закріплена нода праворуч від сусіда: сусіда можна зсунути вниз.
  const around = resolvePlacement({
    moving: [{ id: "a", rect: rect(0, 0) }],
    others: [
      { id: "b", rect: rect(100, 40) },
      { id: "p", rect: rect(280, 40), pinned: true },
    ],
  });
  assert.equal(around.strategy, "push");
  assert.equal(around.pushed.has("p"), false);
  const b = around.pushed.get("b")!;
  assert.equal(conflicts({ ...rect(0, 0, 160, 80), x: b.x, y: b.y }, rect(280, 40), 20), false);
});

test("findFreeOffset: найближче вільне місце з урахуванням проміжку", () => {
  const offset = findFreeOffset([rect(0, 0, 40, 40)], [rect(0, 0, 40, 40)]);
  assert.ok(offset);
  assert.equal(Math.abs(offset.x) + Math.abs(offset.y), 60, "40 + 20 проміжку, по одній осі");
});

test("alignmentGuides: збіг країв і центрів — лінії напрямних", () => {
  const guides = alignmentGuides(rect(0, 200), [rect(0, 0), rect(300, 200)]);
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.at === 0), "лівий край");
  assert.ok(guides.some((guide) => guide.axis === "x" && guide.at === 80), "центр");
  assert.ok(guides.some((guide) => guide.axis === "y" && guide.at === 200 && guide.to === 460), "верх, протяжність до сусіда");
});

// ---------- Маршрути ----------

test("routeEdges: маршрут ортогональний, виходить праворуч, входить ліворуч і обходить ноду", () => {
  const blocker = rect(200, 0, 160, 200);
  const [route] = routeEdges([{ id: "e", from: { x: 160, y: 100 }, to: { x: 480, y: 100 } }], { obstacles: [rect(0, 60), blocker, rect(480, 60)] });
  const points = route!.points;
  assert.ok(orthogonal(points));
  assert.deepEqual(points[0], { x: 160, y: 100 });
  assert.deepEqual(points.at(-1), { x: 480, y: 100 });
  assert.ok(points[1]!.x > 160 && points[1]!.y === 100, "перший відрізок — на схід");
  assert.ok(points.at(-2)!.x < 480 && points.at(-2)!.y === 100, "останній — зі заходу");
  assert.equal(crosses(points, blocker), false);
});

test("routeEdges: сокет на частку пікселя від контуру не ламає обхід нод", () => {
  // Виміряний центр сокета через рамку стоїть на 0,33 px від межі ноди (живий випадок):
  // раніше точка біля входу потрапляла в зону відступу, і ребро йшло навпростець крізь ноди.
  const form = rect(280, 540, 193, 94);
  const filter = rect(360, 40, 193, 94);
  const [route] = routeEdges([{ id: "e", from: { x: 473.33, y: 615.33 }, to: { x: 360.33, y: 115.33 } }], { obstacles: [form, filter] });
  assert.ok(orthogonal(route!.points));
  assert.equal(crosses(route!.points, form), false, "не крізь Form");
  assert.equal(crosses(route!.points, filter), false, "не крізь Filter");
  assert.ok(route!.points[1]!.x > 473, "виходить праворуч, а не назад крізь ноду");
});

test("routeEdges: зворотне ребро огинає власні ноди", () => {
  const source = rect(400, 0);
  const target = rect(0, 0);
  const [route] = routeEdges([{ id: "e", from: { x: 560, y: 40 }, to: { x: 0, y: 40 } }], { obstacles: [source, target] });
  assert.ok(orthogonal(route!.points));
  assert.equal(crosses(route!.points, source), false);
  assert.equal(crosses(route!.points, target), false);
});

test("routeEdges: ребра на спільній лінії розходяться паралельними смугами", () => {
  const obstacles = [rect(0, 0), rect(0, 200), rect(600, 0), rect(600, 200), rect(300, 100, 100, 40)];
  const routes = routeEdges(
    [
      { id: "a", from: { x: 160, y: 40 }, to: { x: 600, y: 240 } },
      { id: "b", from: { x: 160, y: 240 }, to: { x: 600, y: 40 } },
    ],
    { obstacles },
  );
  const interior = (points: readonly Point[]) => points.slice(1, -1);
  const shared = interior(routes[0]!.points).filter((p) => interior(routes[1]!.points).some((q) => q.x === p.x && q.y === p.y));
  assert.ok(shared.length <= 1, "спільних зламів немає (хіба точка перетину)");
});

test("routeEdges: ручний згин проходиться; згин на ноді зсувається з неї", () => {
  const obstacle = rect(200, 200);
  const [route] = routeEdges([{ id: "e", from: { x: 0, y: 0 }, to: { x: 600, y: 0 }, bends: [{ x: 300, y: 400 }, { x: 260, y: 240 }] }], { obstacles: [obstacle] });
  assert.ok(passesThrough(route!.points, { x: 300, y: 400 }), "маршрут іде через перший згин");
  const corrected = route!.bends[1]!;
  assert.notDeepEqual(corrected, { x: 260, y: 240 });
  assert.equal(strictlyInside(corrected, { x: 190, y: 190, width: 180, height: 100 }), false, "згин поза нодою з відступом");
  assert.equal(crosses(route!.points, obstacle), false);
  assert.deepEqual(correctBend({ x: 31, y: 9 }, []), { x: 40, y: 0 }, "згин прив'язується до сітки");
});

test("routePath і simplify: злами без зайвих точок, кути заокруглені", () => {
  assert.deepEqual(simplify([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  assert.equal(routePath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]), "M0 0L14 0Q20 0 20 6L20 20");
});

test("bendInsertIndex: новий згин стає між сусідніми за ходом маршруту", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(bendInsertIndex(points, [{ x: 40, y: 0 }, { x: 100, y: 80 }], { x: 100, y: 20 }), 1);
  assert.equal(bendInsertIndex(points, [], { x: 50, y: 0 }), 0);
});

// ---------- Сцена: фрейми, згортання, план переміщення ----------

const sceneWithFrame = (collapsed = false): Scene => ({
  nodes: [node("a", 40, 60, { frame: "f" }), node("b", 260, 60, { frame: "f" }), node("c", 600, 60)],
  frames: [{ id: "f", rect: rect(20, 20, 420, 160), collapsed }],
});

test("visibleScene: згорнутий фрейм ховає ноди й внутрішні ребра, зовнішні ведуть до його краю", () => {
  const edges = [
    { id: "inner", from: "a:out", to: "b:in" },
    { id: "outer", from: "b:out", to: "c:in" },
  ];
  const open = visibleScene(sceneWithFrame(false), edges);
  assert.deepEqual([...open.members.get("f")!], ["a", "b"]);
  assert.equal(open.hidden.size, 0);
  assert.equal(open.edges.length, 2);
  const closed = visibleScene(sceneWithFrame(true), edges);
  assert.deepEqual([...closed.hidden].sort(), ["a", "b"]);
  assert.deepEqual(closed.edges.map((edge) => edge.id), ["outer"]);
  const box = collapsedFrameRect(rect(20, 20, 420, 160));
  assert.equal(closed.edges[0]!.from.x, box.x + box.width, "вихід — з правого краю згорнутого фрейма");
  assert.ok(closed.obstacles.some((item) => item.x === box.x && item.width === box.width), "згорнутий фрейм — перешкода");
});

test("planMove: нода прив'язується до сітки, на іншій ноді — розсуває її", () => {
  const scene: Scene = { nodes: [node("a", 0, 0), node("b", 300, 0)], frames: [] };
  const free = planMove(scene, { kind: "node", id: "a" }, { x: 7, y: 33 })!;
  assert.equal(free.strategy, "clear");
  assert.deepEqual(free.nodes.get("a"), { x: 0, y: 40 });
  const onto = planMove(scene, { kind: "node", id: "a" }, { x: 290, y: 0 })!;
  assert.equal(onto.strategy, "push");
  const b = onto.nodes.get("b")!;
  assert.equal(conflicts({ ...rect(0, 0), x: b.x, y: b.y }, onto.target, 20), false);
  assert.equal(planMove({ nodes: [node("p", 0, 0, { pinned: true })], frames: [] }, { kind: "node", id: "p" }, { x: 40, y: 0 }), null, "закріплена нода не тягнеться");
});

test("planMove: фрейм несе вміст, крім закріпленої ноди; згини всередині йдуть разом", () => {
  const scene: Scene = {
    nodes: [node("a", 40, 60, { frame: "f" }), node("b", 260, 60, { pinned: true, frame: "f" }), node("c", 900, 60)],
    frames: [{ id: "f", rect: rect(20, 20, 420, 160) }],
  };
  const plan = planMove(scene, { kind: "frame", id: "f" }, { x: 0, y: 300 })!;
  assert.deepEqual(plan.frames.get("f"), { x: 20, y: 320 });
  assert.deepEqual(plan.nodes.get("a"), { x: 40, y: 360 });
  assert.equal(plan.nodes.has("b"), false, "закріплена нода лишається");
  assert.equal(plan.membership.get("b"), null, "і виходить із фрейма, що від неї відійшов");
  assert.equal(plan.membership.has("a"), false);
  assert.equal(plan.nodes.has("c"), false);
  const moved = applyPlan(scene, plan);
  const bends = adjustBends([{ id: "e", from: "a:out", to: "a:in", bends: [{ x: 300, y: 260 }] }], moved, plan);
  assert.deepEqual(bends.get("e"), [{ x: 300, y: 560 }]);
});

test("planMove: фрейм на ноді поза ним розсуває її, а не поглинає", () => {
  const scene: Scene = { nodes: [node("a", 40, 60, { frame: "f" }), node("x", 40, 400)], frames: [{ id: "f", rect: rect(20, 20, 420, 160) }] };
  const plan = planMove(scene, { kind: "frame", id: "f" }, { x: 0, y: 320 })!;
  assert.equal(plan.strategy, "push");
  const x = plan.nodes.get("x")!;
  assert.equal(conflicts({ ...rect(0, 0), x: x.x, y: x.y }, plan.target, 20), false);
});

test("planExpand: розгортання на зайняте місце розсуває ноди", () => {
  // x поставили на місце, яке звільнив згорнутий фрейм: вона не учасник, лише сусід.
  const scene: Scene = { nodes: [node("a", 40, 60, { frame: "f" }), node("x", 260, 120)], frames: [{ id: "f", rect: rect(20, 20, 420, 200), collapsed: true }] };
  const plan = planExpand(scene, "f")!;
  assert.notEqual(plan.strategy, "blocked");
  const x = plan.nodes.get("x");
  assert.ok(x, "нода зсунута");
  assert.equal(conflicts({ ...rect(0, 0), x: x.x, y: x.y }, plan.target, 20), false);
});

test("planMove: нода, скинута у фрейм, стає його учасником; винесена — виходить", () => {
  const scene: Scene = { nodes: [node("a", 40, 60, { frame: "f" }), node("z", 700, 400)], frames: [{ id: "f", rect: rect(20, 20, 600, 200) }] };
  assert.equal(planMove(scene, { kind: "node", id: "z" }, { x: -340, y: -340 })!.membership.get("z"), "f");
  assert.equal(planMove(scene, { kind: "node", id: "a" }, { x: 0, y: 400 })!.membership.get("a"), null);
});

test("planArrange: стовпчик і ряд із проміжком у клітинку, закріплена нода лишається", () => {
  const scene: Scene = { nodes: [node("a", 40, 300), node("b", 300, 20), node("p", 600, 600, { pinned: true })], frames: [] };
  const column = planArrange(scene, ["a", "b", "p"], "vertical")!;
  // Порядок — за y: b (20) вище за a (300); лівий край — найлівіший (40).
  assert.deepEqual(column.nodes.get("b"), { x: 40, y: 20 });
  assert.deepEqual(column.nodes.get("a"), { x: 40, y: 120 }, "20 + 80 висоти + 20 проміжку");
  assert.equal(column.nodes.has("p"), false);
  const row = planArrange(scene, ["a", "b"], "horizontal")!;
  assert.deepEqual(row.nodes.get("a"), { x: 40, y: 20 });
  assert.deepEqual(row.nodes.get("b"), { x: 220, y: 20 }, "40 + 160 ширини + 20");
  assert.equal(planArrange(scene, ["a", "p"], "vertical"), null, "одна незакріплена — вирівнювати нічого");
});

test("freePlacement: нова нода у вузлі сітки, поруч із зайнятим місцем — найближче вільне", () => {
  const empty: Scene = { nodes: [], frames: [] };
  assert.deepEqual(freePlacement(empty, { x: 105, y: 47 }, { width: 160, height: 80 }), { x: 20, y: 0 });
  const busy: Scene = { nodes: [node("a", 0, 0)], frames: [] };
  const spot = freePlacement(busy, { x: 80, y: 40 }, { width: 160, height: 80 });
  assert.equal(conflicts({ x: spot.x, y: spot.y, width: 160, height: 80 }, rect(0, 0), 20), false);
  assert.ok(Number.isInteger(spot.x / 20), "x у вузлі сітки");
  assert.ok(Number.isInteger(spot.y / 20), "y у вузлі сітки");
});
