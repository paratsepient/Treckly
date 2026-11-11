"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { layoutSizes } from "@index/design-tokens";
import { Drawer } from "../drawer/Drawer.tsx";
import { useControllableState, useLayoutMode } from "../internal/hooks.ts";
import { PanelResizer } from "./PanelResizer.tsx";

export type PanelPresentation = "docked" | "drawer";

export interface PanelControl {
  /** Панель передана в layout. */
  readonly present: boolean;
  readonly open: boolean;
  readonly presentation: PanelPresentation;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
  /** id контейнера панелі для aria-controls. */
  readonly id: string;
  readonly label: string;
  /** Кнопка-перемикач у заголовку: сюди повертається фокус після закриття панелі. */
  readonly registerToggle: (element: HTMLElement | null) => void;
  /**
   * Переносить фокус на заголовок панелі після наступного рендеру — для явної дії
   * («Налаштувати»), а не для кожного вибору: вибір рядка чи ноди лишає фокус на місці.
   * Закріплена панель поруч із поверхнею, тож без цього Tab ішов би через усю поверхню.
   */
  readonly focus: () => void;
}

export interface WorkspacePanels {
  readonly context: PanelControl;
  readonly inspector: PanelControl;
}

const WorkspaceContext = createContext<WorkspacePanels | null>(null);

export function useWorkspacePanels(): WorkspacePanels {
  const context = useContext(WorkspaceContext);
  if (context === null) {
    throw new Error("Компонент використовується лише всередині WorkspaceLayout.");
  }
  return context;
}

export function useOptionalWorkspacePanels(): WorkspacePanels | null {
  return useContext(WorkspaceContext);
}

export interface WorkspaceLayoutProps {
  /** Зазвичай WorkspaceHeader. Знаходиться всередині layout, щоб мати доступ до перемикачів панелей. */
  readonly header?: ReactNode;
  /** ContextPanel з доменним вмістом (дерево, списки, бібліотеки). */
  readonly contextPanel?: ReactNode;
  readonly contextLabel?: string;
  readonly contextOpen?: boolean;
  readonly defaultContextOpen?: boolean;
  readonly onContextOpenChange?: (open: boolean) => void;
  /** InspectorPanel. Відкриття контролює споживач (наприклад, наявністю вибраного об'єкта). */
  readonly inspector?: ReactNode;
  readonly inspectorLabel?: string;
  readonly inspectorOpen?: boolean;
  readonly defaultInspectorOpen?: boolean;
  readonly onInspectorOpenChange?: (open: boolean) => void;
  /**
   * Ідентифікатор об'єкта в інспекторі. Його зміна (вибір іншого об'єкта)
   * відкриває Drawer інспектора на вузьких екранах, навіть якщо інспектор уже «відкритий»,
   * і перемонтовує вміст інспектора: неконтрольовані поля (defaultValue) інакше
   * показували б значення попереднього об'єкта, і «Застосувати» записало б їх не туди.
   */
  readonly inspectorKey?: string;
  /** Робоча поверхня (WorkspaceSurface). */
  readonly children: ReactNode;
}

const { "panel-min-width": PANEL_MIN, "panel-max-width": PANEL_MAX } = layoutSizes;

/**
 * Контракт розміщення робочої області: [ContextPanel] [WorkspaceSurface] [InspectorPanel].
 *
 * Поверхня завжди отримує весь залишок ширини (flex: 1, min-width: 0); панелі
 * згортаються й змінюють ширину незалежно від неї. На вузьких екранах панелі
 * переходять у Drawer: ContextPanel — нижче 1024 px, Inspector — нижче 1280 px.
 * Згорнута закріплена панель лишається змонтованою (hidden), щоб зберегти
 * прокрутку, пошук і стан вмісту.
 */
export function WorkspaceLayout({
  header,
  contextPanel,
  contextLabel = "Контекстна панель",
  contextOpen,
  defaultContextOpen = true,
  onContextOpenChange,
  inspector,
  inspectorLabel = "Інспектор",
  inspectorOpen,
  defaultInspectorOpen = false,
  onInspectorOpenChange,
  inspectorKey,
  children,
}: WorkspaceLayoutProps) {
  const mode = useLayoutMode();
  const baseId = useId();
  const contextPresentation: PanelPresentation = mode === "large" || mode === "wide" ? "docked" : "drawer";
  const inspectorPresentation: PanelPresentation = mode === "wide" ? "docked" : "drawer";

  const [contextDocked, setContextDocked] = useControllableState(contextOpen, defaultContextOpen, onContextOpenChange);
  // Drawer контекстної панелі — тимчасовий: завжди закритий після зміни режиму.
  const [contextDrawer, setContextDrawer] = useState(false);
  const [inspectorIsOpen, setInspectorOpen] = useControllableState(inspectorOpen, defaultInspectorOpen, onInspectorOpenChange);
  /**
   * Модальний Drawer інспектора відкривається лише явною дією (новий вибір
   * або перемикач), а не через звуження вікна при вже вибраному об'єкті:
   * інакше зміна розміру несподівано блокувала б сторінку модальним шаром.
   */
  const [inspectorDrawerShown, setInspectorDrawerShown] = useState(false);

  const [contextWidth, setContextWidth] = useState<number>(layoutSizes["context-panel-width"]);
  const [inspectorWidth, setInspectorWidth] = useState<number>(layoutSizes["inspector-width"]);

  const contextRef = useRef<HTMLDivElement | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const toggles = useRef<{ context: HTMLElement | null; inspector: HTMLElement | null }>({ context: null, inspector: null });
  const pendingFocus = useRef<"context" | "inspector" | null>(null);

  useEffect(() => setContextDrawer(false), [contextPresentation]);
  useEffect(() => setInspectorDrawerShown(false), [inspectorPresentation]);
  const previousInspector = useRef({ open: inspectorIsOpen, key: inspectorKey });
  useEffect(() => {
    const previous = previousInspector.current;
    if (inspectorIsOpen && (!previous.open || previous.key !== inspectorKey)) setInspectorDrawerShown(true);
    previousInspector.current = { open: inspectorIsOpen, key: inspectorKey };
  }, [inspectorIsOpen, inspectorKey]);

  /**
   * Закриття закріпленої панелі, у якій був фокус, інакше лишило б фокус
   * на прихованому елементі (body). Повертаємо його на перемикач або поверхню.
   */
  const beforeDockedClose = (panel: "context" | "inspector"): void => {
    const element = panel === "context" ? contextRef.current : inspectorRef.current;
    if (element && element.contains(document.activeElement)) {
      pendingFocus.current = panel;
    }
  };

  useEffect(() => {
    const panel = pendingFocus.current;
    if (panel === null) return;
    pendingFocus.current = null;
    const target = toggles.current[panel];
    if (target?.isConnected) {
      target.focus();
    } else {
      surfaceRef.current?.focus();
    }
  });

  // Об'єкт, а не прапорець: кожен запит — новий стан і новий рендер, навіть повторний.
  const [focusRequest, setFocusRequest] = useState<{ readonly panel: "context" | "inspector" } | null>(null);
  useEffect(() => {
    if (focusRequest === null) return;
    setFocusRequest(null);
    const presentation = focusRequest.panel === "context" ? contextPresentation : inspectorPresentation;
    // Drawer — модальний діалог: фокус у нього переносить він сам.
    if (presentation === "drawer") return;
    const element = focusRequest.panel === "context" ? contextRef.current : inspectorRef.current;
    if (!element || element.hidden) return;
    element.querySelector<HTMLElement>("[data-panel-title]")?.focus();
  }, [focusRequest, contextPresentation, inspectorPresentation]);

  const contextIsOpen = contextPresentation === "docked" ? contextDocked : contextDrawer;
  const setContext = (open: boolean): void => {
    if (contextPresentation === "docked") {
      if (!open) beforeDockedClose("context");
      setContextDocked(open);
    } else {
      setContextDrawer(open);
    }
  };
  const inspectorVisible = inspectorPresentation === "docked" ? inspectorIsOpen : inspectorIsOpen && inspectorDrawerShown;
  const setInspector = (open: boolean): void => {
    if (!open && inspectorPresentation === "docked") beforeDockedClose("inspector");
    if (inspectorPresentation === "drawer") setInspectorDrawerShown(open);
    setInspectorOpen(open);
  };

  const registerContextToggle = useCallback((element: HTMLElement | null) => {
    toggles.current.context = element;
  }, []);
  const registerInspectorToggle = useCallback((element: HTMLElement | null) => {
    toggles.current.inspector = element;
  }, []);

  const contextId = `ixp-context-${baseId}`;
  const inspectorId = `ixp-inspector-${baseId}`;

  const panels: WorkspacePanels = {
    context: {
      present: contextPanel !== undefined,
      open: contextIsOpen,
      presentation: contextPresentation,
      setOpen: setContext,
      toggle: () => setContext(!contextIsOpen),
      id: contextId,
      label: contextLabel,
      registerToggle: registerContextToggle,
      focus: () => setFocusRequest({ panel: "context" }),
    },
    inspector: {
      present: inspector !== undefined,
      open: inspectorVisible,
      presentation: inspectorPresentation,
      setOpen: setInspector,
      toggle: () => setInspector(!inspectorVisible),
      id: inspectorId,
      label: inspectorLabel,
      registerToggle: registerInspectorToggle,
      focus: () => setFocusRequest({ panel: "inspector" }),
    },
  };

  const widths = {
    "--ixp-context-width": `${contextWidth}px`,
    "--ixp-inspector-width": `${inspectorWidth}px`,
  } as CSSProperties;

  return (
    <WorkspaceContext.Provider value={panels}>
      <main className="ixp-workspace" data-layout-mode={mode} tabIndex={-1}>
        {header}
        <div className="ixp-workspace__body" style={widths}>
          {contextPanel !== undefined && contextPresentation === "docked" ? (
            <div ref={contextRef} id={contextId} className="ixp-workspace__panel" data-panel="context" hidden={!contextDocked}>
              {contextPanel}
              <PanelResizer
                edge="end"
                value={contextWidth}
                min={PANEL_MIN}
                max={PANEL_MAX}
                onChange={setContextWidth}
                label={`Ширина: ${contextLabel}`}
                controls={contextId}
              />
            </div>
          ) : null}
          <div ref={surfaceRef} className="ixp-workspace__surface" tabIndex={-1}>
            {children}
          </div>
          {inspector !== undefined && inspectorPresentation === "docked" ? (
            <div ref={inspectorRef} id={inspectorId} className="ixp-workspace__panel" data-panel="inspector" hidden={!inspectorIsOpen}>
              <PanelResizer
                edge="start"
                value={inspectorWidth}
                min={PANEL_MIN}
                max={PANEL_MAX}
                onChange={setInspectorWidth}
                label={`Ширина: ${inspectorLabel}`}
                controls={inspectorId}
              />
              <Fragment key={inspectorKey}>{inspector}</Fragment>
            </div>
          ) : null}
        </div>
        {contextPanel !== undefined && contextPresentation === "drawer" ? (
          <Drawer id={contextId} side="start" label={contextLabel} open={contextDrawer} onClose={() => setContextDrawer(false)}>
            {contextPanel}
          </Drawer>
        ) : null}
        {inspector !== undefined && inspectorPresentation === "drawer" ? (
          <Drawer id={inspectorId} side="end" label={inspectorLabel} open={inspectorVisible} onClose={() => setInspector(false)}>
            <Fragment key={inspectorKey}>{inspector}</Fragment>
          </Drawer>
        ) : null}
      </main>
    </WorkspaceContext.Provider>
  );
}
