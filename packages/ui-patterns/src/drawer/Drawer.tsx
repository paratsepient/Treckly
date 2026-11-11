"use client";

import type { ReactNode } from "react";
import { cx } from "../internal/hooks.ts";
import { ModalDialog } from "../internal/ModalDialog.tsx";

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Край екрана: start — навігація й контекстна панель, end — інспектор. */
  readonly side?: "start" | "end";
  /** Доступна назва діалогу. */
  readonly label: string;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Тимчасова панель поверх layout на вузьких екранах. Модальна поведінка (фокус,
 * Escape, backdrop) — спільний ModalDialog, той самий, що в Dialog.
 */
export function Drawer({ open, onClose, side = "end", label, id, className, children }: DrawerProps) {
  return (
    <ModalDialog open={open} onClose={onClose} id={id} className={cx("ixp-drawer", className)} label={label} dataAttributes={{ "data-side": side }}>
      <div className="ixp-drawer__content">{children}</div>
    </ModalDialog>
  );
}
