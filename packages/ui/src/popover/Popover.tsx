"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../internal/class-names.ts";
import type { FloatingAlign, FloatingSide } from "../internal/position.ts";
import { focusableSelector, focusAfterTrigger, portalContainer, themeOf, useDismiss, useFloatingPosition } from "../internal/useFloating.ts";

export interface PopoverTriggerProps {
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly "aria-expanded"?: boolean;
  readonly "aria-controls"?: string;
  readonly "aria-haspopup"?: "dialog" | "menu";
}

export interface PopoverProps {
  /** Доступна назва панелі (non-modal dialog). */
  readonly label: string;
  /** Один елемент-тригер: Button чи IconButton. */
  readonly trigger: ReactElement<PopoverTriggerProps>;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly placement?: FloatingSide;
  readonly align?: FloatingAlign;
  readonly className?: string;
}

/**
 * Popover — немодальна плаваюча панель біля тригера (фільтри, швидкі налаштування).
 * Портал з position: fixed, як у Tooltip: батьки з overflow панель не обрізають.
 * Відкриття переводить фокус у панель; Escape чи закриття кнопкою в панелі повертає
 * фокус на тригер; клік поза панеллю закриває без перенесення фокуса. Tab з останнього елемента веде
 * до елемента після тригера, Shift+Tab з першого — на тригер (панель у порталі, тож
 * рідний порядок Tab вивів би фокус за межі сторінки).
 */
export function Popover({ label, trigger, children, open: openProp, defaultOpen = false, onOpenChange, placement = "bottom", align = "start", className }: PopoverProps) {
  const id = `ix-popover-${useId()}`;
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const position = useFloatingPosition(open, anchorRef, panelRef, placement, align);

  const setOpen = (next: boolean): void => {
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };

  const focusTrigger = (): void => {
    anchorRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
  };

  useEffect(() => setMounted(true), []);

  // Фокус у панель після позиціювання: перший активний елемент або сама панель.
  useEffect(() => {
    if (!open || position === null) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>(focusableSelector) ?? panel).focus();
    }
  }, [open, position]);

  // Закриття кліком поза панеллю: фокус лишається там, куди клікнули, навіть на body.
  const closedOutside = useRef(false);
  useDismiss(open, [anchorRef, panelRef], (reason) => {
    closedOutside.current = reason === "outside";
    setOpen(false);
    if (reason === "escape") focusTrigger();
  });

  /*
   * Панель закрив її власний вміст («Застосувати», «Скинути») чи власник через open:
   * сфокусована кнопка зникла разом із порталом, і фокус упав би на body — посеред
   * сторінки для клавіатури. Повертаємо його на тригер. Escape і Tab уже перенесли фокус.
   */
  const wasOpen = useRef(open);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost && !closedOutside.current) focusTrigger();
    closedOutside.current = false;
  }, [open]);

  if (!isValidElement(trigger)) {
    throw new Error("Popover очікує один елемент-тригер.");
  }

  const triggerElement = cloneElement(trigger, {
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
    "aria-haspopup": "dialog",
    onClick: (event: MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(event);
      setOpen(!open);
    },
  });

  return (
    <span ref={anchorRef} className="ix-popover-anchor">
      {triggerElement}
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={id}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              className={cx("ix-popover", className)}
              data-theme={themeOf(anchorRef.current)}
              data-placement={position?.placement ?? placement}
              data-positioned={position ? "" : undefined}
              style={position ? { top: position.top, left: position.left } : undefined}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Tab") return;
                const items = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)];
                const active = document.activeElement;
                const atEnd = event.shiftKey ? active === event.currentTarget || active === items[0] : active === items[items.length - 1] || items.length === 0;
                if (!atEnd) return;
                const trigger = anchorRef.current?.querySelector<HTMLElement>(focusableSelector);
                if (!trigger) return;
                event.preventDefault();
                setOpen(false);
                if (event.shiftKey) trigger.focus();
                else focusAfterTrigger(trigger, event.currentTarget);
              }}
              onBlur={(event: FocusEvent<HTMLDivElement>) => {
                const next = event.relatedTarget as Node | null;
                // Фокус пішов за межі панелі й тригера (Tab далі) — панель більше не потрібна.
                if (next && !event.currentTarget.contains(next) && !anchorRef.current?.contains(next)) setOpen(false);
              }}
            >
              {children}
            </div>,
            portalContainer(anchorRef.current),
          )
        : null}
    </span>
  );
}
