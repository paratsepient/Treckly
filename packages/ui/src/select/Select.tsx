"use client";

import type { Ref, SelectHTMLAttributes } from "react";
import { FieldShell, useFieldIds, type FieldProps } from "../internal/Field.tsx";
import { FocusPulse } from "../internal/FocusPulse.tsx";

export interface SelectProps extends FieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> {
  /** Перший неактивний пункт із порожнім значенням. Працює разом із required. */
  readonly placeholder?: string;
  readonly ref?: Ref<HTMLSelectElement>;
}

/**
 * Select на основі нативного <select>.
 * Нативний список дає клавіатуру, пошук за першою літерою, мобільні
 * пікери й доступність без власного listbox; стилізуємо лише закрите поле.
 */
export function Select({ label, hideLabel, description, error, placeholder, id, className, required, disabled, children, defaultValue, ref, ...rest }: SelectProps) {
  const ids = useFieldIds({ description, error }, id, rest["aria-describedby"]);
  // Без явного значення браузер вибрав би перший активний пункт, і placeholder ніколи б не показався.
  const initial = placeholder !== undefined && rest.value === undefined && defaultValue === undefined ? "" : defaultValue;
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      description={description}
      error={error}
      ids={ids}
      required={required}
      disabled={disabled}
      className={className}
    >
      <span className="ix-select ix-focus-pulse">
        <select
          {...rest}
          ref={ref}
          id={ids.controlId}
          defaultValue={initial}
          className="ix-input ix-select__control"
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : rest["aria-invalid"]}
          aria-describedby={ids.describedBy}
        >
          {placeholder === undefined ? null : (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <svg className="ix-select__chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <FocusPulse />
      </span>
    </FieldShell>
  );
}
