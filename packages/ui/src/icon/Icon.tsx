"use client";

import { useId } from "react";
import { cx } from "../internal/class-names.ts";
import { icons, type IconDefinition, type IconName } from "./icons.ts";

export type IconSize = 16 | 20 | 24;

export interface IconProps {
  readonly name: IconName;
  /** Розмір у пікселях; лінія масштабується разом з іконкою. */
  readonly size?: IconSize;
  /**
   * Доступна назва. Без неї іконка декоративна (aria-hidden): у кнопці чи пункті меню
   * назву дає текст або aria-label самого елемента.
   */
  readonly title?: string;
  readonly className?: string;
}

/**
 * Ширина вирізу під верхнім шаром: лінія 1.5 + проміжок 1.25 з кожного боку. Там, де
 * контур і акцент сходяться (вістря, з'єднувачі, кінці ліній), нижній шар обривається
 * з проміжком, тож елементи не злипаються в одну пляму.
 */
const gapStrokeWidth = 4;

/**
 * Двоколірна лінійна іконка: контур — колір тексту (currentColor), виразний елемент —
 * акцент теми. Розмітка без кольорів, тож іконка змінюється разом з темою.
 */
export function Icon({ name, size = 20, title, className }: IconProps) {
  const { base, accent = [], accentOnTop = false } = icons[name] as IconDefinition;
  const maskId = `ix-icon-gap-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  // Зверху — контур, для іконок з accentOnTop — акцент. Нижній шар вирізається під верхнім.
  const top = accentOnTop ? accent : base;
  const bottom = accentOnTop ? base : accent;
  const bottomClass = accentOnTop ? "ix-icon__base" : "ix-icon__accent";
  const topClass = accentOnTop ? "ix-icon__accent" : "ix-icon__base";
  const masked = top.length > 0 && bottom.length > 0;
  return (
    <svg
      className={cx("ix-icon", className)}
      data-size={size}
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {masked ? (
        <defs>
          {/*
           * Маска яскравості: біле — видно, чорне — виріз. Це не колір дизайну, а форма
           * вирізу, тому значення задані атрибутами, а не токенами.
           */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="white" />
            {top.map((d) => (
              <path key={d} d={d} fill="none" stroke="black" strokeWidth={gapStrokeWidth} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </mask>
        </defs>
      ) : null}
      <g mask={masked ? `url(#${maskId})` : undefined}>
        {bottom.map((d) => (
          <path key={d} className={bottomClass} d={d} />
        ))}
      </g>
      {top.map((d) => (
        <path key={d} className={topClass} d={d} />
      ))}
    </svg>
  );
}
