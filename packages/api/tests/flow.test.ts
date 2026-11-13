import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyLists } from "@dsp/db";
import { AUTHOR_A, AUTHOR_B, boot, lineOf, positionByName, seed, type Harness } from "./harness.ts";

const itemNamed = async (h: Harness, name: string) => {
  const { items } = await h.call("reference", AUTHOR_A);
  const found = items.find((i) => i.name === name);
  assert.ok(found, `предмета «${name}» немає`);
  return found;
};

/** Заміна `qty` позиції плану на `newQty` предмета `name` на суму `totalMinor` (не більшу за замінене). */
async function replacementLine(h: Harness, positionName: string, name: string, kekv: string, qty: number, totalMinor: number, newQty = 1) {
  const position = await positionByName(h, positionName);
  return {
    kind: "replacement" as const,
    id: "ln-rep",
    positionId: position.id,
    qty,
    kekv: position.kekv,
    newItem: { code: "", name, kekv, qty: newQty, totalMinor, measure: "компл." },
  };
}

test("E1: заміна на інший КЕКВ — автоперевірка показує вплив на бюджет, заявка подається й видна в «Моїх заявках»", async () => {
  const h = await boot();
  // 10 антен по 900 грн (9 000 грн) замінюють однією антенною системою за 8 000 грн у КЕКВ 3110.
  const line = await replacementLine(h, "Антена всеспрямована 2,4 ГГц", "Антенна система мобільна", "3110", 10, 8_000_00);

  // Дорожче за замінене — не можна.
  const over = await h.call("checkRequest", AUTHOR_A, { body: { lines: [{ ...line, newItem: { ...line.newItem, totalMinor: 9_000_01 } }] } });
  assert.ok(over.report.errors.some((e) => e.code === "REPLACEMENT_OVER_SUM"));

  const { report } = await h.call("checkRequest", AUTHOR_A, { body: { lines: [line] } });
  assert.equal(report.ok, true);
  assert.deepEqual(report.impact.perKekv, { "3110": 8_000_00 }, "новий КЕКВ витрачається; старий не змінюється");
  assert.equal(report.impact.total, 8_000_00);
  assert.ok(report.warnings.some((w) => w.details["scope"] === "3110"), "разом із заявками «у роботі» перевищено залишок 3110");

  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [line], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  assert.equal(request.status, "draft");
  assert.deepEqual(request.route, ["unit-a", "brig-1", "ru-1", "dir-1", "vor"]);
  assert.equal(request.createdOn, seed.now.slice(0, 10), "дата — із симульованого часу, а не з системного годинника");

  const submitted = await h.call("submitRequest", AUTHOR_A, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } });
  assert.equal(submitted.request.status, "at_level");
  assert.equal(submitted.request.level, 1);
  assert.equal(submitted.request.levelEnteredOn, seed.now.slice(0, 10));

  const mine = await h.call("myRequests", AUTHOR_A);
  assert.equal(mine.requests[0]?.id, request.id, "нова заявка згори");

  const detail = await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } });
  assert.deepEqual(detail.track.steps.map((s) => s.state), ["current", "pending", "pending", "pending", "pending"]);
  assert.equal(detail.lineStatuses["ln-rep"], "awaits_replacement_approval");
  assert.deepEqual(detail.journal.map((e) => e.type), ["request.created", "request.submitted"]);
});

test("автоперевірки: кожен код помилки показано в звіті, подання з помилкою відхиляється й чернетка лишається", async () => {
  const h = await boot();
  const drone = await positionByName(h, "Квадрокоптер розвідувальний"); // 185 000 грн, КЕКВ 3110
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S"); // КЕКВ 2210

  const cases = [
    { line: lineOf("pos-zzz", "2210"), code: "NOT_IN_LIST" },
    { line: lineOf(battery.id, "2210", battery.availableQty + 1), code: "QTY_EXCEEDED" },
    { line: lineOf(battery.id, "3110"), code: "KEKV_MISMATCH" },
    { line: lineOf(drone.id, "3110"), code: "BUDGET_EXCEEDED" },
  ];
  for (const { line, code } of cases) {
    const { report } = await h.call("checkRequest", AUTHOR_A, { body: { lines: [line] } });
    assert.equal(report.ok, false, code);
    assert.ok(report.errors.some((e) => e.code === code), `очікували ${code}, є ${report.errors.map((e) => e.code)}`);
  }

  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [cases[3]!.line], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  const error = await h.fail("submitRequest", AUTHOR_A, 422, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } });
  assert.equal(error.code, "BUDGET_EXCEEDED");
  const after = await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } });
  assert.equal(after.request.status, "draft");
  assert.equal(after.request.revision, request.revision);
});

test("план в/ч: позиція напрямку, якої немає в плані в/ч, не проходить; більше за план — теж", async () => {
  const h = await boot();
  const { items } = await h.call("property", AUTHOR_A);
  const plannedNames = new Set(items.filter((i) => i.tab === "planned").map((i) => i.item.name));
  const { positions } = await h.call("positions", AUTHOR_A);
  const outside = positions.find((p) => !plannedNames.has(p.name) && p.availableQty > 0);
  assert.ok(outside, "у демо-даних є позиція напрямку поза планом в/ч А0001");

  const notPlanned = await h.call("checkRequest", AUTHOR_A, { body: { lines: [lineOf(outside.id, outside.kekv)] } });
  assert.deepEqual(notPlanned.report.errors.map((e) => [e.code, e.details["reason"]]), [["NOT_IN_LIST", "NOT_IN_UNIT_PLAN"]]);
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(outside.id, outside.kekv)], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  const refused = await h.fail("submitRequest", AUTHOR_A, 422, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } });
  assert.equal(refused.code, "NOT_IN_LIST");
  assert.equal((await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } })).request.status, "draft");

  // Інша в/ч має власний план: що заплановано в А0001, не означає, що можна в А0002.
  const planB = new Set((await h.call("property", "author-unit-b")).items.filter((i) => i.tab === "planned").map((i) => i.item.name));
  const onlyA = positions.find((p) => plannedNames.has(p.name) && !planB.has(p.name));
  if (onlyA) {
    const other = await h.call("checkRequest", "author-unit-b", { body: { lines: [lineOf(onlyA.id, onlyA.kekv)] } });
    assert.equal(other.report.errors[0]?.details["reason"], "NOT_IN_UNIT_PLAN");
  }
  // Позиція плану, якої немає в жодній незавершеній заявці в/ч (інакше спрацює POSITION_BUSY).
  const planned = items.find((i) => i.tab === "planned" && i.item.name === "Павербанк 20 000 мА·год")!;
  const position = positions.find((p) => p.name === planned.item.name)!;
  const over = await h.call("checkRequest", AUTHOR_A, { body: { lines: [lineOf(position.id, position.kekv, planned.qty + 1)] } });
  assert.ok(over.report.errors.some((e) => e.code === "QTY_EXCEEDED"));

  // Позиція з іншої незавершеної заявки в/ч — POSITION_BUSY.
  const mine = (await h.call("myRequests", AUTHOR_A)).requests.find((r) => r.status === "at_level" || r.status === "in_list")!;
  const busyLine = mine.lines[0]!;
  const busy = await h.call("checkRequest", AUTHOR_A, { body: { lines: [lineOf(busyLine.positionId, busyLine.kekv, 1)] } });
  assert.equal(busy.report.errors[0]?.code, "POSITION_BUSY");
});

test("перевірка не змінює стан: ні заявок, ні журналу", async () => {
  const h = await boot();
  const [requests, journal] = [await h.count("requests"), await h.count("journal")];
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  await h.call("checkRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210")] } });
  assert.equal(await h.count("requests"), requests);
  assert.equal(await h.count("journal"), journal);
});

test("автор редагує чернетку; заявка в черзі вже не редагується", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210", 1)], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  const edited = await h.call("editLines", AUTHOR_A, { params: { id: request.id }, body: { lines: [lineOf(battery.id, "2210", 5)], expectedRevision: request.revision } });
  assert.equal(edited.request.lines[0]?.qty, 5);
  assert.equal(edited.request.revision, request.revision + 1);

  await h.call("submitRequest", AUTHOR_A, { params: { id: request.id }, body: { expectedRevision: edited.request.revision, sedoNumber: 4100 } });
  const current = (await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } })).request;
  const refused = await h.fail("editLines", AUTHOR_A, 409, { params: { id: request.id }, body: { lines: [], expectedRevision: current.revision } });
  assert.equal(refused.code, "INVALID_TRANSITION");
});

test("повернута заявка: автор виправляє й подає нову версію — вона йде з першого рівня", async () => {
  const h = await boot();
  const returned = (await h.call("myRequests", AUTHOR_B)).requests.find((r) => r.status === "returned")!;
  assert.equal(returned.version, 1);

  const lines = returned.lines.map((l) => ({ ...l, qty: Math.max(1, Math.floor(l.qty / 2)) }));
  const edited = await h.call("editLines", AUTHOR_B, { params: { id: returned.id }, body: { lines, expectedRevision: returned.revision } });
  const resubmitted = await h.call("newVersion", AUTHOR_B, { params: { id: returned.id }, body: { expectedRevision: edited.request.revision, sedoNumber: 4100 } });
  assert.equal(resubmitted.request.version, 2);
  assert.equal(resubmitted.request.status, "at_level");
  assert.equal(resubmitted.request.level, 1);
  assert.equal(resubmitted.request.returnInfo, null);

  const detail = await h.call("requestDetail", AUTHOR_B, { params: { id: returned.id } });
  assert.deepEqual(detail.track.steps.map((s) => s.state), ["current", "pending", "pending", "pending", "pending"]);
  assert.ok(detail.journal.some((e) => e.type === "request.resubmitted" && e.requestVersion === 2));
});

test("«Подати» для повернутої й «Нова версія» для чернетки — різні операції: помилкова відхиляється", async () => {
  const h = await boot();
  const returned = (await h.call("myRequests", AUTHOR_B)).requests.find((r) => r.status === "returned")!;
  assert.equal((await h.fail("submitRequest", AUTHOR_B, 409, { params: { id: returned.id }, body: { expectedRevision: returned.revision, sedoNumber: 4100 } })).code, "INVALID_TRANSITION");
  const draft = (await h.call("myRequests", AUTHOR_A)).requests.find((r) => r.status === "draft")!;
  assert.equal((await h.fail("newVersion", AUTHOR_A, 409, { params: { id: draft.id }, body: { expectedRevision: draft.revision, sedoNumber: 4100 } })).code, "INVALID_TRANSITION");
});

test("відкликання: з черги — одразу; із сформованого переліку — спершу розформовує його; після затвердження — ні", async () => {
  const h = await boot();
  const mine = (await h.call("myRequests", AUTHOR_A)).requests;

  const queued = mine.find((r) => r.status === "at_level")!;
  const w1 = await h.call("withdrawRequest", AUTHOR_A, { params: { id: queued.id }, body: { expectedRevision: queued.revision } });
  assert.equal(w1.request.status, "withdrawn");

  const listed = mine.find((r) => r.status === "in_list")!;
  const w2 = await h.call("withdrawRequest", AUTHOR_A, { params: { id: listed.id }, body: { expectedRevision: listed.revision } });
  assert.equal(w2.request.status, "withdrawn");
  const lists = await h.db.select().from(dailyLists);
  assert.equal(lists.find((l) => l.id === listed.listId)?.status, "disbanded");

  const approved = mine.find((r) => r.status === "extract_issued")!;
  assert.equal((await h.fail("withdrawRequest", AUTHOR_A, 409, { params: { id: approved.id }, body: { expectedRevision: approved.revision } })).code, "INVALID_TRANSITION");
});

test("ролі: не автор і адміністратор заявок не створюють; чужу заявку редагувати не можна", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const body = { lines: [lineOf(battery.id, "2210")] };
  assert.equal((await h.fail("createRequest", "prep-1-unit-a", 403, { body })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("createRequest", "admin-demo", 403, { body })).code, "FORBIDDEN_ROLE");

  const foreign = (await h.call("myRequests", AUTHOR_A)).requests.find((r) => r.status === "draft")!;
  const error = await h.fail("editLines", AUTHOR_B, 403, { params: { id: foreign.id }, body: { lines: [], expectedRevision: foreign.revision } });
  assert.equal(error.code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("withdrawRequest", AUTHOR_B, 403, { params: { id: foreign.id }, body: { expectedRevision: foreign.revision } })).code, "FORBIDDEN_ROLE");
});

test("«Скинути демо» очищає всі рапорти; «з прикладами» повертає демо-стан", async () => {
  let resets = 0;
  const h = await boot({ onReset: () => (resets += 1) });
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const before = (await h.call("registry", AUTHOR_A)).requests;
  await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210")], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  assert.equal((await h.call("registry", AUTHOR_A)).requests.length, before.length + 1);

  // Скидання за замовчуванням: жодної заявки, переліку, витягу, сповіщення; структура, план і ліміти лишаються.
  await h.call("resetDemo", AUTHOR_A, { body: {} });
  assert.equal(resets, 1);
  assert.deepEqual((await h.call("registry", AUTHOR_A)).requests, []);
  assert.deepEqual((await h.call("final", "prep-5-vor")).requests, []);
  assert.deepEqual((await h.call("final", "prep-5-vor")).extracts, []);
  assert.deepEqual((await h.call("notifications", AUTHOR_A)).notifications, []);
  assert.deepEqual((await h.call("levelQueue", "prep-1-unit-a", { params: { level: "1" } })).lists, []);
  const budget = (await h.call("budget", AUTHOR_A)).lines;
  assert.ok(budget.every((l) => l.approvedMinor === 0 && l.inWorkMinor === 0 && l.remainingMinor === l.limitMinor), "нічого не зарезервовано");
  assert.ok((await h.call("property", AUTHOR_A)).items.some((i) => i.tab === "planned"), "план в/ч лишився");
  // Після чистого скидання систему можна одразу використовувати: заявка подається.
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210")], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  await h.call("submitRequest", AUTHOR_A, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } });

  // З прикладами — той самий початковий демо-стан.
  await h.call("resetDemo", AUTHOR_A, { body: { withExamples: true } });
  assert.equal(resets, 2);
  assert.deepEqual((await h.call("registry", AUTHOR_A)).requests, before);
});

test("закупівля через API: Відділ оборонних ресурсів підтверджує, видає актом; майно в/ч змінюється; інші ролі — відмова", async () => {
  const h = await boot();
  // ЗМ-0001 (в/ч А0001) затверджена з витягом у демо-даних.
  const request = (await h.call("requestDetail", "admin-demo", { params: { id: "req-0001" } })).request;
  assert.equal(request.status, "extract_issued");
  const quantities = Object.fromEntries(request.lines.map((l) => [l.id, l.qty]));
  const body = { acceptanceDoc: "АП-2027-17", recipient: "Склад бази", quantities, expectedRevision: request.revision };
  assert.equal((await h.fail("procureRequest", "admin-demo", 403, { params: { id: request.id }, body })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("procureRequest", "prep-4-dir-1", 403, { params: { id: request.id }, body })).code, "FORBIDDEN_ROLE");
  const wrong = await h.fail("procureRequest", "prep-5-vor", 409, { params: { id: request.id }, body: { ...body, quantities: { ...quantities, [request.lines[0]!.id]: 0 } } });
  assert.equal(wrong.details?.["reason"], "QTY_MISMATCH");

  const onBaseBefore = (await h.call("property", AUTHOR_A)).items.filter((i) => i.tab === "on_base").reduce((s, i) => s + i.qty, 0);
  const procured = (await h.call("procureRequest", "prep-5-vor", { params: { id: request.id }, body })).request;
  assert.equal(procured.status, "procured");
  const onBaseAfter = (await h.call("property", AUTHOR_A)).items.filter((i) => i.tab === "on_base").reduce((s, i) => s + i.qty, 0);
  assert.equal(onBaseAfter - onBaseBefore, request.lines.reduce((s, l) => s + l.qty, 0), "нове — на складі бази, закріплене за в/ч");

  const issued = (await h.call("issueRequest", "prep-5-vor", { params: { id: request.id }, body: { act: "АВ-5", expectedRevision: procured.revision } })).request;
  assert.equal(issued.status, "issued");
  const onBaseIssued = (await h.call("property", AUTHOR_A)).items.filter((i) => i.tab === "on_base").reduce((s, i) => s + i.qty, 0);
  assert.equal(onBaseIssued, onBaseBefore, "видане зникає зі складу бази");
  assert.ok((await h.call("notifications", AUTHOR_A)).notifications.some((n) => n.kind === "request_issued"));
  // Резерв бюджету не змінюється: закуплене й видане лишаються затвердженими.
  assert.ok((await h.call("final", "prep-5-vor")).requests.some((r) => r.id === request.id));
});

test("не виконано через API: резерв вивільняється, заявка зникає з затверджених", async () => {
  const h = await boot();
  const request = (await h.call("requestDetail", "admin-demo", { params: { id: "req-0002" } })).request;
  const before = (await h.call("budget", AUTHOR_A)).lines.find((l) => l.scope === "TOTAL")!.approvedMinor;
  await h.call("notProcuredRequest", "prep-5-vor", { params: { id: request.id }, body: { note: "Постачальник не виконав договір", expectedRevision: request.revision } });
  const after = (await h.call("budget", AUTHOR_A)).lines.find((l) => l.scope === "TOTAL")!.approvedMinor;
  assert.ok(after < before, "резерв вивільнено");
  assert.ok(!(await h.call("final", "prep-5-vor")).requests.some((r) => r.id === request.id));
});
