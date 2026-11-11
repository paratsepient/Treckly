import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  Radio,
  RadioGroup,
  ScrollArea,
  SegmentedControl,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Tooltip,
} from "../src/index.ts";
import { axeViolations, focus, render } from "./helpers.tsx";

const Icon = () => (
  <svg viewBox="0 0 16 16">
    <path d="M2 8h12" />
  </svg>
);

/** Усі компоненти в основних станах. Той самий набір станів показує Playground. */
function AllControls() {
  return (
    <main>
      <h1>Controls</h1>
      <section aria-label="Кнопки">
        <Button>Secondary</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Видалити</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <IconButton label="Налаштування" icon={<Icon />} />
        <IconButton label="Видалити" icon={<Icon />} disabled />
      </section>
      <section aria-label="Поля">
        <Input label="Назва" />
        <Input label="Код" description="4 символи" error="Невірний формат" required />
        <Input label="Ідентифікатор" readOnly value="UNIT-0427" />
        <Input label="Архів" disabled value="Недоступно" />
        <Input label="Пошук" hideLabel type="search" placeholder="Пошук" />
        <Textarea label="Коментар" description="До 500 символів" />
        <Textarea label="Причина" error="Обов'язкове поле" />
        <Select label="Підрозділ" placeholder="Оберіть">
          <option value="a">А</option>
        </Select>
        <Select label="Статус" error="Оберіть статус" disabled>
          <option value="a">Активний</option>
        </Select>
      </section>
      <section aria-label="Вибір">
        <Checkbox label="Підтверджую" />
        <Checkbox label="Вибрати всі" indeterminate />
        <Checkbox label="Згода" error="Потрібна згода" />
        <Checkbox label="Заблоковано" disabled defaultChecked />
        <Switch label="Сповіщення" description="Push і e-mail" />
        <Switch label="Режим" disabled defaultChecked />
        <RadioGroup label="Пріоритет" defaultValue="low" error="Перевірте вибір">
          <Radio value="low" label="Низький" />
          <Radio value="high" label="Високий" description="Сповіщає чергового" />
          <Radio value="off" label="Вимкнено" disabled />
        </RadioGroup>
      </section>
      <section aria-label="Сегменти">
        <SegmentedControl label="Період" defaultValue="week" options={[{ value: "day", label: "День" }, { value: "week", label: "Тиждень" }, { value: "month", label: "Місяць", disabled: true }]} />
        <SegmentedControl label="Вигляд" hideLabel iconOnly defaultValue="list" options={[{ value: "list", label: "Список", icon: <Icon /> }, { value: "grid", label: "Сітка", icon: <Icon /> }]} />
      </section>
      <section aria-label="Навігація">
        <Tabs defaultValue="a">
          <TabList aria-label="Розділи">
            <Tab value="a">Огляд</Tab>
            <Tab value="b">Журнал</Tab>
            <Tab value="c" disabled>
              Архів
            </Tab>
          </TabList>
          <TabPanel value="a">Вміст огляду</TabPanel>
          <TabPanel value="b">Вміст журналу</TabPanel>
          <TabPanel value="c">Архів</TabPanel>
        </Tabs>
        <ScrollArea label="Журнал подій" maxHeight="120px">
          <p>Подія 1</p>
          <p>Подія 2</p>
        </ScrollArea>
        <Tooltip content="Оновлено о 14:20">
          <Button>Статус</Button>
        </Tooltip>
      </section>
    </main>
  );
}

test("axe: усі компоненти в основних станах без порушень", async () => {
  const { container, unmount } = render(<AllControls />);
  assert.deepEqual(await axeViolations(container), []);
  unmount();
});

test("axe: відкриті підказки без порушень", async () => {
  const { container, unmount } = render(<AllControls />);
  for (const trigger of container.querySelectorAll(".ix-tooltip-anchor > button")) {
    focus(trigger);
    // Підказка рендериться порталом у body, тому перевіряємо весь документ.
    assert.deepEqual(await axeViolations(document.body), []);
  }
  unmount();
});

test("Кожен інтерактивний елемент має доступну назву", () => {
  const { container, unmount } = render(<AllControls />);
  const unnamed = Array.from(container.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']"))
    .filter((element) => {
      const labelled = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
      const byLabel = "labels" in element && (element as HTMLInputElement).labels?.length;
      const text = element.tagName === "BUTTON" && element.textContent?.trim();
      return !(labelled || byLabel || text);
    })
    .map((element) => element.outerHTML.slice(0, 80));
  assert.deepEqual(unnamed, []);
  unmount();
});
