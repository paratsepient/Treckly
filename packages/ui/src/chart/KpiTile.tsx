"use client";

import { useId, type ReactNode } from "react";
import { Icon } from "../icon/Icon.tsx";
import { cx } from "../internal/class-names.ts";

const trendIcons = { up: "trend-up", down: "trend-down", flat: "trend-flat" } as const;

export interface KpiDelta {
  /** Зміна зі знаком (12 → +12, −3 → −3). */
  readonly value: number;
  /** З чим порівнюємо: «до минулого тижня». Без періоду зміна не має сенсу. */
  readonly period: string;
  /** Формат зміни; за замовчуванням — число зі знаком. */
  readonly format?: (value: number) => string;
  /** Що добре для цього показника: зростання (кількість донесень) чи спад (час реагування). */
  readonly goodWhen?: "up" | "down";
}

export interface KpiTileProps {
  /** Назва показника, звичайним реченням, без двокрапки. */
  readonly label: string;
  readonly value: number;
  /** Формат значення; за замовчуванням ≥ 10 000 скорочується («12,9 тис.»). */
  readonly formatValue?: (value: number) => string;
  /** Одиниця поруч зі значенням («хв», «%»). */
  readonly unit?: ReactNode;
  readonly delta?: KpiDelta;
  /** Тренд — до 12 останніх значень; останнє — поточний період. */
  readonly trend?: readonly number[];
  readonly className?: string;
}

const fullFormat = new Intl.NumberFormat("uk-UA");
const compactFormat = new Intl.NumberFormat("uk-UA", { notation: "compact", maximumFractionDigits: 1 });
const signedFormat = new Intl.NumberFormat("uk-UA", { signDisplay: "exceptZero", maximumFractionDigits: 1 });

/** Великі числа скорочуються (1 284 → «1284», 12 900 → «12,9 тис.»), щоб плитки лишались однієї ширини. */
export const formatKpiValue = (value: number): string => (Math.abs(value) >= 10_000 ? compactFormat.format(value) : fullFormat.format(value));

// Розміри тренду в px: компактна лінія під значенням, кінцева точка ≥ 8 px (специфікація dataviz).
const trendWidth = 120;
const trendHeight = 32;
const trendDot = 4;

function trendPoints(values: readonly number[]): { readonly line: string; readonly last: { x: number; y: number } } | null {
  const points = values.slice(-12);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  // Відступ на радіус точки й половину лінії, щоб нічого не обрізалось краєм SVG.
  const pad = trendDot + 1;
  const coords = points.map((value, index) => ({
    x: pad + (index * (trendWidth - 2 * pad)) / (points.length - 1),
    y: pad + (1 - (value - min) / span) * (trendHeight - 2 * pad),
  }));
  return {
    line: coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(""),
    last: coords[coords.length - 1]!,
  };
}

/**
 * KPI-плитка: назва, значення, зміна до названого періоду й тренд. Колір зміни — напрям ×
 * «що добре»: зростання кількості донесень — успіх, зростання часу реагування — проблема.
 * Статусний колір не буває єдиним носієм: поруч стрілка й текст, а для зчитувача — речення.
 */
export function KpiTile({ label, value, formatValue = formatKpiValue, unit, delta, trend, className }: KpiTileProps) {
  const labelId = useId();
  const direction = delta === undefined || delta.value === 0 ? "flat" : delta.value > 0 ? "up" : "down";
  const tone = direction === "flat" ? "neutral" : direction === (delta?.goodWhen ?? "up") ? "positive" : "negative";
  const deltaText = delta ? (delta.format ?? ((n: number) => signedFormat.format(n)))(delta.value) : "";
  const spoken = { up: "зростання", down: "спад", flat: "без змін" }[direction];
  const trendShape = trend ? trendPoints(trend) : null;

  return (
    <div className={cx("ix-kpi", className)} role="group" aria-labelledby={labelId}>
      <p id={labelId} className="ix-kpi__label">
        {label}
      </p>
      <p className="ix-kpi__value">
        {formatValue(value)}
        {unit === undefined ? null : <span className="ix-kpi__unit">{unit}</span>}
      </p>
      {delta ? (
        <p className="ix-kpi__delta">
          <span className="ix-kpi__change" data-tone={tone}>
            {/* Іконка набору замість символу шрифту: та сама лінія й розмір у будь-якому шрифті. */}
            <Icon name={trendIcons[direction]} size={16} />
            <span className="ix-sr-only">{spoken}</span>
            {deltaText}
          </span>
          <span className="ix-kpi__period">{delta.period}</span>
        </p>
      ) : null}
      {trendShape ? (
        // Тренд дублює значення й зміну, тому декоративний для зчитувача.
        <svg className="ix-kpi__trend" width={trendWidth} height={trendHeight} viewBox={`0 0 ${trendWidth} ${trendHeight}`} aria-hidden="true" focusable="false">
          <path className="ix-kpi__trend-line" d={trendShape.line} />
          <circle className="ix-kpi__trend-dot" cx={trendShape.last.x} cy={trendShape.last.y} r={trendDot} />
        </svg>
      ) : null}
    </div>
  );
}
