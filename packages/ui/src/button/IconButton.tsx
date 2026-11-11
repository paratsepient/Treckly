"use client";

import type { ReactNode } from "react";
import { cx } from "../internal/class-names.ts";
import { Tooltip, type TooltipPlacement } from "../tooltip/Tooltip.tsx";
import { Button, type ButtonProps } from "./Button.tsx";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "iconStart" | "iconEnd" | "aria-label"> {
  /** Доступна назва. Обов'язкова: кнопка без тексту інакше німа для зчитувача. */
  readonly label: string;
  readonly icon: ReactNode;
  /** Видима підказка з назвою. Вимикати лише коли назва вже видима поруч. */
  readonly showTooltip?: boolean;
  readonly tooltipPlacement?: TooltipPlacement;
}

/** Квадратна кнопка з іконкою. За замовчуванням ghost — найменш нав'язливий варіант для панелей. */
export function IconButton({ label, icon, showTooltip = true, tooltipPlacement, variant = "ghost", className, ...rest }: IconButtonProps) {
  const button = (
    <Button {...rest} variant={variant} aria-label={label} className={cx("ix-icon-button", className)} iconStart={icon} />
  );
  if (!showTooltip) {
    return button;
  }
  return (
    <Tooltip content={label} duplicatesLabel placement={tooltipPlacement ?? "top"}>
      {button}
    </Tooltip>
  );
}
