import assert from "node:assert/strict";
import { test } from "node:test";
import { allocationIssues } from "../src/index.ts";

test("розподіл по в/ч: сума планів в/ч не більша за план напрямку", () => {
  const plan = { p1: 10, p2: 5 };
  assert.deepEqual(allocationIssues(plan, [{ positionId: "p1", qty: 6 }, { positionId: "p1", qty: 4 }, { positionId: "p2", qty: 5 }]), []);
  assert.deepEqual(allocationIssues(plan, [{ positionId: "p1", qty: 6 }, { positionId: "p1", qty: 5 }, { positionId: "p3", qty: 1 }]), [
    { positionId: "p1", planned: 10, allocated: 11 },
    { positionId: "p3", planned: 0, allocated: 1 },
  ]);
});
