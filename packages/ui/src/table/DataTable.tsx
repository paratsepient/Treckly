"use client";

import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { DataState, type DataStateKind } from "../feedback/DataState.tsx";
import { Icon } from "../icon/Icon.tsx";
import { cx } from "../internal/class-names.ts";
import { ScrollArea } from "../scroll-area/ScrollArea.tsx";

export type SortDirection = "ascending" | "descending";

export interface TableSort {
  readonly key: string;
  readonly direction: SortDirection;
}

export interface DataTableColumn<Row> {
  readonly key: string;
  /** Заголовок стовпця звичайним словом; візуально — overline, для зчитувача — як є. */
  readonly header: string;
  /** Вміст клітинки; за замовчуванням — значення row[key] як текст. */
  readonly render?: (row: Row) => ReactNode;
  /** Число: вирівнювання до кінця й табличні цифри, щоб розряди стояли один під одним. */
  readonly numeric?: boolean;
  /** Ідентифікатор чи код: моноширинний шрифт. */
  readonly mono?: boolean;
  /** Довгий текст (коментар) переноситься; решта клітинок — в один рядок. */
  readonly wrap?: boolean;
  /** Ширина стовпця в px; без неї стовпець підлаштовується під вміст. */
  readonly width?: number;
  /** Стовпець можна сортувати: заголовок стає кнопкою з aria-sort. */
  readonly sortable?: boolean;
}

export interface DataTableProps<Row> {
  /** Доступна назва таблиці (caption) і області прокрутки. */
  readonly label: string;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly getRowId: (row: Row) => string;
  /** Стовпець-заголовок рядка (th scope="row"); за замовчуванням — перший. */
  readonly rowHeaderKey?: string;
  /** Поточне сортування; таблиця не сортує сама — порядок рядків належить власнику даних. */
  readonly sort?: TableSort | null;
  readonly onSortChange?: (sort: TableSort) => void;
  /** Поточний рядок (відкритий в інспекторі). */
  readonly currentRowId?: string | null;
  /** Вибір рядка: заголовок рядка стає кнопкою; клік по рядку — швидкий шлях мишею. */
  readonly onRowSelect?: (id: string) => void;
  /** Стан даних замість рядків; заголовки стовпців лишаються видимими. */
  readonly state?: "ready" | DataStateKind;
  /** Текст стану (порожньо, помилка) і дія відновлення. */
  readonly stateTitle?: string;
  readonly stateDescription?: ReactNode;
  readonly stateAction?: ReactNode;
  /** compact — рядки 28 px для щільних переліків; comfortable — 36 px. */
  readonly density?: "comfortable" | "compact";
  /**
   * plain — таблиця заповнює поверхню без власного оформлення (робоча поверхня, де вона
   * єдиний вміст). well — окремий об'єкт на сторінці: заокруглена лунка із внутрішньою
   * тінню, як у ScrollArea, а липкий заголовок обрізається її кутами.
   */
  readonly variant?: "plain" | "well";
  /** Клас кореня: місце в розкладці (висота для прокрутки). */
  readonly className?: string;
}

const valueOf = <Row,>(row: Row, key: string): ReactNode => {
  const value = (row as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
};

/** Знак напрямку з набору іконок: форма (стрілка й стовпчики), а не колір, показує порядок. */
function SortMark({ direction }: { readonly direction: SortDirection | null }) {
  return (
    <span className="ix-table__sort-mark" data-direction={direction ?? "none"} aria-hidden="true">
      <Icon name={direction === null ? "sort" : direction === "ascending" ? "sort-ascending" : "sort-descending"} size={16} />
    </span>
  );
}

/**
 * Таблиця даних: нативна <table> у ScrollArea (прокрутка в обидва боки, заголовок липне
 * зверху). Рядки — плоский рівень 0: розділення волосяними лініями, без тіні.
 * Вибір рядка — кнопка в заголовку рядка (клавіатура й зчитувач), поточний рядок —
 * тло вибору плюс смуга 4 px, як у списках. Кнопки рядків — одна зупинка Tab, стрілки
 * вгору/вниз переходять між ними.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  getRowId,
  rowHeaderKey,
  sort = null,
  onSortChange,
  currentRowId = null,
  onRowSelect,
  state = "ready",
  stateTitle,
  stateDescription,
  stateAction,
  density = "comfortable",
  variant = "plain",
  className,
}: DataTableProps<Row>) {
  const headerKey = rowHeaderKey ?? columns[0]?.key;
  const showRows = state === "ready" && rows.length > 0;
  const fallbackState: DataStateKind = state === "ready" ? "empty" : state;

  /*
   * Roving tabindex: кнопки вибору рядків — одна зупинка Tab на всю таблицю (інакше 60
   * рядків — 60 натискань Tab до наступної області). Між рядками — стрілки, Home, End.
   * Зупинка — останній рядок із фокусом, інакше поточний, інакше перший.
   */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowIds = showRows && onRowSelect ? rows.map(getRowId) : [];
  const tabStopId = [focusedId, currentRowId].find((id) => id !== null && rowIds.includes(id)) ?? rowIds[0] ?? null;

  const moveRowFocus = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const buttons = [...(event.currentTarget.closest("table")?.querySelectorAll<HTMLButtonElement>(".ix-table__row-action") ?? [])];
    const index = buttons.indexOf(event.currentTarget);
    const target =
      event.key === "ArrowDown" ? buttons[index + 1] : event.key === "ArrowUp" ? buttons[index - 1] : event.key === "Home" ? buttons[0] : event.key === "End" ? buttons[buttons.length - 1] : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  const toggleSort = (key: string): void => {
    const direction: SortDirection = sort?.key === key && sort.direction === "ascending" ? "descending" : "ascending";
    onSortChange?.({ key, direction });
  };

  return (
    <ScrollArea label={label} orientation="both" variant={variant} className={cx("ix-table-scroll", className)} viewportClassName="ix-table-scroll__viewport">
      <table className="ix-table" data-density={density} data-variant={variant} aria-busy={state === "loading" ? true : undefined}>
        <caption className="ix-sr-only">{label}</caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width === undefined ? undefined : ({ width: column.width } satisfies CSSProperties)} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => {
              const direction = sort?.key === column.key ? sort.direction : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className="ix-table__header"
                  data-numeric={column.numeric ? "" : undefined}
                  aria-sort={column.sortable ? (direction ?? "none") : undefined}
                >
                  {column.sortable && onSortChange ? (
                    <button type="button" className="ix-table__sort" onClick={() => toggleSort(column.key)}>
                      <span>{column.header}</span>
                      <SortMark direction={direction} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showRows ? (
            rows.map((row) => {
              const id = getRowId(row);
              const current = id === currentRowId;
              return (
                <tr
                  key={id}
                  className="ix-table__row"
                  aria-current={current ? "true" : undefined}
                  data-selectable={onRowSelect ? "" : undefined}
                  onClick={onRowSelect ? () => onRowSelect(id) : undefined}
                >
                  {columns.map((column) => {
                    const content = column.render ? column.render(row) : valueOf(row, column.key);
                    const cellProps = {
                      className: "ix-table__cell",
                      "data-numeric": column.numeric ? "" : undefined,
                      "data-mono": column.mono ? "" : undefined,
                      "data-wrap": column.wrap ? "" : undefined,
                    };
                    if (column.key !== headerKey) {
                      return (
                        <td key={column.key} {...cellProps}>
                          {content}
                        </td>
                      );
                    }
                    return (
                      <th key={column.key} scope="row" {...cellProps}>
                        {onRowSelect ? (
                          <button
                            type="button"
                            className="ix-table__row-action"
                            aria-pressed={current}
                            tabIndex={id === tabStopId ? 0 : -1}
                            onFocus={() => setFocusedId(id)}
                            onKeyDown={moveRowFocus}
                            onClick={(event) => {
                              // Клік по кнопці не має вдруге спрацювати на рядку.
                              event.stopPropagation();
                              onRowSelect(id);
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  })}
                </tr>
              );
            })
          ) : (
            <tr className="ix-table__state-row">
              <td colSpan={columns.length}>
                <DataState kind={fallbackState} title={stateTitle} description={stateDescription} action={stateAction} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ScrollArea>
  );
}
