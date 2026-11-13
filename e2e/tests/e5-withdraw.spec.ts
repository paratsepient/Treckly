import { expect, test } from "@playwright/test";
import { AUTHOR_A, AUTHOR_C, openAs, requestCard, row, switchTo, toast } from "../support.ts";

/**
 * E5. Автор відкликає заявку на рівні 4; після затвердження відкликати вже не можна.
 */
test("E5: відкликання на рівні 4 можливе, після затвердження — ні", async ({ page }) => {
  await openAs(page, AUTHOR_C, "/my");

  // ЗМ-0006 лежить на рівні 4.
  await requestCard(page, /ЗМ-0006/).getByRole("button", { name: "ЗМ-0006" }).click();
  await expect(page.getByText("Версія 1 · На розгляді · напрямок")).toBeVisible();
  await page.getByRole("button", { name: "Відкликати", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Відкликати", exact: true }).click();
  await expect(toast(page, "Заявку відкликано")).toBeVisible();
  await expect(requestCard(page, /ЗМ-0006/)).toContainText("Відкликано");

  // Рівні, де заявка була, отримали сповіщення про відкликання.
  await switchTo(page, "prep-4-dir-1", "/notifications");
  await expect(page.getByText("ЗМ-0006: автор відкликав заявку")).toBeVisible();

  // Затверджену заявку відкликати не можна: кнопки немає.
  await switchTo(page, AUTHOR_A, "/my");
  await requestCard(page, /ЗМ-0001/).getByRole("button", { name: "ЗМ-0001" }).click();
  await expect(page.getByText(/Версія 1 · Чекає закупівлі/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Відкликати", exact: true })).toHaveCount(0);
});
