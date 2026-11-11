"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../internal/class-names.ts";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Тон стану. Статусні кольори зарезервовані для станів, не для «серії 4». */
  readonly tone?: BadgeTone;
  /** Іконка перед текстом: стан не передається лише кольором. */
  readonly icon?: ReactNode;
  /** Текст позначки — завжди видимий, короткий («Застаріло», «Чернетка»). */
  readonly children: ReactNode;
}

/**
 * Позначка стану в рядку: статус запису в таблиці, «Застаріло»/«Вибірка» на віджеті.
 * Пара текст / тло — status / status-surface, перевірена на 4.5:1 у токенах.
 */
export function Badge({ tone = "neutral", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={cx("ix-badge", className)} data-tone={tone}>
      {icon !== undefined ? (
        <span className="ix-badge__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ix-badge__label">{children}</span>
    </span>
  );
}
