import { expect, test } from "@playwright/test";
import { demoAction, openAs, row, switchTo, toast } from "../support.ts";

/**
 * E4. Перелік сформовано і розформовано; «Наступний день» надсилає нагадування.
 */
test("E4: розформування переліку, повторне формування і нагадування після «Наступного дня»", async ({ page }) => {
  await openAs(page, "prep-1-unit-a", "/queue");

  // У демо-даних є сформований перелік із ЗМ-0009: розформовуємо його.
  await expect(page.getByRole("article", { name: /Перелік від 09\.02\.2027/ })).toBeVisible();
  await page.getByRole("button", { name: "Розформувати" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Розформувати" }).click();
  await expect(toast(page, "Перелік розформовано")).toBeVisible();
  await expect(row(page, /ЗМ-0009/)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);

  // Заявка повернулась у чергу: формуємо перелік знову.
  await page.getByRole("checkbox", { name: "Обрати ЗМ-0009 до переліку" }).check();
  await page.getByRole("button", { name: "Сформувати перелік (1)" }).click();
  await expect(toast(page, "Перелік сформовано: заявок 1")).toBeVisible();

  // «Наступний день»: дата +1 і нагадування тим, у кого є заявки.
  await demoAction(page, "Наступний день");
  await expect(toast(page, /Наступний день: 16 лютого 2027/)).toBeVisible();
  await expect(page.getByText(/Сьогодні: 16 лютого 2027/)).toBeVisible();

  await switchTo(page, "prep-1-unit-a", "/notifications");
  await expect(page.getByText(/ЗМ-0010: заявка чекає на вашу дію/)).toBeVisible();
  await expect(page.getByText("Днів на рівні: 7").first()).toBeVisible();

  // Керівник отримує нагадування про перелік, що чекає на нього; автор повернутої заявки — про неї.
  await switchTo(page, "appr-1-unit-a", "/notifications");
  await expect(page.getByText(/заявка чекає на вашу дію/).first()).toBeVisible();
  await switchTo(page, "author-unit-b", "/notifications");
  await expect(page.getByText(/ЗМ-0004: заявка чекає на вашу дію/)).toBeVisible();
});
