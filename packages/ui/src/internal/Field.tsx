import { useId, type ReactNode } from "react";
import { cx, joinIds } from "./class-names.ts";

/** Спільні властивості полів з підписом. Мітка обов'язкова: поле без доступної назви не можна створити. */
export interface FieldProps {
  /** Видима (або прихована через hideLabel) мітка поля. */
  readonly label: string;
  /** Ховає мітку візуально, залишаючи її доступною назвою. Лише коли контекст очевидний (пошук у панелі). */
  readonly hideLabel?: boolean;
  /** Допоміжний текст під полем. */
  readonly description?: string;
  /** Текст помилки. Наявність помилки вмикає aria-invalid. */
  readonly error?: string;
}

export interface FieldIds {
  readonly controlId: string;
  readonly descriptionId: string | undefined;
  readonly errorId: string | undefined;
  /** Готове значення aria-describedby: опис, помилка і зовнішні id. */
  readonly describedBy: string | undefined;
}

export function useFieldIds(
  props: Pick<FieldProps, "description" | "error">,
  explicitId: string | undefined,
  externalDescribedBy: string | undefined,
): FieldIds {
  const generated = useId();
  const controlId = explicitId ?? `ix-${generated}`;
  const descriptionId = props.description ? `${controlId}-description` : undefined;
  const errorId = props.error ? `${controlId}-error` : undefined;
  return {
    controlId,
    descriptionId,
    errorId,
    describedBy: joinIds(externalDescribedBy, descriptionId, errorId),
  };
}

interface FieldShellProps extends FieldProps {
  readonly ids: FieldIds;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Обгортка поля: мітка, контрол, опис, помилка.
 * Помилка стоїть після опису й не має role="alert": оголошення при кожному
 * рендері заважало б введенню. Зв'язок з полем забезпечує aria-describedby.
 */
export function FieldShell({ label, hideLabel, description, error, ids, required, disabled, className, children }: FieldShellProps) {
  return (
    <div
      className={cx("ix-field", className)}
      data-invalid={error ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
    >
      <label className={cx("ix-field__label", hideLabel && "ix-sr-only")} htmlFor={ids.controlId}>
        {label}
        {required ? (
          <span className="ix-field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {description ? (
        <p className="ix-field__description" id={ids.descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="ix-field__error" id={ids.errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
