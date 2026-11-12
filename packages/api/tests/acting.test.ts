import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHOR_A, AUTHOR_B, boot } from "./harness.ts";

const ADMIN = "admin-demo";
const APPR_1A = "appr-1-unit-a";

test("ТВО: адміністратор призначає, заступник діє з роллю керівника, журнал пише «за кого»; після зняття — своя роль", async () => {
  const h = await boot();
  assert.equal((await h.fail("assignActing", APPR_1A, 403, { body: { principalId: APPR_1A, deputyId: AUTHOR_A } })).code, "FORBIDDEN_ROLE");
  assert.equal((await h.fail("assignActing", ADMIN, 409, { body: { principalId: AUTHOR_B, deputyId: AUTHOR_A } })).code, "INVALID_TRANSITION", "автора не заміщають");
  assert.equal((await h.fail("assignActing", ADMIN, 409, { body: { principalId: APPR_1A, deputyId: APPR_1A } })).code, "INVALID_TRANSITION");

  const { assignment } = await h.call("assignActing", ADMIN, { body: { principalId: APPR_1A, deputyId: AUTHOR_A } });
  assert.equal((await h.fail("assignActing", ADMIN, 409, { body: { principalId: APPR_1A, deputyId: AUTHOR_B } })).code, "INVALID_TRANSITION", "друге ТВО за ту саму особу");

  const session = await h.call("session", AUTHOR_A);
  assert.equal(session.actingFor, APPR_1A);
  assert.equal(session.user.roleKind, "approver");
  assert.equal(session.user.level, 1);
  assert.match(session.user.title, /^ТВО: /);

  const queue = await h.call("levelQueue", AUTHOR_A, { params: { level: "1" } });
  const list = queue.lists.find((l) => l.status === "formed")!;
  await h.call("approveList", AUTHOR_A, { params: { id: list.id }, body: { sedoNumber: 8100 } });
  const approved = (await h.call("journal", ADMIN)).journal.find((e) => e.type === "list.approved" && e.listId === list.id)!;
  assert.equal(approved.actorId, AUTHOR_A);
  assert.equal(approved.data["actingFor"], APPR_1A);

  const revoked = await h.call("revokeActing", ADMIN, { params: { id: assignment.id }, body: {} });
  assert.ok(revoked.assignment.revokedAt);
  const back = await h.call("session", AUTHOR_A);
  assert.equal(back.actingFor, null);
  assert.equal(back.user.roleKind, "author");
  assert.equal((await h.fail("revokeActing", ADMIN, 409, { params: { id: assignment.id }, body: {} })).code, "INVALID_TRANSITION");
  const types = (await h.call("journal", ADMIN)).journal.map((e) => e.type);
  assert.ok(types.includes("acting.assigned") && types.includes("acting.revoked"));
});
