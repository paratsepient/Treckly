import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { Packer } from "docx";
import type { DailyList, Extract, Request } from "@dsp/domain";
import { buildFinalDocument, buildRaportDocument } from "../src/lib/docx-export.ts";
import type { RaportInput } from "../src/lib/raport.ts";
import { finalReportModel } from "../src/lib/reports.ts";

/** Мінімальне читання zip (.docx — це zip): записи з центрального каталогу, стиснення deflate. */
function readZip(buffer: Buffer): Map<string, Buffer> {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, "це не zip");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const request: Request = {
  id: "req-0001",
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
  service: "Служба зв'язку",
  funding: "general",
  sedoNumber: null,
  procurement: null,
  levelEnteredOn: "2027-02-06",
  createdOn: "2027-02-01",
};
const list: DailyList = { id: "list-1", level: 5, unitId: "vor", date: "2027-02-06", status: "approved", requestIds: ["req-0001"], formedBy: "p", sedoNumber: 7240123, approvedBy: "g", revision: 2 };
const extract: Extract = {
  id: "ex-1",
  unitId: "unit-a",
  date: "2027-02-06",
  requestIds: ["req-0001"],
  lines: [{ requestId: "req-0001", lineId: "l2", positionId: "p1", qty: 1, kind: "replacement", status: "replacement_agreed" }],
};
const base = { title: "Затверджені закупівлі", today: "2027-02-15", positions: [{ id: "p1", name: "Акумулятор <6S>", priceMinor: 100_00 }], unitName: (id: string) => (id === "unit-a" ? "в/ч А0001" : id) };

const documentXml = async (input: Parameters<typeof buildFinalDocument>[0]): Promise<string> => {
  const files = readZip(await Packer.toBuffer(buildFinalDocument(input)));
  assert.ok(files.has("word/document.xml") && files.has("[Content_Types].xml"), "є обов'язкові частини .docx");
  return (files.get("word/document.xml") as Buffer).toString("utf8");
};

test("Word: документ відкривається як zip і містить заголовок, СЕДО, витяг і статус заміни", async () => {
  const xml = await documentXml({ ...base, requests: [request], lists: [list], extracts: [extract] });
  for (const expected of ["Затверджені закупівлі", "ЗМ-0001", "в/ч А0001", "7240123", "Витяг по в/ч А0001 від 06.02.2027", "Заміна погоджена", "Заміна"]) {
    assert.ok(xml.includes(expected), `у документі немає «${expected}»`);
  }
});

test("Word: спеціальні символи в даних не ламають документ (XML екранується бібліотекою)", async () => {
  const xml = await documentXml({ ...base, requests: [request], lists: [list], extracts: [extract] });
  assert.ok(xml.includes("Акумулятор &lt;6S&gt;"), "назва з < > екранована");
  assert.ok(!xml.includes("Акумулятор <6S>"));
});

test("Word: порожній стан — повідомлення замість порожньої таблиці", async () => {
  const xml = await documentXml({ ...base, requests: [], lists: [], extracts: [] });
  assert.ok(xml.includes("Затверджених заявок немає."));
  assert.ok(xml.includes("Витягів ще немає."));
});

test("Word і друк показують однакові дані: обидва будуються з однієї моделі", () => {
  const model = finalReportModel({ ...base, requests: [request], lists: [list], extracts: [extract] });
  assert.equal(model.requestRows.length, 1);
  assert.equal(model.requestRows[0]?.[2], "7240123");
  assert.equal(model.extracts[0]?.rows[0]?.[4], "Заміна погоджена");
  assert.match(model.summary, /Заявок: 1/);
});

const raportInput: RaportInput = {
  request: { ...request, status: "draft", justification: ["Перший абзац <важливо>.", "Другий абзац."].join("\n") },
  author: { name: "Савицький Роксолан Корнилович", title: "Автор заявок" },
  unitName: (id: string) => (id === "unit-a" ? "в/ч А0001" : id),
  positions: [{ id: "p1", code: "ПМ-001", name: "Акумулятор <6S>", kekv: "2210", priceMinor: 100_00 }],
  items: [{ code: "ПМ-001", measure: "шт." }],
  date: "2027-02-16",
};

test("Word: рапорт містить адресата, назву, позиції, обґрунтування і підпис", async () => {
  const files = readZip(await Packer.toBuffer(buildRaportDocument(raportInput)));
  const xml = (files.get("word/document.xml") as Buffer).toString("utf8");
  for (const expected of ["Командиру військової частини А0001", "РАПОРТ", "ПМ-001", "Акумулятор &lt;6S&gt;", "Перший абзац &lt;важливо&gt;.", "Другий абзац.", "Роксолан САВИЦЬКИЙ", "16 лютого 2027 р.", "Times New Roman"]) {
    assert.ok(xml.includes(expected), `у рапорті немає «${expected}»`);
  }
});
