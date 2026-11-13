import { expect, test } from "@playwright/test";
import { AUTHOR_C, openAs, requestCard, switchTo, toast } from "../support.ts";

/** Голова не підписав остаточний перелік: Відділ відмічає це з приміткою, заявка повертається автору з першого рівня. */
test("Голова не підписав: заявки переліку повертаються авторам із приміткою", async ({ page }) => {
  await openAs(page, "prep-5-vor", "/queue");
  await page.getByRole("checkbox", { name: "Обрати ЗМ-0007 до переліку" }).check();
  await page.getByRole("button", { name: "Сформувати перелік (1)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 1")).toBeVisible();

  const card = page.getByRole("article", { name: /Перелік від/ });
  await card.getByRole("button", { name: "Голова не підписав…" }).click();
  const dialog = page.getByRole("dialog", { name: "Голова не підписав перелік?" });
  const confirm = dialog.getByRole("button", { name: "Повернути авторам" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Чому не підписано").fill("Уточнити потребу в генераторах");
  await confirm.click();
  await expect(toast(page, "Відмічено: Голова не підписав")).toBeVisible();
  await expect(page.getByRole("article", { name: /Перелік від/ })).toHaveCount(0);

  await switchTo(page, AUTHOR_C, "/my");
  const returned = requestCard(page, "ЗМ-0007");
  await expect(returned).toContainText("На доопрацюванні");
  await page.goto("/#/notifications");
  await expect(page.getByText(/Голова не підписав перелік: Уточнити потребу в генераторах/).first()).toBeVisible();
});
