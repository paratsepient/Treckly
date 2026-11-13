import assert from "node:assert/strict";
import test from "node:test";
import type { RequestLine } from "@dsp/domain";
import {
  canRedo,
  canUndo,
  editorReducer,
  emptyHistory,
  fromRequestLines,
  linesKey,
  newLine,
  parseMoney,
  parseQty,
  toRequestLines,
  type CatalogItem,
  type CatalogPosition,
  type EditorAction,
  type History,
} from "../src/lib/editor-state.ts";

const items: CatalogItem[] = [
  { id: "i1", code: "A-1", name: "Акумулятор 6S", kekv: "2210", priceMinor: 100_00, group: "живлення" },
  { id: "i2", code: "A-2", name: "Акумулятор LiFePO4", kekv: "2210", priceMinor: 130_00, group: "живлення" },
  { id: "i3", code: "B-1", name: "Зарядна станція", kekv: "3110", priceMinor: 900_00, group: "живлення" },
  { id: "i4", code: "C-1", name: "Бінокль", kekv: "2210", priceMinor: 50_00, group: "оптика" },
];
const positions: CatalogPosition[] = [
  { id: "p1", code: "A-1", name: "Акумулятор 6S", kekv: "2210", priceMinor: 100_00, availableQty: 10 },
  { id: "p4", code: "C-1", name: "Бінокль", kekv: "2210", priceMinor: 50_00, availableQty: 5 },
];
const posMap = new Map(positions.map((p) => [p.id, p]));
const itemMap = new Map(items.map((i) => [i.id, i]));

const run = (history: History, ...actions: EditorAction[]): History => actions.reduce(editorReducer, history);
const line = (id: string, patch: Partial<ReturnType<typeof newLine>> = {}) => ({ ...newLine(id), ...patch });

test("додавання й видалення рядків; кожна зміна — крок історії", () => {
  let h = emptyHistory();
  h = run(h, { type: "add", line: line("a") }, { type: "add", line: line("b") });
  assert.deepEqual(h.present.map((l) => l.id), ["a", "b"]);
  h = run(h, { type: "remove", id: "a" });
  assert.deepEqual(h.present.map((l) => l.id), ["b"]);
  assert.equal(h.past.length, 3);
});

test("undo/redo відновлюють стан; нова зміна стирає «майбутнє»", () => {
  let h = run(emptyHistory(), { type: "add", line: line("a") }, { type: "add", line: line("b") });
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);
  h = run(h, { type: "undo" });
  assert.deepEqual(h.present.map((l) => l.id), ["a"]);
  assert.equal(canRedo(h), true);
  h = run(h, { type: "redo" });
  assert.deepEqual(h.present.map((l) => l.id), ["a", "b"]);
  h = run(h, { type: "undo" }, { type: "add", line: line("c") });
  assert.equal(canRedo(h), false);
  assert.deepEqual(h.present.map((l) => l.id), ["a", "c"]);
});

test("undo без історії й redo без «майбутнього» нічого не змінюють", () => {
  const h = emptyHistory([line("a")]);
  assert.equal(run(h, { type: "undo" }), h);
  assert.equal(run(h, { type: "redo" }), h);
});

test("набір кількості літера за літерою — один крок історії, а не по одному на символ", () => {
  let h = run(emptyHistory(), { type: "add", line: line("a", { qty: "1" }) });
  const steps = h.past.length;
  for (const qty of ["1", "12", "125"]) h = run(h, { type: "update", id: "a", patch: { qty }, group: "qty:a" });
  assert.equal(h.present[0]?.qty, "125");
  assert.equal(h.past.length, steps + 1);
  h = run(h, { type: "undo" });
  assert.equal(h.present[0]?.qty, "1", "одне «Відмінити» скасовує весь набір");
});

test("зміна іншого рядка чи іншої групи починає новий крок", () => {
  let h = run(emptyHistory(), { type: "add", line: line("a") }, { type: "add", line: line("b") });
  h = run(h, { type: "update", id: "a", patch: { qty: "2" }, group: "qty:a" }, { type: "update", id: "b", patch: { qty: "3" }, group: "qty:b" });
  assert.equal(run(h, { type: "undo" }).present[1]?.qty, "1");
  assert.equal(run(h, { type: "undo" }).present[0]?.qty, "2");
});

test("сума заміни: гривні з пробілами й комою → копійки; нуль і сміття — ні", () => {
  assert.equal(parseMoney("8000"), 8_000_00);
  assert.equal(parseMoney("8 000,50"), 8_000_50);
  assert.equal(parseMoney("12.5"), 12_50);
  for (const bad of ["", "0", "-5", "abc", "1,234"]) assert.equal(parseMoney(bad), null, bad);
});

test("завантаження збереженої заявки починає історію заново", () => {
  const h = run(emptyHistory(), { type: "add", line: line("a") }, { type: "load", lines: [line("z")] });
  assert.deepEqual(h.present.map((l) => l.id), ["z"]);
  assert.equal(canUndo(h), false);
});

test("історія обмежена: глибоке редагування не росте безмежно", () => {
  let h = emptyHistory();
  for (let i = 0; i < 150; i += 1) h = run(h, { type: "add", line: line(`l${i}`) });
  assert.equal(h.past.length, 100);
});

test("кількість: лише додатне ціле без нулів на початку й не більше семи цифр", () => {
  for (const ok of ["1", "25", " 7 ", "9999999"]) assert.notEqual(parseQty(ok), null, ok);
  for (const bad of ["", "0", "01", "-1", "1.5", "1,5", "abc", "12a", "10000000"]) assert.equal(parseQty(bad), null, bad);
});

test("перетворення в рядки API: повні рядки йдуть далі, незавершені блокують подання", () => {
  const editor = [
    line("ok1", { positionId: "p1", qty: "3" }),
    line("noPos"),
    line("badQty", { positionId: "p1", qty: "0" }),
    line("noItem", { kind: "replacement", positionId: "p1", qty: "1" }),
    line("rep", { kind: "replacement", positionId: "p1", qty: "2", newName: "Зарядна станція", newQty: "1", newTotal: "180", newKekv: "3110" }),
  ];
  const { lines, incomplete } = toRequestLines(editor, posMap, itemMap);
  assert.deepEqual(incomplete, ["noPos", "badQty", "noItem"]);
  assert.deepEqual(lines.map((l) => [l.id, l.kind]), [["ok1", "by_list"], ["rep", "replacement"]]);
  const rep = lines[1]!;
  assert.equal(rep.kind === "replacement" && rep.newItem.kekv, "3110");
  assert.deepEqual(rep.kind === "replacement" && [rep.newItem.name, rep.newItem.qty, rep.newItem.totalMinor], ["Зарядна станція", 1, 180_00]);
  assert.equal(rep.kekv, "2210", "КЕКВ рядка — це КЕКВ позиції, а не нового предмета");
});

test("збережена заявка → редактор → рядки API без втрат; ключ вмісту збігається", () => {
  const saved: RequestLine[] = [
    { kind: "by_list", id: "l1", positionId: "p1", qty: 4, kekv: "2210" },
    { kind: "replacement", id: "l2", positionId: "p1", qty: 2, kekv: "2210", newItem: { code: "B-1", name: "Зарядна станція", kekv: "3110", qty: 2, totalMinor: 180000, measure: "шт." } },
  ];
  const back = toRequestLines(fromRequestLines(saved, items), posMap, itemMap);
  assert.deepEqual(back.incomplete, []);
  assert.equal(linesKey(back.lines), linesKey(saved), "після завантаження немає зайвого автозбереження");
});

test("ключ вмісту не залежить від порядку полів в об'єктах", () => {
  const a: RequestLine = { kind: "by_list", id: "l", positionId: "p", qty: 1, kekv: "2210" };
  const b = { kekv: "2210", qty: 1, positionId: "p", id: "l", kind: "by_list" } as RequestLine;
  assert.equal(linesKey([a]), linesKey([b]));
  assert.notEqual(linesKey([a]), linesKey([{ ...a, qty: 2 }]));
});

test("заміна без найменування чи суми — незавершений рядок, а не мовчазна втрата", () => {
  const saved: RequestLine[] = [{ kind: "replacement", id: "l", positionId: "p1", qty: 1, kekv: "2210", newItem: { code: "", name: " ", kekv: "2210", qty: 1, totalMinor: 1, measure: "шт." } }];
  const editor = fromRequestLines(saved, items);
  assert.deepEqual(toRequestLines(editor, posMap, itemMap).incomplete, ["l"]);
});
