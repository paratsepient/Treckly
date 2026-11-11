"use client";

import type { ReactNode } from "react";
import { Icon, IconButton } from "@index/ui";
import { useOptionalAppShell } from "../shell/AppShell.tsx";
import { SaveStatus, type SaveStatusProps } from "./SaveStatus.tsx";
import { useOptionalWorkspacePanels, type PanelControl } from "./WorkspaceLayout.tsx";

export interface Breadcrumb {
  readonly label: string;
  readonly href?: string;
}

export interface WorkspaceHeaderProps {
  readonly title: string;
  readonly breadcrumbs?: readonly Breadcrumb[];
  /** Контекстна інформація під назвою: версія, власник, кількість записів. */
  readonly meta?: ReactNode;
  readonly saveStatus?: SaveStatusProps;
  /** Головна дія екрана — завжди в одному місці: останньою праворуч. */
  readonly primaryAction?: ReactNode;
  /** Другорядні дії, зазвичай WorkspaceToolbar. */
  readonly actions?: ReactNode;
  /** Режим перегляду: показується позначка, головна дія й стан збереження приховуються. */
  readonly readOnly?: boolean;
  /**
   * Стан документа біля назви («Чернетка · не опубліковано», «Опубліковано»). Позначка, а не
   * метадані: метадані зникають на вузькому екрані, а різниця чернетки й опублікованої
   * версії (ADR-DASH-001 v2) потрібна завжди. У режимі перегляду не показується.
   */
  readonly documentState?: string;
}

const icons = {
  menu: <Icon name="menu" />,
  panelStart: <Icon name="panel-start" />,
  panelEnd: <Icon name="panel-end" />,
};

function PanelToggle({ panel, icon }: { readonly panel: PanelControl; readonly icon: ReactNode }) {
  if (!panel.present) return null;
  return (
    <IconButton
      ref={panel.registerToggle}
      label={panel.open ? `Сховати: ${panel.label}` : `Показати: ${panel.label}`}
      icon={icon}
      aria-expanded={panel.open}
      aria-controls={panel.id}
      onClick={panel.toggle}
    />
  );
}

/**
 * Єдиний заголовок робочої області. Перемикачі панелей і меню навігації
 * додаються автоматично з контексту AppShell і WorkspaceLayout, тож екрани
 * не повторюють цю логіку.
 */
export function WorkspaceHeader({ title, breadcrumbs, meta, saveStatus, primaryAction, actions, readOnly = false, documentState }: WorkspaceHeaderProps) {
  const shell = useOptionalAppShell();
  const panels = useOptionalWorkspacePanels();

  return (
    <header className="ixp-header" data-compact={shell?.mode === "compact" ? "" : undefined}>
      <div className="ixp-header__start">
        {shell?.sidebarPresentation === "drawer" ? (
          <IconButton
            label="Відкрити навігацію"
            icon={icons.menu}
            aria-expanded={shell.navigationOpen}
            aria-controls={shell.navigationId}
            onClick={() => shell.setNavigationOpen(true)}
          />
        ) : null}
        {/*
          * Закріплена контекстна панель не згортається (рішення власника 05.11.2026): перемикач
          * потрібен лише тоді, коли панель — Drawer на вузькому екрані й інакше недосяжна.
          */}
        {panels && panels.context.presentation === "drawer" ? <PanelToggle panel={panels.context} icon={icons.panelStart} /> : null}
        <div className="ixp-header__titles">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Шлях" className="ixp-breadcrumbs">
              <ol>
                {breadcrumbs.map((crumb, index) => (
                  <li key={`${crumb.label}-${index}`}>
                    {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="ixp-header__title-row">
            <h1 className="ixp-header__title">{title}</h1>
            {readOnly ? <span className="ixp-header__badge">Лише перегляд</span> : null}
            {!readOnly && documentState ? (
              <span className="ixp-header__badge" data-kind="document-state">
                {documentState}
              </span>
            ) : null}
          </div>
          {meta ? <div className="ixp-header__meta">{meta}</div> : null}
        </div>
      </div>
      <div className="ixp-header__end">
        {saveStatus && !readOnly ? <SaveStatus {...saveStatus} /> : null}
        {actions}
        {primaryAction && !readOnly ? primaryAction : null}
        {panels ? <PanelToggle panel={panels.inspector} icon={icons.panelEnd} /> : null}
      </div>
    </header>
  );
}
