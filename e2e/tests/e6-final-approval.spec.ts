import { expect, test } from "@playwright/test";
import { AUTHOR_C, openAs, row, switchTo, toast } from "../support.ts";

/**
 * E6. Голова затверджує: резерв бюджету, витяги по в/ч, «Заміна погоджена», оновлені KPI.
 */
test("E6: затвердження Головою — резерв бюджету, витяг із «Заміна погоджена», оновлене зведення", async ({ page }) => {
  await openAs(page, "appr-5-vor", "/registry");
  const budget = page.getByRole("table", { name: "Бюджет напрямку за КЕКВ" });
  await expect(budget.getByRole("row", { name: /^2210/ })).toContainText(/221[\s ]100,00/);
  await expect(page.locator(".kpi-row")).toContainText("Затверджено");

  // Відділ формує остаточний перелік із ЗМ-0007, Голова затверджує.
  await switchTo(page, "prep-5-vor", "/queue");
  await page.getByRole("checkbox", { name: "Обрати ЗМ-0007 до переліку" }).check();
  await page.getByRole("button", { name: "Сформувати перелік (1)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 1")).toBeVisible();

  await switchTo(page, "appr-5-vor", "/lists");
  await page.getByRole("button", { name: "Затвердити", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("резервує бюджет і формує витяги");
  await dialog.getByLabel("Номер СЕДО").fill("7600001");
  await dialog.getByRole("button", { name: "Затвердити" }).click();
  await expect(toast(page, "Перелік затверджено")).toBeVisible();

  // Остаточний перелік і витяг по в/ч А0003: рядок заміни — «Заміна погоджена».
  await page.goto("/#/final");
  await expect(row(page, /ЗМ-0007/)).toContainText("Витяг сформовано");
  await expect(row(page, /ЗМ-0007/)).toContainText("7600001");
  const extract = page.getByRole("article", { name: /Витяг по в\/ч А0003/ });
  await expect(extract.getByText("Заміна погоджена")).toBeVisible();
  await expect(extract.getByText(/\(заміна\)/)).toBeVisible();

  // Бюджет зарезервовано (+37 200 грн у КЕКВ 2210; заміна в межах КЕКВ ліміт не витрачає); зведення оновилось.
  await page.goto("/#/registry");
  await expect(budget.getByRole("row", { name: /^2210/ })).toContainText(/258[\s ]300,00/);

  // Автор в/ч А0003 бачить власний витяг, а чужих — ні.
  await switchTo(page, AUTHOR_C, "/final");
  await expect(page.getByRole("article", { name: /Витяг по в\/ч А0003/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Витяг по в\/ч А0001/ })).toHaveCount(0);
});
