"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { FieldShell, useFieldIds, type FieldProps } from "../internal/Field.tsx";

export interface TextareaProps extends FieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/** Багаторядкове поле. Розмір змінюється лише по вертикалі, щоб не ламати сітку форми. */
export function Textarea({ label, hideLabel, description, error, id, className, required, disabled, rows = 4, ref, ...rest }: TextareaProps) {
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
      <textarea
        {...rest}
        ref={ref}
        id={ids.controlId}
        rows={rows}
        className="ix-input ix-textarea"
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : rest["aria-invalid"]}
        aria-describedby={ids.describedBy}
      />
    </FieldShell>
  );
}
