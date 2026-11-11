import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { act, useState } from "react";
import { layoutSizes } from "@index/design-tokens";
import { ContextPanel, WorkspaceLayout, WorkspaceSurface, useWorkspaceSurfaceSize } from "../src/index.ts";
import { FullShell, cancelDialog, click, focus, keyDown, render, setViewportWidth } from "./helpers.tsx";

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T & Element>(selector) as T | null;

function presentation() {
  const context = q("[data-panel=context]");
  const inspector = q("[data-panel=inspector]");
  return {
    mode: q(".ixp-app-shell")?.getAttribute("data-layout-mode"),
    sidebar: q(".ixp-app-shell")?.getAttribute("data-sidebar"),
    context: context ? "docked" : q("dialog[aria-label='Бібліотека']") ? "drawer" : "absent",
    inspector: inspector ? "docked" : q("dialog[aria-label='Властивості']") ? "drawer" : "absent",
  };
}

test("Адаптивність: розподіл панелей на 1440 / 1280 / 1024 / 768 / 375 та 200% zoom", () => {
  const expected: Array<[number, ReturnType<typeof presentation>]> = [
    [1440, { mode: "wide", sidebar: "rail", context: "docked", inspector: "docked" }],
    [1280, { mode: "wide", sidebar: "rail", context: "docked", inspector: "docked" }],
    [1024, { mode: "large", sidebar: "rail", context: "docked", inspector: "drawer" }],
    [768, { mode: "medium", sidebar: "rail", context: "drawer", inspector: "drawer" }],
    [375, { mode: "compact", sidebar: "drawer", context: "drawer", inspector: "drawer" }],
    // 1440 px при zoom 200% = 720 CSS px.
    [720, { mode: "compact", sidebar: "drawer", context: "drawer", inspector: "drawer" }],
  ];
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  for (const [width, state] of expected) {
    setViewportWidth(width);
    assert.deepEqual(presentation(), state, `${width}px`);
  }
  unmount();
  setViewportWidth(1440);
});

test("Канонічна композиція: один AppShell, один FeedbackLayer, одна поверхня", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  assert.equal(document.querySelectorAll(".ixp-app-shell").length, 1);
  assert.equal(document.querySelectorAll(".ixp-feedback").length, 1);
  assert.equal(document.querySelectorAll("main").length, 1);
  assert.equal(document.querySelectorAll(".ixp-surface").length, 1);
  unmount();
});

test("Закріплена ContextPanel завжди відкрита: без кнопок згортання", () => {
  setViewportWidth(1440);
  function Fixture() {
    const [query, setQuery] = useState("бригада");
    return (
      <WorkspaceLayout contextLabel="Дерево" contextPanel={<ContextPanel title="Дерево" search={{ label: "Пошук", value: query, onChange: setQuery }} />}>
        <WorkspaceSurface variant="page" label="Сторінка">
          Вміст
        </WorkspaceSurface>
      </WorkspaceLayout>
    );
  }
  const { container, unmount } = render(<Fixture />);
  const panel = container.querySelector<HTMLElement>("[data-panel=context]")!;
  // Закріплена контекстна панель не згортається: ні × у панелі, ні перемикача деінде.
  assert.equal(panel.hidden, false);
  assert.equal(panel.querySelector("button[aria-label='Сховати: Дерево']"), null);
  assert.equal(document.querySelector(`button[aria-controls='${panel.id}']`) === null, true, "перемикача панелі немає");
  assert.equal(panel.querySelector("input")!.value, "бригада");
  unmount();
});

test("Без місця для закріпленої панелі (Drawer) перемикач контекстної панелі лишається в шапці", () => {
  setViewportWidth(375);
  const { unmount } = render(<FullShell />);
  assert.ok(document.querySelector(".ixp-header button[aria-label='Показати: Бібліотека']"));
  unmount();
});

test("Закриття закріпленого інспектора повертає фокус на перемикач у заголовку", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  const inspector = q("[data-panel=inspector]")!;
  const field = [...inspector.querySelectorAll("button")].find((button) => button.textContent === "Поле інспектора")!;
  focus(field);
  click(inspector.querySelector("button[aria-label='Закрити інспектор']")!);
  assert.equal(inspector.hidden, true);
  const toggle = document.activeElement!;
  assert.equal(toggle.getAttribute("aria-label"), "Показати: Властивості");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), inspector.id);
  click(toggle);
  assert.equal(inspector.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  unmount();
});

test("Інспектор не займає місце без вибору і відкривається, коли споживач його відкриває", () => {
  setViewportWidth(1440);
  const { rerender, unmount } = render(<FullShell inspectorOpen={false} />);
  assert.equal(q<HTMLElement>("[data-panel=inspector]")!.hidden, true);
  rerender(<FullShell inspectorOpen />);
  assert.equal(q<HTMLElement>("[data-panel=inspector]")!.hidden, false);
  unmount();
});

test("Drawer інспектора: відкривається новим вибором, Escape закриває й повертає фокус", () => {
  setViewportWidth(1024);
  function Fixture() {
    const [selected, setSelected] = useState<string | null>("a");
    const [open, setOpen] = useState(true);
    return (
      <FullShell inspectorOpen={open} inspectorKey={selected ?? undefined} onInspectorOpenChange={setOpen}>
        <WorkspaceSurface variant="canvas" label="Полотно">
          <button
            type="button"
            onClick={() => {
              setSelected("b");
              setOpen(true);
            }}
          >
            Вибрати B
          </button>
        </WorkspaceSurface>
      </FullShell>
    );
  }
  const { unmount } = render(<Fixture />);
  const dialog = q<HTMLDialogElement>("dialog[aria-label='Властивості']")!;
  assert.equal(dialog.open, false, "вже вибраний об'єкт не відкриває модальний шар сам");
  const trigger = [...document.querySelectorAll("button")].find((button) => button.textContent === "Вибрати B")!;
  focus(trigger);
  click(trigger);
  assert.equal(dialog.open, true);
  assert.ok(dialog.contains(document.activeElement), "фокус переходить у Drawer");
  cancelDialog(dialog);
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger, "фокус повернувся на елемент, що відкрив Drawer");
  unmount();
  setViewportWidth(1440);
});

test("Drawer навігації на 375 px: кнопка меню відкриває, перехід за пунктом закриває", () => {
  setViewportWidth(375);
  const { unmount } = render(<FullShell />);
  const menu = q<HTMLButtonElement>("button[aria-label='Відкрити навігацію']")!;
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  focus(menu);
  click(menu);
  const dialog = q<HTMLDialogElement>("dialog[aria-label='Головна навігація']")!;
  assert.equal(dialog.open, true);
  assert.equal(menu.getAttribute("aria-expanded"), "true");
  const link = dialog.querySelector<HTMLAnchorElement>("a[href='#/data']")!;
  click(link);
  assert.equal(dialog.open, false);
  unmount();
  setViewportWidth(1440);
});

test("Зміна ширини панелі з клавіатури: крок 16 px, межі з токенів, напрямок для інспектора", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  const [contextSeparator, inspectorSeparator] = [...document.querySelectorAll<HTMLElement>("[role=separator][aria-valuenow]")];
  focus(contextSeparator!);
  for (let index = 0; index < 3; index += 1) keyDown(contextSeparator!, "ArrowRight");
  assert.equal(contextSeparator!.getAttribute("aria-valuenow"), String(layoutSizes["context-panel-width"] + 48));
  keyDown(contextSeparator!, "End");
  assert.equal(contextSeparator!.getAttribute("aria-valuenow"), String(layoutSizes["panel-max-width"]));
  keyDown(contextSeparator!, "ArrowRight");
  assert.equal(contextSeparator!.getAttribute("aria-valuenow"), String(layoutSizes["panel-max-width"]), "не більше максимуму");
  keyDown(contextSeparator!, "Home");
  assert.equal(contextSeparator!.getAttribute("aria-valuenow"), String(layoutSizes["panel-min-width"]));
  // Межа інспектора — ліворуч від нього: стрілка вліво розширює.
  keyDown(inspectorSeparator!, "ArrowLeft");
  assert.equal(inspectorSeparator!.getAttribute("aria-valuenow"), String(layoutSizes["inspector-width"] + 16));
  const style = q<HTMLElement>(".ixp-workspace__body")!.style;
  assert.equal(style.getPropertyValue("--ixp-context-width"), `${layoutSizes["panel-min-width"]}px`);
  unmount();
});

test("Власники прокрутки: панелі й сторінка — ScrollArea, canvas/table — сам вміст, без вкладених ScrollArea", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell defaultInspectorOpen />);
  for (const panel of document.querySelectorAll("[data-panel]")) {
    assert.ok(panel.querySelector(".ixp-panel__body.ix-scroll-area"), "тіло панелі — канонічний ScrollArea");
  }
  const surface = q(".ixp-surface")!;
  assert.equal(surface.getAttribute("data-scroll-owner"), "content");
  assert.equal(surface.querySelector(".ix-scroll-area"), null, "canvas не отримує ScrollArea");
  for (const area of document.querySelectorAll(".ix-scroll-area")) {
    assert.equal(area.querySelector(".ix-scroll-area"), null, "вкладена вертикальна прокрутка");
  }
  unmount();

  const page = render(
    <WorkspaceLayout>
      <WorkspaceSurface variant="page" label="Сторінка">
        Текст
      </WorkspaceSurface>
    </WorkspaceLayout>,
  );
  assert.equal(page.container.querySelector(".ixp-surface")!.getAttribute("data-scroll-owner"), "surface");
  assert.ok(page.container.querySelector(".ixp-surface .ix-scroll-area > [role='region'][aria-label='Сторінка']"));
  page.unmount();
});

test("Контракт canvas: розмір поверхні надходить через useWorkspaceSurfaceSize", () => {
  type Callback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
  // Спостерігачів кілька (режим layout теж слухає <html>), тому зберігаємо їх за елементом.
  const observed = new Map<Element, Callback>();
  class FakeResizeObserver {
    readonly #callback: Callback;
    constructor(cb: Callback) {
      this.#callback = cb;
    }
    observe(element: Element): void {
      observed.set(element, this.#callback);
    }
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: FakeResizeObserver });
  const seen: string[] = [];
  function Canvas() {
    const size = useWorkspaceSurfaceSize();
    seen.push(size ? `${size.width}x${size.height}` : "null");
    return null;
  }
  const { unmount } = render(
    <WorkspaceLayout>
      <WorkspaceSurface variant="canvas" label="Полотно">
        <Canvas />
      </WorkspaceSurface>
    </WorkspaceLayout>,
  );
  // Імітуємо зміну розміру після згортання панелі.
  const surface = observed.get(document.querySelector(".ixp-surface")!);
  assert.ok(surface, "поверхня спостерігається");
  act(() => surface([{ contentRect: { width: 550, height: 827 } }]));
  act(() => surface([{ contentRect: { width: 831, height: 827 } }]));
  unmount();
  Reflect.deleteProperty(globalThis, "ResizeObserver");
  assert.deepEqual(seen.filter((value, index) => value !== seen[index - 1]), ["null", "550x827", "831x827"]);
});

test("ContextPanel hideTitle: рядок заголовка не показується, назва лишається для зчитувача", () => {
  setViewportWidth(1440);
  const { unmount } = render(<FullShell contextPanel={<ContextPanel title="Компонування" hideTitle><button type="button">Дія</button></ContextPanel>} />);
  const panel = q<HTMLElement>("[data-panel=context]")!;
  assert.equal(panel.querySelector(".ixp-panel__header"), null, "вміст піднімається до верху панелі");
  const heading = panel.querySelector("h2")!;
  assert.equal(heading.textContent, "Компонування");
  assert.equal(panel.querySelector("section")!.getAttribute("aria-labelledby"), heading.id);
  unmount();
});
