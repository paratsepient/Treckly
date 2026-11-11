import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import {
  approveList,
  createDraft,
  buildTrack,
  createManualClock,
  createSequentialIds,
  formList,
  issueExtracts,
  returnRequest,
  submit,
  type Actor,
  type Audience,
  type Budget,
  type DailyList,
  type DomainErrorCode,
  type EventType,
  type Extract,
  type JournalEvent as DomainJournalEvent,
  type Level as DomainLevel,
  type LineStatus as DomainLineStatus,
  type Notification as DomainNotification,
  type NotificationKind as DomainNotificationKind,
  type Position,
  type Request as DomainRequest,
  type TrackStepState as DomainTrackStepState,
  type RequestLine as DomainRequestLine,
  type RequestStatus as DomainRequestStatus,
  type Route as DomainRoute,
} from "@dsp/domain";
import * as c from "../src/index.ts";

// ── Відповідність типам домену: порушення ловить компілятор ────────────────────

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <_T extends true>(): void => undefined;

// Перелічення збігаються точно.
assertTrue<Equal<z.infer<typeof c.RequestStatus>, DomainRequestStatus>>();
assertTrue<Equal<z.infer<typeof c.LineStatus>, DomainLineStatus>>();
assertTrue<Equal<z.infer<typeof c.NotificationKind>, DomainNotificationKind>>();
assertTrue<Equal<z.infer<typeof c.Level>, DomainLevel>>();
assertTrue<Equal<z.infer<typeof c.TrackStepState>, DomainTrackStepState>>();
// Усі коди помилок домену є в контракті.
assertTrue<DomainErrorCode extends z.infer<typeof c.ErrorCode> ? true : false>();

// Об'єкт за схемою придатний як об'єкт домену. Зворотний напрямок (домен → схема) перевіряє
// тест нижче: кожен об'єкт, який видає домен, розбирається схемами.
const toDomainRequest = (r: z.infer<typeof c.Request>): DomainRequest => r;
const toDomainList = (l: z.infer<typeof c.DailyList>): DailyList => l;
const toDomainLine = (l: z.infer<typeof c.RequestLine>): DomainRequestLine => l;
const toDomainRoute = (r: z.infer<typeof c.Route>): DomainRoute => r;
const toDomainAudience = (a: z.infer<typeof c.Audience>): Audience => a;
const toDomainPosition = (p: z.infer<typeof c.Position>): Position => p;
const toDomainBudget = (b: z.infer<typeof c.Budget>): Budget => b;
const toDomainExtract = (x: z.infer<typeof c.Extract>): Extract => x;
void [toDomainRequest, toDomainList, toDomainLine, toDomainRoute, toDomainAudience, toDomainPosition, toDomainBudget, toDomainExtract];

// ── Розбір реальних об'єктів домену ───────────────────────────────────────────

const ROUTE: DomainRoute = ["u-vch", "u-brig", "u-ru", "dir", "u-vor"];
const author: Actor = { userId: "a1", role: { kind: "author", unitId: "u-vch" } };
const system: Actor = { userId: "sys", role: { kind: "system" } };
const prep = (l: DomainLevel): Actor => ({ userId: `p${l}`, role: { kind: "preparer", level: l, unitId: ROUTE[l - 1] as string } });
const appr = (l: DomainLevel): Actor => ({ userId: `g${l}`, role: { kind: "approver", level: l, unitId: ROUTE[l - 1] as string } });
let n = 0;
const meta = (actor: Actor) => ({ actor, idempotencyKey: `k${(n += 1)}` });

const positions = { p1: { id: "p1", code: "A", name: "Дрон", kekv: "2210", priceMinor: 100_00, availableQty: 5 } };
const budget: Budget = { total: { limitMinor: 1_000_00, approvedMinor: 0 }, perKekv: { "2210": { limitMinor: 1_000_00, approvedMinor: 0 }, "3110": { limitMinor: 1_000_00, approvedMinor: 0 } } };

function allOutcomes() {
  const ctx = { clock: createManualClock("2027-02-01T09:00:00Z"), ids: createSequentialIds() };
  const outcomes = [];
  const lines = [{ kind: "replacement" as const, id: "l1", positionId: "p1", qty: 1, kekv: "2210", newItem: { code: "N", name: "Н", kekv: "3110", priceMinor: 90_00 } }];
  const created = createDraft(ctx, meta(author), { route: ROUTE, lines });
  outcomes.push(created);
  let req = created.requests[0]!;
  const submitted = submit(ctx, meta(author), { request: req, positions, budget, requests: [] });
  outcomes.push(submitted);
  req = submitted.requests[0]!;
  const returned = returnRequest(ctx, meta(prep(1)), { request: req, note: "Уточніть" });
  outcomes.push(returned);

  // Окремий шлях до затвердження й витягу.
  let cur = submitted.requests[0]!;
  let b = budget;
  for (const level of [1, 2, 3, 4, 5] as const) {
    const formed = formList(ctx, meta(prep(level)), { level, unitId: ROUTE[level - 1] as string, selected: [cur], existingLists: [] });
    const approved = approveList(ctx, meta(appr(level)), { list: formed.lists[0]!, requests: formed.requests, sedoNumber: 100 + level, positions, budget: b });
    outcomes.push(formed, approved);
    cur = approved.requests[0]!;
    if (approved.budget) b = approved.budget;
  }
  outcomes.push(issueExtracts(ctx, meta(system), { requests: [cur] }));
  return outcomes;
}

test("усе, що видає домен, проходить схеми контракту", () => {
  const outcomes = allOutcomes();
  assert.ok(outcomes.length >= 10);
  let checked = 0;
  for (const o of outcomes) {
    for (const r of o.requests) (c.Request.parse(r), (checked += 1));
    for (const l of o.lists) (c.DailyList.parse(l), (checked += 1));
    for (const e of o.events) (c.JournalEvent.parse(e), (checked += 1));
    for (const x of o.notifications) (c.Notification.parse(x), (checked += 1));
    for (const x of o.extracts ?? []) (c.Extract.parse(x), (checked += 1));
    if (o.budget) (c.Budget.parse(o.budget), (checked += 1));
  }
  assert.ok(checked > 40, `перевірено об'єктів: ${checked}`);
});

test("типи подій домену перелічені (контракт приймає будь-який рядок типу, домен — лише відомі)", () => {
  const known: EventType[] = ["request.created", "request.listed", "request.delisted", "list.formed"];
  for (const type of known) {
    assert.doesNotThrow(() => c.JournalEvent.parse({ type, at: "2027-02-01T09:00:00.000Z", actorId: "a", idempotencyKey: "k", requestId: null, listId: null, from: null, to: null, requestVersion: null, revision: null, data: {} }));
  }
});

test("схеми відхиляють хибні дані", () => {
  const good = allOutcomes()[0]!.requests[0]!;
  assert.throws(() => c.Request.parse({ ...good, status: "unknown" }));
  assert.throws(() => c.Request.parse({ ...good, level: 6 }));
  assert.throws(() => c.Request.parse({ ...good, route: ["a", "b"] }));
  assert.throws(() => c.Request.parse({ ...good, createdOn: "11.11.2026" }));
  assert.throws(() => c.RequestLine.parse({ kind: "replacement", id: "l", positionId: "p", qty: 1, kekv: "2210" }), "заміна без нового предмета");
  assert.throws(() => c.RequestLine.parse({ kind: "by_list", id: "l", positionId: "p", qty: 1.5, kekv: "2210" }), "дробова кількість");
  assert.throws(() => c.Money.parse(10.5), "гроші — цілі копійки");
});

// ── Реєстр ендпоінтів і команди ───────────────────────────────────────────────

test("реєстр API: пара «метод + шлях» унікальна, змінні шляху — відомі", () => {
  const seen = new Set<string>();
  for (const [name, e] of Object.entries(c.API)) {
    const key = `${e.method} ${e.path}`;
    assert.ok(!seen.has(key), `дубль ${key} (${name})`);
    seen.add(key);
    assert.ok(e.path.startsWith("/api/"), name);
    for (const param of e.path.match(/:[a-z]+/g) ?? []) assert.ok([":id", ":level"].includes(param), `${name}: ${param}`);
    if (e.method === "GET") assert.equal("input" in e, false, `${name}: GET без тіла`);
  }
  assert.ok(seen.size >= 25);
});

test("команди приймають коректні тіла й відхиляють некоректні", () => {
  const line = { kind: "by_list", id: "l1", positionId: "p1", qty: 1, kekv: "2210" };
  assert.doesNotThrow(() => c.API.createRequest.input.parse({ lines: [line] }));
  assert.throws(() => c.API.createRequest.input.parse({ lines: [{ ...line, qty: "1" }] }));
  assert.throws(() => c.API.editLines.input.parse({ lines: [line] }), "без expectedRevision");
  assert.throws(() => c.API.formList.input.parse({ level: 1, unitId: "u", requestIds: [] }), "порожній вибір");
  assert.throws(() => c.API.formList.input.parse({ level: 7, unitId: "u", requestIds: ["r"] }));
  assert.doesNotThrow(() => c.API.returnRequest.input.parse({ note: "", expectedRevision: 1 }), "порожню примітку відхиляє домен (NOTE_REQUIRED)");
});

test("номер СЕДО на межі контракту не відсікається: формат перевіряє домен, щоб API повернув SEDO_NUMBER_INVALID", () => {
  for (const sedoNumber of [123, "123", "abc", "", "12.5"]) {
    assert.doesNotThrow(() => c.API.approveList.input.parse({ sedoNumber }));
  }
  assert.throws(() => c.API.approveList.input.parse({}));
});

test("відповідь про помилку: код — один із відомих", () => {
  assert.doesNotThrow(() => c.ErrorResponse.parse({ error: { code: "VERSION_CONFLICT", message: "m", details: { id: "r" } } }));
  assert.throws(() => c.ErrorResponse.parse({ error: { code: "WHATEVER", message: "m" } }));
});

test("трек: рівно 5 кроків", () => {
  const step = (level: number) => ({ level, state: "pending", enteredOn: null, daysAtLevel: null, sedoNumber: null, inList: false });
  assert.doesNotThrow(() => c.RequestTrack.parse({ steps: [1, 2, 3, 4, 5].map(step) }));
  assert.throws(() => c.RequestTrack.parse({ steps: [1, 2, 3, 4].map(step) }));
});

test("трек, який будує домен, проходить схему контракту на кожному етапі шляху", () => {
  const outcomes = allOutcomes();
  const events = outcomes.flatMap((o) => o.events);
  const byId = new Map<string, DomainRequest>();
  for (const o of outcomes) for (const r of o.requests) byId.set(`${r.id}@${r.revision}`, r);
  assert.ok(byId.size >= 8);
  for (const request of byId.values()) {
    const track = buildTrack(request, events, "2027-02-10");
    assert.doesNotThrow(() => c.RequestTrack.parse({ steps: track }), `${request.id}@${request.revision} (${request.status})`);
  }
});
