import { createContext, useContext, useState, type ReactNode } from "react";
import { DataState, Icon, IconButton, Tab, TabList, TabPanel, Tabs } from "@index/ui";

export interface DetailTab {
  readonly value: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface DetailPanelProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly tabs?: readonly DetailTab[] | undefined;
  readonly children?: ReactNode;
  /** Дії над об'єктом: закріплені внизу панелі. */
  readonly actions?: ReactNode;
  readonly empty?: boolean;
  readonly emptyText?: string;
}

/** Закриття панелі дає каркас сторінки (ScreenFrame): лише там, де панель можна закрити. */
export const DetailCloseContext = createContext<(() => void) | null>(null);

/**
 * Бічна картка об'єкта: заголовок, вкладки, вміст із власною прокруткою і дії внизу.
 * Розміщення (колонка поруч із вмістом, блок під ним або висувна панель) вирішує ScreenFrame.
 */
export function DetailPanel({ title, subtitle, tabs, children, actions, empty = false, emptyText }: DetailPanelProps) {
  const close = useContext(DetailCloseContext);
  const [tab, setTab] = useState(tabs?.[0]?.value ?? "");
  const useTabs = !empty && tabs !== undefined && tabs.length > 0;
  const activeTab = tabs?.some((item) => item.value === tab) ? tab : (tabs?.[0]?.value ?? "");

  const head = (
    <header className="detail__head">
      <div className="detail__heading">
        <h2 className="detail__title">{title}</h2>
        {subtitle ? <p className="detail__subtitle">{subtitle}</p> : null}
      </div>
      {close ? <IconButton label="Закрити картку" icon={<Icon name="close" />} onClick={close} /> : null}
    </header>
  );

  const body = empty ? (
    <DataState kind="empty" size="compact" title={emptyText ?? "Нічого не вибрано"} />
  ) : useTabs ? (
    tabs.map((item) => (
      <TabPanel key={item.value} value={item.value}>
        {item.content}
      </TabPanel>
    ))
  ) : (
    children
  );

  const frame = (
    <section className="detail" aria-label={title}>
      {head}
      {useTabs ? (
        <div className="detail__tabs">
          <TabList aria-label={`Розділи: ${title}`} variant="segmented">
            {tabs.map((item) => (
              <Tab key={item.value} value={item.value}>
                {item.label}
              </Tab>
            ))}
          </TabList>
        </div>
      ) : null}
      <div className="detail__body">{body}</div>
      {actions && !empty ? <footer className="detail__actions">{actions}</footer> : null}
    </section>
  );

  return useTabs ? (
    <Tabs value={activeTab} onValueChange={setTab} className="detail__tabs-root">
      {frame}
    </Tabs>
  ) : (
    frame
  );
}
