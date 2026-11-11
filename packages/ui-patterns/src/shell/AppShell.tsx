"use client";

import { createContext, useContext, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { LayoutMode } from "@index/design-tokens";
import { Drawer } from "../drawer/Drawer.tsx";
import { FeedbackLayer, FeedbackProvider } from "../feedback/Feedback.tsx";
import { useLayoutMode } from "../internal/hooks.ts";

export interface AppShellContextValue {
  readonly mode: LayoutMode;
  /**
   * docked — вузька колонка з іконками поруч із контентом; drawer — тимчасова
   * панель з підписами на вузьких екранах, де колонка забрала б помітну частину ширини.
   */
  readonly sidebarPresentation: "docked" | "drawer";
  readonly navigationOpen: boolean;
  readonly setNavigationOpen: (open: boolean) => void;
  readonly navigationId: string;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (context === null) {
    throw new Error("Компонент використовується лише всередині AppShell.");
  }
  return context;
}

/** Для компонентів, які працюють і поза AppShell (WorkspaceHeader в ізольованих тестах). */
export function useOptionalAppShell(): AppShellContextValue | null {
  return useContext(AppShellContext);
}

export interface AppShellProps {
  /** Глобальна навігація, зазвичай AppSidebar. */
  readonly sidebar: ReactNode;
  /** Область застосунку, зазвичай WorkspaceLayout. */
  readonly children: ReactNode;
  readonly navigationLabel?: string;
}

/**
 * Єдина оболонка застосунку: глобальна навігація, область контенту
 * й один FeedbackLayer. Займає весь viewport (position: fixed), тому
 * документ не прокручується — прокрутку мають лише визначені власники
 * (ScrollArea панелей і поверхні).
 */
export function AppShell({ sidebar, children, navigationLabel = "Головна навігація" }: AppShellProps) {
  const mode = useLayoutMode();
  const navigationId = `ixp-nav-${useId()}`;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const sidebarPresentation = mode === "compact" ? "drawer" : "docked";
  const regionRef = useRef<HTMLDivElement | null>(null);

  /**
   * Перехід до вмісту без зміни адреси: застосунок маршрутизує через hash, тож
   * рідний перехід за якорем підмінив би маршрут. Фокус — на ландмарк main робочої області.
   */
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const target = regionRef.current?.querySelector<HTMLElement>("main") ?? regionRef.current;
    target?.focus();
  };

  const value: AppShellContextValue = {
    mode,
    sidebarPresentation,
    navigationOpen: sidebarPresentation === "drawer" && navigationOpen,
    setNavigationOpen,
    navigationId,
  };

  return (
    <AppShellContext.Provider value={value}>
      <FeedbackProvider>
        <div className="ixp-app-shell" data-layout-mode={mode} data-sidebar={sidebarPresentation === "drawer" ? "drawer" : "rail"}>
          {/* Перша зупинка Tab: інакше клавіатура проходить усю колонку навігації на кожному екрані. */}
          <a className="ixp-skip-link" href={`#${navigationId}-content`} onClick={skipToContent}>
            Перейти до вмісту
          </a>
          {sidebarPresentation === "docked" ? (
            // aside: бренд, контекст ролі й профіль теж мають бути в ландмарку, а не лише nav.
            <aside className="ixp-app-shell__sidebar" id={navigationId} aria-label="Бічна панель застосунку">
              {sidebar}
            </aside>
          ) : (
            <Drawer id={navigationId} side="start" label={navigationLabel} open={value.navigationOpen} onClose={() => setNavigationOpen(false)}>
              {sidebar}
            </Drawer>
          )}
          <div ref={regionRef} id={`${navigationId}-content`} className="ixp-app-shell__region" tabIndex={-1}>
            {children}
          </div>
          <FeedbackLayer />
        </div>
      </FeedbackProvider>
    </AppShellContext.Provider>
  );
}
