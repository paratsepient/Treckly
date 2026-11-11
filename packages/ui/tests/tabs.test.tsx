import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Tab, TabList, TabPanel, Tabs } from "../src/index.ts";
import { folderOutlinePath } from "../src/tabs/folder-outline.ts";
import { byRole, click, focus, keyDown, render } from "./helpers.tsx";

function Fixture({ activation }: { readonly activation?: "automatic" | "manual" }) {
  return (
    <Tabs defaultValue="one" activation={activation ?? "automatic"}>
      <TabList aria-label="Розділи">
        <Tab value="one">Огляд</Tab>
        <Tab value="two">Донесення</Tab>
        <Tab value="three" disabled>
          Архів
        </Tab>
        <Tab value="four">Налаштування</Tab>
      </TabList>
      <TabPanel value="one">Панель 1</TabPanel>
      <TabPanel value="two">Панель 2</TabPanel>
      <TabPanel value="three">Панель 3</TabPanel>
      <TabPanel value="four">Панель 4</TabPanel>
    </Tabs>
  );
}

const selected = (container: HTMLElement): string | undefined =>
  byRole<HTMLButtonElement>(container, "tab").find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent ?? undefined;

test("Tabs: за замовчуванням вигляд «папки» (variant=folder)", () => {
  const { container, unmount } = render(<Fixture />);
  assert.equal(container.querySelector('[role="tablist"]')!.getAttribute("data-variant"), "folder");
  unmount();
});

test("Tabs: ролі й зв'язки tab ↔ tabpanel", () => {
  const { container, unmount } = render(<Fixture />);
  const [list] = byRole(container, "tablist");
  assert.equal(list!.getAttribute("aria-label"), "Розділи");
  for (const tab of byRole(container, "tab")) {
    const panel = document.getElementById(tab.getAttribute("aria-controls")!)!;
    assert.equal(panel.getAttribute("role"), "tabpanel");
    assert.equal(panel.getAttribute("aria-labelledby"), tab.id);
  }
  unmount();
});

test("Tabs: roving tabindex — у Tab-послідовності лише вибрана вкладка", () => {
  const { container, unmount } = render(<Fixture />);
  const indexes = byRole<HTMLButtonElement>(container, "tab").map((tab) => tab.tabIndex);
  assert.deepEqual(indexes, [0, -1, -1, -1]);
  unmount();
});

test("Tabs: невибрані панелі приховані й порожні", () => {
  const { container, unmount } = render(<Fixture />);
  const panels = byRole<HTMLElement>(container, "tabpanel");
  assert.deepEqual(panels.map((panel) => panel.hidden), [false, true, true, true]);
  assert.equal(panels[1]!.textContent, "");
  unmount();
});

test("Tabs: стрілки рухають фокус і вибір, неактивна вкладка пропускається", () => {
  const { container, unmount } = render(<Fixture />);
  const tabs = byRole<HTMLButtonElement>(container, "tab");
  focus(tabs[0]!);
  keyDown(tabs[0]!, "ArrowRight");
  assert.equal(document.activeElement, tabs[1]);
  assert.equal(selected(container), "Донесення");
  keyDown(tabs[1]!, "ArrowRight");
  assert.equal(document.activeElement, tabs[3], "Архів неактивний");
  keyDown(tabs[3]!, "ArrowRight");
  assert.equal(document.activeElement, tabs[0], "перехід по колу");
  keyDown(tabs[0]!, "ArrowLeft");
  assert.equal(document.activeElement, tabs[3]);
  unmount();
});

test("Tabs: Home і End", () => {
  const { container, unmount } = render(<Fixture />);
  const tabs = byRole<HTMLButtonElement>(container, "tab");
  focus(tabs[0]!);
  const end = keyDown(tabs[0]!, "End");
  assert.equal(end.defaultPrevented, true, "сторінка не прокручується");
  assert.equal(document.activeElement, tabs[3]);
  keyDown(tabs[3]!, "Home");
  assert.equal(document.activeElement, tabs[0]);
  assert.equal(selected(container), "Огляд");
  unmount();
});

test("Tabs: manual — стрілки лише фокусують, вибір кліком/Enter", () => {
  const { container, unmount } = render(<Fixture activation="manual" />);
  const tabs = byRole<HTMLButtonElement>(container, "tab");
  focus(tabs[0]!);
  keyDown(tabs[0]!, "ArrowRight");
  assert.equal(document.activeElement, tabs[1]);
  assert.equal(selected(container), "Огляд");
  // Enter/Space на <button> браузер перетворює на click.
  click(tabs[1]!);
  assert.equal(selected(container), "Донесення");
  unmount();
});

test("Tabs: інші клавіші не перехоплюються", () => {
  const { container, unmount } = render(<Fixture />);
  const tabs = byRole<HTMLButtonElement>(container, "tab");
  focus(tabs[0]!);
  const event = keyDown(tabs[0]!, "Tab");
  assert.equal(event.defaultPrevented, false);
  unmount();
});

test("Tabs: у «папці» світіння фокуса вибраної вкладки зв'язане з панеллю", () => {
  const { container, unmount } = render(<Fixture />);
  const root = container.querySelector(".ix-tabs")!;
  const list = container.querySelector('[role="tablist"]')!;
  assert.ok(root.hasAttribute("data-pulse-group"));
  assert.ok(list.hasAttribute("data-pulse-links"), "folder зв'язує світіння");
  const triggers = [...container.querySelectorAll("[data-pulse-trigger]")];
  assert.deepEqual(triggers.map((tab) => tab.getAttribute("aria-selected")), ["true"], "тригер — лише вибрана вкладка");
  const panel = container.querySelector('[role="tabpanel"]:not([hidden])')!;
  assert.ok(panel.hasAttribute("data-pulse-link"));
  // Світіння «папки» — один шар по контуру (без окремих шарів панелі й вигинів): шви неможливі.
  const outline = root.querySelector(":scope > svg.ix-focus-pulse__outline")!;
  assert.equal(outline.getAttribute("aria-hidden"), "true");
  assert.equal(outline.querySelectorAll("path").length, 2, "смуга й ореол");
  assert.equal(panel.querySelector(".ix-focus-pulse__glow"), null);
  unmount();

  const line = render(
    <Tabs defaultValue="a">
      <TabList aria-label="Лінія" variant="line">
        <Tab value="a">А</Tab>
      </TabList>
      <TabPanel value="a">А</TabPanel>
    </Tabs>,
  );
  assert.equal(line.container.querySelector("[data-pulse-links]"), null, "line не зв'язує світіння");
  line.unmount();
});

test("Контур «папки»: вигини з обох боків; перша вкладка — без лівого вигину й кута", () => {
  const panel = { left: 0, top: 40, right: 300, bottom: 140 };
  const middle = folderOutlinePath({ left: 100, top: 0, right: 180, bottom: 42 }, panel, 10);
  // Увігнуті вигини (sweep 0): зліва до боку вкладки, справа — від боку до панелі.
  assert.match(middle, /H90A10 10 0 0 0 100 30/);
  assert.match(middle, /V30A10 10 0 0 0 190 40/);
  assert.match(middle, /^M0 130V50A10 10 0 0 1 10 40/, "лівий верхній кут панелі заокруглений");
  const first = folderOutlinePath({ left: 0, top: 0, right: 80, bottom: 42 }, panel, 10);
  assert.match(first, /^M0 130V10A10 10 0 0 1 10 0/, "лівий бік панелі й вкладки — одна пряма");
  assert.equal(first.match(/ 0 0 0 /g)?.length, 1, "лише правий вигин");
});
