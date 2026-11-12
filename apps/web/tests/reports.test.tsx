import "./setup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { DailyList, Extract, Request } from "@dsp/domain";
import { buildFinalReport, escapeHtml, printHtml } from "../src/lib/reports.ts";

const request = (id: string, patch: Partial<Request> = {}): Request => ({
  id,
  authorId: "a",
  route: ["unit-a", "b", "c", "d", "e"],
  version: 1,
  revision: 3,
  status: "extract_issued",
  level: 5,
  listId: "list-1",
  lines: [{ kind: "by_list", id: "l1", positionId: "p1", qty: 2, kekv: "2210" }],
  justification: "Потреба підрозділу.",
  title: "",
  returnInfo: null,
  levelEnteredOn: "2027-02-06",
  createdOn: "2027-02-01",
  ...patch,
});

const list: DailyList = { id: "list-1", level: 5, unitId: "vor", date: "2027-02-06", status: "approved", requestIds: ["req-0001"], formedBy: "p", sedoNumber: 7240123, approvedBy: "g", revision: 2 };
const extract: Extract = {
  id: "ex-1",
  unitId: "unit-a",
  date: "2027-02-06",
  requestIds: ["req-0001"],
  lines: [
    { requestId: "req-0001", lineId: "l1", positionId: "p1", qty: 2, kind: "by_list", status: "approved" },
    { requestId: "req-0001", lineId: "l2", positionId: "p1", qty: 1, kind: "replacement", status: "replacement_agreed" },
  ],
};
const positions = [{ id: "p1", name: "Акумулятор", priceMinor: 100_00 }];
const base = { title: "Затверджені закупівлі", today: "2027-02-15", positions, unitName: (id: string) => (id === "unit-a" ? "в/ч А0001" : id) };

test("екранування: небезпечні символи не потрапляють у розмітку", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'q'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
  assert.equal(escapeHtml(42), "42");
});

test("звіт: номер, в/ч, СЕДО, сума й статус рядків витягу, зокрема «Заміна погоджена»", () => {
  const html = buildFinalReport({ ...base, requests: [request("req-0001")], lists: [list], extracts: [extract] });
  assert.match(html, /<title>Затверджені закупівлі<\/title>/);
  assert.match(html, /ЗМ-0001/);
  assert.match(html, /в\/ч А0001/);
  assert.match(html, /7240123/);
  assert.match(html, /Заміна погоджена/);
  assert.match(html, /Витяг по в\/ч А0001 від 06\.02\.2027/);
  assert.match(html, /Демонстраційні дані, СЕДО імітується/);
  assert.match(html.replace(/\s/g, " "), /Заявок: 1, на суму 200,00/);
});

test("звіт: порожні стани, коли нічого не затверджено", () => {
  const html = buildFinalReport({ ...base, requests: [], lists: [], extracts: [] });
  assert.match(html, /Затверджених заявок немає/);
  assert.match(html, /Витягів ще немає/);
  assert.match(html.replace(/\s/g, " "), /Заявок: 0, на суму 0,00/);
});

test("звіт: назви з даних екрануються, а не виконуються", () => {
  const html = buildFinalReport({
    ...base,
    unitName: () => `<img src=x onerror=alert(1)>`,
    positions: [{ id: "p1", name: `<b>Позиція</b>`, priceMinor: 100 }],
    requests: [request("req-0001")],
    lists: [list],
    extracts: [extract],
  });
  assert.ok(!html.includes("<img src=x"), "розмітка з назви підрозділу екранована");
  assert.ok(!html.includes("<b>Позиція</b>"), "розмітка з назви позиції екранована");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("звіт без СЕДО у переліку показує прочерк, а не «null»", () => {
  const html = buildFinalReport({ ...base, requests: [request("req-0001")], lists: [], extracts: [] });
  assert.ok(!html.includes("null") && !html.includes("undefined"));
  assert.match(html, /<td>—<\/td>/);
});

test("звіт самодостатній: без зовнішніх посилань і колірних літералів (працює без інтернету)", () => {
  const html = buildFinalReport({ ...base, requests: [request("req-0001")], lists: [list], extracts: [extract] });
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(html));
  assert.ok(!/<script/i.test(html));
});

test("друк: створюється прихований iframe із документом, який можна зберегти як PDF", () => {
  printHtml("<!doctype html><title>t</title><p>x</p>");
  const frame = document.querySelector("iframe");
  assert.ok(frame);
  assert.equal(frame.getAttribute("aria-hidden"), "true");
  assert.match(frame.srcdoc, /<p>x<\/p>/);
  frame.remove();
});
