import { createRequire } from "node:module";
import { expect, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");

export const AUTHOR_A = "author-unit-a";
export const AUTHOR_B = "author-unit-b";
export const AUTHOR_C = "author-unit-c";

/** Відкриває застосунок від імені користувача (перемикач ролей без паролів) і чекає, поки завантажиться демо. */
export async function openAs(page: Page, userId: string, hash = "/"): Promise<void> {
  await page.addInitScript((id) => {
    // Лише для першого відкриття: наступні переходи не повинні перебивати роль, обрану в тесті.
    if (!sessionStorage.getItem("e2e.roleSet")) {
      localStorage.setItem("dsp.userId", id);
      sessionStorage.setItem("e2e.roleSet", "1");
    }
  }, userId);
  await page.goto(`/#${hash}`);
  await waitReady(page);
}

/** Зміна ролі посеред сценарію: так само, як у демо-панелі, але без кліків по її елементах. */
export async function switchTo(page: Page, userId: string, hash = "/"): Promise<void> {
  await page.evaluate((id) => localStorage.setItem("dsp.userId", id), userId);
  // Повне завантаження через порожню сторінку: перехід лише за хешем спрацював би ще у сторінці
  // старої ролі, а вона перенаправляє чужий для неї маршрут на свій початковий екран.
  await page.goto("about:blank");
  await page.goto(`/#${hash}`);
  await waitReady(page);
}

/** Демо запущено, коли з'явилась оболонка з навігацією: перший запуск наповнює базу кілька секунд. */
export async function waitReady(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Пункти навігації" }).or(page.getByRole("navigation")).first()).toBeVisible({ timeout: 30_000 });
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("dsp.theme", t);
    document.documentElement.dataset["theme"] = t;
  }, theme);
}

/** Порушення доступності за axe, разом із контрастом (у справжньому браузері він рахується). */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")}`);
  });
}

/** Тост із заголовком (повідомлення про результат дії). */
export const toast = (page: Page, title: string | RegExp) => page.getByText(title).first();

/** Автор подає просту заявку (одна позиція за переліком, кількість 1): швидкий спосіб додати заявку в чергу. */
export async function submitSimpleRequest(page: Page, positionId = "pos-002"): Promise<void> {
  await page.goto("/#/new");
  await page.getByRole("button", { name: "Додати рядок" }).click();
  await page.getByLabel("Позиція, рядок 1").selectOption(positionId);
  await expect(page.getByText("Перевірки пройдено")).toBeVisible();
  await page.getByLabel("Обґрунтування потреби").fill("Майно зношене, потрібне поповнення.");
  const submit = page.getByRole("button", { name: "Подати", exact: true });
  await expect(submit).toBeEnabled();
  const before = new URL(page.url()).hash;
  await submit.click();
  // Чекаємо саме переходу до цієї заявки: тост від попереднього подання міг ще не зникнути.
  await page.waitForURL((url) => url.hash.startsWith("#/my?selected=req-") && url.hash !== before);
  await expect(toast(page, "Заявку подано")).toBeVisible();
}

/** Рядок таблиці за текстом (номер заявки тощо). */
export const row = (page: Page, text: string | RegExp) => page.getByRole("row", { name: text });

/** Відкриває демо-панель і натискає кнопку в ній. */
export async function demoAction(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: /Демо-панель/ }).click();
  await page.getByRole("button", { name: label }).click();
}
