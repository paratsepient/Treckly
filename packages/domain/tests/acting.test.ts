import assert from "node:assert/strict";
import { test } from "node:test";
import { actingOf, assertAssignable, type ActingAssignment } from "../src/index.ts";
import { throwsCode } from "./helpers.ts";

const a = (id: string, deputyId: string, principalId: string, revokedAt: string | null = null): ActingAssignment => ({
  id,
  deputyId,
  principalId,
  assignedBy: "admin",
  assignedAt: "2027-02-15T08:00:00.000Z",
  revokedAt,
});

test("ТВО: заміщають лише рівні погодження; одна особа — одне чинне призначення в кожен бік", () => {
  const appr = { id: "appr", roleKind: "approver" as const };
  const prep = { id: "prep", roleKind: "preparer" as const };
  const author = { id: "auth", roleKind: "author" as const };
  const admin = { id: "adm", roleKind: "admin" as const };
  assertAssignable(appr, author, []);
  assertAssignable(prep, appr, []);
  const reason = (fn: () => void) => throwsCode(fn, "INVALID_TRANSITION").details["reason"];
  assert.equal(reason(() => assertAssignable(author, appr, [])), "PRINCIPAL_ROLE");
  assert.equal(reason(() => assertAssignable(appr, appr, [])), "SAME_PERSON");
  assert.equal(reason(() => assertAssignable(appr, admin, [])), "DEPUTY_ROLE");
  assert.equal(reason(() => assertAssignable(appr, author, [a("1", "x", "appr")])), "PRINCIPAL_BUSY");
  assert.equal(reason(() => assertAssignable(appr, author, [a("1", "auth", "prep")])), "DEPUTY_BUSY");
  assert.equal(reason(() => assertAssignable(prep, appr, [a("1", "x", "appr")])), "DEPUTY_ABSENT");
  assertAssignable(appr, author, [a("1", "auth", "appr", "2027-02-16T08:00:00.000Z")]);
});

test("ТВО: чинне призначення визначає, за кого діє особа; зняте — ні", () => {
  const list = [a("1", "auth", "appr", "2027-02-16T08:00:00.000Z"), a("2", "auth", "prep")];
  assert.equal(actingOf("auth", list)?.principalId, "prep");
  assert.equal(actingOf("appr", list), null);
});
