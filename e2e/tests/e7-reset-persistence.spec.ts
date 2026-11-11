import { expect, test } from "@playwright/test";
import { AUTHOR_A, demoAction, openAs, row, toast } from "../support.ts";

/**
 * E7. «Скинути демо», збереження після перезавантаження.
 */
test("E7: чернетка переживає перезавантаження, «Скинути демо» повертає початковий стан", async ({ page }) => {
  await openAs(page, AUTHOR_A, "/new");
  await page.getByRole("button", { name: "Додати рядок" }).click();
  await page.getByLabel("Позиція, рядок 1").selectOption("pos-003");
  await expect(page.getByText(/Збережено о/)).toBeVisible({ timeout: 15_000 });
  expect(page.url()).toMatch(/#\/new\?id=req-/);

  // Перезавантаження: дані в IndexedDB лишились, чернетка відкривається з тими самими рядками.
  await page.reload();
  await expect(page.getByLabel("Позиція, рядок 1")).toHaveValue("pos-003");

  await page.goto("/#/my");
  await expect(row(page, /Чернетка/)).toHaveCount(2);

  // Скидання: чернетки немає, стан як на початку; роль і тема збережені.
  await demoAction(page, "Скинути демо");
  await expect(toast(page, "Демо скинуто до початкового стану")).toBeVisible();
  await page.goto("/#/my");
  await expect(row(page, /Чернетка/)).toHaveCount(1);
  await expect(row(page, /ЗМ-0001/)).toContainText("Витяг сформовано");
});
