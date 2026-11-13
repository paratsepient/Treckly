import { expect, test, type Page } from "@playwright/test";
import { axeViolations, openAs, setTheme } from "../support.ts";

/**
 * Доступність: axe без порушень на кожному екрані кожної ролі в обох темах (WCAG 2.1 AA).
 * На відміну від тестів у jsdom, тут перевіряється й контраст кольорів: у справжньому браузері він рахується.
 */
const SCREENS: readonly { role: string; hash: string; name: string; ready: (page: Page) => Promise<void> }[] = [
  { role: "author-unit-a", hash: "/property", name: "Моє майно", ready: (p) => expect(p.getByRole("table").first()).toBeVisible() },
  { role: "author-unit-a", hash: "/new", name: "Нова заявка", ready: (p) => expect(p.getByRole("button", { name: "Додати рядок" })).toBeVisible() },
  { role: "author-unit-a", hash: "/my?selected=req-0008", name: "Мої заявки з карткою заявки", ready: (p) => expect(p.getByRole("list", { name: "Трек заявки за рівнями погодження" })).toBeVisible() },
  { role: "author-unit-a", hash: "/final", name: "Витяги по в/ч", ready: (p) => expect(p.getByRole("article").first()).toBeVisible() },
  { role: "author-unit-b", hash: "/notifications", name: "Сповіщення", ready: (p) => expect(p.getByRole("list", { name: /Сповіщення/ })).toBeVisible() },
  { role: "prep-1-unit-a", hash: "/queue", name: "Черга рівня", ready: (p) => expect(p.getByRole("checkbox", { name: /Обрати ЗМ-/ }).first()).toBeVisible() },
  { role: "appr-1-unit-a", hash: "/lists", name: "Денний перелік", ready: (p) => expect(p.getByRole("button", { name: "Погодити", exact: true })).toBeEnabled() },
  { role: "appr-5-vor", hash: "/summary", name: "Зведення", ready: (p) => expect(p.getByRole("table", { name: "Бюджет напрямку за КЕКВ" })).toBeVisible() },
  { role: "appr-5-vor", hash: "/registry", name: "Реєстр заявок", ready: (p) => expect(p.getByRole("table", { name: "Таблиця реєстру заявок" })).toBeVisible() },
  { role: "appr-5-vor", hash: "/final", name: "Затверджені закупівлі", ready: (p) => expect(p.getByRole("article").first()).toBeVisible() },
  { role: "prep-5-vor", hash: "/planned", name: "Запланований перелік", ready: (p) => expect(p.getByRole("table", { name: "Запланований перелік закупівель" })).toBeVisible() },
  { role: "prep-5-vor", hash: "/procurement", name: "Закупівлі й видача", ready: (p) => expect(p.getByRole("article").first()).toBeVisible() },
  { role: "admin-demo", hash: "/users", name: "Користувачі", ready: (p) => expect(p.getByRole("table", { name: "Користувачі" })).toBeVisible() },
  { role: "admin-demo", hash: "/acting", name: "ТВО", ready: (p) => expect(p.getByRole("heading", { name: "Призначити ТВО" })).toBeVisible() },
  { role: "admin-demo", hash: "/journal", name: "Журнал дій", ready: (p) => expect(p.getByRole("table", { name: "Журнал дій" })).toBeVisible() },
];

for (const screen of SCREENS) {
  test(`axe: «${screen.name}» (${screen.role}) у світлій і темній темі`, async ({ page }) => {
    await openAs(page, screen.role, screen.hash);
    await screen.ready(page);

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(400); // перехід кольорів теми
      expect(await axeViolations(page), `тема ${theme}`).toEqual([]);
    }
  });
}

test("axe: діалоги (повернення, СЕДО) і демо-середовище у двох темах", async ({ page }) => {
  await openAs(page, "prep-1-unit-a", "/queue");
  await page.getByRole("button", { name: "Повернути…" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await page.waitForTimeout(400);
    expect(await axeViolations(page), `діалог повернення, тема ${theme}`).toEqual([]);
  }
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Демо-середовище/ }).click();
  await expect(page.getByRole("heading", { name: "Оберіть роль" })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await page.waitForTimeout(400);
    expect(await axeViolations(page), `демо-середовище, тема ${theme}`).toEqual([]);
  }
});

test("axe: діалог рапорту з переглядом аркуша у двох темах", async ({ page }) => {
  await openAs(page, "author-unit-a", "/my?selected=req-0008");
  await page.getByRole("button", { name: "Рапорт", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Рапорт ЗМ-0008" });
  await expect(dialog.frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await page.waitForTimeout(400);
    expect(await axeViolations(page), `діалог рапорту, тема ${theme}`).toEqual([]);
  }
});
