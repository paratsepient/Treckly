"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "@index/ui";
import { useOptionalWorkspacePanels } from "../workspace/WorkspaceLayout.tsx";
import { PanelFrame } from "./PanelFrame.tsx";

export interface InspectorTab {
  readonly value: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface InspectorPanelProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  /** Контекстні вкладки (Властивості, Доступ, Історія). Без них — один вміст у children. */
  readonly tabs?: readonly InspectorTab[];
  readonly children?: ReactNode;
  /** StickyActions: дії, що завжди видимі внизу панелі. У режимі readOnly приховуються. */
  readonly actions?: ReactNode;
  readonly readOnly?: boolean;
  /** Немає вибраного об'єкта: панель показує пояснення замість властивостей. */
  readonly empty?: boolean;
  readonly emptyText?: string;
}

const InspectorContext = createContext<{ readonly readOnly: boolean }>({ readOnly: false });

/** Доменний вміст інспектора дізнається про read-only без пропсів на кожному полі. */
export function useInspector(): { readonly readOnly: boolean } {
  return useContext(InspectorContext);
}

/**
 * Єдина панель властивостей для підрозділу, ноди, ребра чи віджета.
 * Вкладки — канонічні Tabs з @index/ui: список вкладок нерухомий,
 * прокручується лише вміст (один ScrollArea).
 */
export function InspectorPanel({ title, subtitle, tabs, children, actions, readOnly = false, empty = false, emptyText }: InspectorPanelProps) {
  const panels = useOptionalWorkspacePanels();
  const [tab, setTab] = useState(tabs?.[0]?.value ?? "");
  const activeTab = tabs?.some((item) => item.value === tab) ? tab : (tabs?.[0]?.value ?? "");
  const useTabs = !empty && tabs !== undefined && tabs.length > 0;

  const frame = (
    <PanelFrame
      kind="inspector"
      title={title}
      subtitle={subtitle}
      headerExtra={readOnly ? <span className="ixp-header__badge">Лише перегляд</span> : null}
      control={panels?.inspector ?? null}
      closeLabel="Закрити інспектор"
      toolbar={
        useTabs ? (
          <TabList aria-label={`Розділи: ${title}`} variant="segmented">
            {tabs.map((item) => (
              <Tab key={item.value} value={item.value}>
                {item.label}
              </Tab>
            ))}
          </TabList>
        ) : undefined
      }
      footer={actions && !readOnly && !empty ? <div className="ixp-panel__sticky-actions">{actions}</div> : undefined}
      status={empty ? "empty" : "ready"}
      emptyText={emptyText ?? "Виберіть об'єкт, щоб переглянути його властивості."}
    >
      {useTabs
        ? tabs.map((item) => (
            <TabPanel key={item.value} value={item.value}>
              {item.content}
            </TabPanel>
          ))
        : children}
    </PanelFrame>
  );

  return (
    <InspectorContext.Provider value={{ readOnly }}>
      {useTabs ? (
        <Tabs value={activeTab} onValueChange={setTab} className="ixp-inspector-tabs">
          {frame}
        </Tabs>
      ) : (
        frame
      )}
    </InspectorContext.Provider>
  );
}
