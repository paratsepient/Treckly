import { createApp, createInProcessFetch, createRandomIds } from "@dsp/api";
import { loadUsers, openDb } from "@dsp/db";
// Готові демо-дані без генератора: faker у браузерну збірку не потрапляє.
import { applySeed, resetDemo, seedData } from "@dsp/seed/browser";

/** Демо вже відкрите в іншій вкладці: PGlite підтримує одного власника бази на браузер. */
export class DemoOpenElsewhereError extends Error {
  constructor() {
    super("Демо вже відкрите в іншій вкладці або вікні.");
    this.name = "DemoOpenElsewhereError";
  }
}

/**
 * База PGlite в IndexedDB має одного власника: дві вкладки одночасно ламають її («Aborted()»)
 * або зависають. Замок утримується, поки відкрита вкладка; друга вкладка отримує зрозумілу
 * відмову. Без Web Locks (старі браузери) перевірки немає.
 */
async function acquireTabLock(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return true;
  return new Promise((resolve) => {
    void navigator.locks.request("dsp-orders-database", { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => undefined);
    });
  });
}

/**
 * Бекенд прототипу працює прямо в браузері: Hono над PGlite (дані зберігаються в IndexedDB
 * між сесіями). Перший запуск наповнює базу демо-даними; «Скинути демо» робить це знову.
 */
async function start(): Promise<{ readonly fetch: typeof fetch }> {
  if (!(await acquireTabLock())) throw new DemoOpenElsewhereError();
  const t0 = performance.now();
  const stage = (name: string) => console.info(`[запуск] ${name}: ${Math.round(performance.now() - t0)} мс`);
  const { pg, db } = await openDb("idb://dsp-orders");
  stage("база відкрита, міграції застосовано");
  if ((await loadUsers(db)).length === 0) {
    await applySeed(db, seedData);
    stage("демо-дані записано");
  }
  const app = createApp({ db, ids: createRandomIds(), resetDemo: (options) => resetDemo(pg, db, seedData, options) });
  return { fetch: createInProcessFetch(app) };
}

let booting: Promise<{ readonly fetch: typeof fetch }> | undefined;

/**
 * Запуск одиничний: StrictMode виконує ефекти двічі, а дві копії PGlite на одній IndexedDB
 * конфліктують. Усі виклики отримують той самий проміс.
 */
export function bootBackend(): Promise<{ readonly fetch: typeof fetch }> {
  booting ??= start();
  return booting;
}
