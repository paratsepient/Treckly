import assert from "node:assert/strict";
import test from "node:test";
import { doneShare, moneyOf, percent, qtyOf } from "../src/lib/plan-states.ts";

const p = (planned: number, inRequests: number, approved: number, bought: number, priceMinor: number) => ({
  plannedQty: planned,
  inRequestsQty: inRequests,
  approvedQty: approved,
  boughtQty: bought,
  issuedQty: 0,
  freeQty: planned - inRequests - approved - bought,
  priceMinor,
});

test("стани плану: разом дають план; «Виконано» — куплене від плану", () => {
  const a = qtyOf(p(100, 15, 20, 25, 1_00));
  assert.equal(a.bought + a.approved + a.inRequests + a.free, a.planned);
  assert.equal(doneShare(a), 0.25);
  assert.equal(doneShare(qtyOf(p(0, 0, 0, 0, 1_00))), 0, "без плану — нуль, а не ділення на нуль");
});

test("стани плану в гривнях: суми різних позицій додаються за ціною плану", () => {
  const m = moneyOf([p(10, 0, 0, 5, 2_00), p(100, 10, 0, 0, 1_00)]);
  assert.deepEqual(m, { planned: 120_00, bought: 10_00, approved: 0, inRequests: 10_00, free: 100_00 });
  assert.equal(doneShare(m), 10 / 120);
});

test("відсоток виконання: мала закупівля не показується як 0 %", () => {
  assert.notEqual(percent.format(0.003), percent.format(0));
  assert.equal(percent.format(0.25), percent.format(0.249));
});
