import type { ReactNode } from "react";
import { Badge } from "@index/ui";
import { Drawer, SaveStatus, type SaveStatusProps } from "@index/ui-patterns";
import { useMedia, WIDE } from "../lib/useMedia.ts";
import { DetailCloseContext } from "./DetailPanel.tsx";

export interface ScreenFrameProps {
  readonly title: string;
  /** Контекст під назвою: кількість записів, сума. */
  readonly meta?: ReactNode;
  /** Стан документа біля назви («Чернетка · зберігається автоматично»). */
  readonly documentState?: string;
  readonly saveStatus?: SaveStatusProps;
  /** Головна дія екрана: завжди остання праворуч у шапці сторінки. */
  readonly primaryAction?: ReactNode;
  /** Другорядні дії екрана. */
  readonly actions?: ReactNode;
  /** Бічна картка (DetailPanel). */
  readonly inspector?: ReactNode;
  readonly inspectorOpen?: boolean;
  /** Є — картку можна закрити (кнопка в картці, Escape у висувній панелі). */
  readonly onInspectorOpenChange?: (open: boolean) => void;
  readonly inspectorKey?: string;
  readonly inspectorLabel?: string;
  /**
   * detail — картка вибраного запису: на вузькому екрані висувається поверх сторінки.
   * aside — постійний супровід вмісту (перевірки, склад переліку): на вузькому екрані стає блоком під вмістом.
   */
  readonly inspectorPlacement?: "detail" | "aside";
  readonly surfaceLabel: string;
  /** Другорядний вміст після супровідної картки: на вузькому екрані картка стоїть одразу під головним вмістом. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Каркас сторінки: шапка (назва, стан, дії) і вміст у сітці. Бічна картка на широкому
 * екрані — окрема колонка сітки, тож нічого не накладається на вміст.
 */
export function ScreenFrame(props: ScreenFrameProps) {
  const wide = useMedia(WIDE);
  const placement = props.inspectorPlacement ?? "detail";
  const open = props.inspector !== undefined && props.inspectorOpen !== false;
  const close = props.onInspectorOpenChange ? () => props.onInspectorOpenChange?.(false) : null;
  const panel = <DetailCloseContext.Provider value={close}>{props.inspector}</DetailCloseContext.Provider>;
  const docked = open && wide;
  const stacked = open && !wide && placement === "aside";
  const drawer = props.inspector !== undefined && !wide && placement === "detail";

  return (
    <div className="page" data-detail={docked ? "docked" : undefined}>
      <main id="content" className="page__content" tabIndex={-1} aria-label={props.surfaceLabel}>
        <header className="page__head">
          <div className="page__heading">
            <div className="page__title-row">
              <h1 className="page__title">{props.title}</h1>
              {props.documentState ? <Badge>{props.documentState}</Badge> : null}
            </div>
            {props.meta !== undefined || props.saveStatus ? (
              <div className="page__meta">
                {props.meta !== undefined ? <span>{props.meta}</span> : null}
                {props.saveStatus ? <SaveStatus {...props.saveStatus} /> : null}
              </div>
            ) : null}
          </div>
          {props.actions || props.primaryAction ? (
            <div className="page__actions">
              {props.actions}
              {props.primaryAction}
            </div>
          ) : null}
        </header>
        {props.children}
        {stacked ? <div className="page__stacked">{panel}</div> : null}
        {props.footer}
      </main>
      {docked ? (
        <aside className="page__detail" key={props.inspectorKey} aria-label={props.inspectorLabel ?? "Картка"}>
          {panel}
        </aside>
      ) : null}
      {drawer ? (
        <Drawer side="end" label={props.inspectorLabel ?? "Картка"} open={open} onClose={() => props.onInspectorOpenChange?.(false)}>
          <div className="page__drawer" key={props.inspectorKey}>
            {panel}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
