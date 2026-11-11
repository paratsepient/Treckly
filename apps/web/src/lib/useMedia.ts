import { useSyncExternalStore } from "react";

/** Відповідність медіазапиту з підпискою на зміну (ширина вікна, орієнтація). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Межі розкладки застосунку: їх же використовує app.css. */
export const WIDE = "(min-width: 1280px)"; // бічна картка стоїть колонкою поруч із вмістом
export const DESKTOP = "(min-width: 1024px)"; // навігація закріплена зліва
export const NARROW = "(max-width: 719px)"; // телефон: таблиці показують лише головні стовпці

/** Стовпці таблиці для вузького екрана: другорядні ховаються, щоб таблиця читалась без горизонтальної прокрутки. */
export function visibleColumns<T extends { readonly key: string; readonly width?: number }>(columns: readonly T[], narrow: boolean, hideOnNarrow: readonly string[]): readonly T[] {
  if (!narrow) return columns;
  // Фіксовані ширини знімаються: на вузькому місці стовпці діляться за вмістом.
  return columns.filter((column) => !hideOnNarrow.includes(column.key)).map(({ width: _width, ...column }) => column as unknown as T);
}
