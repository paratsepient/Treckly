import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs } from "../support.ts";

/** Демо-середовище: ролі за структурою від Голови до в/ч; вибір ролі веде на її початковий екран. */
test("демо: кнопка «Демо» відкриває ієрархію ролей, вибір ролі перемикає середовище", async ({ page }) => {
  await openAs(page, AUTHOR_A, "/property");
  await page.getByRole("button", { name: /Демо-середовище/ }).click();
  await expect(page).toHaveURL(/#\/demo$/);

  // Структура зверху вниз: заголовки вкладені за рівнями, в/ч — найглибше.
  await expect(page.getByRole("heading", { level: 2, name: "Відділ оборонних ресурсів і Голова" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /Напрямок/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 4, name: "РУ-1" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 5, name: "Бригада 1" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 6, name: "в/ч А0001" })).toBeVisible();

  // Поточна роль позначена; у в/ч — автор, уповноважений і командир.
  const unitRoles = page.getByRole("list", { name: "Ролі: в/ч А0001" });
  await expect(unitRoles.getByRole("button")).toHaveCount(3);
  await expect(unitRoles.getByRole("button", { name: /Автор заявок/ })).toHaveAttribute("aria-current", "true");

  // Вибір командира бригади: початковий екран — «Головна» з тим, що зараз потрібно зробити.
  await page.getByRole("list", { name: "Ролі: Бригада 1" }).getByRole("button", { name: /Командир бригади/ }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Головна" })).toBeVisible();
  await expect(page.getByText(/Командир бригади · Бригада 1/).first()).toBeVisible();
});
