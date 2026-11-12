import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, switchTo, toast } from "../support.ts";

/** ТВО: адміністратор призначає заступника, той діє з роллю керівника, журнал пише «ТВО за …»; після зняття — своя роль. */
test("ТВО: призначення, дія заступника з позначкою в журналі, зняття", async ({ page }) => {
  await openAs(page, "admin-demo", "/acting");
  await page.getByLabel("Чиї обов'язки").selectOption("appr-1-unit-a");
  await page.getByLabel("Хто виконує").selectOption(AUTHOR_A);
  await page.getByRole("button", { name: "Призначити" }).click();
  await expect(toast(page, "ТВО призначено")).toBeVisible();
  await expect(page.getByRole("table", { name: "Призначення ТВО" }).getByText("Чинне")).toBeVisible();

  // Заступник бачить екрани керівника рівня 1 і погоджує перелік.
  await switchTo(page, AUTHOR_A, "/lists");
  await expect(page.locator(".sidebar__user-role")).toContainText("ТВО:");
  await page.getByRole("button", { name: "Погодити", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Номер СЕДО").fill("8100001");
  await dialog.getByRole("button", { name: "Погодити" }).click();
  await expect(toast(page, "Перелік погоджено")).toBeVisible();

  await switchTo(page, "admin-demo", "/journal");
  await expect(page.getByRole("row", { name: /Перелік погоджено/ }).first()).toContainText("(ТВО за ");

  await page.goto("/#/acting");
  await page.getByRole("button", { name: "Зняти" }).click();
  await expect(toast(page, "Призначення ТВО знято")).toBeVisible();
  await switchTo(page, AUTHOR_A, "/");
  await expect(page.locator(".sidebar__user-role")).not.toContainText("ТВО:");
});
