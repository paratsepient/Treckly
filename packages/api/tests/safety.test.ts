import assert from "node:assert/strict";
import { test } from "node:test";
import { idempotencyKeys } from "@dsp/db";
import { AUTHOR_A, boot, lineOf, positionByName } from "./harness.ts";

test("ідемпотентність: той самий ключ повертає ту саму відповідь і не створює дубль", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const body = { lines: [lineOf(battery.id, "2210")] };
  const [requests, journal] = [await h.count("requests"), await h.count("journal")];
  const first = await h.call("createRequest", AUTHOR_A, { body, key: "same" });
  const second = await h.call("createRequest", AUTHOR_A, { body, key: "same" });
  assert.equal(second.request.id, first.request.id);
  assert.equal(await h.count("requests"), requests + 1);
  assert.equal(await h.count("journal"), journal + 1);
});

test("зміна без ключа ідемпотентності відхиляється", async () => {
  const h = await boot();
  const res = await h.app.request("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: [] }) });
  assert.equal(res.status, 400);
});

test("VERSION_CONFLICT: застаріла версія → 409; паралельні зміни — проходить рівно одна", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210", 1)] } });
  const edit = (qty: number, expectedRevision: number) =>
    h.raw(AUTHOR_A, "PUT", `/api/requests/${request.id}/lines`, { lines: [lineOf(battery.id, "2210", qty)], expectedRevision });

  assert.equal((await edit(2, request.revision)).status, 200);
  const stale = await edit(3, request.revision);
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { error: { code: string } }).error.code, "VERSION_CONFLICT");

  const race = await Promise.all([edit(4, request.revision + 1), edit(5, request.revision + 1)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
});

test("тіло запиту перевіряється контрактом: хибні дані → 400 VALIDATION, стан не змінюється", async () => {
  const h = await boot();
  const requests = await h.count("requests");
  const bad = [
    { lines: [{ kind: "by_list", id: "l", positionId: "p", qty: 1.5, kekv: "2210" }] },
    { lines: [{ kind: "replacement", id: "l", positionId: "p", qty: 1, kekv: "2210" }] },
    {},
    { lines: "no" },
  ];
  for (const body of bad) {
    const res = await h.raw(AUTHOR_A, "POST", "/api/requests", body);
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: { code: string; details: { issues: unknown[] } } };
    assert.equal(json.error.code, "VALIDATION");
    assert.ok(json.error.details.issues.length > 0);
  }
  assert.equal((await h.raw(AUTHOR_A, "POST", "/api/requests", undefined)).status, 400, "порожнє тіло");
  assert.equal((await h.raw(AUTHOR_A, "PUT", "/api/requests/x/lines", { lines: [] })).status, 400, "без expectedRevision");
  assert.equal(await h.count("requests"), requests);
});

test("запис про неіснуючу заявку → 404", async () => {
  const h = await boot();
  assert.equal((await h.fail("editLines", AUTHOR_A, 404, { params: { id: "req-nope" }, body: { lines: [], expectedRevision: 1 } })).code, "NOT_FOUND");
  assert.equal((await h.fail("withdrawRequest", AUTHOR_A, 404, { params: { id: "req-nope" }, body: { expectedRevision: 1 } })).code, "NOT_FOUND");
});

test("відкат: збій під час запису скасовує й попередні записи тієї ж команди, ключ не зберігається", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210", 1)] }, key: "create" });
  const journalBefore = await h.count("journal");

  // Кількість поза діапазоном цілого типу бази: домен і контракт її приймають, а вставка рядків падає —
  // уже після оновлення самої заявки. Усе, що команда встигла записати, має відкотитися.
  const huge = lineOf(battery.id, "2210", 3_000_000_000);
  const error = await h.fail("editLines", AUTHOR_A, 500, { params: { id: request.id }, body: { lines: [huge], expectedRevision: request.revision }, key: "broken" });
  assert.equal(error.code, "INTERNAL");

  assert.equal(await h.count("journal"), journalBefore, "журнал не змінився");
  const stored = (await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } })).request;
  assert.equal(stored.revision, request.revision, "версія заявки відкотилась");
  assert.equal(stored.lines[0]?.qty, 1, "рядки лишились попередніми");
  const keys = (await h.db.select().from(idempotencyKeys)).map((k) => k.key);
  assert.ok(keys.includes("create") && !keys.includes("broken"), "ключ невдалої команди не збережено — її можна повторити");
});

test("дублікат id рядків відхиляється доменом як 409, а не падає на базі; заявка не змінюється", async () => {
  const h = await boot();
  const battery = await positionByName(h, "Акумулятор літій-полімерний 6S");
  const line = lineOf(battery.id, "2210", 1);
  const [requests, journal] = [await h.count("requests"), await h.count("journal")];
  const created = await h.fail("createRequest", AUTHOR_A, 409, { body: { lines: [line, line] } });
  assert.equal(created.code, "INVALID_TRANSITION");
  assert.equal(created.details?.["reason"], "DUPLICATE_LINE_ID");
  assert.equal(await h.count("requests"), requests);

  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [line] } });
  const edited = await h.fail("editLines", AUTHOR_A, 409, { params: { id: request.id }, body: { lines: [line, line], expectedRevision: request.revision } });
  assert.equal(edited.details?.["reason"], "DUPLICATE_LINE_ID");
  assert.equal((await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } })).request.revision, request.revision);
  assert.equal(await h.count("journal"), journal + 1, "записано лише створення першої заявки");
});

test("журнал через API змінити неможливо, а база його захищає", async () => {
  const h = await boot();
  await assert.rejects(() => h.pg.query("delete from journal"), /append-only/);
  const { journal } = await h.call("journal", AUTHOR_A);
  assert.ok(journal.length > 0 && journal.length <= 200);
});
