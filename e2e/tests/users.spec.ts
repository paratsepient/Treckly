import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, switchTo, toast } from "../support.ts";

/** Адміністратор змінює відділ і КЕКВ автора: служба в заявці — з профілю, «Моє майно» — лише за доступними КЕКВ. */
test("користувачі: відділ і доступні КЕКВ автора", async ({ page }) => {
  await openAs(page, "admin-demo", "/users");
  await page.getByRole("table", { name: "Користувачі" }).getByRole("row", { name: /Автор заявок/ }).first().click();
  const card = page.getByRole("complementary").or(page.getByRole("dialog")).filter({ hasText: "Доступні КЕКВ" }).first();
  await card.getByLabel("Відділ (служба)").selectOption("dep-a2");
  await card.getByLabel(/^3110/).check();
  await card.getByRole("button", { name: "Зберегти" }).click();
  await expect(toast(page, "Налаштування збережено")).toBeVisible();

  // Служба в рапорті — з відділу профілю; у виборі позицій — лише КЕКВ 3110.
  await switchTo(page, AUTHOR_A, "/new");
  await page.getByRole("button", { name: "Додати рядок" }).click();
  const position = page.getByLabel("Позиція, рядок 1");
  await position.selectOption({ index: 1 });
  await expect(page.getByRole("table", { name: "Рядки заявки" }).getByText("3110")).toBeVisible();
  await page.getByLabel("Обґрунтування потреби").fill("Потреба відділу тилу.");
  await page.getByRole("button", { name: "Переглянути рапорт" }).click();
  const sheet = page.getByRole("dialog", { name: /Рапорт ЗМ-/ }).frameLocator("iframe");
  await expect(sheet.getByText(/\(відділ тилу\) за Попереднім переліком/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/#/property");
  const table = page.getByRole("table").first();
  await expect(table.getByText("2210", { exact: true })).toHaveCount(0);
});
