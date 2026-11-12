import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyLists } from "@dsp/db";
import { AUTHOR_A, boot, lineOf, positionByName, seed, type Harness } from "./harness.ts";

const PREP_1A = "prep-1-unit-a";
const APPR_1A = "appr-1-unit-a";

/** Подає нову заявку автора в/ч А0001 з одним дешевим рядком і повертає її. */
/**
 * Дешеві позиції з плану в/ч А0001 по черзі: одна позиція не може бути у двох незавершених заявках в/ч,
 * тож кожна нова заявка в тесті бере наступну. Перша в кожному тесті — акумулятор 4S (1 800 грн).
 */
const CHEAP = ["Акумулятор літій-полімерний 4S", "Зарядний пристрій універсальний", "Павербанк 20 000 мА·год", "Антена всеспрямована 2,4 ГГц"];
const used = new WeakMap<Harness, number>();
async function submitCheap(h: Harness, qty = 1) {
  const n = used.get(h) ?? 0;
  used.set(h, n + 1);
  const battery = await positionByName(h, CHEAP[n % CHEAP.length] as string);
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(battery.id, "2210", qty)], justification: "Потреба підрозділу на 2027 рік.", service: "Служба зв'язку" } });
  return (await h.call("submitRequest", AUTHOR_A, { params: { id: request.id }, body: { expectedRevision: request.revision, sedoNumber: 4100 } })).request;
}

const queueOf = (h: Harness, user: string, level: number) => h.call("levelQueue", user, { params: { level: String(level) } });
const ids = (list: readonly { id: string }[]) => list.map((r) => r.id);

// ── Черга ─────────────────────────────────────────────────────────────────────

test("черга рівня: бачить лише свій рівень і підрозділ; у переліку й поза ним — окремо", async () => {
  const h = await boot();
  const q = await queueOf(h, PREP_1A, 1);
  assert.deepEqual(ids(q.queue), ["req-0010"], "у черзі в/ч А0001 одна заявка");
  assert.deepEqual(ids(q.listed.filter((r) => r.status === "in_list")), ["req-0009"], "заявка в сформованому переліку — окремо від черги");
  assert.ok(q.lists.some((l) => l.status === "formed" && l.requestIds.join() === "req-0009"));
  assert.ok(q.lists.every((l) => l.unitId === "unit-a" && l.level === 1));

  assert.deepEqual(ids((await queueOf(h, "prep-1-unit-b", 1)).queue), [], "в/ч А0002: черги немає");
  assert.deepEqual(ids((await queueOf(h, "prep-2-brig-1", 2)).queue), ["req-0008"]);
  assert.deepEqual(ids((await queueOf(h, "prep-3-ru-1", 3)).queue), ["req-0003"]);
  assert.deepEqual(ids((await queueOf(h, "prep-4-dir-1", 4)).queue), ["req-0006"]);
  assert.deepEqual(ids((await queueOf(h, "prep-5-vor", 5)).queue), ["req-0007"]);
  assert.deepEqual(ids((await queueOf(h, APPR_1A, 1)).queue), ["req-0010"], "керівник бачить ту саму чергу");
});

test("черга: чужий рівень, автор і адміністратор — відмова; найдовше очікувані згори", async () => {
  const h = await boot();
  assert.equal((await h.fail("levelQueue", PREP_1A, 403, { params: { level: "2" } })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("levelQueue", AUTHOR_A, 403, { params: { level: "1" } })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("levelQueue", "admin-demo", 403, { params: { level: "1" } })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("lists", AUTHOR_A, 403)).code, "FORBIDDEN_ROLE");

  const newer = await submitCheap(h);
  const q = await queueOf(h, PREP_1A, 1);
  assert.deepEqual(ids(q.queue), ["req-0010", newer.id], "req-0010 лежить від 9-го, нова — від сьогодні");
});

// ── Формування й розформування ────────────────────────────────────────────────

test("формування: обрані 2 із 3 — у переліку, необрана лишається в черзі; керівник отримує сповіщення", async () => {
  const h = await boot();
  const [a, b] = [await submitCheap(h), await submitCheap(h)];
  const queue = await queueOf(h, PREP_1A, 1);
  assert.equal(queue.queue.length, 3);

  const { list, requests } = await h.call("formList", PREP_1A, { body: { level: 1, unitId: "unit-a", requestIds: [b.id, a.id] } });
  assert.deepEqual(list.requestIds, [b.id, a.id], "порядок, який обрав користувач");
  assert.equal(list.status, "formed");
  assert.equal(list.date, seed.now.slice(0, 10));
  assert.ok(requests.every((r) => r.status === "in_list" && r.listId === list.id));

  const after = await queueOf(h, PREP_1A, 1);
  assert.deepEqual(ids(after.queue), ["req-0010"], "необрана лишилась");
  const approverInbox = await h.call("notifications", APPR_1A);
  assert.ok(approverInbox.notifications.some((n) => n.kind === "list_formed" && n.listId === list.id));
});

test("формування: другий перелік за день, чужа заявка, порожній вибір і чужий підрозділ відхиляються", async () => {
  const h = await boot();
  const [a, b] = [await submitCheap(h), await submitCheap(h)];
  await h.call("formList", PREP_1A, { body: { level: 1, unitId: "unit-a", requestIds: [a.id] } });

  const twice = await h.fail("formList", PREP_1A, 409, { body: { level: 1, unitId: "unit-a", requestIds: [b.id] } });
  assert.equal(twice.code, "INVALID_TRANSITION");
  assert.equal(twice.details?.["reason"], "LIST_EXISTS");

  assert.equal((await h.fail("formList", "prep-1-unit-b", 403, { body: { level: 1, unitId: "unit-a", requestIds: [b.id] } })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("formList", APPR_1A, 403, { body: { level: 1, unitId: "unit-a", requestIds: [b.id] } })).code, "FORBIDDEN_ROLE", "керівник не формує");
  assert.equal((await h.fail("formList", PREP_1A, 400, { body: { level: 1, unitId: "unit-a", requestIds: [] } })).code, "VALIDATION");
  assert.equal((await h.fail("formList", PREP_1A, 404, { body: { level: 1, unitId: "unit-a", requestIds: ["req-nope"] } })).code, "NOT_FOUND");
  const foreign = await h.fail("formList", "prep-1-unit-b", 409, { body: { level: 1, unitId: "unit-b", requestIds: ["req-0010"] } });
  assert.equal(foreign.code, "INVALID_TRANSITION", "заявка іншої в/ч не в черзі цього підрозділу");
});

test("формування: застаріла версія заявки → VERSION_CONFLICT і нічого не змінюється", async () => {
  const h = await boot();
  const request = await submitCheap(h);
  const lists = await h.count("daily_lists");
  const stale = await h.fail("formList", PREP_1A, 409, {
    body: { level: 1, unitId: "unit-a", requestIds: [request.id], expectedRevisions: { [request.id]: request.revision - 1 } },
  });
  assert.equal(stale.code, "VERSION_CONFLICT");
  assert.equal(await h.count("daily_lists"), lists);
});

test("розформування: лише той, хто сформував; заявки повертаються в чергу; перелік лишається в історії", async () => {
  const h = await boot();
  const a = await submitCheap(h);
  const { list } = await h.call("formList", PREP_1A, { body: { level: 1, unitId: "unit-a", requestIds: [a.id] } });

  assert.equal((await h.fail("disbandList", APPR_1A, 403, { params: { id: list.id }, body: {} })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("disbandList", "prep-1-unit-b", 403, { params: { id: list.id }, body: {} })).code, "FORBIDDEN_ROLE");

  const done = await h.call("disbandList", PREP_1A, { params: { id: list.id }, body: {} });
  assert.equal(done.list.status, "disbanded");
  assert.ok(done.requests.every((r) => r.status === "at_level" && r.listId === null));
  assert.ok(ids((await queueOf(h, PREP_1A, 1)).queue).includes(a.id));
  assert.equal((await h.db.select().from(dailyLists)).find((l) => l.id === list.id)?.status, "disbanded");
  assert.equal((await h.fail("disbandList", PREP_1A, 409, { params: { id: list.id }, body: {} })).code, "INVALID_TRANSITION", "вдруге не розформувати");
  assert.equal((await h.fail("disbandList", PREP_1A, 404, { params: { id: "list-nope" }, body: {} })).code, "NOT_FOUND");
});

// ── Погодження ────────────────────────────────────────────────────────────────

test("погодження: заявки переходять на рівень вище з номером СЕДО; повторний запит не дублює", async () => {
  const h = await boot();
  const seeded = (await queueOf(h, APPR_1A, 1)).lists.find((l) => l.status === "formed")!;
  const first = await h.call("approveList", APPR_1A, { params: { id: seeded.id }, body: { sedoNumber: "7777777" }, key: "approve-1" });
  assert.equal(first.list.status, "approved");
  assert.equal(first.list.sedoNumber, 7777777);
  assert.ok(first.requests.every((r) => r.status === "at_level" && r.level === 2));

  const journal = await h.count("journal");
  const replay = await h.call("approveList", APPR_1A, { params: { id: seeded.id }, body: { sedoNumber: "7777777" }, key: "approve-1" });
  assert.deepEqual(replay, first);
  assert.equal(await h.count("journal"), journal, "повтор із тим самим ключем нічого не пише");

  assert.ok(ids((await queueOf(h, "prep-2-brig-1", 2)).queue).includes("req-0009"), "заявка в черзі рівня 2");
  assert.equal((await h.fail("approveList", APPR_1A, 409, { params: { id: seeded.id }, body: { sedoNumber: 1 } })).code, "INVALID_TRANSITION", "погоджений перелік не погодити вдруге");
});

test("СЕДО: нечисловий номер відхиляється, перелік і заявки не змінюються; число — і рядком, і числом", async () => {
  const h = await boot();
  const list = (await queueOf(h, APPR_1A, 1)).lists.find((l) => l.status === "formed")!;
  for (const bad of ["abc", "", "12.5", "0", "-3", "1 000"]) {
    const error = await h.fail("approveList", APPR_1A, 422, { params: { id: list.id }, body: { sedoNumber: bad } });
    assert.equal(error.code, "SEDO_NUMBER_INVALID", `«${bad}»`);
  }
  const unchanged = (await queueOf(h, APPR_1A, 1)).lists.find((l) => l.id === list.id)!;
  assert.equal(unchanged.status, "formed");
  assert.equal(unchanged.sedoNumber, null);
  const ok = await h.call("approveList", APPR_1A, { params: { id: list.id }, body: { sedoNumber: 4242 } });
  assert.equal(ok.list.sedoNumber, 4242);
});

test("погодження: лише керівник свого рівня й підрозділу; застаріла версія → конфлікт", async () => {
  const h = await boot();
  const list = (await queueOf(h, APPR_1A, 1)).lists.find((l) => l.status === "formed")!;
  const body = { sedoNumber: 1 };
  assert.equal((await h.fail("approveList", PREP_1A, 403, { params: { id: list.id }, body })).code, "FORBIDDEN_ROLE", "уповноважена особа не погоджує");
  assert.equal((await h.fail("approveList", "appr-1-unit-b", 403, { params: { id: list.id }, body })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("approveList", "appr-2-brig-1", 403, { params: { id: list.id }, body })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("approveList", AUTHOR_A, 403, { params: { id: list.id }, body })).code, "FORBIDDEN_ROLE");
  const conflict = await h.fail("approveList", APPR_1A, 409, { params: { id: list.id }, body: { ...body, expectedRevisions: { [list.id]: 99 } } });
  assert.equal(conflict.code, "VERSION_CONFLICT");
  assert.equal((await h.fail("approveList", APPR_1A, 404, { params: { id: "list-nope" }, body })).code, "NOT_FOUND");
});

// ── Повний шлях ───────────────────────────────────────────────────────────────

const STEPS = [
  { level: 1, unit: "unit-a" },
  { level: 2, unit: "brig-1" },
  { level: 3, unit: "ru-1" },
  { level: 4, unit: "dir-1" },
  { level: 5, unit: "vor" },
] as const;

test("повний шлях: нова заявка проходить 5 рівнів, Голова затверджує — резерв бюджету, витяг, сповіщення, зменшена доступна кількість", async () => {
  const h = await boot();
  const request = await submitCheap(h, 3); // 3 × 1 800 грн = 5 400 грн, КЕКВ 2210
  const battery = await positionByName(h, "Акумулятор літій-полімерний 4S");
  const budgetBefore = (await h.call("budget", AUTHOR_A)).lines;

  for (const { level, unit } of STEPS) {
    const prep = `prep-${level}-${unit}`;
    // Рівень 5: підпис Голови відмічає Відділ (уповноважений рівня 5).
    const appr = level === 5 ? prep : `appr-${level}-${unit}`;
    const { list } = await h.call("formList", prep, { body: { level, unitId: unit, requestIds: [request.id] } });
    const detail = await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } });
    assert.equal(detail.track.steps[level - 1]?.inList, true, `рівень ${level}: у переліку`);
    const approved = await h.call("approveList", appr, { params: { id: list.id }, body: { sedoNumber: String(9_000_000 + level) } });
    assert.equal(approved.list.sedoNumber, 9_000_000 + level);
    if (level < 5) assert.equal(approved.requests[0]?.level, level + 1);
  }

  const final = (await h.call("requestDetail", AUTHOR_A, { params: { id: request.id } }));
  assert.equal(final.request.status, "extract_issued", "затвердження + витяг в одній транзакції");
  assert.deepEqual(final.track.steps.map((s) => s.state), ["done", "done", "done", "done", "done"]);
  assert.deepEqual(final.track.steps.map((s) => s.sedoNumber), [9000001, 9000002, 9000003, 9000004, 9000005]);

  const after = (await h.call("budget", AUTHOR_A)).lines;
  const k = (lines: typeof after, scope: string) => lines.find((l) => l.scope === scope)!;
  assert.equal(k(after, "2210").approvedMinor - k(budgetBefore, "2210").approvedMinor, 5_400_00, "резерв — лише при затвердженні");
  assert.equal(k(after, "TOTAL").approvedMinor - k(budgetBefore, "TOTAL").approvedMinor, 5_400_00);

  const positionAfter = (await positionByName(h, "Акумулятор літій-полімерний 4S")).availableQty;
  assert.equal(positionAfter, battery.availableQty - 3);

  const authorInbox = (await h.call("notifications", AUTHOR_A)).notifications.map((n) => n.kind);
  assert.ok(authorInbox.includes("request_approved") && authorInbox.includes("extract_issued"));
  const journalTypes = final.journal.map((e) => e.type);
  assert.equal(journalTypes.filter((t) => t === "request.advanced").length, 4);
  assert.deepEqual(journalTypes.slice(-2), ["request.approved", "request.extract_issued"]);
  assert.ok(final.journal.some((e) => e.actorId === "system"), "витяг сформовано системою");
});

test("затвердження Головою блокується, якщо сума не вміщується в залишок: перелік лишається сформованим, бюджет не змінюється", async () => {
  const h = await boot();
  // req-0006 (в/ч А0003): ~404 000 грн у КЕКВ 3110 при залишку 100 000 грн. Проводимо її на рівень 5.
  const route = [{ level: 4, unit: "dir-1" }] as const;
  for (const { level, unit } of route) {
    const { list } = await h.call("formList", `prep-${level}-${unit}`, { body: { level, unitId: unit, requestIds: ["req-0006"] } });
    await h.call("approveList", `appr-${level}-${unit}`, { params: { id: list.id }, body: { sedoNumber: 100 } });
  }
  const { list } = await h.call("formList", "prep-5-vor", { body: { level: 5, unitId: "vor", requestIds: ["req-0006"] } });
  const budgetBefore = (await h.call("budget", AUTHOR_A)).lines;

  // Голова в системі не погоджує: лише Відділ відмічає його підпис.
  assert.equal((await h.fail("approveList", "appr-5-vor", 403, { params: { id: list.id }, body: { sedoNumber: 200 } })).code, "FORBIDDEN_ROLE");
  const error = await h.fail("approveList", "prep-5-vor", 422, { params: { id: list.id }, body: { sedoNumber: 200 } });
  assert.equal(error.code, "BUDGET_EXCEEDED");
  assert.equal(error.details?.["scope"], "3110");
  assert.deepEqual((await h.call("budget", AUTHOR_A)).lines, budgetBefore);
  const still = (await queueOf(h, "prep-5-vor", 5)).lists.find((l) => l.id === list.id)!;
  assert.equal(still.status, "formed");
  assert.equal((await h.call("requestDetail", AUTHOR_A, { params: { id: "req-0006" } })).request.status, "in_list");
});

// ── Повернення ────────────────────────────────────────────────────────────────

test("повернення: примітка обов'язкова, лише уповноважена особа рівня, лише з черги", async () => {
  const h = await boot();
  const request = (await h.call("requestDetail", AUTHOR_A, { params: { id: "req-0010" } })).request;
  const body = { note: "Уточніть кількість", expectedRevision: request.revision };
  const params = { id: "req-0010" };

  assert.equal((await h.fail("returnRequest", PREP_1A, 422, { params, body: { ...body, note: "   " } })).code, "NOTE_REQUIRED");
  assert.equal((await h.fail("returnRequest", APPR_1A, 403, { params, body })).code, "FORBIDDEN_ROLE", "керівник повертає через уповноважену особу");
  assert.equal((await h.fail("returnRequest", "prep-1-unit-b", 403, { params, body })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("returnRequest", PREP_1A, 409, { params, body: { ...body, expectedRevision: request.revision - 1 } })).code, "VERSION_CONFLICT");

  const listed = (await h.call("requestDetail", AUTHOR_A, { params: { id: "req-0009" } })).request;
  assert.equal((await h.fail("returnRequest", PREP_1A, 409, { params: { id: "req-0009" }, body: { note: "ні", expectedRevision: listed.revision } })).code, "INVALID_TRANSITION", "із сформованого переліку — спершу розформувати");

  const done = await h.call("returnRequest", PREP_1A, { params, body });
  assert.equal(done.request.status, "returned");
  assert.equal(done.request.returnInfo?.note, "Уточніть кількість");
});

test("повернення з рівня 3: каскад сповіщень — автор і рівні 2, 1 з приміткою; рівень 4 нічого не отримує", async () => {
  const h = await boot();
  const request = (await h.call("requestDetail", "author-unit-b", { params: { id: "req-0003" } })).request;
  await h.call("returnRequest", "prep-3-ru-1", { params: { id: "req-0003" }, body: { note: "Не вміщується в КЕКВ", expectedRevision: request.revision } });

  const inbox = async (user: string) => (await h.call("notifications", user)).notifications.filter((n) => n.kind === "request_returned" && n.requestId === "req-0003");
  assert.equal((await inbox("author-unit-b")).length, 1);
  assert.equal((await inbox("author-unit-b"))[0]?.note, "Не вміщується в КЕКВ");
  assert.equal((await inbox("prep-2-brig-1")).length, 1, "рівень 2 (бригада)");
  assert.equal((await inbox("appr-2-brig-1")).length, 1, "обидві ролі рівня");
  assert.equal((await inbox("prep-1-unit-b")).length, 1, "рівень 1 (в/ч автора)");
  assert.equal((await inbox("prep-1-unit-a")).length, 0, "інша в/ч");
  assert.equal((await inbox("prep-4-dir-1")).length, 0, "вищі рівні не сповіщаються");
  assert.equal((await inbox("author-unit-a")).length, 0);

  const track = (await h.call("requestDetail", "author-unit-b", { params: { id: "req-0003" } })).track;
  assert.deepEqual(track.steps.map((s) => s.state), ["returned", "returned", "returned", "pending", "pending"]);
});

// ── Сповіщення й «Наступний день» ─────────────────────────────────────────────

test("сповіщення: нова заявка сповіщає уповноважену особу рівня 1; прочитання лише своїх", async () => {
  const h = await boot();
  const request = await submitCheap(h);
  const inbox = await h.call("notifications", PREP_1A);
  const mine = inbox.notifications.find((n) => n.kind === "request_submitted" && n.requestId === request.id);
  assert.ok(mine && mine.readAt === null);
  assert.equal((await h.call("notifications", "appr-1-unit-a")).notifications.some((n) => n.requestId === request.id), false, "керівник про подання не сповіщається");
  assert.deepEqual((await h.call("notifications", "admin-demo")).notifications, []);

  await h.call("markRead", PREP_1A, { body: { ids: [mine.id] } });
  const after = (await h.call("notifications", PREP_1A)).notifications;
  assert.ok(after.find((n) => n.id === mine.id)?.readAt);
  await h.call("markRead", PREP_1A, { body: {} });
  assert.ok((await h.call("notifications", PREP_1A)).notifications.every((n) => n.readAt !== null));
});

test("«Наступний день»: дата +1, нагадування всім, у кого заявки, з лічильником днів; повтор із тим самим ключем не дублює", async () => {
  const h = await boot();
  const before = await h.count("notifications");
  const day = await h.call("nextDay", AUTHOR_A, { key: "next-1" });
  assert.equal(day.today, "2027-02-16");
  const reminders = (await h.db.query.notifications.findMany()).filter((n) => n.kind === "reminder");
  // 5 у черзі (0003, 0006, 0007, 0008, 0010), 1 у переліку (0009), 1 повернута (0004)
  assert.equal(reminders.length, 7);
  assert.equal(await h.count("notifications"), before + 7);

  const prep = (await h.call("notifications", PREP_1A)).notifications.find((n) => n.kind === "reminder" && n.requestId === "req-0010");
  assert.equal(prep?.note, "Днів на рівні: 7", "з 9 по 16 лютого");
  const approver = (await h.call("notifications", APPR_1A)).notifications.find((n) => n.kind === "reminder" && n.requestId === "req-0009");
  assert.ok(approver, "перелік чекає керівника — нагадування йому");
  const author = (await h.call("notifications", "author-unit-b")).notifications.find((n) => n.kind === "reminder" && n.requestId === "req-0004");
  assert.equal(author?.note, "Днів на рівні: 12", "повернута чекає на автора");

  await h.call("nextDay", AUTHOR_A, { key: "next-1" });
  assert.equal((await h.call("session", AUTHOR_A)).today, "2027-02-16", "повтор не зсуває дату вдруге");
  assert.equal(await h.count("notifications"), before + 7);

  const second = await h.call("nextDay", AUTHOR_A);
  assert.equal(second.today, "2027-02-17");
  assert.equal(await h.count("notifications"), before + 14);
});

test("після «Наступного дня» перелік можна сформувати знову: правило «один перелік на день»", async () => {
  const h = await boot();
  const [a, b] = [await submitCheap(h), await submitCheap(h)];
  await h.call("formList", PREP_1A, { body: { level: 1, unitId: "unit-a", requestIds: [a.id] } });
  await h.fail("formList", PREP_1A, 409, { body: { level: 1, unitId: "unit-a", requestIds: [b.id] } });
  await h.call("nextDay", AUTHOR_A);
  const next = await h.call("formList", PREP_1A, { body: { level: 1, unitId: "unit-a", requestIds: [b.id] } });
  assert.equal(next.list.date, "2027-02-16");
});
