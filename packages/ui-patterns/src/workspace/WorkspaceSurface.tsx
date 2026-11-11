"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollArea } from "@index/ui";

/**
 * Тип вмісту визначає лише власника прокрутки й заповнення:
 * - page — текстова сторінка, поверхня прокручується, ширина обмежена токеном;
 * - dashboard — перегляд дашборду, поверхня прокручується на всю ширину;
 * - table, canvas, builder — вміст сам керує переглядом (DataTable, pan/zoom),
 *   поверхня лише обрізає й віддає всю площу.
 */
export type SurfaceVariant = "page" | "dashboard" | "table" | "canvas" | "builder";

export interface SurfaceSize {
  readonly width: number;
  readonly height: number;
}

const SurfaceSizeContext = createContext<SurfaceSize | null>(null);

/**
 * Розмір поверхні для майбутнього CanvasWorkspace: оновлюється при зміні
 * ширини панелей, згортанні sidebar і зміні вікна, без власних слухачів у canvas.
 */
export function useWorkspaceSurfaceSize(): SurfaceSize | null {
  return useContext(SurfaceSizeContext);
}

export interface WorkspaceSurfaceProps {
  readonly variant: SurfaceVariant;
  /** Доступна назва області. */
  readonly label: string;
  /** Плаваюча панель інструментів поверх поверхні (WorkspaceToolbar placement="floating"). */
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
}

const SCROLL_OWNERS: ReadonlySet<SurfaceVariant> = new Set(["page", "dashboard"]);

export function WorkspaceSurface({ variant, label, overlay, children }: WorkspaceSurfaceProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<SurfaceSize | null>(null);
  const ownsScroll = SCROLL_OWNERS.has(variant);

  useEffect(() => {
    const element = ref.current;
    // ResizeObserver відсутній у SSR і старих тестових середовищах — розмір тоді невідомий (null).
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) => (previous && previous.width === width && previous.height === height ? previous : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <SurfaceSizeContext.Provider value={size}>
      <div ref={ref} className="ixp-surface" data-variant={variant} data-scroll-owner={ownsScroll ? "surface" : "content"}>
        {ownsScroll ? (
          <ScrollArea label={label} className="ixp-surface__scroll">
            <div className="ixp-surface__content">{children}</div>
          </ScrollArea>
        ) : (
          <section aria-label={label} className="ixp-surface__fill">
            {children}
          </section>
        )}
        {overlay}
      </div>
    </SurfaceSizeContext.Provider>
  );
}
