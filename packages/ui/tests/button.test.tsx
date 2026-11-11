import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Button, IconButton } from "../src/index.ts";
import { click, focus, keyDown, render } from "./helpers.tsx";

const Icon = () => (
  <svg viewBox="0 0 16 16">
    <path d="M2 8h12" />
  </svg>
);

test("Button: нейтральний варіант і type=button за замовчуванням", () => {
  const { container, unmount } = render(<Button>Зберегти</Button>);
  const button = container.querySelector("button")!;
  assert.equal(button.dataset["variant"], "secondary");
  assert.equal(button.type, "button");
  unmount();
});

test("Button: клік викликає обробник", () => {
  let clicks = 0;
  const { container, unmount } = render(<Button onClick={() => (clicks += 1)}>Дія</Button>);
  click(container.querySelector("button")!);
  assert.equal(clicks, 1);
  unmount();
});

test("Button: disabled не викликає обробник", () => {
  let clicks = 0;
  const { container, unmount } = render(
    <Button disabled onClick={() => (clicks += 1)}>
      Дія
    </Button>,
  );
  click(container.querySelector("button")!);
  assert.equal(clicks, 0);
  unmount();
});

test("Button: loading блокує дію, але лишає кнопку у фокусі", () => {
  let clicks = 0;
  const { container, unmount } = render(
    <Button loading onClick={() => (clicks += 1)}>
      Зберегти
    </Button>,
  );
  const button = container.querySelector("button")!;
  assert.equal(button.getAttribute("aria-busy"), "true");
  assert.equal(button.getAttribute("aria-disabled"), "true");
  assert.equal(button.disabled, false, "loading не повинен вибивати кнопку з Tab-послідовності");
  focus(button);
  assert.equal(document.activeElement, button);
  click(button);
  assert.equal(clicks, 0);
  assert.match(button.textContent ?? "", /Виконується/);
  assert.ok(button.querySelector(".ix-spinner"), "індикатор завантаження");
  unmount();
});

test("Button: loading у формі не надсилає форму", () => {
  let submits = 0;
  const { container, unmount } = render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submits += 1;
      }}
    >
      <Button type="submit" loading>
        Надіслати
      </Button>
    </form>,
  );
  click(container.querySelector("button")!);
  assert.equal(submits, 0);
  unmount();
});

test("IconButton: доступна назва з label, підказка не дублюється в описі", () => {
  const { container, unmount } = render(<IconButton label="Видалити" icon={<Icon />} />);
  const button = container.querySelector("button")!;
  assert.equal(button.getAttribute("aria-label"), "Видалити");
  assert.equal(button.dataset["variant"], "ghost");
  assert.equal(button.getAttribute("aria-describedby"), null);
  const tooltip = document.querySelector('[role="tooltip"]')!;
  assert.equal(tooltip.getAttribute("aria-hidden"), "true");
  assert.equal(tooltip.textContent, "Видалити");
  unmount();
});

test("IconButton: фокус показує підказку, Escape ховає без втрати фокуса", () => {
  const { container, unmount } = render(<IconButton label="Фільтр" icon={<Icon />} />);
  const button = container.querySelector("button")!;
  const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  assert.equal(tooltip.hidden, true);
  focus(button);
  assert.equal(tooltip.hidden, false);
  keyDown(button, "Escape");
  assert.equal(tooltip.hidden, true);
  assert.equal(document.activeElement, button);
  unmount();
});

test("Button: destructive — окремий варіант на токенах action-destructive", () => {
  const { container, unmount } = render(<Button variant="destructive">Видалити</Button>);
  assert.equal(container.querySelector("button")!.dataset["variant"], "destructive");
  unmount();
});

test("Контроли підключають спільну пульсацію фокуса", () => {
  const { container, unmount } = render(<Button>Дія</Button>);
  const button = container.querySelector("button")!;
  assert.ok(button.classList.contains("ix-focus-pulse"));
  assert.equal(button.querySelector(":scope > .ix-focus-pulse__glow")?.getAttribute("aria-hidden"), "true");
  unmount();
});
