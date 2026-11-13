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

  await switchTo(page, AUTHOR_A, "/new");
  await expect(page.locator(".request-details__value")).toHaveText("Відділ тилу");
  await page.goto("/#/property");
  const table = page.getByRole("table").first();
  await expect(table.getByText("2210", { exact: true })).toHaveCount(0);
});
