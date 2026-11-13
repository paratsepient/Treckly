import type { Level } from "./types.ts";

export interface LevelConfig {
  readonly level: Level;
  readonly name: string;
  /** Хто формує денний перелік. */
  readonly preparerTitle: string;
  /** Хто погоджує перелік (на рівні 5 — затверджує). */
  readonly approverTitle: string;
}

/**
 * Назви посад — зі схеми «Зараз». Посади на рівнях 2–3 поки невідомі, тому це
 * налаштування, яке передають у застосунок, а не константи правил.
 */
export const DEFAULT_LEVELS: readonly LevelConfig[] = [
  { level: 1, name: "в/ч", preparerTitle: "Уповноважений заступник командира", approverTitle: "Командир в/ч" },
  { level: 2, name: "Бригада", preparerTitle: "Уповноважений заступник командира бригади", approverTitle: "Командир бригади" },
  { level: 3, name: "РУ", preparerTitle: "Уповноважений заступник командира РУ", approverTitle: "Начальник РУ" },
  { level: 4, name: "Адміністрація по напрямку", preparerTitle: "Заступник по напрямку (службі)", approverTitle: "Заступник Голови" },
  { level: 5, name: "Відділ оборонних ресурсів і Голова", preparerTitle: "Відділ оборонних ресурсів", approverTitle: "Голова ГАДССТ" },
];
