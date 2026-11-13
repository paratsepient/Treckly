import assert from "node:assert/strict";
import test from "node:test";
import { buildExtractHtml, extractDocModel, type ExtractDocInput } from "../src/lib/extract-doc.ts";

const input: ExtractDocInput = {
  extract: {
    id: "ex-1",
    unitId: "unit-a",
    date: "2027-02-06",
    requestIds: ["req-0001"],
    lines: [
      { requestId: "req-0001", lineId: "l1", positionId: "p1", qty: 2, kind: "by_list", status: "approved" },
      { requestId: "req-0001", lineId: "l2", positionId: "p2", qty: 1, kind: "replacement", status: "replacement_agreed" },
    ],
  },
  requests: [
    {
      id: "req-0001",
      title: "Живлення <зв'язок>",
      lines: [
        { kind: "by_list", id: "l1", positionId: "p1", qty: 2, kekv: "2210" },
        { kind: "replacement", id: "l2", positionId: "p2", qty: 1, kekv: "2210", newItem: { code: "ПМ-900", name: "Бінокль", kekv: "2210", qty: 1, totalMinor: 500000, measure: "шт." } },
      ],
    },
  ],
  lists: [{ requestIds: ["req-0001"], sedoNumber: 7240042, date: "2027-02-06" }],
  positions: [
    { id: "p1", code: "ПМ-001", name: "Акумулятор", priceMinor: 1_000_00 },
    { id: "p2", code: "ПМ-020", name: "Бінокль старий", priceMinor: 3_000_00 },
  ],
  items: [{ code: "ПМ-001", measure: "шт." }, { code: "ПМ-900", measure: "компл." }],
  unitName: (id) => (id === "unit-a" ? "в/ч А0001" : id),
};

test("витяг: назва, підстава з СЕДО, рядки з цінами, заміна — новим предметом", () => {
  const m = extractDocModel(input);
  assert.equal(m.title, "ВИТЯГ");
  assert.match(m.subtitle, /по в\/ч А0001/u);
  assert.match(m.basis, /СЕДО № 7240042/u);
  assert.match(m.basis, /ЗМ-0001 \(«Живлення <зв'язок>»\)/u);
  assert.deepEqual(m.rows[0]?.slice(1, 6), ["ЗМ-0001", "ПМ-001", "Акумулятор", "шт.", "2"]);
  assert.deepEqual(m.rows[1]?.slice(2, 5), ["ПМ-900", "Бінокль (заміна: Бінокль старий × 1)", "компл."]);
  assert.equal(m.rows[1]?.[7], "Заміна погоджена");
  assert.match(m.total, /7\s000,00/u);
  assert.equal(m.fileName, "Витяг в/ч А0001 2027-02-06.docx");
});

test("витяг: дані в HTML екрануються", () => {
  const html = buildExtractHtml(input);
  assert.ok(html.includes("&lt;зв&#39;язок&gt;"));
  assert.ok(!html.includes("<зв'язок>"));
});
