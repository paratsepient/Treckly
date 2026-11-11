import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Button, IconButton } from "@index/ui";
import {
  AppShell,
  AppSidebar,
  ContextPanel,
  InspectorPanel,
  SaveStatus,
  WorkspaceHeader,
  WorkspaceToolbar,
  ToolbarSeparator,
  useFeedback,
  useInspector,
  MAX_VISIBLE_FEEDBACK,
} from "../src/index.ts";
import { click, focus, groups, keyDown, render, setViewportWidth, wait } from "./helpers.tsx";

const icon = <svg viewBox="0 0 16 16" />;

test("AppSidebar показує рівно передані пункти, активний маршрут має aria-current", () => {
  setViewportWidth(1440);
  const { container, unmount } = render(
    <AppShell sidebar={<AppSidebar brand={{ name: "IndeX" }} groups={groups} activeItemId="graph" roleContext={{ label: "Роль", value: "Оператор" }} user={{ name: "Оператор Демо", role: "Черговий", initials: "ОД" }} />}>
      <div />
    </AppShell>,
  );
  const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["#/structure", "#/graph", "#/data"]);
  assert.deepEqual(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("aria-label")), ["Граф (3)"]);
  assert.ok(container.textContent?.includes("Оператор Демо"));
  assert.ok(container.textContent?.includes("Роль"));
  unmount();
});

test("AppSidebar: стрілки переходять між пунктами, Home/End — до крайніх", () => {
  setViewportWidth(1440);
  const { container, unmount } = render(
    <AppShell sidebar={<AppSidebar brand={{ name: "IndeX" }} groups={groups} />}>
      <div />
    </AppShell>,
  );
  const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
  focus(links[0]!);
  keyDown(links[0]!, "ArrowDown");
  assert.equal(document.activeElement, links[1]);
  keyDown(links[1]!, "End");
  assert.equal(document.activeElement, links[2]);
  keyDown(links[2]!, "ArrowDown");
  assert.equal(document.activeElement, links[0], "по колу");
  unmount();
});

test("AppSidebar: колонка іконок — назви, лічильник і профіль доступні, перемикача немає", () => {
  setViewportWidth(1440);
  const { container, unmount } = render(
    <AppShell sidebar={<AppSidebar brand={{ name: "IndeX" }} groups={groups} activeItemId="graph" user={{ name: "Оператор Демо", initials: "ОД" }} />}>
      <div />
    </AppShell>,
  );
  assert.equal(container.querySelector(".ixp-app-shell")!.getAttribute("data-sidebar"), "rail");
  assert.equal(container.querySelector(".ixp-sidebar__label"), null, "підписів у колонці немає");
  assert.equal(container.querySelector("button[aria-label*='навігацію']"), null, "розгортання немає");
  const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
  assert.equal(links[0]!.getAttribute("aria-label"), "Структура");
  assert.equal(links[1]!.getAttribute("aria-label"), "Граф (3)", "лічильник входить у назву");
  assert.equal(links[1]!.getAttribute("aria-current"), "page");
  assert.ok(links[0]!.closest(".ix-tooltip-anchor"), "підпис доступний через канонічний Tooltip");
  assert.ok([...container.querySelectorAll(".ix-sr-only")].some((element) => element.textContent?.includes("Оператор Демо")));
  unmount();
});

test("AppSidebar: у Drawer на вузькому екрані — повний список з підписами", () => {
  setViewportWidth(375);
  const { container, unmount } = render(
    <AppShell sidebar={<AppSidebar brand={{ name: "IndeX" }} groups={groups} />}>
      <div />
    </AppShell>,
  );
  assert.equal(container.querySelector(".ixp-app-shell")!.getAttribute("data-sidebar"), "drawer");
  unmount();
});

test("WorkspaceHeader: шлях, назва, стан збереження й головна дія; read-only їх ховає", () => {
  const props = {
    title: "Граф підрозділу",
    breadcrumbs: [{ label: "Графи", href: "#/graph" }, { label: "Бригада 1" }],
    saveStatus: { state: "saved" as const, savedAt: "14:20" },
    primaryAction: <Button variant="primary">Зберегти</Button>,
  };
  const { container, rerender, unmount } = render(<WorkspaceHeader {...props} />);
  assert.equal(container.querySelector("h1")!.textContent, "Граф підрозділу");
  assert.equal(container.querySelector("nav[aria-label='Шлях'] ol")!.children.length, 2);
  assert.equal(container.querySelector("[role=status]")!.textContent, "Збережено о 14:20");
  assert.ok([...container.querySelectorAll("button")].some((button) => button.textContent === "Зберегти"));
  rerender(<WorkspaceHeader {...props} readOnly />);
  assert.ok(container.textContent?.includes("Лише перегляд"));
  assert.equal(container.querySelector("[role=status]"), null);
  assert.ok(![...container.querySelectorAll("button")].some((button) => button.textContent === "Зберегти"));
  unmount();
});

test("SaveStatus: стани й повторна спроба", () => {
  let retries = 0;
  const { container, rerender, unmount } = render(<SaveStatus state="saving" />);
  assert.equal(container.textContent, "Збереження…");
  rerender(<SaveStatus state="dirty" />);
  assert.equal(container.textContent, "Є незбережені зміни");
  rerender(<SaveStatus state="error" onRetry={() => (retries += 1)} />);
  click(container.querySelector("button")!);
  assert.equal(retries, 1);
  assert.equal(container.querySelector("[role=status]")!.getAttribute("data-state"), "error");
  unmount();
});

function FeedbackProbe({ onReady }: { readonly onReady: (api: ReturnType<typeof useFeedback>) => void }) {
  onReady(useFeedback());
  return null;
}

test("FeedbackLayer: дедуплікація за ключем, помилка з повторною спробою, ліміт видимих", async () => {
  setViewportWidth(1440);
  let api: ReturnType<typeof useFeedback> | undefined;
  const { container, unmount } = render(
    <AppShell sidebar={<div />}>
      <FeedbackProbe onReady={(value) => (api = value)} />
    </AppShell>,
  );
  const items = () => [...container.querySelectorAll(".ixp-feedback__item")];
  await wait(0);
  let retried = 0;
  // Два контейнери повідомляють про ту саму подію — показано одне повідомлення.
  await wait(0).then(() => {
    api!.notify({ key: "save:graph", tone: "saving", title: "Збереження…" });
    api!.notify({ key: "save:graph", tone: "error", title: "Не вдалося зберегти", action: { label: "Повторити", onAction: () => (retried += 1) } });
  });
  await wait(0);
  assert.equal(items().length, 1);
  assert.equal(items()[0]!.getAttribute("data-tone"), "error");
  assert.ok(items()[0]!.closest("[aria-live='assertive']"), "помилка оголошується одразу");
  click([...items()[0]!.querySelectorAll("button")].find((button) => button.textContent === "Повторити")!);
  assert.equal(retried, 1);
  for (let index = 0; index < 5; index += 1) api!.notify({ key: `info:${index}`, tone: "info", title: `Подія ${index}` });
  await wait(0);
  assert.equal(items().length, MAX_VISIBLE_FEEDBACK);
  api!.notify({ key: "done", tone: "success", title: "Готово", duration: 20 });
  await wait(0);
  assert.ok(items().some((item) => item.textContent?.includes("Готово")));
  await wait(60);
  assert.ok(!items().some((item) => item.textContent?.includes("Готово")), "успіх зникає автоматично");
  unmount();
});

test("WorkspaceToolbar: одна Tab-зупинка, стрілки, неактивні пропускаються", () => {
  const { container, unmount } = render(
    <WorkspaceToolbar label="Інструменти">
      <IconButton label="Перший" icon={icon} />
      <IconButton label="Неактивний" icon={icon} disabled />
      <ToolbarSeparator />
      <IconButton label="Третій" icon={icon} />
    </WorkspaceToolbar>,
  );
  const toolbar = container.querySelector("[role=toolbar]")!;
  assert.equal(toolbar.getAttribute("aria-label"), "Інструменти");
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  assert.deepEqual(buttons.map((button) => button.tabIndex), [0, -1]);
  focus(buttons[0]!);
  keyDown(buttons[0]!, "ArrowRight");
  assert.equal(document.activeElement, buttons[1]);
  assert.deepEqual(buttons.map((button) => button.tabIndex), [-1, 0]);
  keyDown(buttons[1]!, "Home");
  assert.equal(document.activeElement, buttons[0]);
  unmount();
});

test("ContextPanel: стани даних через DataState, повторна спроба для збою", () => {
  let retries = 0;
  const { container, rerender, unmount } = render(<ContextPanel title="Форми" status="loading" />);
  assert.equal(container.querySelector("[role=status]")!.getAttribute("aria-busy"), "true");
  rerender(<ContextPanel title="Форми" status="empty" emptyText="Форм немає." />);
  assert.ok(container.textContent?.includes("Форм немає."));
  assert.equal(container.querySelector(".ix-data-state")!.getAttribute("data-kind"), "empty");
  assert.ok(container.querySelector(".ix-data-state__icon svg"), "стан має іконку, не лише текст");
  rerender(<ContextPanel title="Форми" status="error" onRetry={() => (retries += 1)} />);
  assert.ok(container.querySelector("[role=alert]"));
  click(container.querySelector("[role=alert] button")!);
  assert.equal(retries, 1);
  // Недоступне джерело — теж збій із повторною спробою; відсутність доступу — без неї.
  rerender(<ContextPanel title="Форми" status="unavailable" errorText="Сервер підрозділу недоступний." onRetry={() => (retries += 1)} />);
  assert.ok(container.textContent?.includes("Сервер підрозділу недоступний."));
  click(container.querySelector("[role=alert] button")!);
  assert.equal(retries, 2);
  rerender(<ContextPanel title="Форми" status="denied" onRetry={() => (retries += 1)} />);
  assert.equal(container.querySelector(".ix-data-state")!.getAttribute("data-kind"), "denied");
  assert.equal(container.querySelector(".ix-data-state button"), null);
  assert.ok(container.querySelector(".ixp-panel__body.ix-scroll-area > [role='region'][aria-label='Вміст: Форми']"));
  unmount();
});

function ReadOnlyProbe() {
  const { readOnly } = useInspector();
  return <p>{readOnly ? "режим перегляду" : "редагування"}</p>;
}

test("InspectorPanel: вкладки з @index/ui, sticky actions, read-only і порожній стан", () => {
  const tabs = [
    { value: "props", label: "Властивості", content: <ReadOnlyProbe /> },
    { value: "access", label: "Доступ", content: <p>Доступ</p> },
  ];
  const { container, rerender, unmount } = render(<InspectorPanel title="Нода" tabs={tabs} actions={<Button>Застосувати</Button>} />);
  assert.equal(container.querySelectorAll("[role=tab]").length, 2);
  assert.ok(container.querySelector(".ixp-panel__footer")?.textContent?.includes("Застосувати"));
  assert.ok(container.textContent?.includes("редагування"));
  // Вкладки поза прокруткою, вміст — у ній.
  assert.equal(container.querySelector(".ixp-panel__body [role=tablist]"), null);
  assert.ok(container.querySelector(".ixp-panel__body [role=tabpanel]"));
  rerender(<InspectorPanel title="Нода" tabs={tabs} actions={<Button>Застосувати</Button>} readOnly />);
  assert.ok(container.textContent?.includes("режим перегляду"));
  assert.equal(container.querySelector(".ixp-panel__footer"), null, "дії приховані в режимі перегляду");
  rerender(<InspectorPanel title="Нода" tabs={tabs} empty />);
  assert.ok(container.textContent?.includes("Виберіть об'єкт"));
  unmount();
});
