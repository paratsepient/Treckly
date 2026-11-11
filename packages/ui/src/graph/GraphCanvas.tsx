"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "../internal/class-names.ts";
import { GraphCanvasContext, type GraphCanvasContextValue } from "./context.ts";
import { graphGridStep, type Point as GraphPoint, type Rect as GraphRect } from "./layout/geometry.ts";
import { useGraphEditor, type GraphEdgeSpec, type GraphLayoutChange } from "./use-graph-editor.ts";

export type { GraphEdgeLayout, GraphEdgeSpec, GraphEdgeState, GraphFrameLayout, GraphLayoutChange, GraphNodeLayout } from "./use-graph-editor.ts";

/** Вид полотна: зсув світу в px екрана і масштаб. */
export interface GraphView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * Частини полотна, закриті плаваючими шарами (інспектор, панель масштабу), у px.
 * «Вмістити все» і прокрутка до сфокусованої ноди тримають вміст поза ними.
 */
export interface GraphViewportInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/** Керування видом ззовні: кнопки масштабу лежать у плаваючій панелі поверхні, а не в полотні. */
export interface GraphCanvasHandle {
  /** Масштабує відносно центру видимої частини (без закритих смуг). */
  readonly zoomBy: (factor: number) => void;
  /** Показує всі видимі ноди й фрейми; масштаб не більший за 100 %. */
  readonly fit: () => void;
  /** Масштаб 100 % без зсуву центру видимої частини. */
  readonly resetZoom: () => void;
  /** Точка світу під точкою екрана (кидок ноди з палітри на полотно). */
  readonly toWorld: (clientX: number, clientY: number) => GraphPoint;
  /**
   * Лівий верхній кут нової ноди: центр — у точці світу (без неї — центр видимої частини),
   * вузол сітки, щонайменше клітинка до інших нод; зайняте місце — найближче вільне.
   */
  readonly freePosition: (centre?: GraphPoint) => GraphPoint;
  /** Вирівнювання нод у стовпчик чи ряд із проміжком у клітинку — зміна через onLayoutChange. */
  readonly arrange: (ids: readonly string[], axis: "vertical" | "horizontal") => void;
  /** Спільні межі нод (для фрейма навколо виділення). */
  readonly boundsOf: (ids: readonly string[]) => GraphRect | null;
  /** Згин посередині маршруту ребра — зміна через onLayoutChange. */
  readonly addBend: (edgeId: string) => void;
}

export interface GraphCanvasProps {
  /** Доступна назва полотна. */
  readonly label: string;
  /** Ноди й фрейми (GraphNode, GraphFrame) з абсолютними координатами світу. */
  readonly children?: ReactNode;
  /**
   * Ребра Output → Input. Маршрут будується автоматично (ортогонально, в обхід нод) від
   * фактичного положення сокетів; ручні згини — у bends.
   */
  readonly edges?: readonly GraphEdgeSpec[];
  /**
   * Завершені зміни розкладки: кидок ноди чи фрейма (з розсуванням сусідів), згортання
   * фрейма, правка згинів. З обробником ноди й фрейми рухаються мишею, дотиком і
   * стрілками, а подвійний клік на ребрі додає згин; без нього полотно лише для перегляду.
   */
  readonly onLayoutChange?: (change: GraphLayoutChange) => void;
  /** Клік по ребру: вибір ребра власником (дії «Додати згин», «Розірвати зв'язок»). */
  readonly onEdgeSelect?: (id: string, event: MouseEvent<Element>) => void;
  /** Клік по порожньому місцю (не після панорамування): зазвичай знімає виділення. */
  readonly onBackgroundClick?: () => void;
  /**
   * Виділення рамкою: ліва кнопка з порожнього місця тягне рамку, ноди, яких вона торкається,
   * повертаються власнику (additive — з Shift / Ctrl, додати до виділення). З обробником
   * полотно панорамується правою чи середньою кнопкою (і пальцем на сенсорному екрані).
   */
  readonly onMarqueeSelect?: (ids: readonly string[], options: { readonly additive: boolean }) => void;
  /** Керований вид; без нього полотно тримає вид саме. */
  readonly view?: GraphView;
  readonly defaultView?: GraphView;
  readonly onViewChange?: (view: GraphView) => void;
  /** Значення або функція: функція читається в момент дії, тож встигає за шириною панелей. */
  readonly viewportInsets?: GraphViewportInsets | (() => GraphViewportInsets);
  readonly ref?: Ref<GraphCanvasHandle>;
  readonly className?: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Межі масштабу: нижче 50 % підписи портів не читаються, вище 200 % нода не вміщується. */
export const graphZoomLimits = { min: 0.5, max: 2 } as const;

/** Крок масштабу кнопками й клавішами. */
export const graphZoomStep = 1.25;

/** Спільний порожній перелік: новий [] на кожному рендері перебудовував би маршрути. */
const noEdges: readonly GraphEdgeSpec[] = [];
const initialView: GraphView = { x: 0, y: 0, zoom: 1 };

/** Відступ від краю видимої частини для «Вмістити все» і прокрутки до ноди, px екрана. */
const viewPadding = 24;

/** Крок панорамування стрілками, px екрана. */
const panStep = 48;

const clampZoom = (zoom: number): number => Math.min(graphZoomLimits.max, Math.max(graphZoomLimits.min, zoom));

/**
 * Положення елемента у світі через offset-ланцюжок до шару світу: layout-координати
 * не залежать від transform, тож вимір не змінюється при pan/zoom.
 */
function worldBox(element: HTMLElement, world: HTMLElement): { x: number; y: number; width: number; height: number } {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  while (current && current !== world) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

/** Вид, за якого прямокутник світу вміщується у видиму частину. */
export function fitViewTo(
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  insets: GraphViewportInsets = {},
): GraphView {
  const left = (insets.left ?? 0) + viewPadding;
  const top = (insets.top ?? 0) + viewPadding;
  const width = Math.max(1, viewport.width - left - (insets.right ?? 0) - viewPadding);
  const height = Math.max(1, viewport.height - top - (insets.bottom ?? 0) - viewPadding);
  const zoom = clampZoom(Math.min(1, width / Math.max(1, bounds.width), height / Math.max(1, bounds.height)));
  return {
    zoom,
    x: left + (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: top + (height - bounds.height * zoom) / 2 - bounds.y * zoom,
  };
}

/**
 * Полотно графа: сітка точок із кроком 20 (SVG-патерн на токенах), шар ребер і ноди поверх.
 * Положення нод і фреймів — дані власника; розміри й сокети вимірюються в DOM
 * (data-graph-port), тож геометрія нод не дублюється константами в коді.
 *
 * Редагування (з onLayoutChange): нода чи фрейм тягнеться за курсором, а пунктирний контур
 * показує, куди вона стане — у вузол сітки, з напрямними вирівнювання; сусіди, на яких її
 * кинуть, заздалегідь розсуваються. Ребра обходять ноди й розходяться паралельними лініями.
 *
 * Вид (pan/zoom) — transform шару світу. Панорамування: перетягування порожнього місця,
 * коліщатко чи стрілки на сфокусованому полотні; масштаб: Ctrl+коліщатко (і жест
 * зведення пальців), «+» / «−» або кнопки через GraphCanvasHandle. Фокус на ноді за
 * межами видимої частини підтягує вид до неї: ноди досяжні з клавіатури без миші.
 */
export function GraphCanvas({
  label,
  children,
  edges = noEdges,
  onLayoutChange,
  onEdgeSelect,
  onBackgroundClick,
  onMarqueeSelect,
  view: viewProp,
  defaultView = initialView,
  onViewChange,
  viewportInsets,
  ref,
  className,
}: GraphCanvasProps) {
  const patternId = `ix-graph-grid-${useId()}`;
  const hintId = `ix-graph-hint-${useId()}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const [innerView, setInnerView] = useState(defaultView);
  const view = viewProp ?? innerView;
  // Актуальний вид для обробників, що живуть довше за рендер (wheel, pointermove).
  const viewRef = useRef(view);
  viewRef.current = view;
  const insetsRef = useRef(viewportInsets);
  insetsRef.current = viewportInsets;
  const insets = useCallback((): GraphViewportInsets => {
    const value = insetsRef.current;
    return (typeof value === "function" ? value() : value) ?? {};
  }, []);
  const [panning, setPanning] = useState(false);
  // Рамка виділення в координатах екрана відносно полотна: тонкий контур не масштабується з видом.
  const marquee = useRef<{ readonly pointer: number; readonly start: Point } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null>(null);
  const currentView = useCallback(() => viewRef.current, []);
  const editor = useGraphEditor({ edges, onLayoutChange, rootRef, view: currentView });
  // zoom — функція: ноди не перерендерюються від кожного кроку pan/zoom.
  const context = useMemo((): GraphCanvasContextValue => ({ ...editor.context, zoom: () => viewRef.current.zoom }), [editor.context]);
  const drag = useRef<{ readonly pointer: number; readonly start: Point; readonly origin: GraphView } | null>(null);
  // Відпускання після панорамування — не клік: не вибирає ребро й не знімає виділення.
  const panMoved = useRef(false);

  const setView = useCallback(
    (next: GraphView) => {
      viewRef.current = next;
      if (viewProp === undefined) setInnerView(next);
      onViewChange?.(next);
    },
    [viewProp, onViewChange],
  );

  /** Масштаб навколо точки екрана: точка світу під нею лишається на місці. */
  const zoomAt = useCallback(
    (factor: number, point: Point) => {
      const current = viewRef.current;
      const zoom = clampZoom(current.zoom * factor);
      if (zoom === current.zoom) return;
      const ratio = zoom / current.zoom;
      setView({ zoom, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio });
    },
    [setView],
  );

  /** Центр видимої частини (без смуг, закритих плаваючими шарами). */
  const visibleCentre = useCallback((): Point => {
    const root = rootRef.current;
    const covered = insets();
    const width = root?.clientWidth ?? 0;
    const height = root?.clientHeight ?? 0;
    const left = covered.left ?? 0;
    const top = covered.top ?? 0;
    return { x: left + (width - left - (covered.right ?? 0)) / 2, y: top + (height - top - (covered.bottom ?? 0)) / 2 };
  }, [insets]);

  const { bounds, toWorld, freePosition, arrange, boundsOfNodes, addBend } = editor;
  const fit = useCallback(() => {
    const root = rootRef.current;
    const content = bounds();
    if (!root || !content) return;
    setView(fitViewTo(content, { width: root.clientWidth, height: root.clientHeight }, insets()));
  }, [setView, insets, bounds]);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (factor) => zoomAt(factor, visibleCentre()),
      fit,
      resetZoom: () => zoomAt(1 / viewRef.current.zoom, visibleCentre()),
      toWorld,
      freePosition: (centre) => {
        if (centre) return freePosition(centre);
        const screen = visibleCentre();
        const current = viewRef.current;
        return freePosition({ x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom });
      },
      arrange,
      boundsOf: boundsOfNodes,
      addBend,
    }),
    [zoomAt, visibleCentre, fit, toWorld, freePosition, arrange, boundsOfNodes, addBend],
  );

  // wheel через addEventListener: React вішає його пасивним, і preventDefault не спрацював би.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const current = viewRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = root.getBoundingClientRect();
        zoomAt(Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else {
        setView({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY });
      }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [zoomAt, setView]);

  /** Точка екрана відносно лівого верхнього кута полотна. */
  const local = (event: { readonly clientX: number; readonly clientY: number }): Point => {
    const rect = rootRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // Нода, фрейм і згин тягнуться редактором (ліва кнопка).
    if (editor.pointerDown(event)) return;
    // Порожнє місце: нода, фрейм-підпис і контроли мають свої дії.
    if ((event.target as Element).closest(".ix-graph-node, button, a, input, select, textarea")) return;
    // Ліва кнопка миші — рамка виділення; права й середня (і палець, у якого правої немає) — огляд графа.
    const selects = onMarqueeSelect !== undefined && event.button === 0 && event.pointerType !== "touch";
    const pans = event.button === 2 || event.button === 1 || (event.button === 0 && !selects);
    panMoved.current = false;
    if (selects) marquee.current = { pointer: event.pointerId, start: local(event) };
    else if (pans) drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: viewRef.current };
  };

  /** Захоплення лише після порогу: із ним браузер шле click на полотно, а не на ребро під курсором. */
  const capture = (event: PointerEvent<HTMLDivElement>): void => {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Вказівник уже зник — рух триває без захоплення.
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (editor.pointerMove(event)) return;
    const box = marquee.current;
    if (box && box.pointer === event.pointerId) {
      const point = local(event);
      if (!panMoved.current) {
        if (Math.hypot(point.x - box.start.x, point.y - box.start.y) < 4) return;
        panMoved.current = true;
        capture(event);
      }
      setMarqueeBox({ x: Math.min(box.start.x, point.x), y: Math.min(box.start.y, point.y), width: Math.abs(point.x - box.start.x), height: Math.abs(point.y - box.start.y) });
      return;
    }
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (!panMoved.current) {
      if (Math.hypot(event.clientX - state.start.x, event.clientY - state.start.y) < 4) return;
      panMoved.current = true;
      capture(event);
      setPanning(true);
    }
    setView({ ...state.origin, x: state.origin.x + event.clientX - state.start.x, y: state.origin.y + event.clientY - state.start.y });
  };

  const endPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (editor.pointerUp(event, event.type === "pointercancel")) return;
    const box = marquee.current;
    if (box && box.pointer === event.pointerId) {
      marquee.current = null;
      setMarqueeBox(null);
      if (!panMoved.current || event.type === "pointercancel") return;
      // Рамка в екрані → прямокутник світу: ноди, яких вона торкається, стають виділенням.
      const point = local(event);
      const current = viewRef.current;
      const world = (value: Point): Point => ({ x: (value.x - current.x) / current.zoom, y: (value.y - current.y) / current.zoom });
      const a = world(box.start);
      const b = world(point);
      const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
      onMarqueeSelect?.(editor.nodesInRect(rect), { additive: event.shiftKey || event.ctrlKey || event.metaKey });
      return;
    }
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    setPanning(false);
  };

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (panMoved.current) {
      panMoved.current = false;
      return;
    }
    const target = event.target as Element;
    const edge = target.closest<SVGElement>("[data-graph-edge]");
    if (edge) onEdgeSelect?.(edge.dataset["graphEdge"]!, event);
    else if (!target.closest(".ix-graph-node, .ix-graph-frame, [data-graph-bend], button, a, input, select, textarea")) onBackgroundClick?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Лише на самому полотні: стрілки в нодах і полях мають власне значення.
    if (event.target !== event.currentTarget) return;
    const current = viewRef.current;
    const pans: Record<string, Point> = {
      ArrowLeft: { x: panStep, y: 0 },
      ArrowRight: { x: -panStep, y: 0 },
      ArrowUp: { x: 0, y: panStep },
      ArrowDown: { x: 0, y: -panStep },
    };
    const pan = pans[event.key];
    if (pan) setView({ ...current, x: current.x + pan.x, y: current.y + pan.y });
    else if (event.key === "+" || event.key === "=") zoomAt(graphZoomStep, visibleCentre());
    else if (event.key === "-" || event.key === "_") zoomAt(1 / graphZoomStep, visibleCentre());
    else return;
    event.preventDefault();
  };

  /** Фокус перейшов на ноду поза видимою частиною (Tab) — вид зсувається до неї. */
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    const world = worldRef.current;
    const node = (event.target as Element).closest<HTMLElement>(".ix-graph-node, .ix-graph-frame");
    if (!root || !world || !node) return;
    const current = viewRef.current;
    const covered = insets();
    const box = worldBox(node, world);
    const left = current.x + box.x * current.zoom;
    const top = current.y + box.y * current.zoom;
    const right = left + box.width * current.zoom;
    const bottom = top + box.height * current.zoom;
    const minX = (covered.left ?? 0) + viewPadding;
    const maxX = root.clientWidth - (covered.right ?? 0) - viewPadding;
    const minY = (covered.top ?? 0) + viewPadding;
    const maxY = root.clientHeight - (covered.bottom ?? 0) - viewPadding;
    const dx = left < minX ? minX - left : right > maxX ? Math.max(minX - left, maxX - right) : 0;
    const dy = top < minY ? minY - top : bottom > maxY ? Math.max(minY - top, maxY - bottom) : 0;
    if (dx !== 0 || dy !== 0) setView({ ...current, x: current.x + dx, y: current.y + dy });
  };

  return (
    <div
      ref={rootRef}
      className={cx("ix-graph", className)}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      // Полотно — зупинка Tab для панорамування й масштабу з клавіатури.
      tabIndex={0}
      data-panning={panning ? "" : undefined}
      data-marquee={onMarqueeSelect ? "" : undefined}
      data-dragging={editor.dragging ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClickCapture={editor.clickCapture}
      onClick={onClick}
      // Права кнопка — огляд графа: контекстне меню браузера тут лише заважало б.
      onContextMenu={onMarqueeSelect ? (event) => event.preventDefault() : undefined}
      onDoubleClick={editor.doubleClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <span id={hintId} className="ix-sr-only">
        {onLayoutChange
          ? "Стрілки прокручують полотно, плюс і мінус змінюють масштаб. На ноді чи фреймі стрілки переміщують їх на клітинку сітки, Escape скасовує перетягування."
          : "Стрілки прокручують полотно, плюс і мінус змінюють масштаб."}
        {onMarqueeSelect ? " Мишею: ліва кнопка на порожньому місці виділяє рамкою, права — переміщує вид." : null}
      </span>
      {/* Результат кидка (розсування, вільне місце) — для зчитувача: він може статися поза видом. */}
      <span className="ix-sr-only" aria-live="polite" aria-atomic="true">
        {editor.announcement}
      </span>
      {marqueeBox ? <div className="ix-graph-marquee" aria-hidden="true" style={{ left: marqueeBox.x, top: marqueeBox.y, width: marqueeBox.width, height: marqueeBox.height }} /> : null}
      <svg className="ix-graph__grid-layer" aria-hidden="true" focusable="false">
        <defs>
          {/*
           * Крок сітки 20 = --ix-space-5: атрибут SVG-патерну не приймає CSS-змінних. Точки — у
           * вузлах сітки (по чверті в кожному куті плитки), тож ноди стають рівно на них.
           */}
          <pattern id={patternId} width={graphGridStep} height={graphGridStep} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {[0, graphGridStep].flatMap((x) => [0, graphGridStep].map((y) => <circle key={`${x}-${y}`} className="ix-graph__dot" cx={x} cy={y} r="1" />))}
          </pattern>
        </defs>
        <rect className="ix-graph__grid" width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div ref={worldRef} className="ix-graph__world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="ix-graph__layer" aria-hidden="true" focusable="false">
          {editor.geometry.map((edge) => (
            <g key={edge.id} className="ix-graph-edge" data-state={edge.state}>
              {/* Широка невидима лінія — зручна ціль кліку (вибір ребра) і подвійного кліку (новий згин). */}
              {onLayoutChange || onEdgeSelect ? <path className="ix-graph-edge__hit" data-graph-edge={edge.id} d={edge.path} /> : null}
              {/* Без вістря: напрямок потоку задають сокети (вихід праворуч, вхід ліворуч). */}
              <path className="ix-graph-edge__line" d={edge.path} />
            </g>
          ))}
        </svg>
        {editor.ghost ? (
          <div
            className="ix-graph-ghost"
            data-strategy={editor.ghost.strategy}
            aria-hidden="true"
            style={{ left: editor.ghost.rect.x, top: editor.ghost.rect.y, width: editor.ghost.rect.width, height: editor.ghost.rect.height }}
          />
        ) : null}
        <GraphCanvasContext.Provider value={context}>{children}</GraphCanvasContext.Provider>
        <svg className="ix-graph__overlay" aria-hidden="true" focusable="false">
          {editor.guides.map((guide) =>
            guide.axis === "x" ? (
              <line key={`x${guide.at}`} className="ix-graph-guide" x1={guide.at} x2={guide.at} y1={guide.from} y2={guide.to} />
            ) : (
              <line key={`y${guide.at}`} className="ix-graph-guide" x1={guide.from} x2={guide.to} y1={guide.at} y2={guide.at} />
            ),
          )}
          {onLayoutChange
            ? editor.geometry.flatMap((edge) =>
                edge.bends.map((bend, index) => (
                  // Маркер згину: тягнеться мишею, подвійний клік видаляє.
                  <rect key={`${edge.id}-${index}`} className="ix-graph-bend" data-graph-bend="" data-edge={edge.id} data-index={index} x={bend.x - 4} y={bend.y - 4} width="8" height="8" />
                )),
              )
            : null}
        </svg>
      </div>
    </div>
  );
}
