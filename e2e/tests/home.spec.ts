import { expect, test } from "@playwright/test";
import { openAs, switchTo } from "../support.ts";

/** «Головна»: кожна роль одразу бачить, що від неї зараз потрібно, і переходить туди однією кнопкою. */
test("головна: що потрібно зробити — для автора, уповноваженого, керівника, Голови й адміністратора", async ({ page }) => {
  // Автор в/ч А0002: повернута заявка — першою й виділеною.
  await openAs(page, "author-unit-b", "/");
  const tasks = page.getByRole("list", { name: "Що потрібно зробити" });
  await expect(tasks.getByRole("listitem").first()).toContainText("Повернуто на доопрацювання");
  await expect(tasks.getByRole("button", { name: "Створити заявку" })).toBeVisible();

  // Уповноважений в/ч А0001: черга.
  await switchTo(page, "prep-1-unit-a", "/");
  await expect(tasks.getByRole("listitem").first()).toContainText("У черзі");
  await tasks.getByRole("button", { name: "До черги" }).first().click();
  await expect(page).toHaveURL(/#\/queue$/);

  // Командир в/ч А0001: перелік на погодження.
  await switchTo(page, "appr-1-unit-a", "/");
  await expect(tasks.getByRole("listitem").first()).toContainText("Переліків чекає вашого погодження: 1");

  // Голова: виконання плану.
  await switchTo(page, "appr-5-vor", "/");
  await expect(tasks.getByRole("listitem").first()).toContainText(/План виконано на/);

  // Адміністратор: користувачі й заміщення.
  await switchTo(page, "admin-demo", "/");
  await expect(tasks.getByRole("button", { name: "Заміщення" })).toBeVisible();
});
