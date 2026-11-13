import "./setup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { TrackStep } from "@dsp/domain";
import { CheckPanel, issueText } from "../src/components/CheckPanel.tsx";
import { LinesEditor } from "../src/components/LinesEditor.tsx";
import { Track } from "../src/components/Track.tsx";
import { emptyHistory, editorReducer, type CatalogItem, type CatalogPosition, type EditorAction, type EditorLine } from "../src/lib/editor-state.ts";
import { axeViolations, click, render } from "./helpers.tsx";

const levels = [
  { level: 1, name: "в/ч" },
  { level: 2, name: "Бригада" },
  { level: 3, name: "РУ" },
  { level: 4, name: "Адміністрація по напрямку" },
  { level: 5, name: "Відділ оборонних ресурсів і Голова" },
];

const step = (level: 1 | 2 | 3 | 4 | 5, state: TrackStep["state"], patch: Partial<TrackStep> = {}): TrackStep => ({
  level,
  state,
  enteredOn: null,
  daysAtLevel: null,
  sedoNumber: null,
  inList: false,
  ...patch,
});

const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

// ── Трек ──────────────────────────────────────────────────────────────────────

test("трек: пройдені рівні з СЕДО, поточний із днями, решта попереду; поточний — aria-current", () => {
  const steps = [
    step(1, "done", { enteredOn: "2027-02-01", daysAtLevel: 0, sedoNumber: 7240001 }),
    step(2, "done", { enteredOn: "2027-02-01", daysAtLevel: 2, sedoNumber: 7240005 }),
    step(3, "current", { enteredOn: "2027-02-03", daysAtLevel: 12 }),
    step(4, "pending"),
    step(5, "pending"),
  ];
  const { container, unmount } = render(<Track steps={steps} levels={levels} />);
  const items = [...container.querySelectorAll("li")];
  assert.equal(items.length, 5);
  assert.deepEqual(items.map((li) => li.dataset["state"]), ["done", "done", "current", "pending", "pending"]);
  assert.deepEqual(items.map((li) => li.getAttribute("aria-current")), [null, null, "step", null, null]);
  assert.match(text(items[0]!), /Пройдено/);
  assert.match(text(items[0]!), /СЕДО № 7240001/);
  assert.match(text(items[2]!), /Зараз тут.*З 03\.02\.2027 · 12 днів/);
  assert.match(text(items[3]!), /Попереду/);
  assert.equal(container.querySelector("ol")?.getAttribute("aria-label"), "Трек заявки за рівнями погодження");
  unmount();
});

test("трек: стан передається текстом, а не лише кольором; заявка в переліку пояснена", () => {
  const steps = [step(1, "current", { inList: true, enteredOn: "2027-02-09", daysAtLevel: 0 }), step(2, "pending"), step(3, "pending"), step(4, "pending"), step(5, "pending")];
  const { container, unmount } = render(<Track steps={steps} levels={levels} />);
  assert.match(text(container.querySelectorAll("li")[0]!), /у денному переліку, чекає погодження керівника/);
  for (const li of container.querySelectorAll("li")) assert.ok(/Пройдено|Зараз тут|Попереду|Повернуто/.test(text(li)), "кожен крок має текстовий стан");
  unmount();
});

test("трек повернення: каскад рівнів до того, що повернув, і примітка на ньому", () => {
  const steps = [step(1, "returned", { daysAtLevel: 0 }), step(2, "returned", { daysAtLevel: 1 }), step(3, "returned", { daysAtLevel: 1 }), step(4, "pending"), step(5, "pending")];
  const { container, unmount } = render(<Track steps={steps} levels={levels} returned={{ level: 3, note: "Уточніть кількість" }} />);
  const items = [...container.querySelectorAll("li")];
  assert.deepEqual(items.map((li) => li.dataset["state"]), ["returned", "returned", "returned", "pending", "pending"]);
  assert.match(text(items[2]!), /повернув цей рівень/);
  assert.equal(text(items[2]!.querySelector("blockquote")), "Уточніть кількість");
  assert.equal(container.querySelectorAll("blockquote").length, 1, "примітка лише на рівні, що повернув");
  unmount();
});

test("axe: трек у кожному стані без порушень", async () => {
  const states: TrackStep[][] = [
    [step(1, "current"), step(2, "pending"), step(3, "pending"), step(4, "pending"), step(5, "pending")],
    [step(1, "done"), step(2, "done"), step(3, "done"), step(4, "done"), step(5, "done")],
    [step(1, "returned"), step(2, "returned"), step(3, "pending"), step(4, "pending"), step(5, "pending")],
  ];
  for (const steps of states) {
    const { unmount } = render(<Track steps={steps} levels={levels} returned={steps[1]?.state === "returned" ? { level: 2, note: "ні" } : null} />);
    assert.deepEqual(await axeViolations(document.body), []);
    unmount();
  }
});

// ── Перевірки й бюджет ────────────────────────────────────────────────────────

type Issue = Parameters<typeof issueText>[0];
const issue = (code: Issue["code"], details: Issue["details"], lineId: string | null = "l1"): Issue => ({ code, lineId, message: "службове", details });
const rows = new Map([["l1", 2]]);

test("тексти проблем: кожен код пояснено людською мовою, з номером рядка", () => {
  assert.equal(issueText(issue("NOT_IN_LIST", {}), rows), "Рядок 2: позиції немає в Попередньому переліку напрямку.");
  assert.equal(issueText(issue("QTY_EXCEEDED", { requested: 500, available: 24 }), rows), "Рядок 2: запитано 500, а доступно 24.");
  assert.equal(
    issueText(issue("QTY_EXCEEDED", { requested: 9, available: 4, reason: "UNIT_PLAN_EXCEEDED" }), rows),
    "Рядок 2: запитано 9, а в плані вашої в/ч 4.",
  );
  assert.equal(issueText(issue("NOT_IN_LIST", { reason: "NOT_IN_UNIT_PLAN" }), rows), "Рядок 2: позиції немає в плані вашої в/ч на 2027 рік.");
  assert.equal(issueText(issue("POSITION_BUSY", { requestId: "req-1" }), rows), "Рядок 2: позиція вже в іншій незавершеній заявці вашої в/ч — її не можна обрати вдруге.");
  assert.match(issueText(issue("POSITION_BUSY", { reason: "PURCHASE_STARTED" }), rows, true), /закупівля цієї позиції за іншою заявкою вже почалась/);
  assert.equal(
    issueText(issue("QTY_EXCEEDED", { requested: 5, available: 2, planned: 10, alreadyOrdered: 8, reason: "UNIT_PLAN_EXCEEDED" }), rows),
    "Рядок 2: запитано 5, а в плані вашої в/ч лишилось 2 (уже замовлено 8 з 10).",
  );
  assert.match(issueText(issue("QTY_EXCEEDED", { reason: "QTY_INVALID" }), rows), /цілим числом більше нуля/);
  assert.match(issueText(issue("KEKV_MISMATCH", { lineKekv: "3110", positionKekv: "2210" }), rows), /КЕКВ рядка \(3110\).*КЕКВ позиції \(2210\)/);
  assert.match(
    issueText(issue("BUDGET_EXCEEDED", { scope: "3110", requestedMinor: 185_000_00, remainingMinor: 100_000_00, inWorkMinor: 0 }, null), rows).replace(/\s/g, " "),
    /Сума 185 000,00 ₴ перевищує залишок КЕКВ 3110: 100 000,00 ₴\./,
  );
});

test("текст без номера рядка починається з великої літери", () => {
  assert.equal(issueText(issue("QTY_EXCEEDED", { requested: 5, available: 1 }, "невідомий"), rows), "Запитано 5, а доступно 1.");
});

test("попередження про суму інших заявок на погодженні відрізняється від помилки", () => {
  const warning = issueText(issue("BUDGET_EXCEEDED", { scope: "3110", requestedMinor: 42_000_00, remainingMinor: 100_000_00, inWorkMinor: 300_000_00 }, null), rows, true);
  assert.match(warning, /вміщується в залишок КЕКВ 3110/);
  assert.match(warning, /разом з іншими заявками на погодженні/);
});

const budget = {
  lines: [
    { scope: "TOTAL", limitMinor: 1_000_00, approvedMinor: 200_00, boughtMinor: 0, inWorkMinor: 300_00, inRequestsMinor: 300_00, remainingMinor: 800_00 },
    { scope: "2210", limitMinor: 600_00, approvedMinor: 100_00, boughtMinor: 0, inWorkMinor: 100_00, inRequestsMinor: 100_00, remainingMinor: 500_00 },
    { scope: "3110", limitMinor: 400_00, approvedMinor: 100_00, boughtMinor: 0, inWorkMinor: 200_00, inRequestsMinor: 200_00, remainingMinor: 300_00 },
  ],
};
const okReport = { ok: true, errors: [], warnings: [], impact: { perKekv: { "3110": 100_00 }, total: 100_00 }, inWork: { perKekv: {}, total: 0 } };

test("панель перевірок: порожній стан, поки немає рядків", () => {
  const { container, unmount } = render(<CheckPanel report={null} budget={budget} rowOf={new Map()} />);
  assert.match(text(container), /Додайте рядки/);
  unmount();
});

test("панель перевірок: усе гаразд — позначка й вплив на бюджет по КЕКВ зі знаками", () => {
  const { container, unmount } = render(<CheckPanel report={okReport} budget={budget} rowOf={rows} />);
  assert.match(text(container), /Перевірки пройдено/);
  const cells = (scope: string) => [...container.querySelectorAll("tbody tr")].find((tr) => text(tr.querySelector("th")) === scope)!.querySelectorAll("td");
  assert.match(text(cells("3110")[1]!), /−100/, "витрата на новому КЕКВ зменшує залишок");
  assert.equal(text(cells("2210")[1]!), "—", "старий КЕКВ заміни не змінюється: вивільнення немає");
  assert.equal(text(cells("3110")[2]!).replace(/\s/g, ""), "200");
  assert.match(text(container.querySelector("tbody tr th")), /Усього/);
  unmount();
});

test("панель перевірок: помилки, попередження й незаповнені рядки показано разом; від'ємний залишок позначено", () => {
  const report = {
    ...okReport,
    ok: false,
    errors: [issue("QTY_EXCEEDED", { requested: 9, available: 3 })],
    warnings: [issue("BUDGET_EXCEEDED", { scope: "2210", requestedMinor: 1, remainingMinor: 2, inWorkMinor: 5 }, null)],
    impact: { perKekv: { "3110": 500_00 }, total: 500_00 },
  };
  const { container, unmount } = render(<CheckPanel report={report} budget={budget} rowOf={rows} incompleteCount={2} />);
  const summary = text(container.querySelector(".check__summary"));
  assert.match(summary, /Помилок: 1/);
  assert.match(summary, /Попереджень: 1/);
  assert.match(summary, /Не заповнено рядків: 2/);
  assert.equal(container.querySelectorAll(".check__item[data-tone='error']").length, 1);
  assert.equal(container.querySelectorAll(".check__item[data-tone='warning']").length, 2, "попередження про бюджет і про незаповнені рядки");
  assert.ok(container.querySelector("[data-negative='true']"), "залишок 3110 після заявки від'ємний");
  unmount();
});

test("axe: панель перевірок", async () => {
  const { unmount } = render(<CheckPanel report={okReport} budget={budget} rowOf={rows} />);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});

// ── Таблиця рядків ────────────────────────────────────────────────────────────

const items: CatalogItem[] = [
  { id: "i1", code: "A-1", name: "Акумулятор 6S", kekv: "2210", priceMinor: 100_00, group: "живлення" },
  { id: "i2", code: "A-2", name: "Акумулятор LiFePO4", kekv: "2210", priceMinor: 130_00, group: "живлення" },
  { id: "i3", code: "B-1", name: "Зарядна станція", kekv: "3110", priceMinor: 900_00, group: "живлення" },
];
const positions: CatalogPosition[] = [{ id: "p1", code: "A-1", name: "Акумулятор 6S", kekv: "2210", priceMinor: 100_00, availableQty: 10 }];

function editor(lines: EditorLine[], problems = new Map<string, string[]>()) {
  const actions: EditorAction[] = [];
  const ui = <LinesEditor lines={lines} positions={positions} items={items} dispatch={(a) => actions.push(a)} problems={problems} newLineId={() => "new-1"} />;
  return { ui, actions };
}
const line = (patch: Partial<EditorLine>): EditorLine => ({ id: "l1", kind: "by_list", positionId: "", qty: "1", replacementItemId: "", condition: "", ...patch });

test("таблиця рядків: сума рахується від ціни позиції й кількості; без позиції — прочерк", () => {
  const { ui } = editor([line({ id: "a", positionId: "p1", qty: "3" }), line({ id: "b" })]);
  const { container, unmount } = render(ui);
  const rowsEls = [...container.querySelectorAll("tr.lines__row")];
  assert.equal(rowsEls.length, 2);
  assert.match(text(rowsEls[0]!.querySelector(".lines__money")).replace(/\s/g, " "), /300,00/);
  assert.match(text(rowsEls[1]!.querySelector(".lines__money")), /—$/);
  unmount();
});

test("таблиця рядків: для заміни показано кандидатів і правило КЕКВ", () => {
  const same = editor([line({ kind: "replacement", positionId: "p1", replacementItemId: "i2" })]);
  let view = render(same.ui);
  assert.match(text(view.container), /Той самий КЕКВ: ліміт не витрачається/);
  const options = [...view.container.querySelector(".lines__replacement select")!.querySelectorAll("option")].map((o) => o.textContent ?? "");
  assert.equal(options.length, 3, "підказка + 2 кандидати тієї ж групи");
  assert.ok(options.every((o) => !o.includes("Акумулятор 6S")), "самого предмета позиції серед кандидатів немає");
  view.unmount();

  const other = editor([line({ kind: "replacement", positionId: "p1", replacementItemId: "i3" })]);
  view = render(other.ui);
  assert.match(text(view.container), /Інший КЕКВ: списується з ліміту 3110/);
  view.unmount();
});

test("таблиця рядків: проблеми рядка видно під ним і позначено", () => {
  const { ui } = editor([line({ positionId: "p1", qty: "500" })], new Map([["l1", ["Запитано 500, а доступно 10."]]]));
  const { container, unmount } = render(ui);
  assert.equal(container.querySelector("tr.lines__row")?.getAttribute("data-invalid"), "true");
  assert.equal(text(container.querySelector(".lines__issues li")), "Запитано 500, а доступно 10.");
  unmount();
});

test("таблиця рядків: нечислова кількість показує помилку поля", () => {
  const { ui } = editor([line({ positionId: "p1", qty: "1,5" })]);
  const { container, unmount } = render(ui);
  assert.match(text(container), /Ціле число більше нуля/);
  unmount();
});

test("таблиця рядків: «Додати рядок» і «Видалити» надсилають дії", () => {
  const { ui, actions } = editor([line({ id: "a", positionId: "p1" })]);
  const { container, unmount } = render(ui);
  click([...container.querySelectorAll("button")].find((b) => text(b).includes("Додати рядок"))!);
  click(container.querySelector("button[aria-label='Видалити рядок 1']")!);
  assert.deepEqual(actions.map((a) => a.type), ["add", "remove"]);
  assert.equal(actions[0]?.type === "add" && actions[0].line.id, "new-1");
  assert.equal(actions[1]?.type === "remove" && actions[1].id, "a");
  unmount();
});

test("таблиця рядків: кожне поле має доступну назву з номером рядка", () => {
  const { ui } = editor([line({ id: "a", positionId: "p1" }), line({ id: "b" })]);
  const { container, unmount } = render(ui);
  for (const row of [1, 2]) {
    assert.ok(container.querySelector(`select[aria-label="Позиція, рядок ${row}"], [aria-label="Позиція, рядок ${row}"]`) ?? [...container.querySelectorAll("label")].some((l) => text(l) === `Позиція, рядок ${row}`), `позиція ${row}`);
    assert.ok([...container.querySelectorAll("label")].some((l) => text(l) === `Кількість, рядок ${row}`), `кількість ${row}`);
  }
  unmount();
});

test("axe: таблиця рядків зі звичайним і замінним рядком та проблемою", async () => {
  const lines = [line({ id: "a", positionId: "p1", qty: "2" }), line({ id: "b", kind: "replacement", positionId: "p1", replacementItemId: "i3" })];
  const { ui } = editor(lines, new Map([["a", ["Запитано 99, а доступно 10."]]]));
  const { unmount } = render(ui);
  assert.deepEqual(await axeViolations(document.body), []);
  unmount();
});

test("редактор + reducer: дія з таблиці змінює стан так, як очікує екран", () => {
  let history = emptyHistory([line({ id: "a", positionId: "p1" })]);
  const dispatch = (action: EditorAction) => (history = editorReducer(history, action));
  const { container, unmount } = render(<LinesEditor lines={history.present} positions={positions} items={items} dispatch={dispatch} problems={new Map()} newLineId={() => "n"} />);
  click([...container.querySelectorAll("button")].find((b) => text(b).includes("Додати рядок"))!);
  assert.deepEqual(history.present.map((l) => l.id), ["a", "n"]);
  unmount();
});
