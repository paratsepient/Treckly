import assert from "node:assert/strict";
import { test } from "node:test";
import { approveList, createDraft, disbandList, formList, submit } from "../src/index.ts";
import { all, apply, approver, byList, createWorld, get, getList, meta, POSITIONS, preparer, ROUTE } from "./fixtures.ts";
import { approveAt, formAt, submitted } from "./flow.ts";
import { throwsCode } from "./helpers.ts";

function setup() {
  const world = createWorld();
  const ids = [1, 2, 3].map(() => submitted(world, [byList("l1", "p1", 1)])) as [string, string, string];
  return { world, ids };
}

test("перелік за кнопкою: обрані 2 із 3, необрана лишається в черзі", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0], ids[1]]);
  assert.equal(get(world, ids[0]).status, "in_list");
  assert.equal(get(world, ids[0]).listId, listId);
  assert.equal(get(world, ids[2]).status, "at_level");
  assert.equal(get(world, ids[2]).listId, null);
  assert.deepEqual(getList(world, listId).requestIds, [ids[0], ids[1]]);
  assert.equal(getList(world, listId).status, "formed");
});

test("формування: сповіщення керівнику рівня і запис журналу", () => {
  const { world, ids } = setup();
  const before = world.notifications.length;
  formAt(world, 1, [ids[0]]);
  const added = world.notifications.slice(before);
  assert.deepEqual(added.map((n) => [n.kind, n.audience]), [["list_formed", { kind: "level", level: 1, unitId: "unit-vch", role: "approver" }]]);
  assert.ok(world.events.some((e) => e.type === "list.formed"));
});

test("формувати може лише уповноважена особа свого рівня й підрозділу", () => {
  const { world, ids } = setup();
  const input = { level: 1 as const, unitId: "unit-vch", selected: [get(world, ids[0])], existingLists: [] };
  throwsCode(() => formList(world.ctx, meta(approver(1)), input), "FORBIDDEN_ROLE");
  throwsCode(() => formList(world.ctx, meta(preparer(2)), input), "FORBIDDEN_ROLE");
  throwsCode(() => formList(world.ctx, meta({ userId: "x", role: { kind: "preparer", level: 1, unitId: "інша" } }), input), "FORBIDDEN_ROLE");
});

test("формування: порожній вибір, дубль і заявки не з цього рівня відхиляються", () => {
  const { world, ids } = setup();
  const base = { level: 1 as const, unitId: "unit-vch", existingLists: [] };
  throwsCode(() => formList(world.ctx, meta(preparer(1)), { ...base, selected: [] }), "INVALID_TRANSITION");
  throwsCode(() => formList(world.ctx, meta(preparer(1)), { ...base, selected: [get(world, ids[0]), get(world, ids[0])] }), "INVALID_TRANSITION");
  formAt(world, 1, [ids[0]]);
  throwsCode(() => formList(world.ctx, meta(preparer(1, "u2")), { ...base, selected: [get(world, ids[0])] }), "INVALID_TRANSITION"); // уже in_list
});

test("один перелік на (рівень, підрозділ, день); наступного дня або після розформування — можна", () => {
  const { world, ids } = setup();
  const first = formAt(world, 1, [ids[0]]);
  throwsCode(() => formAt(world, 1, [ids[1]]), "INVALID_TRANSITION");

  apply(world, disbandList(world.ctx, meta(preparer(1)), { list: getList(world, first), requests: [get(world, ids[0])] }));
  const second = formAt(world, 1, [ids[0], ids[1]]);
  assert.notEqual(second, first);

  approveAt(world, second);
  world.clock.advanceDays(1);
  assert.ok(formAt(world, 1, [ids[2]]));
});

test("розформування: заявки повертаються в чергу рівня, перелік закривається", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0], ids[1]]);
  const outcome = apply(
    world,
    disbandList(world.ctx, meta(preparer(1)), { list: getList(world, listId), requests: [get(world, ids[0]), get(world, ids[1])] }),
  );
  assert.equal(getList(world, listId).status, "disbanded");
  for (const id of [ids[0], ids[1]]) {
    assert.equal(get(world, id).status, "at_level");
    assert.equal(get(world, id).level, 1);
    assert.equal(get(world, id).listId, null);
  }
  assert.equal(outcome.events[0]?.type, "list.disbanded");
});

test("розформувати може лише той, хто сформував; не погоджений і не вже розформований", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0]], preparer(1, "chief-a"));
  const input = () => ({ list: getList(world, listId), requests: [get(world, ids[0])] });
  throwsCode(() => disbandList(world.ctx, meta(preparer(1, "chief-b")), input()), "FORBIDDEN_ROLE");
  throwsCode(() => disbandList(world.ctx, meta(approver(1)), input()), "FORBIDDEN_ROLE");

  approveAt(world, listId);
  throwsCode(() => disbandList(world.ctx, meta(preparer(1, "chief-a")), { list: getList(world, listId), requests: [get(world, ids[0])] }), "INVALID_TRANSITION");
});

test("розформування: склад переліку має збігатися з переданими заявками", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0], ids[1]]);
  throwsCode(() => disbandList(world.ctx, meta(preparer(1)), { list: getList(world, listId), requests: [get(world, ids[0])] }), "INVALID_TRANSITION");
});

test("погодження: усі заявки переліку разом переходять на рівень вище з номером СЕДО", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0], ids[1]]);
  world.clock.advanceDays(2);
  const outcome = approveAt(world, listId, "98765");
  const list = getList(world, listId);
  assert.equal(list.status, "approved");
  assert.equal(list.sedoNumber, 98765);
  assert.equal(list.approvedBy, "u-appr-1");
  for (const id of [ids[0], ids[1]]) {
    const request = get(world, id);
    assert.equal(request.status, "at_level");
    assert.equal(request.level, 2);
    assert.equal(request.levelEnteredOn, "2027-01-12");
  }
  assert.equal(get(world, ids[2]).level, 1, "необрана лишилась на рівні 1");
  assert.equal(outcome.notifications.length, 2);
  assert.ok(outcome.notifications.every((n) => n.kind === "request_advanced" && n.audience.kind === "level" && n.audience.level === 2 && n.audience.role === "preparer"));
  assert.deepEqual(outcome.events.map((e) => e.type), ["list.approved", "request.advanced", "request.advanced"]);
  assert.equal(outcome.events[0]?.data["sedoNumber"], 98765);
});

test("погодження без коректного номера СЕДО неможливе: перелік і заявки не змінюються", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0]]);
  for (const bad of ["", "abc", "12.5", 0]) {
    throwsCode(
      () => approveList(world.ctx, meta(approver(1)), { list: getList(world, listId), requests: [get(world, ids[0])], sedoNumber: bad, positions: POSITIONS, budget: world.budget }),
      "SEDO_NUMBER_INVALID",
    );
  }
  assert.equal(getList(world, listId).status, "formed");
  assert.equal(get(world, ids[0]).status, "in_list");
});

test("погоджує лише керівник свого рівня; уповноважена особа — ні", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0]]);
  const input = () => ({ list: getList(world, listId), requests: [get(world, ids[0])], sedoNumber: 1, positions: POSITIONS, budget: world.budget });
  throwsCode(() => approveList(world.ctx, meta(preparer(1)), input()), "FORBIDDEN_ROLE");
  throwsCode(() => approveList(world.ctx, meta(approver(2)), input()), "FORBIDDEN_ROLE");
  throwsCode(() => approveList(world.ctx, meta({ userId: "x", role: { kind: "approver", level: 1, unitId: "інша" } }), input()), "FORBIDDEN_ROLE");
});

test("погоджений перелік не змінюється: вдруге не погоджується, не розформовується", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0]]);
  approveAt(world, listId);
  throwsCode(() => approveAt(world, listId), "INVALID_TRANSITION");
  assert.equal(getList(world, listId).sedoNumber, 1001);
});

test("конфлікт версій при погодженні: перелік або заявка змінилися", () => {
  const { world, ids } = setup();
  const listId = formAt(world, 1, [ids[0]]);
  const list = getList(world, listId);
  throwsCode(
    () => approveList(world.ctx, meta(approver(1), { [listId]: list.revision - 1 }), { list, requests: [get(world, ids[0])], sedoNumber: 1, positions: POSITIONS, budget: world.budget }),
    "VERSION_CONFLICT",
  );
  const request = get(world, ids[0]);
  throwsCode(
    () => approveList(world.ctx, meta(approver(1), { [ids[0]]: request.revision - 1 }), { list, requests: [request], sedoNumber: 1, positions: POSITIONS, budget: world.budget }),
    "VERSION_CONFLICT",
  );
});

test("заявка іншої в/ч не потрапляє в перелік цього підрозділу, а на спільному рівні 2 об'єднується", () => {
  const world = createWorld();
  const own = submitted(world, [byList("l1", "p1", 1)]);
  const route2 = ["unit-vch-2", "unit-brig", "unit-ru", "unit-adm", "unit-vodr"] as const;
  const author2 = { userId: "u-author-2", role: { kind: "author", unitId: "unit-vch-2" } } as const;
  const [draft] = apply(world, createDraft(world.ctx, meta(author2), { route: route2, lines: [byList("l1", "p2", 1)] })).requests;
  apply(world, submit(world.ctx, meta(author2), { request: draft!, positions: POSITIONS, budget: world.budget, requests: all(world) }));

  // Уповноважений в/ч №1 не може сформувати перелік із заявкою в/ч №2.
  throwsCode(() => formAt(world, 1, [own, draft!.id]), "INVALID_TRANSITION");

  // Кожна в/ч формує й погоджує свій перелік окремо в один день.
  const list1 = formAt(world, 1, [own]);
  const prep2 = { userId: "p-2", role: { kind: "preparer", level: 1, unitId: "unit-vch-2" } } as const;
  const list2 = apply(
    world,
    formList(world.ctx, meta(prep2), {
      level: 1,
      unitId: "unit-vch-2",
      selected: [get(world, draft!.id)],
      existingLists: [...world.lists.values()],
    }),
  ).lists[0]!.id;
  assert.notEqual(list1, list2);
  approveAt(world, list1);
  const appr2 = { userId: "a-2", role: { kind: "approver", level: 1, unitId: "unit-vch-2" } } as const;
  apply(
    world,
    approveList(world.ctx, meta(appr2), {
      list: getList(world, list2),
      requests: [get(world, draft!.id)],
      sedoNumber: 2,
      positions: POSITIONS,
      budget: world.budget,
    }),
  );

  // На рівні 2 це один підрозділ (бригада): обидві заявки можна взяти в один перелік.
  assert.ok(formAt(world, 2, [own, draft!.id]));
});
