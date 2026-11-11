import { useCallback, useState, useSyncExternalStore } from "react";
import { layoutBreakpoints, layoutModeForWidth, type LayoutMode } from "@index/design-tokens";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const queries = {
  wide: `(min-width: ${layoutBreakpoints.wide}px)`,
  large: `(min-width: ${layoutBreakpoints.large}px)`,
  medium: `(min-width: ${layoutBreakpoints.medium}px)`,
} as const;

const hasMatchMedia = (): boolean => typeof window.matchMedia === "function";

/**
 * Слухаємо resize, change у matchMedia і ResizeObserver на <html>: під час перевірок
 * в емуляції viewport окремі джерела пропускали зміну або приходили до оновлення
 * ширини. Значення завжди читається з matchMedia (як у CSS), а React перерендерює
 * лише коли режим справді змінився, тож зайві сповіщення нічого не коштують.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  const lists = hasMatchMedia() ? Object.values(queries).map((query) => window.matchMedia(query)) : [];
  for (const list of lists) list.addEventListener("change", onChange);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => onChange());
  observer?.observe(document.documentElement);
  return () => {
    window.removeEventListener("resize", onChange);
    for (const list of lists) list.removeEventListener("change", onChange);
    observer?.disconnect();
  };
}

function snapshot(): LayoutMode {
  if (!hasMatchMedia()) return layoutModeForWidth(window.innerWidth);
  if (window.matchMedia(queries.wide).matches) return "wide";
  if (window.matchMedia(queries.large).matches) return "large";
  if (window.matchMedia(queries.medium).matches) return "medium";
  return "compact";
}

/**
 * Режим layout за шириною viewport у CSS px (при zoom 200% ширина вдвічі менша,
 * тож панелі коректно переходять у Drawer). На сервері — `wide`.
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, snapshot, () => "wide");
}

/**
 * Контрольований/неконтрольований стан за звичною схемою React:
 * якщо value передано, компонент лише повідомляє про зміни через onChange.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange: ((next: T) => void) | undefined,
): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = useCallback(
    (next: T) => {
      if (!controlled) {
        setInner(next);
      }
      if (next !== current) {
        onChange?.(next);
      }
    },
    [controlled, current, onChange],
  );
  return [current, set];
}
