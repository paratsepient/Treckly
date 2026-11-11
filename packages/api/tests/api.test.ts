import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualClock, createSequentialIds, type Actor, type DomainContext, type RequestLine } from "@dsp/domain";
import { idempotencyKeys, journal, openDb } from "@dsp/db";
import { createApp, createInProcessFetch, createRandomIds } from "../src/index.ts";

const ROUTE = ["unit-vch", "unit-brig", "unit-ru", "dir-1", "vor"] as const;
const author: Actor = { userId: "u-author", role: { kind: "author", unitId: "unit-vch" } };
const preparer: Actor = { userId: "u-prep", role: { kind: "preparer", level: 1, unitId: "unit-vch" } };
const lines: RequestLine[] = [{ kind: "by_list", id: "l1", positionId: "pos-1", qty: 2, kekv: "2210" }];

async function setup(ctxOverride?: Partial<DomainContext>) {
  const { pg, db } = await openDb();
  const ctx: DomainContext = { clock: createManualClock("2027-02-01T09:00:00Z"), ids: createSequentialIds(), ...ctxOverride };
  const app = createApp({ db, ctx, directionId: "dir-1", route: ROUTE });
  const api = createInProcessFetch(app);
  let n = 0;
  const call = (method: string, path: string, body: unknown, actor: Actor = author, key = `k-${(n += 1)}`) =>
    api(`http://app.local${path}`, {
      method,
      headers: { "content-type": "application/json", "idempotency-key": key, "x-actor": JSON.stringify(actor) },
      body: body === undefined ? null : JSON.stringify(body),
    });
  const count = async (table: "requests" | "journal") => Number((await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]?.n);
  return { pg, db, api, call, count };
}

const json = async <T>(res: Response) => (await res.json()) as T;

test("створення чернетки через API: 201, запис у базі й у журналі", async () => {
  const { call, count, api } = await setup();
  const res = await call("POST", "/api/requests", { lines });
  assert.equal(res.status, 201);
  const { request } = await json<{ request: { id: string; status: string; revision: number } }>(res);
  assert.equal(request.status, "draft");
  assert.equal(await count("requests"), 1);
  assert.equal(await count("journal"), 1);

  const list = await json<{ requests: { id: string }[] }>(await api("http://app.local/api/requests"));
  assert.deepEqual(list.requests.map((r) => r.id), [request.id]);
});

test("ідемпотентність: той самий ключ повертає ту саму відповідь і не створює дубль", async () => {
  const { call, count } = await setup();
  const first = await json<{ request: { id: string } }>(await call("POST", "/api/requests", { lines }, author, "same-key"));
  const second = await json<{ request: { id: string } }>(await call("POST", "/api/requests", { lines }, author, "same-key"));
  assert.equal(second.request.id, first.request.id);
  assert.equal(await count("requests"), 1);
  assert.equal(await count("journal"), 1);
});

test("без Idempotency-Key зміна відхиляється", async () => {
  const { api } = await setup();
  const res = await api("http://app.local/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor": JSON.stringify(author) },
    body: JSON.stringify({ lines }),
  });
  assert.equal(res.status, 400);
  assert.equal((await json<{ error: { code: string } }>(res)).error.code, "VALIDATION");
});

test("редагування рядків з актуальною версією: 200 і revision +1", async () => {
  const { call } = await setup();
  const { request } = await json<{ request: { id: string; revision: number } }>(await call("POST", "/api/requests", { lines }));
  const res = await call("PUT", `/api/requests/${request.id}/lines`, { lines: [{ ...lines[0], qty: 3 }], expectedRevision: request.revision });
  assert.equal(res.status, 200);
  assert.equal((await json<{ request: { revision: number } }>(res)).request.revision, request.revision + 1);
});

test("VERSION_CONFLICT: застаріла версія → 409; паралельні зміни — проходить рівно одна", async () => {
  const { call } = await setup();
  const { request } = await json<{ request: { id: string; revision: number } }>(await call("POST", "/api/requests", { lines }));
  const edit = (qty: number, expectedRevision: number) => call("PUT", `/api/requests/${request.id}/lines`, { lines: [{ ...lines[0], qty }], expectedRevision });

  assert.equal((await edit(3, request.revision)).status, 200); // тепер версія запису — 2
  const stale = await edit(5, request.revision); // клієнт усе ще бачить версію 1
  assert.equal(stale.status, 409);
  assert.equal((await json<{ error: { code: string } }>(stale)).error.code, "VERSION_CONFLICT");

  const race = await Promise.all([edit(6, request.revision + 1), edit(7, request.revision + 1)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
});

test("FORBIDDEN_ROLE: створює лише автор; без X-Actor — також відмова", async () => {
  const { call, api } = await setup();
  const res = await call("POST", "/api/requests", { lines }, preparer);
  assert.equal(res.status, 403);
  assert.equal((await json<{ error: { code: string } }>(res)).error.code, "FORBIDDEN_ROLE");
  const anonymous = await api("http://app.local/api/requests", { method: "POST", headers: { "idempotency-key": "x" }, body: JSON.stringify({ lines }) });
  assert.equal(anonymous.status, 403);
});

test("тіло запиту перевіряється контрактом: дробова кількість і відсутні поля відхиляються", async () => {
  const { call, count } = await setup();
  assert.equal((await call("POST", "/api/requests", { lines: [{ ...lines[0], qty: 1.5 }] })).status, 400);
  assert.equal((await call("POST", "/api/requests", {})).status, 400);
  assert.equal((await call("PUT", "/api/requests/r/lines", { lines })).status, 400, "без expectedRevision");
  assert.equal(await count("requests"), 0);
});

test("відкат: збій під час запису скасовує й попередні записи тієї ж команди, ключ не зберігається", async () => {
  const { call, count, db, api } = await setup();
  const { request } = await json<{ request: { id: string; revision: number } }>(await call("POST", "/api/requests", { lines }, author, "create"));
  const journalBefore = await count("journal");

  // Два рядки з одним id: оновлення заявки вже виконано, а вставка рядків порушує ключ таблиці.
  const broken = await call("PUT", `/api/requests/${request.id}/lines`, { lines: [lines[0], lines[0]], expectedRevision: request.revision }, author, "broken");
  assert.equal(broken.status, 500);
  assert.equal((await json<{ error: { code: string } }>(broken)).error.code, "INTERNAL");

  assert.equal(await count("journal"), journalBefore, "журнал не змінився");
  const stored = (await json<{ requests: { revision: number; lines: unknown[] }[] }>(await api("http://app.local/api/requests"))).requests[0];
  assert.equal(stored?.revision, request.revision, "версія заявки відкотилась");
  assert.equal(stored?.lines.length, 1, "рядки лишились попередніми");
  assert.deepEqual((await db.select().from(idempotencyKeys)).map((k) => k.key), ["create"], "ключ невдалої команди не збережено — її можна повторити");
});

test("журнал через API: записи створення й зміни в порядку від найновішого", async () => {
  const { call, api } = await setup();
  const { request } = await json<{ request: { id: string; revision: number } }>(await call("POST", "/api/requests", { lines }));
  await call("PUT", `/api/requests/${request.id}/lines`, { lines: [{ ...lines[0], qty: 4 }], expectedRevision: request.revision });
  const { journal: entries } = await json<{ journal: { type: string }[] }>(await api("http://app.local/api/journal"));
  assert.deepEqual(entries.map((e) => e.type), ["request.edited", "request.created"]);
});

test("журнал у базі лише доповнюється й через API його змінити неможливо", async () => {
  const { call, db } = await setup();
  await call("POST", "/api/requests", { lines });
  assert.equal((await db.select().from(journal)).length, 1);
});

test("випадкові id застосунку унікальні між «сесіями»", () => {
  const a = createRandomIds();
  const b = createRandomIds();
  const ids = new Set([...Array(50)].flatMap(() => [a.next("req"), b.next("req")]));
  assert.equal(ids.size, 100);
  assert.ok([...ids].every((id) => /^req-[0-9a-f]{8}$/.test(id)));
});
