"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { joinIds } from "../internal/class-names.ts";
import { computeTooltipPosition, type TooltipPlacement, type TooltipPosition } from "./position.ts";

export type { TooltipPlacement } from "./position.ts";

interface TriggerProps {
  readonly "aria-describedby"?: string;
}

export interface TooltipProps {
  /** Короткий текст підказки. Інтерактивний вміст у tooltip заборонено (WCAG 1.4.13, APG). */
  readonly content: string;
  /** Один фокусований елемент-тригер. */
  readonly children: ReactElement<TriggerProps>;
  /** Бажаний бік; при нестачі місця підказка перевертається. */
  readonly placement?: TooltipPlacement;
  /** Затримка показу при наведенні, мс. Фокус показує підказку одразу. */
  readonly delay?: number;
  /**
   * Підказка лише дублює доступну назву тригера (IconButton). Тоді вона не стає
   * aria-describedby, щоб зчитувач не читав той самий текст двічі.
   */
  readonly duplicatesLabel?: boolean;
}

/** Старі рушії не знають :focus-visible; тоді вважаємо фокус клавіатурним, щоб підказка не губилася. */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** Час, за який вказівник може перейти з тригера на підказку, не закривши її. */
const CLOSE_GRACE_MS = 120;

/**
 * Контейнер порталу. Відкритий модальний <dialog> лежить у top layer над body,
 * тому всередині Drawer/діалогу підказка монтується в сам діалог.
 */
function portalContainer(anchor: HTMLElement | null): HTMLElement {
  return anchor?.closest<HTMLElement>("dialog[open]") ?? document.body;
}

/**
 * Tooltip згідно з WCAG 1.4.13: закривається Escape без переміщення фокуса,
 * не зникає при наведенні на саму підказку і тримається, доки є фокус чи наведення.
 *
 * Підказка рендериться порталом з position: fixed, тому її не обрізають батьки
 * з overflow (Inspector, ScrollArea, таблиці), а позиція враховує краї viewport.
 * Тема береться з найближчого [data-theme] тригера: портал виходить за межі
 * піддерева з темою, і без цього підказка в темній панелі стала б світлою.
 */
export function Tooltip({ content, children, placement = "top", delay = 400, duplicatesLabel = false }: TooltipProps) {
  const id = `ix-tooltip-${useId()}`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = (): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  const show = useCallback((after: number) => {
    clear();
    if (after <= 0) {
      setOpen(true);
    } else {
      timer.current = setTimeout(() => setOpen(true), after);
    }
  }, []);

  const hide = useCallback((after: number) => {
    clear();
    if (after <= 0) {
      setOpen(false);
    } else {
      timer.current = setTimeout(() => setOpen(false), after);
    }
  }, []);

  // Портал створюється лише після монтування: на сервері document відсутній.
  useEffect(() => setMounted(true), []);
  useEffect(() => clear, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setPosition(
      computeTooltipPosition(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
        { width: document.documentElement.clientWidth, height: window.innerHeight },
        placement,
      ),
    );
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }
    updatePosition();
    // capture: прокрутка будь-якого предка (ScrollArea, Inspector) теж зсуває тригер.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        hide(0);
      }
    };
    // Escape слухаємо на документі: підказку відкриває і наведення, коли фокус деінде.
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, content, updatePosition, hide]);

  if (!isValidElement(children)) {
    throw new Error("Tooltip очікує один елемент-тригер.");
  }

  const trigger = cloneElement(children, {
    "aria-describedby": duplicatesLabel ? children.props["aria-describedby"] : joinIds(children.props["aria-describedby"], id),
  });

  const theme = anchorRef.current?.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined;

  return (
    <span
      ref={anchorRef}
      className="ix-tooltip-anchor"
      onPointerEnter={() => show(delay)}
      onPointerLeave={() => hide(CLOSE_GRACE_MS)}
      onFocus={(event: FocusEvent) => {
        // Підказку показуємо лише для клавіатурного фокуса, а не після кліку мишею.
        if (event.target instanceof Element && isFocusVisible(event.target)) {
          show(0);
        }
      }}
      onBlur={() => hide(0)}
    >
      {trigger}
      {mounted
        ? createPortal(
            <span
              ref={tooltipRef}
              id={id}
              role="tooltip"
              className="ix-tooltip"
              data-theme={theme}
              data-placement={position?.placement ?? placement}
              hidden={!open}
              aria-hidden={duplicatesLabel ? true : undefined}
              style={position ? { top: position.top, left: position.left } : undefined}
              // Перехід вказівника на саму підказку скасовує закриття (WCAG 1.4.13, hoverable).
              onPointerEnter={clear}
              onPointerLeave={() => hide(CLOSE_GRACE_MS)}
            >
              {content}
            </span>,
            portalContainer(anchorRef.current),
          )
        : null}
    </span>
  );
}
