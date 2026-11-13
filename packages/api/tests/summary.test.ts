import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHOR_A, AUTHOR_B, AUTHOR_C, boot, lineOf, positionByName } from "./harness.ts";

test("остаточний перелік: автор бачить лише свою в/ч; Відділ і Голова — усі затверджені", async () => {
  const h = await boot();
  const a = await h.call("final", AUTHOR_A);
  assert.deepEqual(a.requests.map((r) => r.id), ["req-0001"]);
  assert.ok(a.requests.every((r) => r.route[0] === "unit-a" && r.status === "extract_issued"));
  assert.deepEqual(a.extracts.map((x) => x.unitId), ["unit-a"]);
  assert.ok(a.lists.every((l) => l.level === 5 && l.status === "approved" && l.sedoNumber !== null));

  // В/ч А0002: одна заявка чекає закупівлі, друга вже закуплена; в/ч А0003 — заявка, яку вже видано.
  assert.deepEqual((await h.call("final", AUTHOR_B)).requests.map((r) => r.id).sort(), ["req-0002", "req-0012"]);
  assert.deepEqual((await h.call("final", AUTHOR_C)).requests.map((r) => [r.id, r.status]), [["req-0013", "issued"]]);

  const all = await h.call("final", "prep-5-vor");
  assert.deepEqual(all.requests.map((r) => r.id).sort(), ["req-0001", "req-0002", "req-0012", "req-0013"]);
  assert.deepEqual([...new Set(all.extracts.map((x) => x.unitId))].sort(), ["unit-a", "unit-b", "unit-c"]);
  assert.equal((await h.call("final", "appr-5-vor")).lists.length, 2, "два остаточні переліки, підписані Головою");
});

test("витяги: рядок заміни має статус «Заміна погоджена» лише у витягу", async () => {
  const h = await boot();
  const { extracts, requests } = await h.call("final", "appr-5-vor");
  const statuses = extracts.flatMap((x) => x.lines.map((l) => `${l.kind}:${l.status}`));
  assert.ok(statuses.includes("replacement:replacement_agreed"));
  assert.ok(statuses.includes("by_list:approved"));
  assert.ok(!statuses.some((s) => s.endsWith("awaits_replacement_approval")));
  const lineIds = new Set(requests.flatMap((r) => r.lines.map((l) => l.id)));
  assert.ok(extracts.every((x) => x.lines.every((l) => lineIds.has(l.lineId))), "кожен рядок витягу є в заявці");
  assert.equal(extracts.flatMap((x) => x.lines).length, requests.reduce((n, r) => n + r.lines.length, 0), "у витягах усі рядки затверджених заявок");
});

test("нова затверджена заявка з'являється в остаточному переліку й витягу, а не раніше", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 4S");
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210", 2)], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  await h.call("submitRequest", AUTHOR_A, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } });
  assert.equal((await h.call("final", AUTHOR_A)).requests.length, 1, "поки йде маршрутом — її тут немає");

  for (const [level, unit] of [[1, "unit-a"], [2, "brig-1"], [3, "ru-1"], [4, "dir-1"], [5, "vor"]] as const) {
    const { list } = await h.call("formList", `prep-${level}-${unit}`, { body: { level, unitId: unit, requestIds: [request.id] } });
    await h.call("approveList", level === 5 ? `prep-5-${unit}` : `appr-${level}-${unit}`, { params: { id: list.id }, body: { sedoNumber: 100 + level } });
  }
  const after = await h.call("final", AUTHOR_A);
  assert.deepEqual(after.requests.map((r) => r.id).sort(), ["req-0001", request.id].sort());
  assert.ok(after.extracts.some((x) => x.requestIds.includes(request.id)));
});

test("зведення: лише ролі рівнів і адміністратор; автор — відмова", async () => {
  const h = await boot();
  assert.equal((await h.fail("kpi", AUTHOR_A, 403)).code, "FORBIDDEN_ROLE");
  for (const user of ["prep-1-unit-a", "appr-3-ru-1", "prep-5-vor", "admin-demo"]) await h.call("kpi", user);
  // Зведення — по зоні: уповноважений в/ч А0001 рахує лише заявки своєї в/ч.
  const unitA = await h.call("kpi", "prep-1-unit-a");
  const unitATotal = Object.values(unitA.byStatus).reduce((x, y) => x + y, 0);
  assert.equal(unitATotal, (await h.call("registry", "prep-1-unit-a")).requests.length);
  assert.ok(unitATotal < 13);
});

test("зведення: статуси, дні на рівнях, частка повернень і бюджет за КЕКВ відповідають демо-даним", async () => {
  const h = await boot();
  const k = await h.call("kpi", "appr-5-vor");
  assert.deepEqual(k.byStatus, { draft: 1, at_level: 5, in_list: 1, returned: 1, approved: 0, extract_issued: 2, procured: 1, issued: 1, not_procured: 0, withdrawn: 1 });
  assert.equal(Object.values(k.byStatus).reduce((a, b) => a + b, 0), 13);
  assert.equal(k.returnShare, 1 / 12, "1 повернута із 12 поданих");
  // Рівень 3 пройшли за 2, 2, 1, 1 і двічі за 0 днів, а одна заявка лежить там 13 днів: (2+2+13+1+1+0+0)/7.
  assert.equal(k.avgDaysByLevel["3"], Math.round((19 / 7) * 10) / 10);
  assert.deepEqual(Object.keys(k.avgDaysByLevel), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(k.budgetByKekv.map((l) => l.scope), ["TOTAL", "2210", "2220", "3110"]);
  const k3110 = k.budgetByKekv.find((l) => l.scope === "3110")!;
  assert.equal(k3110.remainingMinor, 100_000_00);
  assert.ok(k3110.inWorkMinor > k3110.remainingMinor);
});

test("зведення оновлюється: повернення збільшує частку, «Наступний день» збільшує дні на рівнях", async () => {
  const h = await boot();
  const before = await h.call("kpi", "prep-3-ru-1");
  const request = (await h.call("requestDetail", AUTHOR_B, { params: { id: "req-0003" } })).request;
  await h.call("returnRequest", "prep-3-ru-1", { params: { id: "req-0003" }, body: { note: "ні", expectedRevision: request.revision } });
  const returned = await h.call("kpi", "prep-3-ru-1");
  assert.equal(returned.byStatus.returned, before.byStatus.returned + 1);
  assert.equal(returned.byStatus.at_level, before.byStatus.at_level - 1);
  assert.equal(returned.returnShare, 2 / 12);

  await h.call("nextDay", AUTHOR_A);
  const later = await h.call("kpi", "prep-3-ru-1");
  assert.ok((later.avgDaysByLevel["1"] ?? 0) > (returned.avgDaysByLevel["1"] ?? 0) || (later.avgDaysByLevel["2"] ?? 0) > (returned.avgDaysByLevel["2"] ?? 0), "лежачі заявки додають по дню");
});
