"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";

export interface SegmentedOption {
  readonly value: string;
  /** Доступна назва сегмента; в iconOnly-режимі прихована візуально, але читається. */
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps {
  /** Назва групи (legend). */
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly options: readonly SegmentedOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly name?: string;
  readonly disabled?: boolean;
  /** Лише іконки (перемикач вигляду «список / сітка»). */
  readonly iconOnly?: boolean;
  readonly className?: string;
}

/**
 * Вибір одного значення з кількох рівноправних (період, режим вигляду, фільтр).
 *
 * Контракт — radiogroup: нативні radio з однаковим name дають стрілки, одну
 * Tab-зупинку й участь у формі. Це відрізняє його від Tabs, які перемикають
 * панелі вмісту (tablist ↔ tabpanel) і мають власну клавіатурну модель.
 *
 * Сегменти однакової ширини, тому піднятий індикатор рухається лише transform
 * (без вимірювання DOM і без анімації layout). Вибраний стан має контур
 * border-strong ≥ 3:1 до треку: лише тінь і тон його не передали б.
 */
export function SegmentedControl({
  label,
  hideLabel = false,
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled = false,
  iconOnly = false,
  className,
}: SegmentedControlProps) {
  const generated = `ix-segmented-${useId()}`;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const index = options.findIndex((option) => option.value === current);

  const select = (next: string): void => {
    if (value === undefined) {
      setInner(next);
    }
    onValueChange?.(next);
  };

  const geometry = { "--segment-count": options.length, "--segment-index": Math.max(index, 0) } as CSSProperties;

  return (
    <fieldset className={cx("ix-segmented", className)} disabled={disabled} data-icon-only={iconOnly ? "" : undefined}>
      <legend className={hideLabel ? "ix-sr-only" : "ix-segmented__legend"}>{label}</legend>
      <div className="ix-segmented__track" style={geometry}>
        <span className="ix-segmented__indicator" aria-hidden="true" hidden={index < 0} />
        {options.map((option) => {
          const checked = option.value === current;
          return (
            <label key={option.value} className="ix-segmented__option ix-focus-pulse" data-checked={checked ? "" : undefined} data-disabled={option.disabled ? "" : undefined}>
              <input
                type="radio"
                className="ix-segmented__input"
                name={name ?? generated}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => select(option.value)}
              />
              {option.icon ? (
                <span className="ix-segmented__icon" aria-hidden="true">
                  {option.icon}
                </span>
              ) : null}
              <span className={iconOnly ? "ix-sr-only" : "ix-segmented__label"}>{option.label}</span>
              <FocusPulse />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
