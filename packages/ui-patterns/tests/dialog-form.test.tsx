import "./setup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { act, useState } from "react";
import { Button } from "@index/ui";
import { AppShell, Dialog, FormFieldTable, InspectorPanel, useWorkspacePanels, WorkspaceLayout, type FormFieldRow } from "../src/index.ts";
import { Input } from "@index/ui";
import { axeViolations, cancelDialog, click, render, setViewportWidth } from "./helpers.tsx";

function DialogHarness({ kind }: { readonly kind?: "standard" | "confirm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Видалити ноду</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        kind={kind}
        title="Видалити ноду?"
        description="Ребра, під'єднані до ноди, теж буде видалено."
        actions={
          <>
            <Button onClick={() => setOpen(false)}>Скасувати</Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Видалити
            </Button>
          </>
        }
      />
    </>
  );
}

test("Dialog: заголовок — назва, опис — aria-describedby, Escape закриває й повертає фокус", () => {
  const { container, unmount } = render(<DialogHarness />);
  const trigger = container.querySelector("button")!;
  act(() => trigger.focus());
  click(trigger);
  const dialog = container.querySelector<HTMLDialogElement>("dialog.ixp-dialog")!;
  assert.ok(dialog.open);
  const title = dialog.querySelector("h2")!;
  assert.equal(dialog.getAttribute("aria-labelledby"), title.id);
  assert.equal(dialog.getAttribute("aria-label"), null);
  assert.equal(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent, "Ребра, під'єднані до ноди, теж буде видалено.");
  cancelDialog(dialog);
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
  unmount();
});

test("Dialog: підтвердження не закривається кліком по backdrop, звичайний — закривається", () => {
  for (const [kind, closes] of [["confirm", false], ["standard", true]] as const) {
    const { container, unmount } = render(<DialogHarness kind={kind} />);
    click(container.querySelector("button")!);
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    click(dialog);
    assert.equal(dialog.open, !closes, kind);
    unmount();
  }
});

const fieldTypes = [
  { value: "text", label: "Короткий текст" },
  { value: "integer", label: "Ціле число" },
  { value: "date", label: "Дата" },
];

function FieldsHarness({ onChange }: { readonly onChange?: (fields: readonly FormFieldRow[]) => void }) {
  const [fields, setFields] = useState<readonly FormFieldRow[]>([
    { id: "f1", name: "Підрозділ", type: "text", required: true, inherited: true },
    { id: "f2", name: "Кількість", type: "integer", required: false, typeLocked: true },
    { id: "f3", name: "Дата", type: "date", required: false },
  ]);
  return (
    <FormFieldTable
      label="Поля форми"
      fields={fields}
      fieldTypes={fieldTypes}
      onFieldsChange={(next) => {
        setFields(next);
        onChange?.(next);
      }}
      onAddField={() => setFields([...fields, { id: `f${fields.length + 1}`, name: "Нове поле", type: "text", required: false }])}
    />
  );
}

const names = (container: Element): string[] => [...container.querySelectorAll<HTMLInputElement>("tbody input[type='text'], tbody input:not([type])")].map((input) => input.value);

test("FormFieldTable: таблиця полів у порядку, кожен контрол має назву з контексту рядка", () => {
  const { container, unmount } = render(<FieldsHarness />);
  assert.equal(container.querySelector("caption")!.textContent, "Поля форми");
  assert.deepEqual(names(container), ["Підрозділ", "Кількість", "Дата"]);
  assert.ok(container.querySelector('[aria-label="Перемістити вгору: Кількість"]'));
  assert.ok(container.querySelector('[aria-label="Видалити поле: Дата"]'));
  unmount();
});

test("FormFieldTable: порядок змінюється кнопками, межі вимкнені", () => {
  const { container, unmount } = render(<FieldsHarness />);
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Перемістити вгору: Підрозділ"]')!.disabled);
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Перемістити вниз: Дата"]')!.disabled);
  click(container.querySelector('[aria-label="Перемістити вгору: Дата"]')!);
  assert.deepEqual(names(container), ["Підрозділ", "Дата", "Кількість"]);
  unmount();
});

test("FormFieldTable: поле з шаблону не видаляється, тип опублікованого поля не змінюється (ADR-FORM-002)", () => {
  const { container, unmount } = render(<FieldsHarness />);
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Поле з шаблону не видаляється: Підрозділ"]')!.disabled);
  const selects = container.querySelectorAll<HTMLSelectElement>("tbody select");
  assert.equal(selects[1]!.disabled, true);
  assert.equal(selects[2]!.disabled, false);
  // Вимкнений тип пояснено текстом поруч, а не лише станом контролу.
  const hint = document.getElementById(selects[1]!.getAttribute("aria-describedby")!.split(" ").at(-1)!)!;
  assert.match(hint.textContent ?? "", /Тип опублікованого поля не змінюється/);
  assert.equal(selects[2]!.hasAttribute("aria-describedby"), false);
  click(container.querySelector('[aria-label="Видалити поле: Дата"]')!);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість"]);
  click([...container.querySelectorAll("button")].find((button) => button.textContent === "Додати поле")!);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість", "Нове поле"]);
  unmount();
});

test("FormFieldTable: поле, яке визначає шаблон (locked), лише видно — без зміни, переміщення й видалення", async () => {
  const fields: FormFieldRow[] = [
    { id: "t_name", name: "Назва", type: "text", required: true, locked: true },
    { id: "f_local", name: "Локальне", type: "text", required: false },
  ];
  const changes: (readonly FormFieldRow[])[] = [];
  const { container, unmount } = render(
    <FormFieldTable label="Поля" fields={fields} fieldTypes={fieldTypes} onFieldsChange={(next) => changes.push(next)} onAddField={() => {}} />,
  );
  const [nameInput] = container.querySelectorAll<HTMLInputElement>("tbody input[data-field-name]");
  assert.equal(nameInput!.readOnly, true);
  const hint = document.getElementById(nameInput!.getAttribute("aria-describedby")!)!;
  assert.match(hint.textContent ?? "", /Поля шаблону змінює Оркестратор/);
  assert.equal(container.querySelectorAll<HTMLSelectElement>("tbody select")[0]!.disabled, true);
  assert.equal(container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')[0]!.disabled, true);
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Поле з шаблону не видаляється: Назва"]')!.disabled);
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Перемістити вниз: Назва"]')!.disabled);
  // Локальне поле не стає перед полем шаблону.
  assert.ok(container.querySelector<HTMLButtonElement>('[aria-label="Перемістити вгору: Локальне"]')!.disabled);
  assert.equal(container.querySelectorAll('tbody input[type="checkbox"]')[1]!.hasAttribute("disabled"), false);
  assert.deepEqual(changes, []);
  assert.deepEqual(await axeViolations(container), []);
  unmount();
});

test("axe: відкритий діалог і таблиця полів без порушень", async () => {
  const { container, unmount } = render(
    <main>
      <DialogHarness />
      <FieldsHarness />
    </main>,
  );
  click(container.querySelector("button")!);
  assert.deepEqual(await axeViolations(container), []);
  unmount();
});

test("FormFieldTable: опубліковане поле видаляється лише після підтвердження", () => {
  const { container, unmount } = render(<FieldsHarness />);
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Видалити поле: Кількість"]')!;
  act(() => button.focus());
  click(button);
  const dialog = container.querySelector<HTMLDialogElement>("dialog.ixp-dialog")!;
  assert.ok(dialog.open, "підтвердження відкрито");
  assert.match(dialog.textContent ?? "", /перевірки збережених значень і залежностей/);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість", "Дата"], "до підтвердження поле на місці");
  cancelDialog(dialog);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість", "Дата"]);
  click(button);
  click([...container.querySelectorAll("dialog button")].find((item) => item.textContent === "Видалити поле")!);
  assert.deepEqual(names(container), ["Підрозділ", "Дата"]);
  unmount();
});

test("FormFieldTable: після видалення фокус на сусідньому рядку, зміну оголошено; нове поле отримує фокус", () => {
  const { container, unmount } = render(<FieldsHarness />);
  const live = container.querySelector('[aria-live="polite"]')!;
  click(container.querySelector('[aria-label="Перемістити вгору: Дата"]')!);
  assert.equal(live.textContent, "Поле «Дата» переміщено на позицію 2 з 3.");
  // Дата тепер друга; видаляємо її — фокус переходить на кнопку видалення рядка, що став другим.
  click(container.querySelector('[aria-label="Видалити поле: Дата"]')!);
  assert.equal(live.textContent, "Поле «Дата» видалено.");
  assert.equal(document.activeElement?.getAttribute("aria-label"), "Видалити поле: Кількість");
  click([...container.querySelectorAll("button")].find((item) => item.textContent === "Додати поле")!);
  assert.equal((document.activeElement as HTMLInputElement).value, "Нове поле");
  unmount();
});

test("FormFieldTable в AppShell: «Відмінити» з повідомлення відновлює поле на тому самому місці", () => {
  const { container, unmount } = render(
    <AppShell sidebar={<nav aria-label="Навігація" />}>
      <FieldsHarness />
    </AppShell>,
  );
  click(container.querySelector('[aria-label="Видалити поле: Дата"]')!);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість"]);
  const undo = [...container.querySelectorAll(".ixp-feedback button")].find((item) => item.textContent === "Відмінити")!;
  assert.ok(undo, "повідомлення з дією «Відмінити»");
  click(undo);
  assert.deepEqual(names(container), ["Підрозділ", "Кількість", "Дата"]);
  unmount();
});

test("WorkspaceLayout: новий inspectorKey перемонтовує вміст — неконтрольовані поля не тримають старе значення", () => {
  const view = (key: string, name: string) => (
    <WorkspaceLayout inspectorOpen inspectorKey={key} inspector={<InspectorPanel title={name}><Input label="Назва" defaultValue={name} /></InspectorPanel>}>
      <p>Поверхня</p>
    </WorkspaceLayout>
  );
  const { container, rerender, unmount } = render(view("a", "Донесення F-12"));
  const value = () => container.querySelector<HTMLInputElement>(".ixp-panel input")!.value;
  assert.equal(value(), "Донесення F-12");
  rerender(view("b", "Оперативний дашборд"));
  assert.equal(value(), "Оперативний дашборд");
  unmount();
});

test("WorkspaceLayout: PanelControl.focus() переносить фокус на заголовок закріпленого інспектора", () => {
  setViewportWidth(1440);
  function SettingsButton({ onOpen }: { readonly onOpen: () => void }) {
    const { inspector } = useWorkspacePanels();
    return (
      <Button
        onClick={() => {
          onOpen();
          inspector.focus();
        }}
      >
        Налаштувати
      </Button>
    );
  }
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <WorkspaceLayout inspectorOpen={open} onInspectorOpenChange={setOpen} inspector={<InspectorPanel title="Властивості віджета"><Input label="Назва" /></InspectorPanel>}>
        <SettingsButton onOpen={() => setOpen(true)} />
      </WorkspaceLayout>
    );
  }
  const { container, unmount } = render(<Harness />);
  click(container.querySelector(".ixp-workspace__surface button")!);
  const title = container.querySelector<HTMLElement>('[data-panel="inspector"] [data-panel-title]')!;
  assert.equal(document.activeElement, title, "фокус на заголовку панелі, звідки Tab іде її вмістом");
  assert.equal(title.tabIndex, -1, "заголовок не стає зупинкою Tab");
  unmount();
});

test("AppShell: «Перейти до вмісту» — перша зупинка; переносить фокус на main без зміни адреси", () => {
  const before = window.location.hash;
  const { container, unmount } = render(
    <AppShell sidebar={<nav aria-label="Навігація"><a href="#/x">Пункт</a></nav>}>
      <WorkspaceLayout>
        <p>Поверхня</p>
      </WorkspaceLayout>
    </AppShell>,
  );
  const first = container.querySelector<HTMLElement>("a, button, [tabindex='0']")!;
  assert.equal(first.textContent, "Перейти до вмісту");
  click(first);
  assert.equal(document.activeElement?.tagName, "MAIN");
  assert.equal(window.location.hash, before);
  unmount();
});
