import assert from "node:assert/strict";
import test from "node:test";
import { buildRaportHtml, raportModel, signatureName, type RaportInput } from "../src/lib/raport.ts";

const input = (patch: Partial<RaportInput["request"]> = {}): RaportInput => ({
  request: {
    id: "req-0011",
    version: 2,
    status: "returned",
    route: ["unit-a", "brig-1", "ru-1", "dir-1", "vor"],
    lines: [
      { kind: "by_list", id: "l1", positionId: "p1", qty: 2, kekv: "2210" },
      { kind: "replacement", id: "l2", positionId: "p2", qty: 1, kekv: "2210", newItem: { code: "ОБ-009", name: "Генератор", kekv: "3110", priceMinor: 50_000_00 } },
    ],
    justification: "  Майно зношене.\n\nПотрібне поповнення.  ",
    createdOn: "2027-02-01",
    ...patch,
  },
  author: { name: "Савицький Роксолан Корнилович", title: "Автор заявок" },
  unitName: (id) => ({ "unit-a": "в/ч А0001", "dir-1": "Напрямок «Технічне забезпечення»" })[id] ?? id,
  positions: [
    { id: "p1", code: "ПМ-001", name: "Акумулятор", kekv: "2210", priceMinor: 1_500_00 },
    { id: "p2", code: "ПМ-002", name: "Радіостанція", kekv: "2210", priceMinor: 9_000_00 },
  ],
  items: [
    { code: "ПМ-001", measure: "шт." },
    { code: "ОБ-009", measure: "компл." },
  ],
  date: "2027-02-16",
});

test("рапорт: шаблон заповнює адресата, текст і підпис; автор дає лише позиції й обґрунтування", () => {
  const m = raportModel(input());
  assert.deepEqual(m.addressee, ["Командиру військової частини А0001"]);
  assert.equal(m.title, "РАПОРТ");
  assert.match(m.request, /в\/ч А0001 за Попереднім переліком на 2027 рік, напрямок «Технічне забезпечення», за рахунок загального фонду, у кількості/u);
  assert.deepEqual(m.justification, ["Майно зношене.", "Потрібне поповнення."]);
  assert.equal(m.signature.name, "Роксолан САВИЦЬКИЙ");
  assert.equal(m.signature.position, "Автор заявок в/ч А0001");
  assert.equal(m.signature.date, "16 лютого 2027 р.");
  assert.equal(m.fileName, "Рапорт ЗМ-0011 версія 2.docx");
  assert.match(m.footnote, /ЗМ-0011, версія 2/u);
});

test("рапорт: заміни стоять на початку, далі позиції за переліком; суми й КЕКВ пораховано", () => {
  const m = raportModel(input());
  assert.deepEqual(m.tables.map((t) => t.heading), ["1. Заміна: замість запланованої позиції — інший предмет", "2. Закупівля за переліком (без заміни)"]);
  assert.match(m.request, /Розділ 1 — заміна запланованих позицій на схожі предмети, розділ 2 — закупівля запланованих позицій без заміни/u);
  assert.deepEqual(m.tables[0]?.head.slice(1, 3), ["Замість (позиція переліку)", "Просимо натомість"]);
  assert.equal(m.tables[0]?.rows[0]?.[6], "2210 → 3110", "зміна КЕКВ видна в рядку заміни");
  assert.equal(m.tables[0]?.head[3], "Стан замінюваного");
  const [replacement] = m.tables[0]?.rows ?? [];
  assert.equal(replacement?.[1], "ПМ-002 · Радіостанція");
  assert.equal(replacement?.[2], "ОБ-009 · Генератор");
  assert.equal(replacement?.[4], "компл.");
  const [byList] = m.tables[1]?.rows ?? [];
  assert.deepEqual([byList?.[1], byList?.[3], byList?.[4]], ["ПМ-001", "шт.", "2"]);
  assert.match(m.total, /53\s000,00/u);
  assert.match(m.byKekv, /2210 — 3\s000,00.*3110 — 50\s000,00/u);
});

test("рапорт: без замін одна таблиця з номером 1, без обґрунтування — позначка, а не порожнє місце", () => {
  const m = raportModel(input({ lines: [{ kind: "by_list", id: "l1", positionId: "p1", qty: 1, kekv: "2210" }], justification: "  " }));
  assert.deepEqual(m.tables.map((t) => t.heading), ["1. Закупівля за переліком (без заміни)"]);
  assert.equal(m.byKekv, "");
  assert.deepEqual(m.justification, []);
  assert.match(buildRaportHtml(input({ justification: "" })), /Обґрунтування ще не написано/u);
});

test("рапорт: текст автора екранується в HTML", () => {
  const html = buildRaportHtml(input({ justification: "<script>alert(1)</script>" }));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("підпис: «Прізвище Ім'я По батькові» → «Ім'я ПРІЗВИЩЕ»; коротке ім'я лишається як є", () => {
  assert.equal(signatureName("Гриневецька Анастасія Олегівна"), "Анастасія ГРИНЕВЕЦЬКА");
  assert.equal(signatureName("Адміністратор"), "Адміністратор");
});

test("рапорт: служба й джерело фінансування в тексті прохання, стан замінюваного — у таблиці замін", () => {
  const base = input();
  const m = raportModel({
    ...base,
    request: {
      ...base.request,
      service: "Служба зв'язку",
      funding: "special",
      sedoNumber: 5310042,
      lines: base.request.lines.map((l) => (l.kind === "replacement" ? { ...l, condition: "needs_repair" as const } : l)),
    },
  });
  assert.match(m.request, /для потреб в\/ч А0001 \(служба зв'язку\) за/u);
  assert.match(m.request, /за рахунок спеціального фонду/u);
  assert.equal(m.tables[0]?.rows[0]?.[3], "Потребує ремонту");
  assert.match(m.footnote, /Реєстраційний номер СЕДО 5310042/u);
});
