"use client";

import { useEffect, useId, useRef, type InputHTMLAttributes, type Ref } from "react";
import { cx, joinIds } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  readonly label: string;
  /** Мітка лише для зчитувача: коли назву дає контекст (заголовок стовпця таблиці). */
  readonly hideLabel?: boolean;
  readonly description?: string;
  readonly error?: string;
  /** Частковий вибір (наприклад, «вибрати всі» в таблиці). Існує лише як DOM-властивість, не атрибут. */
  readonly indeterminate?: boolean;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * Нативний checkbox, візуально замінений на власне поле.
 * Input лежить поверх поля з opacity 0: клік, Space, фокус і стан
 * обробляє браузер, а CSS малює поле через сусідній селектор.
 */
export function Checkbox({ label, hideLabel = false, description, error, indeterminate = false, id, className, disabled, ref, ...rest }: CheckboxProps) {
  const generated = `ix-${useId()}`;
  const controlId = id ?? generated;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const inner = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inner.current) {
      inner.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const setRefs = (node: HTMLInputElement | null): void => {
    inner.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  return (
    <div className={cx("ix-choice", className)} data-invalid={error ? "" : undefined} data-disabled={disabled ? "" : undefined} data-hide-label={hideLabel ? "" : undefined}>
      <span className="ix-choice__control ix-checkbox">
        <input
          {...rest}
          ref={setRefs}
          id={controlId}
          type="checkbox"
          className="ix-choice__input"
          disabled={disabled}
          aria-invalid={error ? true : rest["aria-invalid"]}
          aria-describedby={joinIds(rest["aria-describedby"], descriptionId, errorId)}
        />
        <span className="ix-checkbox__box ix-focus-pulse" aria-hidden="true">
          <svg className="ix-checkbox__check" viewBox="0 0 16 16" focusable="false">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg className="ix-checkbox__dash" viewBox="0 0 16 16" focusable="false">
            <path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <FocusPulse />
        </span>
      </span>
      <span className="ix-choice__text">
        <label className={cx("ix-choice__label", hideLabel && "ix-sr-only")} htmlFor={controlId}>
          {label}
        </label>
        {description ? (
          <span className="ix-choice__description" id={descriptionId}>
            {description}
          </span>
        ) : null}
        {error ? (
          <span className="ix-choice__error" id={errorId}>
            {error}
          </span>
        ) : null}
      </span>
    </div>
  );
}
