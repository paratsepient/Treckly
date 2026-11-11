"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { GraphCanvasContextValue, GraphFrameEntry, GraphNodeEntry, GraphPreview } from "./context.ts";
import { boundsOf, conflicts, snapPoint, type Point, type Rect } from "./layout/geometry.ts";
import type { AlignmentGuide, PlacementStrategy } from "./layout/placement.ts";
import { bendInsertIndex, correctBend, routeEdges, routePath } from "./layout/routing.ts";
import { adjustBends, applyPlan, frameFootprint, freePlacement, planArrange, planExpand, planMove, visibleScene, type MovePlan, type MoveSubject, type Scene, type SceneEdge, type SceneNode } from "./layout/scene.ts";

/** Стан ребра: звичайне, вибране, невалідне (несумісні типи, цикл) чи чернеткове. */
export type GraphEdgeState = "default" | "selected" | "invalid" | "pending";

export interface GraphEdgeSpec {
  readonly id: string;
  /** Повний id вихідного порту (`<нода>:<порт>`), як у GraphNode outputs. */
  readonly from: string;
  /** Повний id вхідного порту. */
  readonly to: string;
  readonly state?: GraphEdgeState;
  /** Ручні згини маршруту в координатах світу (вузли сітки), у порядку проходження. */
  readonly bends?: readonly Point[];
}

export interface GraphNodeLayout {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Нова належність: id фрейма чи null (вийшла з фрейма); відсутнє поле — без змін. */
  readonly frame?: string | null;
}

export interface GraphFrameLayout {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly collapsed?: boolean;
}

export interface GraphEdgeLayout {
  readonly id: string;
  readonly bends: readonly Point[];
}

/**
 * Одна завершена зміна розкладки (кидок ноди, перенесення чи згортання фрейма, правка
 * згину) — один крок історії власника. Під час перетягування змін немає: полотно показує
 * попередній результат і повідомляє лише остаточний.
 */
export interface GraphLayoutChange {
  readonly action: "move-node" | "move-frame" | "collapse-frame" | "expand-frame" | "edit-bends" | "arrange";
  /** Id переміщуваної ноди, фрейма чи ребра (для arrange — id через кому). */
  readonly subject: string;
  /** Як розв'язано зіткнення: місце вільне, сусідів розсунуто чи знайдено інше місце. */
  readonly placement?: PlacementStrategy;
  readonly nodes: readonly GraphNodeLayout[];
  readonly frames: readonly GraphFrameLayout[];
  readonly edges: readonly GraphEdgeLayout[];
}

export interface EdgeGeometry {
  readonly id: string;
  readonly state: GraphEdgeState;
  readonly path: string;
  readonly bends: readonly Point[];
  /** Точки маршруту: для згину посередині ребра. */
  readonly points: readonly Point[];
}

interface GraphEditorOptions {
  readonly edges: readonly GraphEdgeSpec[];
  readonly onLayoutChange: ((change: GraphLayoutChange) => void) | undefined;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  /** Вид у момент дії: перерахунок координат екрана у світ. */
  readonly view: () => { readonly x: number; readonly y: number; readonly zoom: number };
}

/** Розмір ноди до першого виміру (і в jsdom, де розмітка не має розмірів): 192 × 80. */
const fallbackNodeSize = { width: 192, height: 80 } as const;

/** Зсув, менший за цей, — ще клік (вибір, згортання), а не перетягування; px екрана. */
const dragThreshold = 4;

type Drag =
  | { readonly kind: "move"; readonly subject: MoveSubject; readonly delta: Point }
  | { readonly kind: "bend"; readonly edge: string; readonly index: number; readonly point: Point };

interface Pending {
  readonly pointer: number;
  readonly start: Point;
  readonly target: { readonly kind: "move"; readonly subject: MoveSubject } | { readonly kind: "bend"; readonly edge: string; readonly index: number };
  moved: boolean;
  /** Escape під час руху: кнопка ще натиснута, але кидок уже скасовано. */
  cancelled?: boolean;
}

const emptyPreview: ReadonlyMap<string, GraphPreview> = new Map();

/** Сцена з даних власника (положення) і DOM (розміри, сокети). */
function measureScene(nodes: ReadonlyMap<string, GraphNodeEntry>, frames: ReadonlyMap<string, GraphFrameEntry>): Scene {
  const sceneNodes: SceneNode[] = [];
  for (const [id, entry] of nodes) {
    const ports = new Map<string, Point>();
    // Центр сокета — за фактичним прямокутником, а не offset-ланцюжком: сокет центрується
    // transform (translateY(-50%)), який offsetTop не враховує, і ребро входило б на 6 px нижче.
    // Масштаб виду однаково діє на ноду й сокет, тож різниця ділиться на нього.
    const nodeBox = entry.element.getBoundingClientRect();
    const scale = nodeBox.width / entry.element.offsetWidth || 1;
    for (const socket of entry.element.querySelectorAll<HTMLElement>("[data-graph-port]")) {
      const box = socket.getBoundingClientRect();
      // Півпікселі: маршрути порівнюють координати точно, а дробові виміри дрижать.
      ports.set(socket.dataset["graphPort"]!, {
        x: Math.round((entry.x + (box.left + box.width / 2 - nodeBox.left) / scale) * 2) / 2,
        y: Math.round((entry.y + (box.top + box.height / 2 - nodeBox.top) / scale) * 2) / 2,
      });
    }
    sceneNodes.push({
      id,
      rect: { x: entry.x, y: entry.y, width: entry.element.offsetWidth || fallbackNodeSize.width, height: entry.element.offsetHeight || fallbackNodeSize.height },
      pinned: entry.pinned,
      frame: entry.frame,
      ports,
    });
  }
  return {
    nodes: sceneNodes,
    frames: [...frames].map(([id, entry]) => ({ id, rect: { x: entry.x, y: entry.y, width: entry.width, height: entry.height }, collapsed: entry.collapsed })),
  };
}

/** Ключ сцени для порівняння: новий стан лише при справжній зміні (інакше цикл рендерів). */
function sceneKey(scene: Scene): string {
  return JSON.stringify([scene.nodes.map((node) => [node.id, node.rect, node.pinned, node.frame, [...node.ports]]), scene.frames]);
}

const announcements: Record<PlacementStrategy, (what: string) => string> = {
  clear: (what) => `${what} переміщено.`,
  push: (what) => `${what} переміщено, сусідні ноди розсунуто.`,
  relocate: (what) => `Розсунути сусідів не вдалося (закріплені ноди чи завеликий зсув) — ${what.toLowerCase()} поставлено на найближче вільне місце.`,
  blocked: () => "Поблизу немає вільного місця — переміщення скасовано.",
};

/**
 * Редагування розкладки полотна: реєстрація нод і фреймів, вимір сцени, перетягування
 * з попереднім результатом (сітка, напрямні, розсування), маршрути ребер і згини.
 * Положення — дані власника: полотно повідомляє завершені зміни через onLayoutChange.
 */
export function useGraphEditor({ edges, onLayoutChange, rootRef, view }: GraphEditorOptions) {
  const editable = onLayoutChange !== undefined;
  const nodesRef = useRef(new Map<string, GraphNodeEntry>());
  const framesRef = useRef(new Map<string, GraphFrameEntry>());
  const [, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  const registerNode = useCallback(
    (id: string, entry: GraphNodeEntry) => {
      nodesRef.current.set(id, entry);
      // Нода змінює розмір (довга назва, стан) — маршрути мають іти за сокетами.
      if (!resizeObserver.current && typeof ResizeObserver !== "undefined") resizeObserver.current = new ResizeObserver(() => bump());
      resizeObserver.current?.observe(entry.element);
      bump();
      return () => {
        if (nodesRef.current.get(id) !== entry) return;
        nodesRef.current.delete(id);
        resizeObserver.current?.unobserve(entry.element);
        bump();
      };
    },
    [bump],
  );

  const registerFrame = useCallback(
    (id: string, entry: GraphFrameEntry) => {
      framesRef.current.set(id, entry);
      bump();
      return () => {
        if (framesRef.current.get(id) !== entry) return;
        framesRef.current.delete(id);
        bump();
      };
    },
    [bump],
  );

  useEffect(() => () => resizeObserver.current?.disconnect(), []);

  const [scene, setScene] = useState<{ readonly key: string; readonly value: Scene }>({ key: "", value: { nodes: [], frames: [] } });
  // Після кожного рендера: дочірні ноди вже зареєструвалися (їхні layout-ефекти раніші).
  useLayoutEffect(() => {
    const value = measureScene(nodesRef.current, framesRef.current);
    const key = sceneKey(value);
    setScene((previous) => (previous.key === key ? previous : { key, value }));
  });

  const [drag, setDrag] = useState<Drag | null>(null);
  const pending = useRef<Pending | null>(null);
  const suppressClick = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const sceneEdges = useMemo((): readonly SceneEdge[] => {
    if (drag?.kind !== "bend") return edges;
    return edges.map((edge) => {
      if (edge.id !== drag.edge || !edge.bends) return edge;
      const bends = [...edge.bends];
      bends[drag.index] = drag.point;
      return { ...edge, bends };
    });
  }, [edges, drag]);

  const plan = useMemo(() => (drag?.kind === "move" ? planMove(scene.value, drag.subject, drag.delta) : null), [scene, drag]);

  /** Сцена для показу: переміщуване — під курсором, розсунуті сусіди — на нових місцях. */
  const display = useMemo(() => {
    if (drag?.kind !== "move" || !plan) return { scene: scene.value, preview: emptyPreview, framePreview: emptyPreview };
    const preview = new Map<string, GraphPreview>();
    const framePreview = new Map<string, GraphPreview>();
    const positions = new Map<string, Point>();
    const framePositions = new Map<string, Point>();
    const rest = new Map(scene.value.nodes.map((node) => [node.id, node.rect]));
    const raw = { dx: drag.delta.x, dy: drag.delta.y, mode: "drag" as const };
    const follow = (id: string): void => {
      const rect = rest.get(id);
      if (!rect) return;
      preview.set(id, raw);
      positions.set(id, { x: rect.x + raw.dx, y: rect.y + raw.dy });
    };
    if (drag.subject.kind === "node") follow(drag.subject.id);
    else {
      const frame = scene.value.frames.find((item) => item.id === drag.subject.id);
      if (frame) {
        framePreview.set(frame.id, raw);
        framePositions.set(frame.id, { x: frame.rect.x + raw.dx, y: frame.rect.y + raw.dy });
      }
      for (const id of plan.carried) follow(id);
    }
    for (const [id, point] of plan.nodes) {
      if (positions.has(id)) continue;
      const rect = rest.get(id)!;
      preview.set(id, { dx: point.x - rect.x, dy: point.y - rect.y, mode: "push" });
      positions.set(id, point);
    }
    return { scene: applyPlan(scene.value, { nodes: positions, frames: framePositions, membership: new Map() }), preview, framePreview };
  }, [scene, drag, plan]);

  const visible = useMemo(() => visibleScene(display.scene, sceneEdges), [display, sceneEdges]);

  const geometry = useMemo((): readonly EdgeGeometry[] => {
    const states = new Map(edges.map((edge) => [edge.id, edge.state ?? "default"]));
    return routeEdges(visible.edges, { obstacles: visible.obstacles }).map((route) => ({
      id: route.id,
      state: states.get(route.id) ?? "default",
      path: routePath(route.points),
      bends: route.bends,
      points: route.points,
    }));
  }, [visible, edges]);

  const memberCount = useMemo(() => new Map([...visible.members].map(([id, members]) => [id, members.length])), [visible]);

  const commit = useCallback(
    (change: GraphLayoutChange, message: string) => {
      onLayoutChange?.(change);
      setAnnouncement(message);
    },
    [onLayoutChange],
  );

  /** Зміна з плану: положення, належність, згини ребер усередині перенесеного фрейма. */
  const commitPlan = useCallback(
    (movePlan: MovePlan, action: "move-node" | "move-frame" | "expand-frame" | "arrange", subject: string, extraFrames: readonly GraphFrameLayout[] = []) => {
      const base = scene.value;
      const what = action === "move-node" ? "Ноду" : action === "arrange" ? "Ноди" : "Фрейм";
      if (movePlan.strategy === "blocked" && action !== "expand-frame") {
        setAnnouncement(announcements.blocked(what));
        return;
      }
      const final = applyPlan(base, movePlan);
      const finalNodes = new Map(final.nodes.map((node) => [node.id, node]));
      const restNodes = new Map(base.nodes.map((node) => [node.id, node]));
      const nodes = [...new Set([...movePlan.nodes.keys(), ...movePlan.membership.keys()])].flatMap((id): GraphNodeLayout[] => {
        const node = finalNodes.get(id);
        const before = restNodes.get(id);
        if (!node || !before) return [];
        const membership = movePlan.membership.get(id);
        if (membership === undefined && node.rect.x === before.rect.x && node.rect.y === before.rect.y) return [];
        return [{ id, x: node.rect.x, y: node.rect.y, ...(membership === undefined ? {} : { frame: membership }) }];
      });
      const restFrames = new Map(base.frames.map((frame) => [frame.id, frame.rect]));
      const frameChanges = new Map<string, GraphFrameLayout>();
      for (const [id, point] of movePlan.frames) {
        const before = restFrames.get(id);
        if (before && (before.x !== point.x || before.y !== point.y)) frameChanges.set(id, { id, x: point.x, y: point.y });
      }
      // Додаткові поля (згортання) поверх нового положення з плану.
      for (const extra of extraFrames) frameChanges.set(extra.id, { ...extra, ...frameChanges.get(extra.id) });
      const frames = [...frameChanges.values()];
      const bendChanges = adjustBends(edges, final, movePlan);
      const edgeChanges = [...bendChanges].map(([id, bends]) => ({ id, bends }));
      if (nodes.length === 0 && frames.length === 0 && edgeChanges.length === 0) return;
      const message = action === "expand-frame" ? "Фрейм розгорнуто." : action === "arrange" && movePlan.strategy !== "relocate" ? "Ноди вирівняно з проміжком у клітинку." : announcements[movePlan.strategy](what);
      commit({ action, subject, placement: movePlan.strategy, nodes, frames, edges: edgeChanges }, message);
    },
    [scene, edges, commit],
  );

  const moveBy = useCallback(
    (subject: MoveSubject, dx: number, dy: number) => {
      if (!editable) return;
      const movePlan = planMove(scene.value, subject, { x: dx, y: dy });
      if (movePlan) commitPlan(movePlan, subject.kind === "node" ? "move-node" : "move-frame", subject.id);
    },
    [editable, scene, commitPlan],
  );

  const toggleFrame = useCallback(
    (id: string) => {
      if (!editable) return;
      const frame = scene.value.frames.find((item) => item.id === id);
      if (!frame) return;
      if (frame.collapsed) {
        const expandPlan = planExpand(scene.value, id);
        const layout = { id, x: frame.rect.x, y: frame.rect.y, collapsed: false };
        // Без вільного місця фрейм усе одно розгортається: приховувати вміст користувач не просив.
        if (expandPlan && expandPlan.strategy !== "blocked") commitPlan(expandPlan, "expand-frame", id, [layout]);
        else commit({ action: "expand-frame", subject: id, nodes: [], frames: [layout], edges: [] }, "Фрейм розгорнуто.");
      } else {
        commit({ action: "collapse-frame", subject: id, nodes: [], frames: [{ id, x: frame.rect.x, y: frame.rect.y, collapsed: true }], edges: [] }, "Фрейм згорнуто: його ноди й внутрішні ребра приховано.");
      }
    },
    [editable, scene, commit, commitPlan],
  );

  /** Точка світу під курсором. */
  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = rootRef.current?.getBoundingClientRect();
      const current = view();
      return { x: (clientX - (rect?.left ?? 0) - current.x) / current.zoom, y: (clientY - (rect?.top ?? 0) - current.y) / current.zoom };
    },
    [rootRef, view],
  );

  const effectiveBends = useCallback((edgeId: string): readonly Point[] => geometry.find((edge) => edge.id === edgeId)?.bends ?? [], [geometry]);

  const commitBends = useCallback(
    (edgeId: string, bends: readonly Point[], message: string) => commit({ action: "edit-bends", subject: edgeId, nodes: [], frames: [], edges: [{ id: edgeId, bends }] }, message),
    [commit],
  );

  // Escape скасовує перетягування: нічого не змінюється, об'єкт повертається на місце.
  useEffect(() => {
    if (!drag) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !pending.current) return;
      pending.current.cancelled = true;
      setDrag(null);
      setAnnouncement("Переміщення скасовано.");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  /** Початок перетягування ноди, фрейма чи згину; true — подію оброблено (не панорамувати). */
  const pointerDown = (event: PointerEvent<HTMLDivElement>): boolean => {
    if (!editable || event.button !== 0) return false;
    const target = event.target as Element;
    const start = { x: event.clientX, y: event.clientY };
    const bend = target.closest<SVGElement>("[data-graph-bend]");
    if (bend) {
      pending.current = { pointer: event.pointerId, start, target: { kind: "bend", edge: bend.dataset["edge"]!, index: Number(bend.dataset["index"]) }, moved: false };
      return true;
    }
    const frame = target.closest<HTMLElement>("[data-graph-frame-handle]");
    if (frame) {
      pending.current = { pointer: event.pointerId, start, target: { kind: "move", subject: { kind: "frame", id: frame.dataset["graphFrameHandle"]! } }, moved: false };
      return true;
    }
    const node = target.closest<HTMLElement>("[data-graph-node]");
    if (node) {
      const id = node.dataset["graphNode"]!;
      if (!nodesRef.current.get(id)?.pinned) pending.current = { pointer: event.pointerId, start, target: { kind: "move", subject: { kind: "node", id } }, moved: false };
      return true;
    }
    return false;
  };

  const pointerMove = (event: PointerEvent<HTMLDivElement>): boolean => {
    const state = pending.current;
    if (!state || state.pointer !== event.pointerId) return false;
    if (state.cancelled) return true;
    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;
    if (!state.moved) {
      if (Math.hypot(dx, dy) < dragThreshold) return true;
      state.moved = true;
      // Захоплення лише після порогу: раніше воно перехопило б клік вибору. Вказівник міг
      // уже зникнути (дотик перервано) — тоді рух триває без захоплення, а не падає.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Без захоплення рух за межами полотна не відстежується, але кидок усередині працює.
      }
    }
    const zoom = view().zoom;
    if (state.target.kind === "move") setDrag({ kind: "move", subject: state.target.subject, delta: { x: dx / zoom, y: dy / zoom } });
    else setDrag({ kind: "bend", edge: state.target.edge, index: state.target.index, point: snapPoint(toWorld(event.clientX, event.clientY)) });
    return true;
  };

  const pointerUp = (event: PointerEvent<HTMLDivElement>, cancelled = false): boolean => {
    const state = pending.current;
    if (!state || state.pointer !== event.pointerId) return false;
    pending.current = null;
    if (!state.moved) return true;
    // Клік, що йде слідом за відпусканням, не має вибирати ноду чи згортати фрейм. Якщо його
    // не буде (відпустили поза елементом), прапорець знімається, щоб не з'їсти наступний клік.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const current = drag;
    setDrag(null);
    if (cancelled || state.cancelled || !current) return true;
    if (current.kind === "move" && plan) commitPlan(plan, current.subject.kind === "node" ? "move-node" : "move-frame", current.subject.id);
    if (current.kind === "bend") {
      const bends = [...effectiveBends(current.edge)];
      const corrected = correctBend(current.point, visible.obstacles);
      if (corrected && current.index < bends.length) {
        bends[current.index] = corrected;
        commitBends(current.edge, bends, corrected.x === current.point.x && corrected.y === current.point.y ? "Згин переміщено." : "Згин потрапив на ноду — його зсунуто на найближче вільне місце.");
      }
    }
    return true;
  };

  /** Подвійний клік: на ребрі — новий згин, на згині — видалення. */
  const doubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!editable) return;
    const target = event.target as Element;
    const bend = target.closest<SVGElement>("[data-graph-bend]");
    if (bend) {
      const edgeId = bend.dataset["edge"]!;
      const index = Number(bend.dataset["index"]);
      commitBends(edgeId, effectiveBends(edgeId).filter((_, position) => position !== index), "Згин видалено.");
      return;
    }
    const hit = target.closest<SVGElement>("[data-graph-edge]");
    if (!hit) return;
    const edgeId = hit.dataset["graphEdge"]!;
    const point = correctBend(toWorld(event.clientX, event.clientY), visible.obstacles);
    const route = visible.edges.find((edge) => edge.id === edgeId);
    if (!point || !route) return;
    const bends = [...effectiveBends(edgeId)];
    const routed = routeEdges([route], { obstacles: visible.obstacles })[0]!;
    bends.splice(bendInsertIndex(routed.points, bends, point), 0, point);
    commitBends(edgeId, bends, "Згин додано.");
  };

  /** Відпускання після перетягування не має вибирати ноду чи згортати фрейм кліком. */
  const clickCapture = (event: MouseEvent<HTMLDivElement>): void => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Вирівнювання виділених нод у стовпчик чи ряд (закріплені лишаються на місці). */
  const arrange = useCallback(
    (ids: readonly string[], axis: "vertical" | "horizontal") => {
      if (!editable) return;
      const arrangePlan = planArrange(scene.value, ids, axis);
      if (!arrangePlan) setAnnouncement("Для вирівнювання потрібні щонайменше дві незакріплені ноди.");
      else commitPlan(arrangePlan, "arrange", ids.join(","));
    },
    [editable, scene, commitPlan],
  );

  /** Згин посередині поточного маршруту ребра (кнопка «Додати згин» — без миші). */
  const addBend = useCallback(
    (edgeId: string) => {
      if (!editable) return;
      const route = geometry.find((edge) => edge.id === edgeId);
      if (!route || route.points.length < 2) return;
      const lengths = route.points.slice(1).map((point, index) => Math.hypot(point.x - route.points[index]!.x, point.y - route.points[index]!.y));
      let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
      let middle = route.points[0]!;
      for (let index = 0; index < lengths.length; index += 1) {
        const length = lengths[index]!;
        const a = route.points[index]!;
        const b = route.points[index + 1]!;
        if (remaining <= length) {
          middle = { x: a.x + ((b.x - a.x) * remaining) / (length || 1), y: a.y + ((b.y - a.y) * remaining) / (length || 1) };
          break;
        }
        remaining -= length;
      }
      const point = correctBend(middle, visible.obstacles);
      if (!point) return;
      const bends = [...route.bends];
      bends.splice(bendInsertIndex(route.points, bends, point), 0, point);
      commitBends(edgeId, bends, "Згин додано посередині ребра; його можна перетягнути.");
    },
    [editable, geometry, visible, commitBends],
  );

  /** Видимі ноди, яких торкається прямокутник світу (виділення рамкою). */
  const nodesInRect = useCallback(
    (rect: Rect): readonly string[] => {
      const shown = visibleScene(scene.value, []);
      return scene.value.nodes.filter((node) => !shown.hidden.has(node.id) && conflicts(node.rect, rect)).map((node) => node.id);
    },
    [scene],
  );

  /** Межі нод за id (для фрейма навколо виділення); сховані ноди не враховуються. */
  const boundsOfNodes = useCallback(
    (ids: readonly string[]): Rect | null => {
      const wanted = new Set(ids);
      return boundsOf(scene.value.nodes.filter((node) => wanted.has(node.id)).map((node) => node.rect));
    },
    [scene],
  );

  /** Лівий верхній кут нової ноди з центром у точці: сітка і вільне місце. */
  const freePosition = useCallback((point: Point): Point => freePlacement(scene.value, point, fallbackNodeSize), [scene]);

  /** Межі видимого вмісту для «Вмістити все»: видимі ноди й фрейми (згорнуті — компактно). */
  const bounds = useCallback((): Rect | null => {
    const shown = visibleScene(scene.value, []);
    return boundsOf([...scene.value.nodes.filter((node) => !shown.hidden.has(node.id)).map((node) => node.rect), ...scene.value.frames.map(frameFootprint)]);
  }, [scene]);

  const context = useMemo(
    (): Omit<GraphCanvasContextValue, "zoom"> => ({
      registerNode,
      registerFrame,
      editable,
      preview: display.preview,
      framePreview: display.framePreview,
      hidden: visible.hidden,
      memberCount,
      moveBy,
      toggleFrame,
    }),
    [registerNode, registerFrame, editable, display, visible.hidden, memberCount, moveBy, toggleFrame],
  );

  const ghost = drag?.kind === "move" && plan ? { rect: plan.target, strategy: plan.strategy } : null;
  const guides: readonly AlignmentGuide[] = drag?.kind === "move" && plan && plan.strategy !== "blocked" ? plan.guides : [];
  const dragging = drag !== null;

  return { context, geometry, ghost, guides, dragging, announcement, bounds, boundsOfNodes, nodesInRect, freePosition, arrange, addBend, toWorld, pointerDown, pointerMove, pointerUp, doubleClick, clickCapture };
}
