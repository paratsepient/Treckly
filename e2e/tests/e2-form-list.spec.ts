import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, row, submitSimpleRequest, switchTo, toast } from "../support.ts";

/**
 * E2. На рівні 1 обирають дві заявки з трьох, формують перелік, командир погоджує з номером СЕДО;
 * третя лишається в черзі.
 */
test("E2: перелік із двох заявок із трьох, погодження з СЕДО, третя лишається в черзі", async ({ page }) => {
  await openAs(page, AUTHOR_A, "/new");
  await submitSimpleRequest(page, "pos-002");
  await submitSimpleRequest(page, "pos-004");

  // Уповноважений: у черзі три заявки (одна з демо-даних і дві нові).
  await switchTo(page, "prep-1-unit-a", "/queue");
  const picks = page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ });
  await expect(picks).toHaveCount(3);

  // Клік по заявці відкриває її рапорт для ознайомлення; галочка лише обирає, не відкриваючи його.
  await picks.nth(1).check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await picks.nth(1).uncheck();
  await row(page, /ЗМ-0010/).getByRole("button", { name: "ЗМ-0010" }).click();
  const raport = page.getByRole("dialog", { name: "Рапорт ЗМ-0010" });
  await expect(raport.getByText(/Рапорт для ознайомлення/)).toBeVisible();
  await expect(raport.frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  await raport.getByRole("button", { name: "Повернути…" }).waitFor();
  await page.keyboard.press("Escape");
  await expect(raport).toHaveCount(0);
  await picks.nth(1).check();
  await picks.nth(2).check();
  await page.getByRole("button", { name: "Сформувати перелік (2)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 2")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(1);

  // Керівник погоджує з числовим СЕДО; нечисловий номер відхиляється.
  await switchTo(page, "appr-1-unit-a", "/lists");
  await expect(page.getByRole("row", { name: /15\.02\.2027/ })).toBeVisible();

  // Керівник відкриває рапорт будь-якої заявки переліку для ознайомлення.
  await page.getByRole("button", { name: /^ЗМ-.*відкрити рапорт/ }).first().click();
  const reading = page.getByRole("dialog", { name: /Рапорт ЗМ-/ });
  await expect(reading.frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reading).toHaveCount(0);
  await page.getByRole("button", { name: "Погодити", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Номер СЕДО").fill("abc");
  await dialog.getByRole("button", { name: "Погодити" }).click();
  await expect(dialog.getByText(/Номер СЕДО — число/)).toBeVisible();
  await dialog.getByLabel("Номер СЕДО").fill("7500001");
  await dialog.getByRole("button", { name: "Погодити" }).click();
  await expect(toast(page, "Перелік погоджено")).toBeVisible();
  await expect(page.getByText(/СЕДО № 7500001/).first()).toBeVisible();

  // Дві заявки пішли на рівень 2, третя лишилась на рівні 1.
  await switchTo(page, "prep-2-brig-1", "/queue");
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(3, { timeout: 15_000 });
  await switchTo(page, "prep-1-unit-a", "/queue");
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(1);
  await expect(row(page, /ЗМ-0010/)).toBeVisible();
});
