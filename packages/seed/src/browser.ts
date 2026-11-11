/**
 * Вхід для браузера: готові демо-дані й запис у базу, без генератора (`faker` сюди не
 * потрапляє). Дані створює `pnpm --filter @dsp/seed generate`; актуальність перевіряє
 * `check:data`.
 */
import data from "./seed-data.json" with { type: "json" };
import type { SeedData } from "./generate.ts";

export { applySeed, resetDemo } from "./apply.ts";
export type { SeedData } from "./generate.ts";

export const seedData = data as unknown as SeedData;
