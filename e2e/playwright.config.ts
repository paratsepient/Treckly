import { defineConfig } from "@playwright/test";

/**
 * Сценарії E1–E7 з документа розробки на встановленому на ПК Chrome (без завантаження браузера).
 * Кожен тест отримує чистий контекст, а отже й чисту IndexedDB: демо-дані створюються заново.
 * Перед запуском потрібна збірка пакетів: `pnpm build`.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4340",
    channel: "chrome",
    locale: "uk-UA",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm --filter @dsp/web dev",
    url: "http://localhost:4340",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
