import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, toast } from "../support.ts";

/**
 * E1. Автор створює заявку із заміною в іншому КЕКВ, бачить вплив на бюджет і подає.
 */
test("E1: заміна на інший КЕКВ — вплив на бюджет видно до подання, заявка потрапляє на рівень 1", async ({ page }) => {
  await openAs(page, AUTHOR_A, "/new");

  await page.getByRole("button", { name: "Додати рядок" }).click();
  await page.getByRole("radio", { name: "Заміна" }).first().check({ force: true });
  await page.getByLabel("Позиція, рядок 1").selectOption("pos-006") // Антена всеспрямована 2,4 ГГц, КЕКВ 2210;
  await page.getByLabel("Замінити на, рядок 1").selectOption("item-104") // Антенна система мобільна, КЕКВ 3110;

  // Автоперевірки й бюджет: новий КЕКВ витрачається, старий вивільняється.
  const budget = page.getByRole("table", { name: /Залишок бюджету за КЕКВ/ });
  const row3110 = budget.getByRole("row", { name: /^3110/ });
  await expect(row3110).toContainText("+48 000");
  await expect(budget.getByRole("row", { name: /^2210/ })).toContainText("−900");
  await expect(page.getByText("Перевірки пройдено")).toBeVisible();
  await expect(page.getByText(/Інший КЕКВ: списується з ліміту 3110/)).toBeVisible();

  await page.getByRole("button", { name: "Подати" }).click();
  await expect(toast(page, "Заявку подано")).toBeVisible();

  // Заявка в «Моїх заявках» на рівні 1; трек показує, що вона зараз там.
  await expect(page).toHaveURL(/#\/my\?selected=req-/);
  await expect(page.getByRole("row", { name: /На рівні 1/ }).first()).toBeVisible();
  const track = page.getByRole("list", { name: "Трек заявки за рівнями погодження" });
  await expect(track.getByRole("listitem").first()).toContainText("Зараз тут");
  await expect(track.getByRole("listitem").nth(1)).toContainText("Попереду");
});
