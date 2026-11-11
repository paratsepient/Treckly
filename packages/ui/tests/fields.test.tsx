import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { Input, Select, Textarea } from "../src/index.ts";
import { render } from "./helpers.tsx";

test("Input: мітка пов'язана з полем", () => {
  const { container, unmount } = render(<Input label="Позивний" />);
  const input = container.querySelector("input")!;
  const label = container.querySelector("label")!;
  assert.ok(input.id);
  assert.equal(label.htmlFor, input.id);
  assert.equal(label.textContent, "Позивний");
  unmount();
});

test("Input: опис і помилка в aria-describedby, помилка вмикає aria-invalid", () => {
  const { container, unmount } = render(
    <Input label="Код" description="4 символи" error="Невірний формат" aria-describedby="external" />,
  );
  const input = container.querySelector("input")!;
  const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
  assert.equal(ids[0], "external", "зовнішній id зберігається");
  const texts = ids.slice(1).map((id) => document.getElementById(id)?.textContent);
  assert.deepEqual(texts, ["4 символи", "Невірний формат"]);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(container.querySelector(".ix-field")!.hasAttribute("data-invalid"));
  unmount();
});

test("Input: без помилки aria-invalid відсутній", () => {
  const { container, unmount } = render(<Input label="Назва" />);
  assert.equal(container.querySelector("input")!.getAttribute("aria-invalid"), null);
  unmount();
});

test("Input: required задає нативний атрибут, зірочка прихована від зчитувача", () => {
  const { container, unmount } = render(<Input label="Назва" required />);
  assert.equal(container.querySelector("input")!.required, true);
  assert.equal(container.querySelector(".ix-field__required")!.getAttribute("aria-hidden"), "true");
  unmount();
});

test("Input: hideLabel лишає мітку доступною", () => {
  const { container, unmount } = render(<Input label="Пошук" hideLabel type="search" />);
  const label = container.querySelector("label")!;
  assert.ok(label.classList.contains("ix-sr-only"));
  assert.equal(label.htmlFor, container.querySelector("input")!.id);
  unmount();
});

test("Textarea: та сама модель мітки й помилки", () => {
  const { container, unmount } = render(<Textarea label="Коментар" error="Порожньо" />);
  const textarea = container.querySelector("textarea")!;
  assert.equal(container.querySelector("label")!.htmlFor, textarea.id);
  assert.equal(textarea.getAttribute("aria-invalid"), "true");
  assert.equal(textarea.rows, 4);
  unmount();
});

test("Select: нативний select з міткою і placeholder за замовчуванням", () => {
  const { container, unmount } = render(
    <Select label="Підрозділ" placeholder="Оберіть підрозділ" required>
      <option value="a">Підрозділ А</option>
      <option value="b">Підрозділ Б</option>
    </Select>,
  );
  const select = container.querySelector("select")!;
  assert.equal(container.querySelector("label")!.htmlFor, select.id);
  assert.equal(select.value, "");
  assert.equal(select.options[0]!.disabled, true);
  assert.equal(select.options[0]!.textContent, "Оберіть підрозділ");
  assert.equal(container.querySelector(".ix-select__chevron")!.getAttribute("aria-hidden"), "true");
  unmount();
});

test("Select: явне defaultValue має пріоритет над placeholder", () => {
  const { container, unmount } = render(
    <Select label="Підрозділ" placeholder="Оберіть" defaultValue="b">
      <option value="a">А</option>
      <option value="b">Б</option>
    </Select>,
  );
  assert.equal(container.querySelector("select")!.value, "b");
  unmount();
});
