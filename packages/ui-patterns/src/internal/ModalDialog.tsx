"use client";

import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
import { cx } from "./hooks.ts";

export interface ModalDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly className: string;
  /** Назва діалогу: або текстом (aria-label), або id видимого заголовка. */
  readonly label?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  /** Чи закривати кліком по backdrop. Діалог підтвердження цього не робить. */
  readonly closeOnBackdrop?: boolean;
  readonly id?: string;
  /** Додаткові data-атрибути вигляду (бік Drawer, розмір діалогу). */
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
  readonly children: ReactNode;
}

/**
 * Єдиний модальний шар пакета (Drawer, Dialog) на нативному <dialog>: top layer,
 * inert для решти сторінки, Tab не виходить назовні, Escape надсилає cancel.
 * Стан відкриття належить React (cancel і клік по backdrop лише просять закрити
 * через onClose), а фокус явно повертається на елемент, з якого шар відкрили.
 * Вміст рендериться тільки у відкритому стані, щоб не дублювати id і фокус.
 */
export function ModalDialog({ open, onClose, className, label, labelledBy, describedBy, closeOnBackdrop = true, id, dataAttributes, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Демонтаж відкритого шару (зміна режиму layout) теж має повернути фокус.
  useEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog?.open) {
        dialog.close();
      }
    },
    [],
  );

  const restoreFocus = (): void => {
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) {
      target.focus();
    }
  };

  const requestClose = (event: SyntheticEvent): void => {
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className={cx(className)}
      {...dataAttributes}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={requestClose}
      onClose={restoreFocus}
      onClick={(event) => {
        // Клік поза вмістом потрапляє на сам <dialog> (його ::backdrop).
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
