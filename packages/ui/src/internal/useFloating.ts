import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { computeFloatingPosition, type FloatingAlign, type FloatingPosition, type FloatingSide } from "./position.ts";

/** Відстань між тригером і плаваючою панеллю (popover, меню). */
export const FLOATING_GAP = 4;

/**
 * Позиція відкритого плаваючого шару біля тригера (position: fixed у порталі).
 * Перераховується при прокрутці будь-якого предка і зміні розміру вікна.
 */
export function useFloatingPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  placement: FloatingSide,
  align: FloatingAlign,
): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const rect = anchor.getBoundingClientRect();
    setPosition(
      computeFloatingPosition(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: floating.offsetWidth, height: floating.offsetHeight },
        { width: document.documentElement.clientWidth, height: window.innerHeight },
        placement,
        FLOATING_GAP,
        align,
      ),
    );
  }, [anchorRef, floatingRef, placement, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    update();
    // capture: прокрутка будь-якого предка (ScrollArea, Inspector) теж зсуває тригер.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update]);

  return position;
}

/**
 * Закриття плаваючого шару: Escape (з поверненням фокуса на тригер робить власник)
 * і натискання вказівника поза тригером і шаром.
 */
export function useDismiss(
  open: boolean,
  refs: readonly RefObject<HTMLElement | null>[],
  onDismiss: (reason: "escape" | "outside") => void,
): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // Escape закриває лише верхній шар: модальний діалог під ним лишається відкритим.
        event.preventDefault();
        event.stopPropagation();
        latest.current("escape");
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && refs.some((ref) => ref.current?.contains(target))) return;
      latest.current("outside");
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
    // refs — стабільні об'єкти useRef: масив створюється щоразу, але вміст той самий.
  }, [open]);
}

/** Елементи, що беруть фокус клавішею Tab (без прихованих і вимкнених). */
export const focusableSelector =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Переносить фокус на наступний за тригером елемент у порядку документа. Плаваючий
 * шар живе в порталі в кінці body, тож рідний Tab із нього вивів би фокус за межі
 * сторінки (у панель браузера), а не до елемента після тригера (WCAG 2.4.3).
 * Повертає false, якщо після тригера нічого немає — тоді фокус лишається на тригері.
 */
export function focusAfterTrigger(trigger: HTMLElement, layer: HTMLElement | null): boolean {
  const candidates = [...document.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !layer?.contains(element) && !element.closest("[hidden], [inert]"),
  );
  const next = candidates.find((element) => trigger !== element && !trigger.contains(element) && trigger.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (next) {
    next.focus();
    return true;
  }
  trigger.focus();
  return false;
}

/** Контейнер порталу: усередині відкритого модального <dialog> — сам діалог (top layer). */
export function portalContainer(anchor: HTMLElement | null): HTMLElement {
  return anchor?.closest<HTMLElement>("dialog[open]") ?? document.body;
}

/** Тема найближчого предка тригера: портал виходить за межі піддерева з data-theme. */
export function themeOf(anchor: HTMLElement | null): string | undefined {
  return anchor?.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined;
}
