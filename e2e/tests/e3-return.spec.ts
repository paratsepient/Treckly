import { expect, test } from "@playwright/test";
import { AUTHOR_B, openAs, row, switchTo, toast, registerRaport } from "../support.ts";

/**
 * E3. На рівні 3 заявку повертають: автор і рівні 1–2 отримують сповіщення; автор виправляє
 * й подає нову версію, вона йде з першого рівня.
 */
test("E3: повернення на рівні 3 з каскадом сповіщень і нова версія з першого рівня", async ({ page }) => {
  await openAs(page, "prep-3-ru-1", "/queue");

  await row(page, /ЗМ-0003/).getByRole("button", { name: "Повернути…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Повернути автору" }).click();
  await expect(dialog.getByText(/Примітка обов'язкова/)).toBeVisible();
  await dialog.getByLabel("Примітка до повернення").fill("Не вміщується в КЕКВ 3110: приберіть квадрокоптер");
  await dialog.getByRole("button", { name: "Повернути автору" }).click();
  await expect(toast(page, "ЗМ-0003 повернуто автору")).toBeVisible();

  // Сповіщення: автор — «повернуто вам» з приміткою; рівні 2 і 1 — «повернуто автору»; рівень 4 нічого не отримує.
  await switchTo(page, AUTHOR_B, "/notifications");
  await expect(page.getByText("ЗМ-0003: заявку повернуто вам")).toBeVisible();
  await expect(page.getByText(/Примітка: Не вміщується в КЕКВ 3110/)).toBeVisible();
  await switchTo(page, "prep-2-brig-1", "/notifications");
  await expect(page.getByText("ЗМ-0003: заявку повернуто автору")).toBeVisible();
  await switchTo(page, "prep-1-unit-b", "/notifications");
  await expect(page.getByText("ЗМ-0003: заявку повернуто автору")).toBeVisible();
  await switchTo(page, "prep-4-dir-1", "/notifications");
  await expect(page.getByText("ЗМ-0003: заявку повернуто автору")).toHaveCount(0);

  // Автор виправляє: прибирає рядок, що не вміщується в бюджет, і подає нову версію.
  await switchTo(page, AUTHOR_B, "/my?selected=req-0003");
  await expect(page.getByText(/Не вміщується в КЕКВ 3110/).first()).toBeVisible();
  await page.getByRole("button", { name: "Виправити й подати" }).click();
  await expect(page.getByText(/Повернуто рівнем 3/)).toBeVisible();
  await page.getByRole("button", { name: /Видалити рядок 1/ }).click();
  const resubmit = page.getByRole("button", { name: "Подати нову версію" });
  await expect(resubmit).toBeEnabled({ timeout: 15_000 });
  await resubmit.click();
  await registerRaport(page);
  await expect(toast(page, "Нову версію подано")).toBeVisible();

  // Нова версія йде з першого рівня.
  await expect(page).toHaveURL(/#\/my\?selected=req-0003/);
  await expect(page.getByText("Версія 2 · На рівні 1")).toBeVisible();
  const track = page.getByRole("list", { name: "Трек заявки за рівнями погодження" });
  await expect(track.getByRole("listitem").first()).toContainText("Зараз тут");
  await expect(track.getByRole("listitem").nth(2)).toContainText("Попереду");
});
