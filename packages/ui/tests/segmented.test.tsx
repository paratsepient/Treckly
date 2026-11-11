import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { useState } from "react";
import { SegmentedControl, Tab, TabList, TabPanel, Tabs } from "../src/index.ts";
import { click, render } from "./helpers.tsx";

const options = [
  { value: "day", label: "День" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "year", label: "Рік", disabled: true },
];

test("SegmentedControl: fieldset + legend, нативні radio з одним name", () => {
  const { container, unmount } = render(<SegmentedControl label="Період" options={options} defaultValue="week" />);
  const fieldset = container.querySelector("fieldset")!;
  assert.equal(fieldset.querySelector("legend")!.textContent, "Період");
  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  assert.equal(radios.length, 4);
  assert.equal(new Set(radios.map((radio) => radio.name)).size, 1);
  assert.equal(radios[1]!.checked, true);
  assert.equal(radios[3]!.disabled, true);
  unmount();
});

test("SegmentedControl: вибір рухає індикатор через --segment-index і викликає onValueChange", () => {
  const changes: string[] = [];
  const { container, unmount } = render(<SegmentedControl label="Період" options={options} defaultValue="day" onValueChange={(value) => changes.push(value)} />);
  const track = container.querySelector<HTMLElement>(".ix-segmented__track")!;
  assert.equal(track.style.getPropertyValue("--segment-count"), "4");
  assert.equal(track.style.getPropertyValue("--segment-index"), "0");
  click(container.querySelectorAll('input[type="radio"]')[2]!);
  assert.deepEqual(changes, ["month"]);
  assert.equal(track.style.getPropertyValue("--segment-index"), "2");
  assert.ok(container.querySelectorAll(".ix-segmented__option")[2]!.hasAttribute("data-checked"));
  unmount();
});

test("SegmentedControl: контрольований режим і відсутність вибору ховає індикатор", () => {
  function Controlled() {
    const [value, setValue] = useState<string | undefined>(undefined);
    return <SegmentedControl label="Період" options={options} value={value ?? "none"} onValueChange={setValue} />;
  }
  const { container, unmount } = render(<Controlled />);
  const indicator = container.querySelector<HTMLElement>(".ix-segmented__indicator")!;
  assert.equal(indicator.hidden, true);
  click(container.querySelectorAll('input[type="radio"]')[0]!);
  assert.equal(indicator.hidden, false);
  unmount();
});

test("SegmentedControl: iconOnly лишає назви доступними", () => {
  const { container, unmount } = render(
    <SegmentedControl label="Вигляд" hideLabel iconOnly options={[{ value: "list", label: "Список", icon: <svg /> }, { value: "grid", label: "Сітка", icon: <svg /> }]} />,
  );
  assert.ok(container.querySelector("legend")!.classList.contains("ix-sr-only"));
  assert.deepEqual([...container.querySelectorAll(".ix-sr-only")].map((element) => element.textContent), ["Вигляд", "Список", "Сітка"]);
  unmount();
});

test("Tabs variant=folder змінює лише вигляд, контракт tablist лишається", () => {
  const { container, unmount } = render(
    <Tabs defaultValue="b">
      <TabList aria-label="Розділи" variant="folder">
        <Tab value="a">Рядки</Tab>
        <Tab value="b">Деталі</Tab>
      </TabList>
      <TabPanel value="a">A</TabPanel>
      <TabPanel value="b">B</TabPanel>
    </Tabs>,
  );
  const list = container.querySelector('[role="tablist"]')!;
  assert.equal(list.getAttribute("data-variant"), "folder");
  const selected = container.querySelector('[role="tab"][aria-selected="true"]')!;
  assert.equal(selected.textContent, "Деталі");
  assert.equal(selected.getAttribute("tabindex"), "0");
  assert.equal(container.querySelector(`#${selected.getAttribute("aria-controls")}`)!.textContent, "B");
  unmount();
});

test("Tabs variant=segmented змінює лише вигляд, контракт tablist лишається", () => {
  const { container, unmount } = render(
    <Tabs defaultValue="a">
      <TabList aria-label="Розділи" variant="segmented">
        <Tab value="a">Властивості</Tab>
        <Tab value="b">Доступ</Tab>
      </TabList>
      <TabPanel value="a">A</TabPanel>
      <TabPanel value="b">B</TabPanel>
    </Tabs>,
  );
  const list = container.querySelector('[role="tablist"]')!;
  assert.equal(list.getAttribute("data-variant"), "segmented");
  assert.equal(container.querySelectorAll('[role="tab"]').length, 2);
  unmount();
});
