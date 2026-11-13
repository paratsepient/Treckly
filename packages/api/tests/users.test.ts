import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHOR_A, boot, lineOf } from "./harness.ts";

const ADMIN = "admin-demo";

test("користувачі: адміністратор задає відділ і КЕКВ; служба заявки — з відділу, майно й план — лише за КЕКВ", async () => {
  const h = await boot();
  const me = (await h.call("session", AUTHOR_A)).user;
  assert.equal(me.departmentId, "dep-a1");
  const body = { name: me.name, title: me.title, departmentId: "dep-a2", kekvs: ["3110"] };
  assert.equal((await h.fail("updateUser", AUTHOR_A, 403, { params: { id: AUTHOR_A }, body })).code, "FORBIDDEN_ROLE");
  const foreign = await h.fail("updateUser", ADMIN, 409, { params: { id: AUTHOR_A }, body: { ...body, departmentId: "dep-b1" } });
  assert.equal(foreign.details?.["reason"], "DEPARTMENT_OUTSIDE_UNIT");
  assert.equal((await h.fail("updateUser", ADMIN, 409, { params: { id: AUTHOR_A }, body: { ...body, kekvs: ["9999"] } })).details?.["reason"], "UNKNOWN_KEKV");

  const { user } = await h.call("updateUser", ADMIN, { params: { id: AUTHOR_A }, body });
  assert.deepEqual([user.departmentId, user.kekvs], ["dep-a2", ["3110"]]);

  // Майно автора — лише КЕКВ 3110.
  const items = (await h.call("property", AUTHOR_A)).items;
  assert.ok(items.length > 0 && items.every((i) => i.item.kekv === "3110"));

  // Служба — з відділу, а не з форми; позиція 2210 для автора тепер поза планом.
  const { positions } = await h.call("positions", AUTHOR_A);
  const p2210 = positions.find((p) => p.kekv === "2210")!;
  const { request } = await h.call("createRequest", AUTHOR_A, { body: { lines: [lineOf(p2210.id, "2210")], justification: "Потреба." } });
  assert.equal(request.service, "Відділ тилу");
  const report = (await h.call("checkRequest", AUTHOR_A, { body: { lines: [lineOf(p2210.id, "2210")] } })).report;
  assert.ok(report.errors.some((e) => e.code === "NOT_IN_LIST"));

  assert.ok((await h.call("journal", ADMIN)).journal.some((e) => e.type === "user.updated" && e.data["userId"] === AUTHOR_A));
});
