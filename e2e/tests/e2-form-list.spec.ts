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

  // Під таблицею — звірка заявки з переліком: за замовчуванням перша в черзі (ЗМ-0010), клік по рядку перемикає.
  const plan = page.getByRole("region", { name: "Звірка з Попереднім переліком" });
  await expect(plan.getByText("ЗМ-0010 · в/ч А0001")).toBeVisible();
  await expect(plan.getByText("Усе відповідає плану")).toBeVisible();
  await expect(plan.getByRole("row", { name: /Тепловізор/ })).toContainText("Відповідає");
  await page.getByRole("button", { name: /^ЗМ-[0-9A-Z]+$/ }).nth(1).click();
  await expect(plan.getByText("ЗМ-0010 · в/ч А0001")).toHaveCount(0);

  // Рапорт для ознайомлення відкриває кнопка з оком перед «Повернути…»; клік по рядку чи галочці його не відкриває.
  await picks.nth(1).check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await picks.nth(1).uncheck();
  await row(page, /ЗМ-0010/).getByText("в/ч А0001").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row(page, /ЗМ-0010/).getByRole("button", { name: "Переглянути рапорт ЗМ-0010" }).click();
  const raport = page.getByRole("dialog", { name: "Рапорт ЗМ-0010" });
  await expect(raport.getByText(/Рапорт для ознайомлення/)).toBeVisible();
  await expect(raport.frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  await raport.getByRole("button", { name: "Повернути…" }).waitFor();
  // Після читання заявку можна одразу додати до переліку: діалог закривається, заявка позначена в таблиці.
  await raport.getByRole("button", { name: "Додати до переліку" }).click();
  await expect(raport).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Обрати ЗМ-0010 до переліку" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Сформувати перелік (1)" })).toBeEnabled();
  await row(page, /ЗМ-0010/).getByRole("button", { name: "Переглянути рапорт ЗМ-0010" }).click();
  await page.getByRole("dialog", { name: "Рапорт ЗМ-0010" }).getByRole("button", { name: "Прибрати з переліку" }).click();
  await expect(page.getByRole("checkbox", { name: "Обрати ЗМ-0010 до переліку" })).not.toBeChecked();
  await picks.nth(1).check();
  await picks.nth(2).check();
  await page.getByRole("button", { name: "Сформувати перелік (2)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 2")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(1);

  // Керівник погоджує з числовим СЕДО; нечисловий номер відхиляється.
  await switchTo(page, "appr-1-unit-a", "/lists");
  await expect(page.getByRole("row", { name: /15\.02\.2027/ })).toBeVisible();

  // Керівник відкриває рапорт будь-якої заявки переліку для ознайомлення.
  await page.getByRole("button", { name: /^Переглянути рапорт ЗМ-/ }).first().click();
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

  // Погоджений перелік відкривається як документ, а з нього — рапорти його заявок.
  await page.getByRole("button", { name: /Переглянути перелік від 15\.02\.2027/ }).click();
  const listDoc = page.getByRole("dialog", { name: /Денний перелік в\/ч А0001/ });
  await expect(listDoc.frameLocator("iframe").getByText("ПЕРЕЛІК", { exact: true })).toBeVisible();
  await expect(listDoc.frameLocator("iframe").getByText(/СЕДО № 7500001/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Рапорт ЗМ-/ }).first().click();
  await expect(page.getByRole("dialog", { name: /Рапорт ЗМ-/ }).frameLocator("iframe").getByText("РАПОРТ", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Дві заявки пішли на рівень 2, третя лишилась на рівні 1.
  await switchTo(page, "prep-2-brig-1", "/queue");
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(3, { timeout: 15_000 });
  await switchTo(page, "prep-1-unit-a", "/queue");
  await expect(page.getByRole("checkbox", { name: /Обрати ЗМ-.* до переліку/ })).toHaveCount(1);
  await expect(row(page, /ЗМ-0010/)).toBeVisible();
});
