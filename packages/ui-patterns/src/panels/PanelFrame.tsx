"use client";

import { useId, type ReactNode } from "react";
import { Button, DataState, Icon, IconButton, ScrollArea, type DataStateKind } from "@index/ui";
import type { PanelControl } from "../workspace/WorkspaceLayout.tsx";

/** ready — вміст панелі; решта — стани даних DataState (ті самі, що в таблицях і віджетах). */
export type PanelStatus = "ready" | DataStateKind;

export interface PanelStateProps {
  readonly status: Exclude<PanelStatus, "ready">;
  /** Текст порожнього стану (у т. ч. «нічого не вибрано» в інспекторі). */
  readonly emptyText?: string;
  /** Текст збою (error, unavailable). */
  readonly errorText?: string;
  readonly loadingText?: string;
  /** Повторна спроба для збою: кнопка «Повторити» під текстом. */
  readonly onRetry?: () => void;
}

/**
 * Стан панелі — той самий DataState, що в таблицях і віджетах: іконка, текст і, для збою,
 * повторна спроба. Тексти панелі замінюють типові заголовки стану.
 */
function PanelState({ status, emptyText, errorText, loadingText, onRetry }: PanelStateProps) {
  const failure = status === "error" || status === "unavailable";
  const title = status === "empty" ? emptyText : failure ? errorText : status === "loading" ? loadingText : undefined;
  return (
    <DataState
      kind={status}
      title={title}
      action={failure && onRetry ? <Button onClick={onRetry}>Повторити</Button> : undefined}
    />
  );
}

const closeIcon = <Icon name="close" />;
const srOnly = "ix-sr-only";

export interface PanelFrameProps extends Partial<Omit<PanelStateProps, "status">> {
  readonly status?: PanelStatus;
  readonly title: string;
  readonly subtitle?: ReactNode;
  /** Позначка або дії праворуч від заголовка. */
  readonly headerExtra?: ReactNode;
  /** Нерухома частина над прокруткою: пошук, вкладки. */
  readonly toolbar?: ReactNode;
  /** Нерухома частина під прокруткою: StickyActions інспектора. */
  readonly footer?: ReactNode;
  /** Панель у layout — для кнопки закриття. */
  readonly control?: PanelControl | null;
  readonly closeLabel?: string;
  /**
   * Назва вже видна в шапці робочої області: рядок заголовка панелі не показується (вміст
   * піднімається), а назва лишається для зчитувача. Якщо в рядку є дії чи кнопка закриття
   * (Drawer), рядок показується — інакше їх не було б де натиснути.
   */
  readonly hideTitle?: boolean;
  readonly kind: "context" | "inspector";
  readonly children?: ReactNode;
}

/**
 * Спільний каркас ContextPanel та InspectorPanel: заголовок, нерухомий toolbar,
 * один ScrollArea для вмісту і нерухомий footer. Прокручується лише тіло панелі,
 * тож вона ніколи не рухає робочу поверхню.
 */
export function PanelFrame({ title, subtitle, headerExtra, toolbar, footer, control, closeLabel, hideTitle = false, kind, status = "ready", emptyText, errorText, loadingText, onRetry, children }: PanelFrameProps) {
  const titleId = `ixp-panel-${useId()}`;
  const headerHidden = hideTitle && !headerExtra && !control && !subtitle;
  return (
    <section className="ixp-panel" data-kind={kind} aria-labelledby={titleId}>
      {headerHidden ? (
        // ix-sr-only — публічна утиліта стилів @index/ui (текст лише для зчитувача).
        <h2 id={titleId} className={srOnly} tabIndex={-1} data-panel-title="">
          {title}
        </h2>
      ) : (
      <div className="ixp-panel__header">
        <div className="ixp-panel__titles">
          {/* tabIndex=-1: ціль PanelControl.focus() — зчитувач називає панель, далі Tab іде її вмістом. */}
          <h2 id={titleId} className="ixp-panel__title" tabIndex={-1} data-panel-title="">
            {title}
          </h2>
          {subtitle ? <div className="ixp-panel__subtitle">{subtitle}</div> : null}
        </div>
        {headerExtra}
        {control ? <IconButton label={closeLabel ?? `Сховати: ${control.label}`} icon={closeIcon} onClick={() => control.setOpen(false)} /> : null}
      </div>
      )}
      {toolbar ? <div className="ixp-panel__toolbar">{toolbar}</div> : null}
      {/* Назва відрізняється від назви панелі: два регіони з однаковою назвою зчитувач не розрізнить. */}
      <ScrollArea label={`Вміст: ${title}`} className="ixp-panel__body" viewportClassName="ixp-panel__content">
        {status === "ready" ? children : <PanelState status={status} emptyText={emptyText} errorText={errorText} loadingText={loadingText} onRetry={onRetry} />}
      </ScrollArea>
      {footer ? <div className="ixp-panel__footer">{footer}</div> : null}
    </section>
  );
}
