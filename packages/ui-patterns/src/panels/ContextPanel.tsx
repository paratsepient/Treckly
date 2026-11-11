"use client";

import type { ChangeEvent, ReactNode } from "react";
import { Input } from "@index/ui";
import { useOptionalWorkspacePanels } from "../workspace/WorkspaceLayout.tsx";
import { PanelFrame, type PanelStatus } from "./PanelFrame.tsx";

export interface ContextPanelSearch {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}

export interface ContextPanelProps {
  readonly title: string;
  readonly search?: ContextPanelSearch;
  /** Дії панелі (створити, фільтр) — зазвичай IconButton. */
  readonly actions?: ReactNode;
  readonly status?: PanelStatus;
  readonly emptyText?: string;
  readonly errorText?: string;
  readonly onRetry?: () => void;
  /** Доменний вміст: дерево підрозділів, список форм, бібліотека нод чи віджетів. */
  readonly children?: ReactNode;
  /**
   * Нерухомий рядок під вмістом (стан виділення, лічильник): лишається видимим, коли вміст
   * прокручується. Не для дій, що змінюють дані, — вони біля об'єкта, якого стосуються.
   */
  readonly footer?: ReactNode;
  /** Назва вже в шапці робочої області: рядок заголовка панелі не показується (див. PanelFrame). */
  readonly hideTitle?: boolean;
}

/**
 * Універсальна контекстна панель. Однакова для дерева підрозділів, списків
 * форм і шаблонів та бібліотек нод і віджетів — змінюється лише вміст.
 */
export function ContextPanel({ title, search, actions, status, emptyText, errorText, onRetry, footer, hideTitle, children }: ContextPanelProps) {
  const panels = useOptionalWorkspacePanels();
  return (
    <PanelFrame
      kind="context"
      title={title}
      headerExtra={actions ? <div className="ixp-panel__actions">{actions}</div> : null}
      // Закріплена панель завжди відкрита: кнопка закриття — лише в Drawer на вузькому екрані.
      control={panels?.context.presentation === "drawer" ? panels.context : null}
      toolbar={
        search ? (
          <Input
            type="search"
            label={search.label}
            hideLabel
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event: ChangeEvent<HTMLInputElement>) => search.onChange(event.target.value)}
          />
        ) : undefined
      }
      status={status}
      emptyText={emptyText}
      errorText={errorText}
      onRetry={onRetry}
      footer={footer}
      hideTitle={hideTitle}
    >
      {children}
    </PanelFrame>
  );
}
