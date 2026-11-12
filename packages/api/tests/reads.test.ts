import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHOR_A, boot, positionByName, seed } from "./harness.ts";

test("сесія: без заголовка діє перший автор; перемикач ролей повертає дані обраного користувача", async () => {
  const h = await boot();
  const res = await h.app.request("/api/session");
  const session = (await res.json()) as { user: { id: string; roleKind: string }; users: unknown[]; today: string };
  assert.equal(session.user.roleKind, "author");
  assert.equal(session.users.length, seed.users.length);
  assert.equal(session.today, seed.now.slice(0, 10));

  const approver = await h.call("switchRole", AUTHOR_A, { body: { userId: "appr-3-ru-1" } });
  assert.equal(approver.user.roleKind, "approver");
  assert.equal(approver.user.level, 3);

  assert.equal((await h.fail("switchRole", AUTHOR_A, 404, { body: { userId: "nobody" } })).code, "NOT_FOUND");
  assert.equal((await h.fail("session", "nobody", 400)).code, "VALIDATION");
});

test("довідники: структура, КЕКВ, номенклатура зі схожими групами, посади рівнів", async () => {
  const h = await boot();
  const ref = await h.call("reference", AUTHOR_A);
  assert.equal(ref.units.length, seed.units.length);
  assert.equal(ref.kekv.length, 3);
  assert.equal(ref.items.length, seed.items.length);
  assert.equal(ref.levels.length, 5);
  assert.ok(ref.items.every((i) => i.group.length > 0));
});

test("Попередній перелік з доступною кількістю: затверджені заявки її зменшують", async () => {
  const h = await boot();
  const { positions } = await h.call("positions", AUTHOR_A);
  assert.equal(positions.length, seed.listPositions.length);
  const radio = await positionByName(h, "Радіостанція носима цифрова");
  const planned = seed.listPositions.find((p) => p.id === radio.id)!.plannedQty;
  assert.equal(radio.availableQty, planned - 2, "2 радіостанції затверджено в першій заявці");
});

test("бюджет: затверджено, у роботі, залишок; загальний рядок дорівнює сумі", async () => {
  const h = await boot();
  const { lines } = await h.call("budget", AUTHOR_A);
  assert.deepEqual(lines.map((l) => l.scope), ["TOTAL", "2210", "2220", "3110"]);
  for (const l of lines) assert.equal(l.remainingMinor, l.limitMinor - l.approvedMinor);
  const k3110 = lines.find((l) => l.scope === "3110")!;
  assert.equal(k3110.remainingMinor, 100_000_00);
  assert.ok(k3110.inWorkMinor > k3110.remainingMinor, "сума «у роботі» перевищує залишок 3110");
  const kekvLines = lines.filter((l) => l.scope !== "TOTAL");
  assert.equal(lines[0]!.approvedMinor, kekvLines.reduce((s, l) => s + l.approvedMinor, 0));
});

test("«Моє майно»: лише своя в/ч, три вкладки (план в/ч узгоджено із заявками)", async () => {
  const h = await boot();
  const { items } = await h.call("property", AUTHOR_A);
  assert.ok(items.length >= 15);
  assert.ok(items.every((i) => i.unitId === "unit-a"));
  assert.deepEqual([...new Set(items.map((i) => i.tab))].sort(), ["on_base", "planned", "received"]);
  const other = await h.call("property", "author-unit-b");
  assert.ok(other.items.every((i) => i.unitId === "unit-b"));
  const noUnit = await h.call("property", "admin-demo");
  assert.deepEqual(noUnit.items, []);
});

test("майно іншої в/ч: автор лише своєї, рівні погодження — будь-якої, і план узгоджено із заявкою", async () => {
  const h = await boot();
  const own = await h.call("unitProperty", AUTHOR_A, { params: { id: "unit-a" } });
  assert.ok(own.items.length >= 15 && own.items.every((i) => i.unitId === "unit-a"));
  assert.equal((await h.fail("unitProperty", AUTHOR_A, 403, { params: { id: "unit-b" } })).code, "FORBIDDEN_ROLE");
  const seen = await h.call("unitProperty", "prep-2-brig-1", { params: { id: "unit-b" } });
  assert.ok(seen.items.length >= 15 && seen.items.every((i) => i.unitId === "unit-b"));
  // Навмисна розбіжність для показу: тепловізор в/ч А0001 не заплановано.
  assert.ok(!own.items.some((i) => i.tab === "planned" && i.item.name.startsWith("Тепловізор")));
});

test("мої заявки: лише власні, нові згори; реєстр — усі", async () => {
  const h = await boot();
  const mine = await h.call("myRequests", AUTHOR_A);
  assert.ok(mine.requests.length >= 3 && mine.requests.every((r) => r.authorId === AUTHOR_A));
  const dates = mine.requests.map((r) => r.createdOn);
  assert.deepEqual(dates, [...dates].sort().reverse());
  const registry = await h.call("registry", AUTHOR_A);
  assert.equal(registry.requests.length, 11);
});

test("картка заявки: трек, статуси рядків і журнал; затверджена з витягом — усе пройдено", async () => {
  const h = await boot();
  const mine = await h.call("myRequests", AUTHOR_A);
  const issued = mine.requests.find((r) => r.status === "extract_issued")!;
  const detail = await h.call("requestDetail", AUTHOR_A, { params: { id: issued.id } });
  assert.deepEqual(detail.track.steps.map((s) => s.state), ["done", "done", "done", "done", "done"]);
  assert.ok(detail.track.steps.every((s) => s.sedoNumber !== null));
  assert.deepEqual(Object.values(detail.lineStatuses).sort(), ["approved", "approved", "approved", "replacement_agreed"]);
  assert.equal(detail.journal[0]?.type, "request.created");
  assert.ok(detail.journal.every((e) => e.requestId === issued.id));

  const missing = await h.fail("requestDetail", AUTHOR_A, 404, { params: { id: "req-nope" } });
  assert.equal(missing.code, "NOT_FOUND");
  assert.deepEqual(missing.details, { id: "req-nope" });
});

test("повернута заявка: трек каскадом, примітка збережена", async () => {
  const h = await boot();
  const mine = await h.call("myRequests", "author-unit-b");
  const returned = mine.requests.find((r) => r.status === "returned")!;
  const detail = await h.call("requestDetail", "author-unit-b", { params: { id: returned.id } });
  assert.deepEqual(detail.track.steps.map((s) => s.state), ["returned", "returned", "returned", "pending", "pending"]);
  assert.equal(detail.request.returnInfo?.level, 3);
});
