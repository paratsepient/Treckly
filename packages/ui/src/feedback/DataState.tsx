"use client";

import type { ReactNode } from "react";
import { Icon } from "../icon/Icon.tsx";
import type { IconName } from "../icon/icons.ts";
import { cx } from "../internal/class-names.ts";
import { Spinner } from "../internal/Spinner.tsx";

/**
 * Стани даних із PRODUCT.md: збій, відсутність доступу чи несумісна схема —
 * явний стан, а не нуль чи зниклий віджет.
 */
export type DataStateKind = "loading" | "empty" | "incomplete" | "unavailable" | "stale" | "denied" | "error";

export interface DataStateProps {
  readonly kind: DataStateKind;
  /** Заголовок стану; за замовчуванням — типова фраза для виду. */
  readonly title?: string;
  /** Пояснення: що сталося і що робити далі. */
  readonly description?: ReactNode;
  /** Дія відновлення (Button «Повторити», «Запросити доступ»). */
  readonly action?: ReactNode;
  /** compact — у віджеті чи клітинці: рядок іконка + текст без відступів блоку. */
  readonly size?: "block" | "compact";
  readonly className?: string;
}

type Tone = "neutral" | "warning" | "error";

const kinds: Record<DataStateKind, { readonly title: string; readonly icon: IconName | null; readonly tone: Tone }> = {
  loading: { title: "Завантаження…", icon: null, tone: "neutral" },
  empty: { title: "Немає даних", icon: "empty", tone: "neutral" },
  incomplete: { title: "Дані неповні", icon: "warning", tone: "warning" },
  unavailable: { title: "Джерело недоступне", icon: "source-unavailable", tone: "error" },
  stale: { title: "Дані застаріли", icon: "stale", tone: "warning" },
  denied: { title: "Немає доступу", icon: "access-denied", tone: "neutral" },
  error: { title: "Не вдалося завантажити дані", icon: "error", tone: "error" },
};

/**
 * Єдиний вигляд стану даних для панелей, таблиць і віджетів.
 * Стан завжди має іконку і текст; колір тону лише підсилює їх.
 * Завантаження оголошується як status, помилка й недоступність — як alert,
 * решта станів статичні (вони не з'являються раптово під час роботи).
 */
export function DataState({ kind, title, description, action, size = "block", className }: DataStateProps) {
  const spec = kinds[kind];
  const role = kind === "loading" ? "status" : kind === "error" || kind === "unavailable" ? "alert" : undefined;
  return (
    <div
      className={cx("ix-data-state", className)}
      data-kind={kind}
      data-tone={spec.tone}
      data-size={size}
      role={role}
      aria-busy={kind === "loading" ? true : undefined}
    >
      <span className="ix-data-state__icon" aria-hidden="true">
        {spec.icon === null ? <Spinner /> : <Icon name={spec.icon} size={size === "compact" ? 16 : 24} />}
      </span>
      <div className="ix-data-state__text">
        <p className="ix-data-state__title">{title ?? spec.title}</p>
        {description !== undefined ? <p className="ix-data-state__description">{description}</p> : null}
      </div>
      {action !== undefined ? <div className="ix-data-state__action">{action}</div> : null}
    </div>
  );
}
