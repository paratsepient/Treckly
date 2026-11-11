import { createContext, useContext } from "react";
import type { Theme } from "../lib/storage.ts";

export interface ShellContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
  /** Повернення на початковий екран ролі: після зміни ролі чи скидання демо. */
  readonly goHome: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell: немає ShellContext");
  return value;
}
