import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, row, switchTo } from "../support.ts";

/** Запланований перелік закупівель: кожен рівень бачить план своєї зони відповідальності; автор — ні. */
test("запланований перелік: Відділ бачить увесь напрямок, уповноважений в/ч — свою в/ч, автор — нічого", async ({ page }) => {
  await openAs(page, "prep-5-vor", "/queue");
  await page.getByRole("link", { name: "Запланований перелік" }).click();
  await expect(page).toHaveURL(/#\/planned$/);

  const table = page.getByRole("table", { name: "Запланований перелік закупівель" });
  await expect(table).toBeVisible();
  // Виконання плану: «Виконано» й ті самі стани в гривнях, що на смугах позицій.
  const summary = page.getByRole("region", { name: "Виконання плану в гривнях" });
  await expect(summary.getByText(/виконано · куплено на/)).toBeVisible();
  for (const label of ["Куплено, грн", "Затверджено, грн", "У заявках, грн", "Згідно плану, грн"]) await expect(summary.getByText(label)).toBeVisible();
  await expect(row(page, /Рюкзак польовий/).getByRole("img", { name: /Куплено 10 шт\./ })).toBeVisible();

  // КЕКВ-фільтр звужує перелік.
  await expect(row(page, /Квадрокоптер розвідувальний/)).toBeVisible();
  const before = await table.getByRole("row").count();
  await page.getByLabel("КЕКВ").selectOption("3110");
  await expect.poll(async () => table.getByRole("row").count()).toBeLessThan(before);

  // Квадрокоптер: план напрямку, стани плану й розбивка по в/ч у картці.
  await row(page, /Квадрокоптер розвідувальний/).getByRole("button", { name: "Квадрокоптер розвідувальний" }).click();
  const card = page.getByRole("complementary", { name: "Розбивка позиції по в/ч" });
  await expect(card.getByText("План за напрямком")).toBeVisible();
  await expect(card.getByText("У заявках")).toBeVisible();
  await expect(card.getByRole("list", { name: /Заплановано по в\/ч/ }).getByText("в/ч А0001")).toBeVisible();

  // Уповноважений в/ч бачить лише план своєї в/ч.
  await switchTo(page, "prep-1-unit-a", "/queue");
  await page.getByRole("link", { name: "Запланований перелік" }).click();
  await expect(page.getByText(/^в\/ч А0001 · \d+ позицій/)).toBeVisible();

  // Автор пункту меню не має, а за адресою його повертає на його екран.
  await switchTo(page, AUTHOR_A, "/planned");
  await expect(page).toHaveURL(/#\/$/);
});
