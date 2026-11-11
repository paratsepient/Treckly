"use client";

import { createContext, useContext, useId, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { cx, joinIds } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";

interface RadioGroupContextValue {
  readonly name: string;
  readonly value: string | undefined;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly select: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  /** Підпис групи (legend). Радіокнопки без групи не мають сенсу, тому мітка обов'язкова. */
  readonly label: string;
  readonly name?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly description?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly orientation?: "vertical" | "horizontal";
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Група радіокнопок: fieldset + legend.
 * Стрілки, Tab (одна зупинка на групу) і вибір виконує браузер для input[type=radio]
 * з однаковим name, тому власної клавіатурної логіки немає.
 */
export function RadioGroup({
  label,
  name,
  value,
  defaultValue,
  onValueChange,
  description,
  error,
  disabled = false,
  required,
  orientation = "vertical",
  className,
  children,
}: RadioGroupProps) {
  const base = `ix-${useId()}`;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const descriptionId = description ? `${base}-description` : undefined;
  const errorId = error ? `${base}-error` : undefined;

  const select = (next: string): void => {
    if (value === undefined) {
      setInner(next);
    }
    onValueChange?.(next);
  };

  return (
    <fieldset
      className={cx("ix-radio-group", className)}
      data-orientation={orientation}
      data-invalid={error ? "" : undefined}
      disabled={disabled}
      aria-describedby={joinIds(descriptionId, errorId)}
    >
      <legend className="ix-field__label">{label}</legend>
      <RadioGroupContext.Provider
        value={{ name: name ?? base, value: current, disabled, invalid: Boolean(error), required: Boolean(required), select }}
      >
        <div className="ix-radio-group__items">{children}</div>
      </RadioGroupContext.Provider>
      {description ? (
        <p className="ix-field__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="ix-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "name" | "value" | "checked" | "defaultChecked" | "size"> {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export function Radio({ value, label, description, id, className, disabled, onChange, ...rest }: RadioProps) {
  const group = useContext(RadioGroupContext);
  if (group === null) {
    throw new Error("Radio використовується лише всередині RadioGroup.");
  }
  const generated = `ix-${useId()}`;
  const controlId = id ?? generated;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const isDisabled = disabled || group.disabled;

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    group.select(value);
    onChange?.(event);
  };

  return (
    <div className={cx("ix-choice", className)} data-disabled={isDisabled ? "" : undefined} data-invalid={group.invalid ? "" : undefined}>
      <span className="ix-choice__control ix-radio">
        <input
          {...rest}
          id={controlId}
          type="radio"
          name={group.name}
          value={value}
          checked={group.value === value}
          onChange={handleChange}
          className="ix-choice__input"
          disabled={isDisabled}
          // Для радіогрупи обов'язковість задається на кожному input; браузер вимагає вибрати один.
          required={group.required}
          aria-invalid={group.invalid ? true : undefined}
          aria-describedby={joinIds(rest["aria-describedby"], descriptionId)}
        />
        <span className="ix-radio__circle ix-focus-pulse" aria-hidden="true">
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
