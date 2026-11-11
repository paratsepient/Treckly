"use client";

import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

export interface WorkspaceToolbarProps {
  /** Доступна назва панелі інструментів. */
  readonly label: string;
  /**
   * inline — у заголовку або над вмістом; floating — компактна панель поверх
   * поверхні (canvas), позиціонується в межах WorkspaceSurface.
   */
  readonly placement?: "inline" | "floating";
  readonly position?: "top-start" | "top-center" | "bottom-center";
  readonly children: ReactNode;
}

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";

function items(toolbar: HTMLElement): HTMLElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(`${FOCUSABLE}, [data-ixp-roving]`)).filter(
    (element) => !(element as HTMLButtonElement).disabled,
  );
}

/**
 * Канонічна панель інструментів (WAI-ARIA toolbar): одна Tab-зупинка,
 * ←/→ між елементами, Home/End — до крайніх. Неактивні кнопки пропускаються.
 * Вміст — звичайні IconButton/Button з @index/ui, тому Tooltip і стани однакові
 * в заголовку, на поверхні та в плаваючій панелі.
 */
export function WorkspaceToolbar({ label, placement = "inline", position = "top-start", children }: WorkspaceToolbarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const current = useRef<HTMLElement | null>(null);

  // Roving tabindex встановлюємо в DOM: дочірні кнопки не знають про toolbar.
  const activate = (target: HTMLElement | null): void => {
    const toolbar = ref.current;
    if (!toolbar) return;
    const all = items(toolbar);
    const active = target && all.includes(target) ? target : all[0];
    current.current = active ?? null;
    for (const element of all) {
      element.setAttribute("data-ixp-roving", "");
      element.tabIndex = element === active ? 0 : -1;
    }
  };

  // Після кожного рендеру вміст міг змінитися (нові або неактивні кнопки) —
  // зберігаємо поточний елемент, якщо він досі доступний.
  useEffect(() => {
    activate(current.current);
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Стрілки в текстовому полі рухають курсор, а не фокус панелі.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const all = items(event.currentTarget);
    const index = all.findIndex((element) => element === document.activeElement);
    if (index === -1) return;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = all[(next + all.length) % all.length];
    activate(target ?? null);
    target?.focus();
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.target instanceof HTMLElement) activate(event.target);
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className="ixp-toolbar"
      data-placement={placement}
      data-position={placement === "floating" ? position : undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="ixp-toolbar__group">
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <div role="separator" aria-orientation="vertical" className="ixp-toolbar__separator" />;
}
