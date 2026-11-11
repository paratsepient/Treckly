import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { useState } from "react";
import { Checkbox, Radio, RadioGroup, Switch } from "../src/index.ts";
import { click, render } from "./helpers.tsx";

test("Checkbox: клік по мітці перемикає стан", () => {
  const { container, unmount } = render(<Checkbox label="Підтверджую" />);
  const input = container.querySelector("input")!;
  assert.equal(input.type, "checkbox");
  click(container.querySelector("label")!);
  assert.equal(input.checked, true);
  unmount();
});

test("Checkbox: indeterminate встановлюється як DOM-властивість і оновлюється", () => {
  const { container, rerender, unmount } = render(<Checkbox label="Усі" indeterminate />);
  const input = container.querySelector("input")!;
  assert.equal(input.indeterminate, true);
  rerender(<Checkbox label="Усі" indeterminate={false} />);
  assert.equal(input.indeterminate, false);
  unmount();
});

test("Checkbox: зовнішній ref отримує input", () => {
  let node: HTMLInputElement | null = null;
  const { unmount } = render(<Checkbox label="Ref" ref={(element) => { node = element; }} />);
  assert.ok(node !== null && (node as HTMLInputElement).type === "checkbox");
  unmount();
});

test("Checkbox: помилка пов'язана через aria-describedby", () => {
  const { container, unmount } = render(<Checkbox label="Згода" error="Потрібна згода" />);
  const input = container.querySelector("input")!;
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const errorId = input.getAttribute("aria-describedby")!;
  assert.equal(document.getElementById(errorId)?.textContent, "Потрібна згода");
  unmount();
});

test("Switch: role=switch на нативному checkbox, перемикається кліком", () => {
  const { container, unmount } = render(<Switch label="Сповіщення" />);
  const input = container.querySelector("input")!;
  assert.equal(input.getAttribute("role"), "switch");
  assert.equal(input.type, "checkbox");
  click(input);
  assert.equal(input.checked, true);
  unmount();
});

test("Switch: disabled не перемикається", () => {
  const { container, unmount } = render(<Switch label="Режим" disabled />);
  const input = container.querySelector("input")!;
  click(input);
  assert.equal(input.checked, false);
  unmount();
});

test("RadioGroup: fieldset + legend, однакове name, вибір через onValueChange", () => {
  const changes: string[] = [];
  const { container, unmount } = render(
    <RadioGroup label="Пріоритет" defaultValue="low" onValueChange={(value) => changes.push(value)}>
      <Radio value="low" label="Низький" />
      <Radio value="high" label="Високий" />
    </RadioGroup>,
  );
  const fieldset = container.querySelector("fieldset")!;
  assert.equal(fieldset.querySelector("legend")!.textContent, "Пріоритет");
  const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  assert.equal(new Set(radios.map((radio) => radio.name)).size, 1);
  assert.equal(radios[0]!.checked, true);
  click(radios[1]!);
  assert.deepEqual(changes, ["high"]);
  assert.equal(radios[1]!.checked, true);
  assert.equal(radios[0]!.checked, false);
  unmount();
});

test("RadioGroup: контрольований режим не змінюється без оновлення value", () => {
  function Controlled() {
    const [value, setValue] = useState("a");
    return (
      <RadioGroup label="Режим" value={value} onValueChange={setValue}>
        <Radio value="a" label="А" />
        <Radio value="b" label="Б" />
      </RadioGroup>
    );
  }
  const { container, unmount } = render(<Controlled />);
  const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  click(radios[1]!);
  assert.equal(radios[1]!.checked, true);
  unmount();
});

test("RadioGroup: required і помилка передаються кожній радіокнопці", () => {
  const { container, unmount } = render(
    <RadioGroup label="Тип" required error="Оберіть тип">
      <Radio value="a" label="А" />
      <Radio value="b" label="Б" />
    </RadioGroup>,
  );
  for (const radio of container.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    assert.equal(radio.required, true);
    assert.equal(radio.getAttribute("aria-invalid"), "true");
  }
  const describedBy = container.querySelector("fieldset")!.getAttribute("aria-describedby")!;
  assert.equal(document.getElementById(describedBy)?.textContent, "Оберіть тип");
  unmount();
});

test("Radio поза RadioGroup — помилка розробника", () => {
  assert.throws(() => {
    const { unmount } = render(<Radio value="x" label="X" />);
    unmount();
  }, /RadioGroup/);
});
