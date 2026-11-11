"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "../internal/class-names.ts";

export interface BarDatum {
  readonly label: string;
  readonly value: number;
}

export interface BarChartProps {
  /** Назва діаграми — підпис фігури й доступна назва. Одна серія: легенди немає, серію називає назва. */
  readonly title: string;
  readonly data: readonly BarDatum[];
  /**
   * vertical — стовпчики (категорії вздовж осі X, короткі назви, часові періоди);
   * horizontal — смуги (довгі назви категорій, рейтинги).
   */
  readonly orientation?: "vertical" | "horizontal";
  /** Формат значення в підказці, мітці й таблиці. */
  readonly formatValue?: (value: number) => string;
  /** Заголовок стовпця значень у таблиці для зчитувача. */
  readonly valueLabel?: string;
  /** Висота області стовпчиків (vertical), px. */
  readonly height?: number;
  readonly className?: string;
}

const numberFormat = new Intl.NumberFormat("uk-UA");
const compactFormat = new Intl.NumberFormat("uk-UA", { notation: "compact", maximumFractionDigits: 1 });

/** Поділки — круглі числа; на осі, що сягає 10 000, усі в скороченому вигляді (один стиль на вісь). */
export function niceTicks(max: number, count = 4): readonly number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= rough) ?? 10) * power;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => Math.round(index * step * 1e6) / 1e6);
}

// Специфікація dataviz: товщина ≤ 24 px (решта смуги — повітря), 4 px заокруглення на кінці
// зі значенням, біля базової лінії кут прямий.
const maxThickness = 24;
const endRadius = 4;
const rowHeight = 36;
/** Середня ширина символу підпису (font-caption), px — для місця під підписи без вимірювання тексту. */
const charWidth = 7;

const truncate = (text: string, room: number): string => {
  const fit = Math.max(1, Math.floor(room / charWidth));
  return text.length <= fit ? text : `${text.slice(0, Math.max(1, fit - 1)).trimEnd()}…`;
};

/** Стовпчик із заокругленим кінцем зі значенням; основа пряма. */
function barPath(orientation: "vertical" | "horizontal", base: number, tip: number, start: number, thickness: number): string {
  const length = Math.abs(base - tip);
  if (length < 0.5) return "";
  const r = Math.min(endRadius, thickness / 2, length);
  if (orientation === "vertical") {
    const x0 = start;
    const x1 = start + thickness;
    return `M${x0} ${base}V${tip + r}A${r} ${r} 0 0 1 ${x0 + r} ${tip}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${tip + r}V${base}Z`;
  }
  const y0 = start;
  const y1 = start + thickness;
  return `M${base} ${y0}H${tip - r}A${r} ${r} 0 0 1 ${tip} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${tip - r} ${y1}H${base}Z`;
}

/**
 * Стовпчикова діаграма однієї серії — порівняння величин. Одна вісь від нуля, тонкі
 * стовпчики кольору серії, сітка — волосяні лінії. Значення підписане лише біля одного
 * стовпчика: найбільшого або того, на який наведено чи який вибрано; решту несуть вісь,
 * підказка й таблиця для зчитувача. Наведення й клік штрихують решту, як у DonutChart.
 */
export function BarChart({
  title,
  data,
  orientation = "vertical",
  formatValue = (value) => numberFormat.format(value),
  valueLabel = "Значення",
  height = 200,
  className,
}: BarChartProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Ширину вимірюємо: SVG малюється в справжніх px, тож текст і заокруглення не розтягуються.
  const [width, setWidth] = useState(480);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const patternId = `ix-bar-hatch-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Перший замір одразу: без нього до відповіді ResizeObserver діаграма мала б 480 px.
    const initial = Math.round(body.getBoundingClientRect().width);
    if (initial > 0) setWidth(initial);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const values = data.map((item) => Math.max(0, item.value));
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1]!;
  const compactAxis = top >= 10_000;
  const tickText = (value: number) => (compactAxis ? compactFormat.format(value) : numberFormat.format(value));
  const active = hovered ?? selected;
  const labelled = active ?? (values.length > 0 ? values.indexOf(Math.max(...values)) : -1);
  const vertical = orientation === "vertical";

  // Поля під підписи осей.
  const tickRoom = Math.max(...ticks.map((tick) => tickText(tick).length)) * charWidth + 8;
  const labelRoom = Math.min(Math.round(width * 0.45), Math.max(...data.map((item) => item.label.length), 4) * charWidth + 8);
  const margin = vertical ? { top: 20, right: 8, bottom: 26, left: tickRoom } : { top: 4, right: 48, bottom: 22, left: labelRoom };
  const plotHeight = vertical ? height : data.length * rowHeight;
  const svgHeight = plotHeight + margin.top + margin.bottom;
  const plotWidth = Math.max(40, width - margin.left - margin.right);
  const band = (vertical ? plotWidth : plotHeight) / Math.max(1, data.length);
  const thickness = Math.min(maxThickness, band * 0.6);
  // Позиція значення на осі величин.
  const scale = (value: number) =>
    vertical ? margin.top + plotHeight * (1 - value / top) : margin.left + plotWidth * (value / top);
  const base = scale(0);

  const toggle = (index: number) => setSelected((current) => (current === index ? null : index));

  return (
    <figure className={cx("ix-bar", className)} data-orientation={orientation} data-active={active === null ? undefined : ""}>
      <figcaption className="ix-chart__title">{title}</figcaption>
      <div ref={bodyRef} className="ix-bar__body">
        {/* Графіка дублює таблицю нижче: для зчитувача — таблиця, для очей — фігура. */}
        <svg className="ix-bar__plot" width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`} aria-hidden="true" focusable="false">
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.5" height="6" className="ix-bar__hatch" />
            </pattern>
          </defs>
          {/* Сітка й поділки осі величин. */}
          {ticks.map((tick) => {
            const at = scale(tick);
            return vertical ? (
              <g key={tick}>
                <line className={tick === 0 ? "ix-bar__baseline" : "ix-bar__grid"} x1={margin.left} x2={width - margin.right} y1={at} y2={at} />
                <text className="ix-bar__tick" x={margin.left - 8} y={at} textAnchor="end" dominantBaseline="middle">
                  {tickText(tick)}
                </text>
              </g>
            ) : (
              <g key={tick}>
                <line className={tick === 0 ? "ix-bar__baseline" : "ix-bar__grid"} x1={at} x2={at} y1={margin.top} y2={margin.top + plotHeight} />
                <text className="ix-bar__tick" x={at} y={svgHeight - 4} textAnchor="middle">
                  {tickText(tick)}
                </text>
              </g>
            );
          })}
          {data.map((item, index) => {
            const value = values[index]!;
            const start = (vertical ? margin.left : margin.top) + index * band + (band - thickness) / 2;
            const tip = scale(value);
            const hatched = active !== null && active !== index;
            const d = barPath(orientation, base, tip, start, thickness);
            const bandStart = (vertical ? margin.left : margin.top) + index * band;
            return (
              <g key={`${item.label}-${index}`}>
                {d ? (
                  <path
                    className="ix-bar__bar"
                    d={d}
                    data-active={active === index ? "" : undefined}
                    data-hatched={hatched ? "" : undefined}
                    style={hatched ? { fill: `url(#${patternId})` } : undefined}
                  />
                ) : null}
                {vertical ? (
                  <text className="ix-bar__category" x={bandStart + band / 2} y={margin.top + plotHeight + 18} textAnchor="middle">
                    {truncate(item.label, band - 4)}
                  </text>
                ) : (
                  <text className="ix-bar__category" x={margin.left - 8} y={bandStart + band / 2} textAnchor="end" dominantBaseline="middle">
                    {truncate(item.label, margin.left - 12)}
                  </text>
                )}
                {labelled === index ? (
                  vertical ? (
                    <text className="ix-bar__value" x={start + thickness / 2} y={tip - 6} textAnchor="middle">
                      {formatValue(item.value)}
                    </text>
                  ) : (
                    <text className="ix-bar__value" x={tip + 6} y={start + thickness / 2} dominantBaseline="middle">
                      {formatValue(item.value)}
                    </text>
                  )
                ) : null}
                {/* Зона влучання — уся смуга категорії: тонкий стовпчик легко промахнутися. */}
                <rect
                  className="ix-bar__hit"
                  x={vertical ? bandStart : margin.left}
                  y={vertical ? margin.top : bandStart}
                  width={vertical ? band : plotWidth}
                  height={vertical ? plotHeight : band}
                  onPointerEnter={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => toggle(index)}
                >
                  <title>{`${item.label}: ${formatValue(item.value)}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      <table className="ix-sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Категорія</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={`${item.label}-${index}`}>
              <th scope="row">{item.label}</th>
              <td>{formatValue(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
