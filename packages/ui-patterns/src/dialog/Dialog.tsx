"use client";

import { useId, type ReactNode } from "react";
import { Icon, IconButton, ScrollArea } from "@index/ui";
import { ModalDialog } from "../internal/ModalDialog.tsx";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Видимий заголовок — він же доступна назва діалогу. */
  readonly title: string;
  /** Коротке пояснення під заголовком (aria-describedby). */
  readonly description?: ReactNode;
  /** Кнопки внизу: вторинна ліворуч від головної, головна — остання. */
  readonly actions?: ReactNode;
  /**
   * confirm — підтвердження дії (видалення, вимкнення сокета): без закриття кліком
   * по backdrop, щоб випадковий клік не скасовував рішення; standard — звичайний.
   */
  readonly kind?: "standard" | "confirm";
  /** Ширина: narrow — підтвердження, medium — коротка форма. */
  readonly size?: "narrow" | "medium";
  readonly closeLabel?: string;
  readonly children?: ReactNode;
}

const closeIcon = <Icon name="close" />;

/**
 * Модальний діалог для коротких рішень і невеликих форм (PRODUCT.md: жодних великих
 * постійних модалок — довгі налаштування живуть в інспекторі). Заголовок і дії
 * нерухомі, тіло прокручується через ScrollArea.
 */
export function Dialog({ open, onClose, title, description, actions, kind = "standard", size = "narrow", closeLabel = "Закрити", children }: DialogProps) {
  const titleId = `ixp-dialog-${useId()}`;
  const descriptionId = `${titleId}-description`;
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      className="ixp-dialog"
      labelledBy={titleId}
      describedBy={description !== undefined ? descriptionId : undefined}
      closeOnBackdrop={kind !== "confirm"}
      dataAttributes={{ "data-size": size, "data-kind": kind }}
    >
      <div className="ixp-dialog__header">
        <h2 id={titleId} className="ixp-dialog__title">
          {title}
        </h2>
        <IconButton label={closeLabel} icon={closeIcon} onClick={onClose} />
      </div>
      {description !== undefined || children !== undefined ? (
        <ScrollArea label={`Вміст: ${title}`} className="ixp-dialog__body" viewportClassName="ixp-dialog__content">
          {description !== undefined ? (
            <p id={descriptionId} className="ixp-dialog__description">
              {description}
            </p>
          ) : null}
          {children}
        </ScrollArea>
      ) : null}
      {actions !== undefined ? <div className="ixp-dialog__actions">{actions}</div> : null}
    </ModalDialog>
  );
}
