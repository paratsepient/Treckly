import { expect, test } from "@playwright/test";
import { AUTHOR_C, openAs, row, switchTo, toast } from "../support.ts";

/**
 * E6. Відділ оборонних ресурсів відмічає підпис Голови: резерв бюджету, витяги по в/ч, «Заміна погоджена», оновлені KPI.
 * Голова в системі лише стежить.
 */
test("E6: затвердження Головою — резерв бюджету, витяг із «Заміна погоджена», оновлене зведення", async ({ page }) => {
  await openAs(page, "appr-5-vor", "/summary");
  const budget = page.getByRole("table", { name: "Бюджет напрямку за КЕКВ" });
  await expect(budget.getByRole("row", { name: /^2210/ })).toContainText(/222[\s ]000,00/);
  await expect(page.locator(".kpi-row")).toContainText("Затверджено");

  // Відділ формує остаточний перелік із ЗМ-0007, Голова затверджує.
  await switchTo(page, "prep-5-vor", "/queue");
  // Рівень 5 бачить залишки ініціатора: скільки того, що просять, уже на базі й отримано.
  const plan = page.getByRole("region", { name: "Звірка з Попереднім переліком" });
  await expect(plan.getByRole("columnheader", { name: "На базі" })).toBeVisible();
  await expect(plan.getByRole("columnheader", { name: "Отримано" })).toBeVisible();
  await expect(plan.getByText(/Такого майна в в\/ч немає|В\/ч уже має таке майно/)).toBeVisible();
  // У ЗМ-0007 є заміна: без позначки «Відповідає вимогам» її не обрати; позначку можна скасувати.
  const pick = page.getByRole("checkbox", { name: "Обрати ЗМ-0007 до переліку" });
  await expect(pick).toBeDisabled();
  const row7 = page.getByRole("row", { name: /ЗМ-0007/ });
  await row7.getByRole("button", { name: "Відповідає вимогам" }).click();
  await expect(pick).toBeEnabled();
  await row7.getByRole("button", { name: "Не відповідає вимогам" }).click();
  await expect(pick).toBeDisabled();
  await row7.getByRole("button", { name: "Відповідає вимогам" }).click();
  await pick.check();
  await page.getByRole("button", { name: "Сформувати перелік (1)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 1")).toBeVisible();

  // Голова в системі не погоджує: екрана затвердження в нього немає, лише моніторинг.
  await switchTo(page, "appr-5-vor", "/lists");
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("link", { name: "Денний перелік" })).toHaveCount(0);

  // Відділ друкує/завантажує перелік, несе на підпис і відмічає «Підписано Головою» з номером СЕДО.
  await switchTo(page, "prep-5-vor", "/queue");
  const card = page.getByRole("article", { name: /Перелік від/ });
  await expect(card).toContainText("Чекає підпису Голови");
  const listDownload = page.waitForEvent("download");
  await card.getByRole("button", { name: "Завантажити перелік (Word)" }).click();
  expect((await listDownload).suggestedFilename()).toMatch(/\.docx$/);
  await card.getByRole("button", { name: "Підписано Головою" }).click();
  const dialog = page.getByRole("dialog", { name: "Відмітити підпис Голови?" });
  await expect(dialog).toContainText("резервує бюджет і формує витяги");
  await dialog.getByLabel("Номер СЕДО").fill("7600001");
  await dialog.getByRole("button", { name: "Підписано Головою" }).click();
  await expect(toast(page, "Перелік підписано Головою")).toBeVisible();

  // Остаточний перелік і витяг по в/ч А0003: рядок заміни — «Заміна погоджена».
  await page.goto("/#/final");
  await expect(row(page, /ЗМ-0007/)).toContainText("Чекає закупівлі");
  await expect(row(page, /ЗМ-0007/)).toContainText("7600001");
  const extract = page.getByRole("article", { name: /Витяг по в\/ч А0003 від 15\.02\.2027/ });
  await expect(extract.getByText("Заміна погоджена")).toBeVisible();
  await expect(extract.getByText(/\(заміна\)/)).toBeVisible();

  // Сформований витяг — окремий документ: перегляд, Word і друк прямо з картки витягу.
  await extract.getByRole("button", { name: /Відкрити витяг по в\/ч А0003 від 15\.02\.2027/ }).click();
  const doc = page.getByRole("dialog", { name: /Витяг по в\/ч А0003/ });
  const sheet = doc.frameLocator("iframe");
  await expect(sheet.getByText("ВИТЯГ", { exact: true })).toBeVisible();
  await expect(sheet.getByText(/СЕДО № 7600001/)).toBeVisible();
  await expect(sheet.getByRole("cell", { name: "Заміна погоджена" })).toBeVisible();
  const download = page.waitForEvent("download");
  await doc.getByRole("button", { name: "Завантажити витяг (Word)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Витяг в\/ч А0003 .+\.docx$|^Витяг .+\.docx$/);
  await page.keyboard.press("Escape");

  // Рапорт затвердженої заявки відкривається з рядка остаточного переліку.
  await row(page, /ЗМ-0007/).getByRole("button", { name: "Переглянути рапорт ЗМ-0007" }).click();
  await expect(page.getByRole("dialog", { name: "Рапорт ЗМ-0007" }).frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Бюджет зарезервовано (+37 200 грн у КЕКВ 2210; заміна в межах КЕКВ ліміт не витрачає); зведення оновилось.
  await page.goto("/#/summary");
  await expect(budget.getByRole("row", { name: /^2210/ })).toContainText(/259[\s ]200,00/);

  // Автор в/ч А0003 бачить власний витяг, а чужих — ні.
  await switchTo(page, AUTHOR_C, "/final");
  await expect(page.getByRole("article", { name: /Витяг по в\/ч А0003 від 15\.02\.2027/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Витяг по в\/ч А0001/ })).toHaveCount(0);
});
