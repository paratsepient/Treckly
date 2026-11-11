"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export interface PanelResizerProps {
  /** Край панелі, на якому стоїть роздільник: end — права межа лівої панелі. */
  readonly edge: "start" | "end";
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (width: number) => void;
  readonly label: string;
  readonly controls: string;
}

/** Крок клавіатури кратний сітці 4 px; Shift — великий крок. */
const STEP = 16;
const LARGE_STEP = 64;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Роздільник ширини панелі (WAI-ARIA separator, що фокусується).
 * Стрілки змінюють ширину в напрямку руху межі: для лівої панелі → ширшає,
 * для правої (інспектор) ← ширшає. Home/End — мінімум/максимум.
 */
export function PanelResizer({ edge, value, min, max, onChange, label, controls }: PanelResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // Кілька подій поспіль (утримана клавіша) можуть прийти до повторного рендеру,
  // тому рахуємо від останнього запитаного значення, а не від value із замикання.
  const latest = useRef(value);
  latest.current = value;
  const commit = (next: number): void => {
    const clamped = clamp(next, min, max);
    latest.current = clamped;
    onChange(clamped);
  };
  // Межа на правому краю лівої панелі: рух вправо розширює. Для правої панелі — навпаки.
  const direction = edge === "end" ? 1 : -1;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? LARGE_STEP : STEP;
    const current = latest.current;
    const next = {
      ArrowRight: current + step * direction,
      ArrowLeft: current - step * direction,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: value };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    commit(drag.current.startWidth + (event.clientX - drag.current.startX) * direction);
  };

  const stop = (): void => {
    drag.current = null;
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="ixp-resizer"
      data-edge={edge}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    />
  );
}
