import { expect, test } from "@playwright/test";
import { AUTHOR_A, openAs, requestCard, toast, registerRaport } from "../support.ts";

/**
 * E1. Автор створює заявку із заміною в іншому КЕКВ, бачить вплив на бюджет і подає.
 */
test("E1: заміна на інший КЕКВ — вплив на бюджет видно до подання, заявка потрапляє на рівень 1", async ({ page }) => {
  await openAs(page, AUTHOR_A, "/new");

  await page.getByRole("button", { name: "Додати рядок" }).click();

  // Автор бачить у виборі лише те, що заплановано на його в/ч: поз. 5 (антена направлена 5,8 ГГц) в плані в/ч А0001 немає.
  const positionSelect = page.getByLabel("Позиція, рядок 1");
  await expect(positionSelect.locator("option[value='pos-006']")).toHaveCount(1);
  await expect(positionSelect.locator("option[value='pos-005']")).toHaveCount(0);
  await page.getByLabel("Тип рядка 1").selectOption("replacement");
  await page.getByLabel("Позиція, рядок 1").selectOption("pos-006") // Антена всеспрямована 2,4 ГГц, КЕКВ 2210;
  await page.getByLabel("Замінити на, рядок 1").selectOption("item-104") // Антенна система мобільна, КЕКВ 3110;

  // Автоперевірки й бюджет: новий КЕКВ витрачається, старий не змінюється (вивільнення немає).
  const budget = page.getByRole("table", { name: /Залишок бюджету за КЕКВ/ });
  const row3110 = budget.getByRole("row", { name: /^3110/ });
  await expect(row3110).toContainText("+48 000");
  await expect(budget.getByRole("row", { name: /^2210/ })).not.toContainText("−");
  await expect(page.getByText("Перевірки пройдено")).toBeVisible();
  await expect(page.getByText(/Інший КЕКВ: списується з ліміту 3110/)).toBeVisible();

  // Без обґрунтування заявку не подати: автор пише лише його, решту рапорту дає шаблон.
  const submit = page.getByRole("button", { name: "Подати", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Обґрунтування потреби").fill("Антена в підрозділі зношена, потрібна мобільна система зв'язку.");

  // Рапорт за шаблоном: адресат, назва, позиції й обґрунтування на аркуші; Word завантажується.
  await page.getByRole("button", { name: "Переглянути рапорт" }).click();
  const dialog = page.getByRole("dialog", { name: /Рапорт ЗМ-/ });
  const sheet = dialog.frameLocator("iframe");
  await expect(sheet.getByText("РАПОРТ", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Командиру військової частини А0001")).toBeVisible();
  await expect(sheet.getByText("Антенна система мобільна", { exact: false })).toBeVisible();
  await expect(sheet.getByText(/мобільна система зв'язку/)).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Завантажити рапорт (Word)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Рапорт ЗМ-.+\.docx$/);
  await page.keyboard.press("Escape");

  // Назва заявки замість номера: кнопка поруч зі значком «і».
  await page.getByRole("button", { name: "Перейменувати заявку" }).click();
  const rename = page.getByRole("dialog", { name: "Перейменувати заявку" });
  await rename.getByLabel("Назва заявки").fill("Антени для відділу зв'язку");
  await rename.getByRole("button", { name: "Зберегти" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Антени для відділу зв'язку" })).toBeVisible();
  await expect(page.getByText(/Збережено о/)).toBeVisible({ timeout: 15_000 });

  await expect(submit).toBeEnabled();
  await submit.click();
  await registerRaport(page);
  await expect(toast(page, "Заявку подано")).toBeVisible();

  // Заявка в «Моїх заявках» на рівні 1; трек показує, що вона зараз там.
  await expect(page).toHaveURL(/#\/my\?selected=req-/);
  await expect(requestCard(page, /На рівні 1/).first()).toBeVisible();
  await expect(requestCard(page, /Антени для відділу зв'язку/)).toContainText("На рівні 1");
  const track = page.getByRole("list", { name: "Трек заявки за рівнями погодження" });
  await expect(track.getByRole("listitem").first()).toContainText("Зараз тут");
  await expect(track.getByRole("listitem").nth(1)).toContainText("Попереду");

  // Обґрунтування видно в картці заявки, рапорт можна відкрити й звідти.
  await page.getByRole("tab", { name: "Зміст" }).click();
  await expect(page.getByText(/мобільна система зв'язку/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Рапорт", exact: true })).toBeEnabled();
});
