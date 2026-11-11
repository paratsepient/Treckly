"use client";

import type { InputHTMLAttributes, Ref } from "react";
import { FieldShell, useFieldIds, type FieldProps } from "../internal/Field.tsx";

/** Типи, для яких Input є канонічним контролом. checkbox/radio/range мають окремі компоненти. */
export type InputType = "text" | "search" | "email" | "password" | "tel" | "url" | "number" | "date" | "time" | "datetime-local";

export interface InputProps extends FieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  readonly type?: InputType;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * Однорядкове поле з міткою, описом і помилкою.
 * readOnly — для значень, які треба прочитати й скопіювати; disabled — лише для
 * справді неактивних полів (їх контраст нижчий і вони не потрапляють у Tab).
 */
export function Input({ label, hideLabel, description, error, type = "text", id, className, required, disabled, ref, ...rest }: InputProps) {
  const ids = useFieldIds({ description, error }, id, rest["aria-describedby"]);
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
      <input
        {...rest}
        ref={ref}
        id={ids.controlId}
        type={type}
        className="ix-input"
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : rest["aria-invalid"]}
        aria-describedby={ids.describedBy}
      />
    </FieldShell>
  );
}
