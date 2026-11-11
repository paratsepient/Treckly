import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Button, ScrollArea, Tooltip } from "../src/index.ts";
import { blur, focus, keyDown, pointer, render, wait } from "./helpers.tsx";

test("Tooltip: прихований за замовчуванням, тригер описаний підказкою", () => {
  const { container, unmount } = render(
    <Tooltip content="Останнє оновлення 14:20">
      <Button aria-describedby="hint">Статус</Button>
    </Tooltip>,
  );
  const button = container.querySelector("button")!;
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  assert.equal(tooltip.hidden, true);
  assert.deepEqual(button.getAttribute("aria-describedby")!.split(" "), ["hint", tooltip.id]);
  unmount();
});

test("Tooltip: фокус показує, blur ховає", () => {
  const { container, unmount } = render(
    <Tooltip content="Підказка">
      <Button>Тригер</Button>
    </Tooltip>,
  );
  const button = container.querySelector("button")!;
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  focus(button);
  assert.equal(tooltip.hidden, false);
  blur(button);
  assert.equal(tooltip.hidden, true);
  unmount();
});

test("Tooltip: наведення показує після затримки і тримається при переході на підказку", async () => {
  const { container, unmount } = render(
    <Tooltip content="Підказка" delay={20}>
      <Button>Тригер</Button>
    </Tooltip>,
  );
  const anchor = container.querySelector(".ix-tooltip-anchor")!;
  const button = container.querySelector("button")!;
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  pointer(button, "pointerover");
  assert.equal(tooltip.hidden, true, "не відкривається миттєво");
  await wait(40);
  assert.equal(tooltip.hidden, false);
  // Підказка в порталі, але в дереві React вона нащадок обгортки: перехід на неї не є pointerleave.
  pointer(button, "pointerout", tooltip);
  pointer(tooltip, "pointerover", button);
  await wait(200);
  assert.equal(tooltip.hidden, false, "підказка лишається, поки вказівник на ній");
  pointer(anchor, "pointerout", document.body);
  await wait(200);
  assert.equal(tooltip.hidden, true);
  unmount();
});

test("Tooltip: Escape закриває підказку, відкриту наведенням", async () => {
  const { container, unmount } = render(
    <Tooltip content="Підказка" delay={0}>
      <Button>Тригер</Button>
    </Tooltip>,
  );
  const button = container.querySelector("button")!;
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  pointer(button, "pointerover");
  assert.equal(tooltip.hidden, false);
  keyDown(document.body, "Escape");
  assert.equal(tooltip.hidden, true);
  unmount();
});

test("ScrollArea: фокусована іменована область без обмеження overscroll", () => {
  const { container, unmount } = render(
    <ScrollArea label="Журнал подій" maxHeight="200px">
      <p>Рядок</p>
    </ScrollArea>,
  );
  const region = container.querySelector<HTMLElement>('[role="region"]')!;
  assert.equal(region.getAttribute("aria-label"), "Журнал подій");
  assert.equal(region.tabIndex, 0);
  const root = region.closest<HTMLElement>(".ix-scroll-area")!;
  assert.equal(root.dataset["orientation"], "vertical");
  assert.equal(root.style.maxHeight, "200px");
  // Смуга — поруч з областю (поза її рамкою), декоративна для зчитувача.
  const bar = root.querySelector(":scope > .ix-scroll-area__bar")!;
  assert.equal(bar.getAttribute("aria-hidden"), "true");
  assert.equal(region.contains(bar), false);
  assert.equal(region.style.overscrollBehavior, "", "компонент не задає overscroll-behavior інлайн");
  unmount();
});

test("Tooltip: рендериться порталом поза контейнером з overflow", () => {
  const { container, unmount } = render(
    <div style={{ overflow: "hidden" }}>
      <Tooltip content="Поза межами">
        <Button>Тригер</Button>
      </Tooltip>
    </div>,
  );
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  assert.equal(container.contains(tooltip), false);
  assert.equal(tooltip.parentElement, document.body);
  unmount();
  assert.equal(document.querySelector('[role="tooltip"]'), null, "портал прибирається при демонтажі");
});

test("Tooltip: успадковує тему найближчого [data-theme] тригера", () => {
  const { container, unmount } = render(
    <div data-theme="dark">
      <Tooltip content="Темна підказка">
        <Button>Тригер</Button>
      </Tooltip>
    </div>,
  );
  focus(container.querySelector("button")!);
  assert.equal(document.querySelector('[role="tooltip"]')!.getAttribute("data-theme"), "dark");
  unmount();
});

test("Tooltip: усередині відкритого <dialog> монтується в сам діалог (top layer)", () => {
  const { container, unmount } = render(
    <dialog open>
      <Tooltip content="У діалозі">
        <Button>Тригер</Button>
      </Tooltip>
    </dialog>,
  );
  focus(container.querySelector("button")!);
  const tooltip = document.querySelector('[role="tooltip"]')!;
  assert.equal(tooltip.parentElement, container.querySelector("dialog"));
  unmount();
});
