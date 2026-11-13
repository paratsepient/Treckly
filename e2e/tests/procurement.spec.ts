import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, requestCard, switchTo, toast } from "../support.ts";

/** Після підпису Голови: Відділ оборонних ресурсів підтверджує закупівлю, видає нове актом; автор бачить статус і майно. */
test("закупівля й видача: «Куплено, на базі» → «Видано в/ч», майно в/ч оновлюється", async ({ page }) => {
  await openAs(page, "prep-5-vor", "/queue");
  await page.getByRole("link", { name: "Закупівлі й видача" }).click();
  await expect(page).toHaveURL(/#\/procurement$/);
  const card = page.getByRole("article", { name: /ЗМ-0001/ });
  await expect(card).toBeVisible();

  // Підтвердження: документ приймання й отримувач обов'язкові, кількість — як у заявці.
  await card.getByRole("button", { name: "Підтвердити закупівлю…" }).click();
  const dialog = page.getByRole("dialog", { name: /Підтвердити закупівлю ЗМ-0001/ });
  await dialog.getByLabel("Документ приймання").fill("АП-2027-17");
  await dialog.getByRole("button", { name: "Підтвердити закупівлю" }).click();
  await expect(toast(page, "ЗМ-0001: закупівлю підтверджено")).toBeVisible();

  // На складі бази: видача одним актом.
  await page.getByRole("radio", { name: /На складі бази/ }).check({ force: true });
  await page.getByRole("article", { name: /ЗМ-0001/ }).getByRole("button", { name: "Видати актом…" }).click();
  const issue = page.getByRole("dialog", { name: /Видати нове за ЗМ-0001/ });
  await issue.getByLabel("Номер акта видачі").fill("АВ-5");
  await issue.getByRole("button", { name: "Видати" }).click();
  await expect(toast(page, "ЗМ-0001: нове видано")).toBeVisible();

  // Автор бачить «Видано в/ч» і сповіщення.
  await switchTo(page, AUTHOR_A, "/my");
  await expect(requestCard(page, /ЗМ-0001/)).toContainText("Видано в/ч");
  await page.goto("/#/notifications");
  await expect(page.getByText(/ЗМ-0001: нове видано в\/ч/)).toBeVisible();
});
