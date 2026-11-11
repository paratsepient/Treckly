"use client";

import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cx, joinIds } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "role"> {
  readonly label: string;
  readonly description?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * Перемикач миттєвої дії (увімкнути/вимкнути налаштування).
 * Нативний checkbox з role="switch": стан checked браузер віддає як aria-checked,
 * Space перемикає, а форма отримує значення без додаткового коду.
 * Для вибору, що застосовується кнопкою «Зберегти», використовуйте Checkbox.
 */
export function Switch({ label, description, id, className, disabled, ref, ...rest }: SwitchProps) {
  const generated = `ix-${useId()}`;
  const controlId = id ?? generated;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <div className={cx("ix-choice", className)} data-disabled={disabled ? "" : undefined}>
      <span className="ix-choice__control ix-switch">
        <input
          {...rest}
          ref={ref}
          id={controlId}
          type="checkbox"
          role="switch"
          className="ix-choice__input"
          disabled={disabled}
          aria-describedby={joinIds(rest["aria-describedby"], descriptionId)}
        />
        <span className="ix-switch__track ix-focus-pulse" aria-hidden="true">
          <span className="ix-switch__thumb" />
          <FocusPulse />
        </span>
      </span>
      <span className="ix-choice__text">
        <label className="ix-choice__label" htmlFor={controlId}>
          {label}
        </label>
        {description ? (
          <span className="ix-choice__description" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
