import { expect, test } from "@playwright/test";
import { AUTHOR_A, demoAction, openAs, requestCard, toast } from "../support.ts";

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
  await expect(requestCard(page, /Чернетка/)).toHaveCount(2);

  // «Скинути демо» видаляє всі рапорти — і чернетки, і подані, і затверджені; роль і тема лишаються.
  await demoAction(page, "Скинути демо");
  await page.getByRole("dialog", { name: "Скинути демо?" }).getByRole("button", { name: "Скинути все" }).click();
  await expect(toast(page, "Демо скинуто: рапортів немає")).toBeVisible();
  await page.goto("/#/my");
  await expect(page.getByText("Заявок ще немає")).toBeVisible();
  await page.goto("/#/final");
  await expect(page.getByText("Затверджених заявок ще немає")).toBeVisible();

  // «Заповнити прикладами» повертає демо-стан.
  await demoAction(page, "Заповнити прикладами");
  await page.getByRole("dialog", { name: "Заповнити демо прикладами?" }).getByRole("button", { name: "Заповнити" }).click();
  await expect(toast(page, "Демо заповнено прикладами")).toBeVisible();
  await page.goto("/#/my");
  await expect(requestCard(page, /Чернетка/)).toHaveCount(1);
  await expect(requestCard(page, /ЗМ-0001/)).toContainText("Чекає закупівлі");
});
