"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type Ref } from "react";
import { cx } from "../internal/class-names.ts";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Назва області прокрутки. Область фокусується з клавіатури, тому потребує доступної назви. */
  readonly label: string;
  readonly orientation?: "vertical" | "horizontal" | "both";
  /** Максимальна висота (CSS-довжина). Без неї область росте разом із вмістом. */
  readonly maxHeight?: string;
  /**
   * Клас області з вмістом (відступи, рамка). className лишається на корені — він задає
   * місце в розкладці; смуга прокрутки стоїть поруч з областю, поза її рамкою.
   */
  readonly viewportClassName?: string;
  /**
   * well — область-лунка, як поле вводу: заглиблене тло, внутрішня тінь і межа лунки
   * (журнали, переліки в рамці). plain — без власного оформлення.
   */
  readonly variant?: "plain" | "well";
  /** hidden — без смуги й без місця під неї; колесо, клавіші й жести прокручують і далі. */
  readonly scrollbar?: "auto" | "hidden";
  /** Посилання на елемент, що прокручується. */
  readonly ref?: Ref<HTMLDivElement>;
}

type Axis = "x" | "y";

/** Найменша довжина повзунка: коротший важко влучити вказівником. */
const minThumb = 24;

const axesFor = (orientation: NonNullable<ScrollAreaProps["orientation"]>): readonly Axis[] =>
  orientation === "both" ? ["y", "x"] : orientation === "horizontal" ? ["x"] : ["y"];

function metrics(viewport: HTMLElement, bar: HTMLElement, axis: Axis) {
  const size = axis === "y" ? viewport.clientHeight : viewport.clientWidth;
  const total = axis === "y" ? viewport.scrollHeight : viewport.scrollWidth;
  const position = axis === "y" ? viewport.scrollTop : viewport.scrollLeft;
  const track = axis === "y" ? bar.clientHeight : bar.clientWidth;
  const thumb = total > 0 ? Math.min(track, Math.max(minThumb, (track * size) / total)) : track;
  return { size, total, position, track, thumb, range: Math.max(0, total - size), travel: Math.max(0, track - thumb) };
}

/**
 * Область прокрутки на нативному overflow: інерція, PageUp/PageDown, Home/End і пошук браузера
 * працюють як завжди, overscroll-behavior не обмежуємо — жест після кінця переходить сторінці.
 * Нативна смуга прихована, а власна стоїть поруч з областю, поза її рамкою: жолоб і опуклий
 * повзунок (Soft Tactical). Смуга декоративна для зчитувача (aria-hidden): прокрутку з
 * клавіатури дає сама область, що фокусується.
 */
export function ScrollArea({
  label,
  orientation = "vertical",
  maxHeight,
  viewportClassName,
  scrollbar = "auto",
  variant = "plain",
  className,
  style,
  children,
  ref,
  ...rest
}: ScrollAreaProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
    },
    [ref],
  );
  const axes = scrollbar === "hidden" ? [] : axesFor(orientation);

  // Положення повзунка пишемо прямо в стиль смуги: перерендер React на кожен кадр прокрутки не потрібен.
  const update = useCallback(() => {
    const viewport = viewportRef.current;
    const root = rootRef.current;
    if (!viewport || !root) return;
    for (const bar of root.querySelectorAll<HTMLElement>(":scope > .ix-scroll-area__bar")) {
      const axis = bar.dataset["axis"] as Axis;
      const m = metrics(viewport, bar, axis);
      const active = m.range > 1 && m.track > 0;
      bar.toggleAttribute("data-active", active);
      if (!active) continue;
      bar.style.setProperty("--thumb-size", `${m.thumb}px`);
      bar.style.setProperty("--thumb-offset", `${(m.travel * m.position) / m.range}px`);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(viewport);
    if (rootRef.current) resize?.observe(rootRef.current);
    // Вміст може змінитися без зміни розміру області (рядки додано, розгорнуто вузол).
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
    mutation?.observe(viewport, { childList: true, subtree: true });
    return () => {
      viewport.removeEventListener("scroll", update);
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [update]);

  const onBarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    const bar = event.currentTarget;
    const axis = bar.dataset["axis"] as Axis;
    const m = metrics(viewport, bar, axis);
    if (m.range <= 0) return;
    event.preventDefault();
    const coordinate = (e: { clientX: number; clientY: number }) => (axis === "y" ? e.clientY : e.clientX);
    const scrollTo = (value: number) => {
      if (axis === "y") viewport.scrollTop = value;
      else viewport.scrollLeft = value;
    };
    if (!(event.target as HTMLElement).classList.contains("ix-scroll-area__thumb")) {
      // Клік по жолобу — сторінка в бік кліку, як у нативної смуги.
      const rect = bar.getBoundingClientRect();
      const offset = (m.travel * m.position) / m.range;
      const at = coordinate(event) - (axis === "y" ? rect.top : rect.left);
      scrollTo(m.position + (at < offset ? -m.size : m.size) * 0.9);
      return;
    }
    // Перетягування повзунка: зсув вказівника переводимо в зсув вмісту.
    const start = coordinate(event);
    const startPosition = m.position;
    const ratio = m.travel > 0 ? m.range / m.travel : 0;
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      // Вказівник без активного захоплення (синтетична подія) — перетягування працює й без нього.
    }
    bar.setAttribute("data-dragging", "");
    const move = (e: globalThis.PointerEvent) => scrollTo(startPosition + (coordinate(e) - start) * ratio);
    const end = () => {
      bar.removeAttribute("data-dragging");
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", end);
      bar.removeEventListener("pointercancel", end);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  };

  const sizing: CSSProperties = maxHeight === undefined ? {} : { maxHeight };
  return (
    <div
      ref={rootRef}
      className={cx("ix-scroll-area", className)}
      data-orientation={orientation}
      data-scrollbar={scrollbar}
      data-variant={variant}
      style={{ ...sizing, ...style }}
    >
      <div
        {...rest}
        ref={setViewport}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cx("ix-scroll-area__viewport", viewportClassName)}
      >
        {children}
      </div>
      {axes.map((axis) => (
        <div key={axis} className="ix-scroll-area__bar" data-axis={axis} aria-hidden="true" onPointerDown={onBarPointerDown}>
          <div className="ix-scroll-area__thumb" />
        </div>
      ))}
    </div>
  );
}
