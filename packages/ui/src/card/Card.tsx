"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../internal/class-names.ts";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Заголовок картки; з ним картка стає іменованою секцією (aria-labelledby). */
  readonly title?: ReactNode;
  /** Рівень заголовка в документі; за замовчуванням h3 — картки лежать у поверхні під h2. */
  readonly headingLevel?: 2 | 3 | 4;
  /** Короткий підпис під заголовком (джерело, період). */
  readonly subtitle?: ReactNode;
  /** Дії в правому верхньому куті (IconButton налаштувань, «Ще»); без title — поверх вмісту. */
  readonly actions?: ReactNode;
  /** Нерухома нижня частина: позначки стану, посилання «Як розраховано?». */
  readonly footer?: ReactNode;
  /**
   * raised — рівень 1 (card): окремий об'єкт на поверхні (віджет, розділ сторінки).
   * flat — рівень 0: група всередині панелі чи іншої картки, без тіні.
   */
  readonly variant?: "raised" | "flat";
  /** Вибрана для інспектора: смуга вибору по контуру, не лише колір. */
  readonly selected?: boolean;
  readonly children?: ReactNode;
}

/**
 * Картка — єдиний контейнер для віджетів дашборду, розділів сторінки й груп.
 * Сама картка не є кнопкою: у ній можуть лежати діаграми й контроли. Вибір
 * робить власник (клік або кнопка налаштувань), картка лише показує стан.
 */
export function Card({ title, headingLevel = 3, subtitle, actions, footer, variant = "raised", selected = false, className, children, ...rest }: CardProps) {
  const titleId = `ix-card-${useId()}`;
  const Heading = `h${headingLevel}` as const;
  // Без заголовка дії плавають у куті й не забирають рядок: заголовок дає вміст (діаграма).
  const hasHeader = title !== undefined;
  const floating = !hasHeader && actions !== undefined;

  /*
   * Плаваючі дії лежать над першим рядком вмісту. Їхню ширину картка передає вмісту
   * локальною змінною --card-actions-inline-size: заголовок діаграми чи KPI відступає
   * на неї й не ховається під кнопками. Ширина залежить від кількості дій, тож вимірюється.
   */
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsSize, setActionsSize] = useState(0);
  useEffect(() => {
    const element = actionsRef.current;
    if (!floating || !element) return;
    const measure = (): void => setActionsSize(Math.ceil(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [floating]);
  const style = floating ? ({ ...rest.style, "--card-actions-inline-size": `${actionsSize}px` } as CSSProperties) : rest.style;

  return (
    <section
      {...rest}
      style={style}
      className={cx("ix-card", className)}
      data-variant={variant}
      data-selected={selected ? "" : undefined}
      aria-labelledby={title !== undefined ? titleId : rest["aria-labelledby"]}
    >
      {hasHeader ? (
        <div className="ix-card__header">
          {title !== undefined ? (
            <div className="ix-card__titles">
              <Heading id={titleId} className="ix-card__title">
                {title}
              </Heading>
              {subtitle !== undefined ? <p className="ix-card__subtitle">{subtitle}</p> : null}
            </div>
          ) : null}
          {actions !== undefined ? <div className="ix-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      {floating ? (
        <div ref={actionsRef} className="ix-card__actions" data-floating="">
          {actions}
        </div>
      ) : null}
      <div className="ix-card__body">{children}</div>
      {footer !== undefined ? <div className="ix-card__footer">{footer}</div> : null}
    </section>
  );
}
