"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "../internal/class-names.ts";

/** Тон розбіжної схеми: 1 — найслабший ступінь, 3 — найсильніший. */
export type ChartTone =
  | "positive-3"
  | "positive-2"
  | "positive-1"
  | "neutral"
  | "negative-1"
  | "negative-2"
  | "negative-3"
  | "other";

export interface ChartDatum {
  readonly label: string;
  readonly value: number;
  /** Лише для scheme="diverging": бік і сила відповіді. Без тону — нейтральний. */
  readonly tone?: ChartTone;
}

export interface RadialChartProps {
  /** Назва діаграми — підпис фігури й доступна назва. */
  readonly title: string;
  readonly data: readonly ChartDatum[];
  /**
   * categorical — кожна частина свій слот кольору в незмінному порядку;
   * diverging — шкала згоди: тепле плече ↔ нейтраль ↔ холодне плече (за tone).
   */
  readonly scheme?: "categorical" | "diverging";
  /** Формат значення в легенді, підказці й таблиці. */
  readonly formatValue?: (value: number) => string;
  /** Підпис для частин, згорнутих в «Інше» (categorical, понад maxSegments). */
  readonly otherLabel?: string;
  /** Скільки частин показати окремо (разом з «Іншим»). Понад 6 кольори вже не розрізняються. */
  readonly maxSegments?: number;
  readonly className?: string;
}

export interface DonutChartProps extends RadialChartProps {
  /** Підпис під сумою в центрі пончика. */
  readonly centerLabel?: ReactNode;
}

interface Slice {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

const categorical = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
const maxCategorical = categorical.length;

const percentFormat = new Intl.NumberFormat("uk-UA", { style: "percent", maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat("uk-UA");

/**
 * Частини → сегменти з кольором. Категоріальні кольори присвоюються за порядком і
 * ніколи не циклічно: зайві частини згортаються в «Інше» (нейтральний графіт).
 */
function toSlices(data: readonly ChartDatum[], scheme: "categorical" | "diverging", otherLabel: string, maxSegments: number): Slice[] {
  const positive = data.filter((item) => item.value > 0);
  if (scheme === "diverging") {
    return positive.map((item) => ({ label: item.label, value: item.value, color: `chart-${item.tone ?? "neutral"}` }));
  }
  const limit = Math.min(Math.max(maxSegments, 2), maxCategorical + 1);
  if (positive.length <= Math.min(limit, maxCategorical)) {
    return positive.map((item, index) => ({ label: item.label, value: item.value, color: categorical[index]! }));
  }
  const shown = positive.slice(0, limit - 1);
  const rest = positive.slice(limit - 1).reduce((sum, item) => sum + item.value, 0);
  return [
    ...shown.map((item, index) => ({ label: item.label, value: item.value, color: categorical[index]! })),
    { label: otherLabel, value: rest, color: "chart-other" },
  ];
}

// Геометрія в координатах viewBox 200 × 200.
const center = 100;
const outerRadius = 96;
const donutInnerRadius = 60;
/** Проміжок між сегментами (колір поверхні) і заокруглення кутів — специфікація dataviz. */
const gap = 2;
const corner = 4;

const point = (radius: number, angle: number): string =>
  `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`;

/**
 * Радіус заокруглення сегмента: 4 px, але вузький сегмент (1–2 %) отримує менший,
 * щоб лишитися видимою смужкою, а не зникнути під проміжком і заокругленням.
 */
function cornerFor(start: number, end: number): number {
  const arc = (end - start) * outerRadius - gap;
  return Math.max(0.5, Math.min(corner, arc / 2 - 0.5));
}

/**
 * Сегмент як фігура, звужена на радіус заокруглення з усіх боків: обведення того самого
 * кольору завширшки 2 × corner з round-з'єднаннями повертає їй розмір і заокруглює кути.
 * Проміжок між сегментами відкладено по дузі окремо на кожному радіусі.
 */
function slicePath(start: number, end: number, innerRadius: number, corner: number): string | null {
  const inset = gap / 2 + corner;
  const rOut = outerRadius - corner;
  const outStart = start + inset / rOut;
  const outEnd = end - inset / rOut;
  if (outEnd <= outStart) return null;
  const large = outEnd - outStart > Math.PI ? 1 : 0;
  if (innerRadius > 0) {
    const rIn = innerRadius + corner;
    const mid = (start + end) / 2;
    let inStart = start + inset / rIn;
    let inEnd = end - inset / rIn;
    if (inEnd < inStart) inStart = inEnd = mid;
    const innerLarge = inEnd - inStart > Math.PI ? 1 : 0;
    return `M ${point(rOut, outStart)} A ${rOut} ${rOut} 0 ${large} 1 ${point(rOut, outEnd)} L ${point(rIn, inEnd)} A ${rIn} ${rIn} 0 ${innerLarge} 0 ${point(rIn, inStart)} Z`;
  }
  // Пиріг: вершина зсунута від центру вздовж бісектриси, щоб проміжки сходились у точку.
  const half = Math.min((end - start) / 2, Math.PI / 2);
  const tip = Math.min(inset / Math.sin(half), rOut / 2);
  return `M ${point(tip, (start + end) / 2)} L ${point(rOut, outStart)} A ${rOut} ${rOut} 0 ${large} 1 ${point(rOut, outEnd)} Z`;
}

/** Повне коло (одна частина) — без проміжків. */
function fullPath(innerRadius: number): string {
  const ring = (r: number) => `M ${center - r} ${center} A ${r} ${r} 0 1 1 ${center + r} ${center} A ${r} ${r} 0 1 1 ${center - r} ${center} Z`;
  return innerRadius > 0 ? `${ring(outerRadius)} ${ring(innerRadius)}` : ring(outerRadius);
}

function RadialChart({
  title,
  data,
  scheme = "categorical",
  formatValue = (value) => numberFormat.format(value),
  otherLabel = "Інше",
  maxSegments = maxCategorical,
  className,
  innerRadius,
  center: centerContent,
}: RadialChartProps & { readonly innerRadius: number; readonly center?: ReactNode }) {
  // Наведення показує частину тимчасово; клік закріплює вибір (повторний — знімає).
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const active = hovered ?? selected;
  const patternBase = `ix-chart-hatch-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const slices = toSlices(data, scheme, otherLabel, maxSegments);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number) => (total > 0 ? value / total : 0);

  let angle = -Math.PI / 2;
  const shapes = slices.map((slice, index) => {
    const start = angle;
    angle += share(slice.value) * Math.PI * 2;
    const round = slices.length === 1 ? corner : cornerFor(start, angle);
    const d = slices.length === 1 ? fullPath(innerRadius) : slicePath(start, angle, innerRadius, round);
    return { slice, index, d, round };
  });

  return (
    <figure
      className={cx("ix-chart", className)}
      data-active={active === null ? undefined : ""}
      data-selected={selected === null ? undefined : ""}
    >
      <figcaption className="ix-chart__title">{title}</figcaption>
      <div className="ix-chart__body">
        {/* Графіка дублює таблицю нижче: для зчитувача — таблиця, для очей — фігура. */}
        <svg className="ix-chart__plot" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          {/*
           * Штрихування 45° кольором самої частини: коли одну частину виділено, решта
           * переходить у текстуру — відступає, але лишається впізнаваною за кольором.
           * Лише непрозорі смужки без напівпрозорого тла: сектор малюється заливкою й
           * обведенням, і тло в місці їх накладання проступало б зайвим контуром.
           */}
          <defs>
            {slices.map((slice, index) => (
              <pattern
                key={slice.label}
                id={`${patternBase}-${index}`}
                className="ix-chart__hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="2.5" height="6" style={{ fill: `var(--ix-${slice.color})` }} />
              </pattern>
            ))}
          </defs>
          {shapes.map(({ slice, index, d, round }) => {
            if (d === null) return null;
            const paint = active !== null && active !== index ? `url(#${patternBase}-${index})` : `var(--ix-${slice.color})`;
            return (
              <path
                key={slice.label}
                className="ix-chart__slice"
                d={d}
                fillRule="evenodd"
                data-active={active === index ? "" : undefined}
                data-hatched={active !== null && active !== index ? "" : undefined}
                style={{ fill: paint, stroke: paint, strokeWidth: round * 2 }}
                onPointerEnter={() => setHovered(index)}
                onPointerLeave={() => setHovered(null)}
                onClick={() => setSelected((current) => (current === index ? null : index))}
              >
                <title>{`${slice.label}: ${formatValue(slice.value)} (${percentFormat.format(share(slice.value))})`}</title>
              </path>
            );
          })}
        </svg>
        {centerContent === undefined ? null : (
          <div className="ix-chart__center" aria-hidden="true">
            {centerContent}
          </div>
        )}
      </div>
      <ul className="ix-chart__legend" aria-hidden="true">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            className="ix-chart__item"
            data-active={active === index ? "" : undefined}
            onPointerEnter={() => setHovered(index)}
            onPointerLeave={() => setHovered(null)}
            onClick={() => setSelected((current) => (current === index ? null : index))}
          >
            <span className="ix-chart__swatch" style={{ backgroundColor: `var(--ix-${slice.color})` }} />
            <span className="ix-chart__label">{slice.label}</span>
            <span className="ix-chart__value">{percentFormat.format(share(slice.value))}</span>
          </li>
        ))}
      </ul>
      <table className="ix-sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Частина</th>
            <th scope="col">Значення</th>
            <th scope="col">Частка</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice) => (
            <tr key={slice.label}>
              <th scope="row">{slice.label}</th>
              <td>{formatValue(slice.value)}</td>
              <td>{percentFormat.format(share(slice.value))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * Пончик: частини одного цілого з першого погляду, сума — в центрі.
 * Для порівняння близьких значень краще стовпчики: кути читаються гірше за довжини.
 * Ідентичність частин ніколи не лише кольором: легенда з назвами й частками,
 * підказка при наведенні, таблиця для зчитувача.
 */
export function DonutChart({ centerLabel, formatValue = (value) => numberFormat.format(value), ...props }: DonutChartProps) {
  const total = props.data.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  return (
    <RadialChart
      {...props}
      formatValue={formatValue}
      innerRadius={donutInnerRadius}
      center={
        <>
          <span className="ix-chart__total">{formatValue(total)}</span>
          {centerLabel === undefined ? null : <span className="ix-chart__center-label">{centerLabel}</span>}
        </>
      }
    />
  );
}

/** Пиріг: те саме, що пончик, без отвору й підсумку в центрі. */
export function PieChart(props: RadialChartProps) {
  return <RadialChart {...props} innerRadius={0} />;
}
