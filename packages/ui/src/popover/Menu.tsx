"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../internal/class-names.ts";
import type { FloatingAlign, FloatingSide } from "../internal/position.ts";
import { focusAfterTrigger, portalContainer, themeOf, useDismiss, useFloatingPosition } from "../internal/useFloating.ts";
import type { PopoverTriggerProps } from "./Popover.tsx";

export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Знищувальна дія: колір brick і окреме місце в кінці меню. */
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface MenuSeparator {
  readonly separator: true;
  readonly id: string;
}

export type MenuEntry = MenuAction | MenuSeparator;

export interface MenuProps {
  /** Доступна назва меню («Дії з віджетом»). */
  readonly label: string;
  readonly trigger: ReactElement<PopoverTriggerProps & { readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void }>;
  readonly items: readonly MenuEntry[];
  readonly placement?: FloatingSide;
  readonly align?: FloatingAlign;
  readonly className?: string;
}

const isAction = (entry: MenuEntry): entry is MenuAction => !("separator" in entry);

/**
 * Меню дій (APG Menu Button): тригер з aria-haspopup="menu", пункти role="menuitem".
 * Стрілки, Home/End і перша літера переміщують фокус; Enter/Space виконують дію й
 * закривають меню; Escape закриває й повертає фокус на тригер; Tab закриває меню й веде
 * до елемента після тригера, Shift+Tab — на тригер (меню в порталі наприкінці body).
 */
export function Menu({ label, trigger, items, placement = "bottom", align = "end", className }: MenuProps) {
  const id = `ix-menu-${useId()}`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Який пункт отримає фокус після відкриття: перший (клік, ↓) чи останній (↑).
  const [initial, setInitial] = useState<"first" | "last">("first");
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const position = useFloatingPosition(open, anchorRef, menuRef, placement, align);

  const menuItems = (): HTMLButtonElement[] => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
  const focusTrigger = (): void => anchorRef.current?.querySelector<HTMLElement>("button")?.focus();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || position === null) return;
    const list = menuItems();
    if (!list.some((item) => item === document.activeElement)) {
      (initial === "first" ? list[0] : list[list.length - 1])?.focus();
    }
  }, [open, position, initial]);

  useDismiss(open, [anchorRef, menuRef], (reason) => {
    setOpen(false);
    if (reason === "escape") focusTrigger();
  });

  if (!isValidElement(trigger)) {
    throw new Error("Menu очікує один елемент-тригер.");
  }

  const show = (from: "first" | "last"): void => {
    setInitial(from);
    setOpen(true);
  };

  const triggerElement = cloneElement(trigger, {
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    "aria-haspopup": "menu",
    onClick: (event: MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(event);
      if (open) setOpen(false);
      else show("first");
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      trigger.props.onKeyDown?.(event);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        show(event.key === "ArrowDown" ? "first" : "last");
      }
    },
  });

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const list = menuItems();
    const index = list.findIndex((item) => item === document.activeElement);
    const move = (next: number): void => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Tab") {
      const trigger = anchorRef.current?.querySelector<HTMLElement>("button");
      event.preventDefault();
      setOpen(false);
      if (trigger && event.shiftKey) trigger.focus();
      else if (trigger) focusAfterTrigger(trigger, menuRef.current);
    }
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Пошук за першою літерою, починаючи з наступного пункту.
      const letter = event.key.toLocaleLowerCase("uk");
      const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
      const match = order.find((item) => item.textContent?.trim().toLocaleLowerCase("uk").startsWith(letter));
      if (match) {
        event.preventDefault();
        match.focus();
      }
    }
  };

  return (
    <span ref={anchorRef} className="ix-popover-anchor">
      {triggerElement}
      {mounted && open
        ? createPortal(
            <div
              ref={menuRef}
              id={id}
              role="menu"
              aria-label={label}
              className={cx("ix-popover", "ix-menu", className)}
              data-theme={themeOf(anchorRef.current)}
              data-placement={position?.placement ?? placement}
              data-positioned={position ? "" : undefined}
              style={position ? { top: position.top, left: position.left } : undefined}
              onKeyDown={onMenuKeyDown}
            >
              {items.map((entry) =>
                isAction(entry) ? (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="ix-menu__item"
                    data-destructive={entry.destructive ? "" : undefined}
                    disabled={entry.disabled}
                    onClick={() => {
                      setOpen(false);
                      focusTrigger();
                      entry.onSelect();
                    }}
                  >
                    {entry.icon !== undefined ? (
                      <span className="ix-menu__icon" aria-hidden="true">
                        {entry.icon}
                      </span>
                    ) : null}
                    <span className="ix-menu__label">{entry.label}</span>
                  </button>
                ) : (
                  <div key={entry.id} role="separator" className="ix-menu__separator" />
                ),
              )}
            </div>,
            portalContainer(anchorRef.current),
          )
        : null}
    </span>
  );
}
