"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { cx } from "../internal/class-names.ts";
import { FocusPulse } from "../internal/FocusPulse.tsx";
import { Spinner } from "../internal/Spinner.tsx";

/**
 * - `secondary` — нейтральна дія за замовчуванням (більшість кнопок).
 * - `primary` — олива, одна визначена пріоритетна дія на екрані.
 * - `accent` — теракотовий, дозовано: окрема, свідомо виділена дія.
 * - `ghost` — без заливки, для панелей інструментів і IconButton.
 * - `destructive` — незворотна або небезпечна дія (видалення). Червона шкала error,
 *   не бренд-акцент. Сама кнопка не замінює підтвердження дії.
 */
export type ButtonVariant = "secondary" | "primary" | "accent" | "ghost" | "destructive";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  readonly variant?: ButtonVariant;
  /** За замовчуванням `button`, щоб кнопка у формі випадково не надсилала її. */
  readonly type?: "button" | "submit" | "reset";
  /**
   * Дія виконується. Кнопка залишається у фокусі (aria-disabled замість disabled),
   * щоб користувач клавіатури не втратив позицію, але кліки ігноруються.
   */
  readonly loading?: boolean;
  /** Текст для допоміжних технологій під час завантаження. */
  readonly loadingLabel?: string;
  readonly iconStart?: ReactNode;
  readonly iconEnd?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  type = "button",
  loading = false,
  loadingLabel = "Виконується",
  iconStart,
  iconEnd,
  className,
  children,
  onClick,
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      // aria-disabled не блокує клік нативно, тому блокуємо його тут.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx("ix-button", "ix-focus-pulse", className)}
      data-variant={variant}
      data-loading={loading ? "" : undefined}
      disabled={disabled}
      aria-disabled={loading ? true : rest["aria-disabled"]}
      aria-busy={loading ? true : undefined}
      onClick={handleClick}
    >
      {loading ? <Spinner /> : iconStart ? <span className="ix-button__icon" aria-hidden="true">{iconStart}</span> : null}
      {children === undefined ? null : <span className="ix-button__label">{children}</span>}
      {iconEnd && !loading ? <span className="ix-button__icon" aria-hidden="true">{iconEnd}</span> : null}
      {loading ? <span className="ix-sr-only">{`, ${loadingLabel}`}</span> : null}
      <FocusPulse />
    </button>
  );
}
